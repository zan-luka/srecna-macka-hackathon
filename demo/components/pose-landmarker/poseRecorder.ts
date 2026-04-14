import type { Landmark } from "./types";

/**
 * Binary format for recorded pose data.
 * Optimized for space efficiency (each landmark = 20 bytes).
 * Supports full-session recording with exercise grouping.
 *
 * Format: [header][exercise entries][frames]
 * Header (36 bytes):
 *   - magic: 4 bytes "POSE" (0x504F5345)
 *   - version: 4 bytes (2)
 *   - frameCount: 4 bytes uint32
 *   - startTime: 8 bytes float64 (milliseconds)
 *   - exerciseCount: 4 bytes uint32
 *   - sessionDuration: 8 bytes float64
 *
 * Each Exercise Entry (variable):
 *   - nameLength: 2 bytes uint16
 *   - name: variable bytes
 *   - startFrameIndex: 4 bytes uint32
 *   - frameCount: 4 bytes uint32
 *
 * Each Frame (variable):
 *   - frameIndex: 4 bytes uint32
 *   - timestamp: 8 bytes float64
 *   - personCount: 2 bytes uint16
 *   - [for each person: 33 landmarks × 20 bytes each]
 *
 * Each Landmark (20 bytes):
 *   - x: 4 bytes float32
 *   - y: 4 bytes float32
 *   - z: 4 bytes float32
 *   - visibility: 4 bytes float32
 *   - presence: 1 byte uint8
 *   - padding: 3 bytes
 */

export type RecordedFrame = {
	frameIndex: number;
	timestamp: number;
	landmarks: Array<Array<Landmark>>;
	exerciseIndex?: number; // Index of the exercise this frame belongs to
};

export type ExerciseGroup = {
	name: string;
	startFrameIndex: number;
	frameCount: number;
	startTime: number;
	endTime?: number;
	duration?: number;
};

export type RecordingMetadata = {
	magic: string; // "POSE"
	version: number;
	frameCount: number;
	startTime: number;
	endTime?: number;
	sessionDuration?: number; // milliseconds
	exerciseGroups: ExerciseGroup[];
};

const MAGIC_NUMBER = 0x504f5345; // "POSE"
const VERSION = 2;
const LANDMARKS_PER_PERSON = 33;
const BYTES_PER_LANDMARK = 20; // 4 + 4 + 4 + 4 + 1 + 3 padding

/**
 * Records pose frames captured during an entire workout session.
 * Stores frames in memory and groups them by exercise for export.
 */
export class PoseRecorder {
	private frames: RecordedFrame[] = [];
	private isRecording: boolean = false;
	private startTime: number = 0;
	private exerciseGroups: ExerciseGroup[] = [];
	private currentExerciseIndex: number = -1;
	private currentExerciseStartFrame: number = 0;
	private currentExerciseStartTime: number = 0;

	/**
	 * Start recording pose frames for the entire workout session.
	 */
	startRecording() {
		this.frames = [];
		this.exerciseGroups = [];
		this.isRecording = true;
		this.startTime = Date.now();
		this.currentExerciseIndex = -1;
		console.log(`📹 Started full-session recording`);
	}

	/**
	 * Mark the start of a new exercise within the session.
	 * @param exerciseName - Name of the exercise being started
	 * @param frameIndex - Current frame index
	 */
	markExerciseStart(exerciseName: string, frameIndex: number) {
		if (!this.isRecording) {
			return;
		}

		// Close previous exercise if exists
		if (this.currentExerciseIndex >= 0) {
			const lastFrame = this.frames[this.frames.length - 1];
			if (lastFrame) {
				this.exerciseGroups[this.currentExerciseIndex].endTime = lastFrame.timestamp;
				this.exerciseGroups[this.currentExerciseIndex].duration =
					lastFrame.timestamp - this.currentExerciseStartTime;
				this.exerciseGroups[this.currentExerciseIndex].frameCount =
					frameIndex - this.currentExerciseStartFrame;
			}
		}

		// Start new exercise
		this.currentExerciseIndex = this.exerciseGroups.length;
		this.currentExerciseStartFrame = frameIndex;
		this.currentExerciseStartTime = Date.now();

		this.exerciseGroups.push({
			name: exerciseName,
			startFrameIndex: frameIndex,
			frameCount: 0,
			startTime: this.currentExerciseStartTime,
		});

		console.log(
			`📌 Exercise started: ${exerciseName} (frame ${frameIndex})`,
		);
	}

	/**
	 * Stop recording and prepare data for export.
	 * @returns Recording metadata
	 */
	stopRecording(): RecordingMetadata {
		this.isRecording = false;
		const endTime = Date.now();

		// Finalize current exercise if exists
		if (this.currentExerciseIndex >= 0) {
			const lastFrame = this.frames[this.frames.length - 1];
			if (lastFrame) {
				this.exerciseGroups[this.currentExerciseIndex].endTime = lastFrame.timestamp;
				this.exerciseGroups[this.currentExerciseIndex].duration =
					lastFrame.timestamp - this.currentExerciseStartTime;
			}
		}

		const sessionDuration = endTime - this.startTime;
		console.log(
			`⏹️  Stopped full-session recording: ${this.frames.length} frames, ${this.exerciseGroups.length} exercises in ${sessionDuration}ms`,
		);

		return {
			magic: "POSE",
			version: VERSION,
			frameCount: this.frames.length,
			startTime: this.startTime,
			endTime: endTime,
			sessionDuration: sessionDuration,
			exerciseGroups: this.exerciseGroups,
		};
	}

	/**
	 * Add a frame to the recording (if currently recording).
	 */
	recordFrame(frameIndex: number, timestamp: number, landmarks: Array<Array<Landmark>>) {
		if (!this.isRecording) {
			return;
		}

		this.frames.push({
			frameIndex,
			timestamp,
			landmarks,
			exerciseIndex: this.currentExerciseIndex,
		});
	}

	/**
	 * Get the number of frames recorded so far.
	 */
	getFrameCount(): number {
		return this.frames.length;
	}

	/**
	 * Clear all recorded frames.
	 */
	clear() {
		this.frames = [];
		this.isRecording = false;
	}

	/**
	 * Export recorded frames as binary ArrayBuffer.
	 * Format optimized for space efficiency with exercise grouping.
	 */
	exportAsBinary(metadata: RecordingMetadata): ArrayBuffer {
		// Estimate size: header + exercise entries + frames
		let estimatedSize = 36; // header

		// Exercise entries
		for (const ex of metadata.exerciseGroups) {
			estimatedSize += 2; // nameLength
			estimatedSize += new TextEncoder().encode(ex.name).length;
			estimatedSize += 8; // startFrameIndex + frameCount
		}

		// Frames
		estimatedSize +=
			this.frames.length * (16 + LANDMARKS_PER_PERSON * BYTES_PER_LANDMARK);

		const buffer = new ArrayBuffer(estimatedSize);
		const view = new DataView(buffer);
		let offset = 0;

		// Write header
		view.setUint32(offset, MAGIC_NUMBER, true);
		offset += 4;
		view.setUint32(offset, VERSION, true);
		offset += 4;
		view.setUint32(offset, metadata.frameCount, true);
		offset += 4;
		view.setFloat64(offset, metadata.startTime, true);
		offset += 8;
		view.setUint32(offset, metadata.exerciseGroups.length, true);
		offset += 4;
		view.setFloat64(offset, metadata.sessionDuration ?? 0, true);
		offset += 8;

		// Write exercise entries
		for (const ex of metadata.exerciseGroups) {
			const nameBytes = new TextEncoder().encode(ex.name);
			view.setUint16(offset, nameBytes.length, true);
			offset += 2;
			for (let i = 0; i < nameBytes.length; i++) {
				view.setUint8(offset + i, nameBytes[i]);
			}
			offset += nameBytes.length;
			view.setUint32(offset, ex.startFrameIndex, true);
			offset += 4;
			view.setUint32(offset, ex.frameCount, true);
			offset += 4;
		}

		// Write frames
		for (const frame of this.frames) {
			view.setUint32(offset, frame.frameIndex, true);
			offset += 4;
			view.setFloat64(offset, frame.timestamp, true);
			offset += 8;
			view.setUint16(offset, frame.landmarks.length, true);
			offset += 2;

			// Write landmarks for each person
			for (const personLandmarks of frame.landmarks) {
				for (const landmark of personLandmarks) {
					view.setFloat32(offset, landmark.x, true);
					offset += 4;
					view.setFloat32(offset, landmark.y, true);
					offset += 4;
					view.setFloat32(offset, landmark.z, true);
					offset += 4;
					view.setFloat32(offset, landmark.visibility ?? 0, true);
					offset += 4;
					view.setUint8(offset, Math.round((landmark.presence ?? 0) * 255));
					offset += 1;
					// 3 bytes padding
					offset += 3;
				}
			}
		}

		// Return buffer with correct size
		return buffer.slice(0, offset);
	}

	/**
	 * Export as JSON for debugging or web analysis.
	 */
	exportAsJSON(metadata: RecordingMetadata): string {
		return JSON.stringify(
			{
				metadata,
				frames: this.frames,
			},
			null,
			2,
		);
	}

	/**
	 * Export as CSV for analysis in spreadsheets.
	 * Each row: frameIndex, timestamp, exerciseName, personIndex, landmarkIndex, x, y, z, visibility
	 */
	exportAsCSV(metadata: RecordingMetadata): string {
		const lines: string[] = [
			"# Full Session Pose Recording Export",
			`# Total Duration: ${metadata.sessionDuration}ms`,
			`# Frames: ${metadata.frameCount}`,
			`# Exercises: ${metadata.exerciseGroups.length}`,
			`# Start: ${new Date(metadata.startTime).toISOString()}`,
			"frameIndex,timestamp,exerciseName,personIndex,landmarkIndex,x,y,z,visibility",
		];

		// Build exercise name map from frame exerciseIndex
		const exerciseMap = new Map<number, string>();
		for (const ex of metadata.exerciseGroups) {
			const frames = this.frames.filter(
				(f) =>
					f.frameIndex >= ex.startFrameIndex &&
					f.frameIndex < ex.startFrameIndex + ex.frameCount
			);
			for (const frame of frames) {
				exerciseMap.set(frame.frameIndex, ex.name);
			}
		}

		for (const frame of this.frames) {
			const exerciseName = exerciseMap.get(frame.frameIndex) || "unknown";
			for (let personIdx = 0; personIdx < frame.landmarks.length; personIdx++) {
				for (
					let lmIdx = 0;
					lmIdx < frame.landmarks[personIdx].length;
					lmIdx++
				) {
					const lm = frame.landmarks[personIdx][lmIdx];
					lines.push(
						`${frame.frameIndex},${frame.timestamp},${exerciseName},${personIdx},${lmIdx},${lm.x},${lm.y},${lm.z},${lm.visibility ?? 0}`,
					);
				}
			}
		}

		return lines.join("\n");
	}

	/**
	 * Get statistics about the recording.
	 */
	getStats() {
		if (this.frames.length === 0) {
			return null;
		}

		const firstFrame = this.frames[0];
		const lastFrame = this.frames[this.frames.length - 1];
		const frameDuration = lastFrame.timestamp - firstFrame.timestamp;
		const fps = this.frames.length / (frameDuration / 1000);

		return {
			frameCount: this.frames.length,
			duration: frameDuration,
			avgFPS: fps,
			recordedPeople: Math.max(...this.frames.map((f) => f.landmarks.length)),
		};
	}

	/**
	 * Import binary recording and parse it.
	 */
	static importFromBinary(buffer: ArrayBuffer): {
		metadata: RecordingMetadata;
		frames: RecordedFrame[];
	} {
		const view = new DataView(buffer);
		let offset = 0;

		// Read header
		const magic = view.getUint32(offset, true);
		offset += 4;
		if (magic !== MAGIC_NUMBER) {
			throw new Error("Invalid pose recording: wrong magic number");
		}

		const version = view.getUint32(offset, true);
		offset += 4;
		if (version !== VERSION) {
			throw new Error(`Unsupported pose recording version: ${version}`);
		}

		const frameCount = view.getUint32(offset, true);
		offset += 4;
		const startTime = view.getFloat64(offset, true);
		offset += 8;
		const exerciseCount = view.getUint32(offset, true);
		offset += 4;
		const sessionDuration = view.getFloat64(offset, true);
		offset += 8;

		// Read exercise entries
		const exerciseGroups: ExerciseGroup[] = [];
		for (let i = 0; i < exerciseCount; i++) {
			const nameLength = view.getUint16(offset, true);
			offset += 2;
			const nameBytes = new Uint8Array(buffer, offset, nameLength);
			const name = new TextDecoder().decode(nameBytes);
			offset += nameLength;
			const startFrameIndex = view.getUint32(offset, true);
			offset += 4;
			const frameCountEx = view.getUint32(offset, true);
			offset += 4;

			exerciseGroups.push({
				name,
				startFrameIndex,
				frameCount: frameCountEx,
				startTime: 0,
			});
		}

		const metadata: RecordingMetadata = {
			magic: "POSE",
			version,
			frameCount,
			startTime,
			sessionDuration,
			exerciseGroups,
		};

		// Read frames
		const frames: RecordedFrame[] = [];
		for (let i = 0; i < frameCount; i++) {
			const frameIndex = view.getUint32(offset, true);
			offset += 4;
			const timestamp = view.getFloat64(offset, true);
			offset += 8;
			const personCount = view.getUint16(offset, true);
			offset += 2;

			const landmarks: Array<Array<Landmark>> = [];
			for (let p = 0; p < personCount; p++) {
				const personLandmarks: Landmark[] = [];
				for (let l = 0; l < LANDMARKS_PER_PERSON; l++) {
					const x = view.getFloat32(offset, true);
					offset += 4;
					const y = view.getFloat32(offset, true);
					offset += 4;
					const z = view.getFloat32(offset, true);
					offset += 4;
					const visibility = view.getFloat32(offset, true);
					offset += 4;
					const presence = view.getUint8(offset) / 255;
					offset += 1;
					offset += 3; // skip padding

					personLandmarks.push({ x, y, z, visibility, presence });
				}
				landmarks.push(personLandmarks);
			}

			// Find exercise index for this frame
			let exerciseIndex = -1;
			for (let ex = 0; ex < exerciseGroups.length; ex++) {
				const exGroup = exerciseGroups[ex];
				if (
					frameIndex >= exGroup.startFrameIndex &&
					frameIndex < exGroup.startFrameIndex + exGroup.frameCount
				) {
					exerciseIndex = ex;
					break;
				}
			}

			frames.push({
				frameIndex,
				timestamp,
				landmarks,
				exerciseIndex,
			});
		}

		return { metadata, frames };
	}
}

/**
 * Utility to create a downloadable file from exported data.
 */
export function downloadRecording(data: ArrayBuffer | string, filename: string, mimeType: string) {
	const blob = new Blob([data], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}
