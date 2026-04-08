import type { Landmark } from "./types";

/**
 * Binary format for recorded pose data.
 * Optimized for space efficiency (each landmark = 20 bytes).
 *
 * Format: [header][frames]
 * Header (28 bytes):
 *   - magic: 4 bytes "POSE" (0x504F5345)
 *   - version: 4 bytes (1)
 *   - frameCount: 4 bytes uint32
 *   - startTime: 8 bytes float64 (milliseconds)
 *   - exerciseName: 8 bytes (max 8 chars, padded)
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
};

export type RecordingMetadata = {
	magic: string; // "POSE"
	version: number;
	frameCount: number;
	startTime: number;
	endTime?: number;
	exerciseName: string;
	duration?: number; // milliseconds
};

const MAGIC_NUMBER = 0x504f5345; // "POSE"
const VERSION = 1;
const LANDMARKS_PER_PERSON = 33;
const BYTES_PER_LANDMARK = 20; // 4 + 4 + 4 + 4 + 1 + 3 padding

/**
 * Records pose frames captured during an exercise session.
 * Stores frames in memory and can export as binary ArrayBuffer.
 */
export class PoseRecorder {
	private frames: RecordedFrame[] = [];
	private isRecording: boolean = false;
	private startTime: number = 0;
	private exerciseName: string = "";

	/**
	 * Start recording pose frames for an exercise.
	 * @param exerciseName - Name of the exercise being performed
	 */
	startRecording(exerciseName: string) {
		this.frames = [];
		this.isRecording = true;
		this.startTime = Date.now();
		this.exerciseName = exerciseName;
		console.log(`📹 Started recording: ${exerciseName}`);
	}

	/**
	 * Stop recording and prepare data for export.
	 * @returns Recording metadata
	 */
	stopRecording(): RecordingMetadata {
		this.isRecording = false;
		const endTime = Date.now();
		console.log(
			`⏹️  Stopped recording: ${this.frames.length} frames captured in ${endTime - this.startTime}ms`,
		);

		return {
			magic: "POSE",
			version: VERSION,
			frameCount: this.frames.length,
			startTime: this.startTime,
			endTime: endTime,
			exerciseName: this.exerciseName,
			duration: endTime - this.startTime,
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
	 * Format optimized for space efficiency.
	 */
	exportAsBinary(metadata: RecordingMetadata): ArrayBuffer {
		const estimatedSize = 28 + this.frames.length * (16 + LANDMARKS_PER_PERSON * BYTES_PER_LANDMARK);
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

		// Write exercise name (8 bytes, padded)
		const nameBytes = new TextEncoder().encode(metadata.exerciseName.substring(0, 8));
		for (let i = 0; i < 8; i++) {
			view.setUint8(offset + i, nameBytes[i] ?? 0);
		}
		offset += 8;

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
	 * Each row: frameIndex, timestamp, personIndex, landmarkIndex, x, y, z, visibility
	 */
	exportAsCSV(metadata: RecordingMetadata): string {
		const lines: string[] = [
			"# Pose Recording Export",
			`# Exercise: ${metadata.exerciseName}`,
			`# Duration: ${metadata.duration}ms`,
			`# Frames: ${metadata.frameCount}`,
			`# Start: ${new Date(metadata.startTime).toISOString()}`,
			"frameIndex,timestamp,personIndex,landmarkIndex,x,y,z,visibility",
		];

		for (const frame of this.frames) {
			for (let personIdx = 0; personIdx < frame.landmarks.length; personIdx++) {
				for (let lmIdx = 0; lmIdx < frame.landmarks[personIdx].length; lmIdx++) {
					const lm = frame.landmarks[personIdx][lmIdx];
					lines.push(
						`${frame.frameIndex},${frame.timestamp},${personIdx},${lmIdx},${lm.x},${lm.y},${lm.z},${lm.visibility ?? 0}`,
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

		// Read exercise name
		const nameBytes = new Uint8Array(buffer, offset, 8);
		const exerciseName = new TextDecoder().decode(nameBytes).replace(/\0/g, "");
		offset += 8;

		const metadata: RecordingMetadata = {
			magic: "POSE",
			version,
			frameCount,
			startTime,
			exerciseName,
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

			frames.push({
				frameIndex,
				timestamp,
				landmarks,
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
