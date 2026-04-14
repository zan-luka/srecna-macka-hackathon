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
const DB_NAME = "pose_recordings_db";
const DB_VERSION = 1;
const RECORDINGS_STORE = "recordings";

type StoredRecordingEntry = {
	startTime: number;
	timestamp: string;
	frameCount: number;
	sessionDuration?: number;
	exerciseCount: number;
	exercises: Array<{ name: string; duration?: number; frameCount: number }>;
	buffer: ArrayBuffer;
};

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
	private currentExerciseStartTimestamp: number = 0; // Using frame timestamp, not Date.now()

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
	 * @param timestamp - Frame timestamp (performance.now())
	 */
	markExerciseStart(exerciseName: string, frameIndex: number, timestamp: number) {
		if (!this.isRecording) {
			return;
		}

		// Close previous exercise if exists
		if (this.currentExerciseIndex >= 0 && this.frames.length > 0) {
			const lastFrame = this.frames[this.frames.length - 1];
			this.exerciseGroups[this.currentExerciseIndex].endTime = lastFrame.timestamp;
			this.exerciseGroups[this.currentExerciseIndex].duration =
				lastFrame.timestamp - this.currentExerciseStartTimestamp;
			this.exerciseGroups[this.currentExerciseIndex].frameCount =
				frameIndex - this.currentExerciseStartFrame;
		}

		// Start new exercise
		this.currentExerciseIndex = this.exerciseGroups.length;
		this.currentExerciseStartFrame = frameIndex;
		this.currentExerciseStartTimestamp = timestamp;

		this.exerciseGroups.push({
			name: exerciseName,
			startFrameIndex: frameIndex,
			frameCount: 0,
			startTime: timestamp,
		});

		console.log(
			`📌 Exercise started: ${exerciseName} (frame ${frameIndex})`,
		);
	}

	/**
	 * Stop recording and prepare data for export.
	 * Automatically saves the binary recording data to IndexedDB.
	 * @returns Recording metadata
	 */
	stopRecording(): RecordingMetadata {
		this.isRecording = false;

		// Finalize current exercise if exists
		if (this.currentExerciseIndex >= 0 && this.frames.length > 0) {
			const lastFrame = this.frames[this.frames.length - 1];
			this.exerciseGroups[this.currentExerciseIndex].endTime = lastFrame.timestamp;
			this.exerciseGroups[this.currentExerciseIndex].duration =
				lastFrame.timestamp - this.currentExerciseStartTimestamp;
		}

		// Calculate session duration from frame timestamps
		let sessionDuration = 0;
		if (this.frames.length > 0) {
			const firstFrame = this.frames[0];
			const lastFrame = this.frames[this.frames.length - 1];
			sessionDuration = lastFrame.timestamp - firstFrame.timestamp;
		}

		const metadata: RecordingMetadata = {
			magic: "POSE",
			version: VERSION,
			frameCount: this.frames.length,
			startTime: this.startTime,
			endTime: this.frames.length > 0 ? this.frames[this.frames.length - 1].timestamp : this.startTime,
			sessionDuration: sessionDuration,
			exerciseGroups: this.exerciseGroups,
		};

		console.log(
			`⏹️  Stopped full-session recording: ${this.frames.length} frames, ${this.exerciseGroups.length} exercises in ${sessionDuration.toFixed(0)}ms`,
		);

		// Automatically save binary data to IndexedDB
		const binaryBuffer = this.exportAsBinary(metadata);
		void this.saveToIndexedDB(binaryBuffer, metadata).catch((error) => {
			console.error("❌ Failed to save recording to IndexedDB:", error);
		});

		return metadata;
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
	 * Open IndexedDB and create schema if needed.
	 */
	private static openDatabase(): Promise<IDBDatabase> {
		if (typeof indexedDB === "undefined") {
			return Promise.reject(new Error("IndexedDB is not available in this environment."));
		}

		return new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);

			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(RECORDINGS_STORE)) {
					db.createObjectStore(RECORDINGS_STORE, { keyPath: "startTime" });
				}
			};

			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
		});
	}

	/**
	 * Save the binary recording data to IndexedDB.
	 * Keeps only the latest 20 recordings.
	 */
	private async saveToIndexedDB(buffer: ArrayBuffer, metadata: RecordingMetadata): Promise<void> {
		const db = await PoseRecorder.openDatabase();

		try {
			await new Promise<void>((resolve, reject) => {
				const transaction = db.transaction(RECORDINGS_STORE, "readwrite");
				const store = transaction.objectStore(RECORDINGS_STORE);

				const entry: StoredRecordingEntry = {
					startTime: metadata.startTime,
					timestamp: new Date(metadata.startTime).toISOString(),
					frameCount: metadata.frameCount,
					sessionDuration: metadata.sessionDuration,
					exerciseCount: metadata.exerciseGroups.length,
					exercises: metadata.exerciseGroups.map((ex) => ({
						name: ex.name,
						duration: ex.duration,
						frameCount: ex.frameCount,
					})),
					buffer,
				};

				store.put(entry);

				const allRequest = store.getAll();
				allRequest.onsuccess = () => {
					const allEntries = (allRequest.result as StoredRecordingEntry[])
						.slice()
						.sort((a, b) => a.startTime - b.startTime);

					const entriesToRemove = Math.max(0, allEntries.length - 20);
					for (let i = 0; i < entriesToRemove; i++) {
						store.delete(allEntries[i].startTime);
					}
				};

				transaction.oncomplete = () => resolve();
				transaction.onerror = () =>
					reject(transaction.error ?? new Error("Failed to write recording to IndexedDB."));
				transaction.onabort = () =>
					reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
			});

			const sizeMB = (buffer.byteLength / (1024 * 1024)).toFixed(2);
			console.log(
				`💾 Recording saved to IndexedDB: pose_recording_${metadata.startTime} (${sizeMB} MB)`,
			);
		} finally {
			db.close();
		}
	}

	/**
	 * Load a recording from IndexedDB by startTime.
	 */
	static async loadFromLocalStorage(startTime: number): Promise<{
		metadata: RecordingMetadata;
		frames: RecordedFrame[];
	} | null> {
		try {
			const db = await PoseRecorder.openDatabase();
			try {
				const entry = await new Promise<StoredRecordingEntry | undefined>((resolve, reject) => {
					const transaction = db.transaction(RECORDINGS_STORE, "readonly");
					const store = transaction.objectStore(RECORDINGS_STORE);
					const request = store.get(startTime);

					request.onsuccess = () => resolve(request.result as StoredRecordingEntry | undefined);
					request.onerror = () => reject(request.error ?? new Error("Failed to read recording."));
				});

				if (!entry) {
					console.warn(`Recording not found: pose_recording_${startTime}`);
					return null;
				}

				return PoseRecorder.importFromBinary(entry.buffer);
			} finally {
				db.close();
			}
		} catch (error) {
			console.error("❌ Error loading from IndexedDB:", error);
			return null;
		}
	}

	/**
	 * Get list of all saved recordings from IndexedDB.
	 */
	static async getRecordingsList(): Promise<Array<{
		timestamp: string;
		startTime: number;
		frameCount: number;
		sessionDuration?: number;
		exerciseCount: number;
		exercises: Array<{ name: string; duration?: number; frameCount: number }>;
	}> | null> {
		try {
			const db = await PoseRecorder.openDatabase();
			try {
				const allEntries = await new Promise<StoredRecordingEntry[]>((resolve, reject) => {
					const transaction = db.transaction(RECORDINGS_STORE, "readonly");
					const store = transaction.objectStore(RECORDINGS_STORE);
					const request = store.getAll();

					request.onsuccess = () => resolve((request.result as StoredRecordingEntry[]) ?? []);
					request.onerror = () => reject(request.error ?? new Error("Failed to read recordings list."));
				});

				return allEntries
					.map((entry) => ({
						timestamp: entry.timestamp,
						startTime: entry.startTime,
						frameCount: entry.frameCount,
						sessionDuration: entry.sessionDuration,
						exerciseCount: entry.exerciseCount,
						exercises: entry.exercises,
					}))
					.sort((a, b) => b.startTime - a.startTime);
			} finally {
				db.close();
			}
		} catch (error) {
			console.error("❌ Error reading recordings list from IndexedDB:", error);
			return null;
		}
	}

	/**
	 * Clear a specific recording from IndexedDB.
	 */
	static async clearRecording(startTime: number): Promise<void> {
		try {
			const db = await PoseRecorder.openDatabase();
			try {
				await new Promise<void>((resolve, reject) => {
					const transaction = db.transaction(RECORDINGS_STORE, "readwrite");
					const store = transaction.objectStore(RECORDINGS_STORE);
					store.delete(startTime);

					transaction.oncomplete = () => resolve();
					transaction.onerror = () =>
						reject(transaction.error ?? new Error("Failed to clear recording from IndexedDB."));
					transaction.onabort = () =>
						reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
				});
			} finally {
				db.close();
			}

			console.log(`🗑️  Recording cleared: pose_recording_${startTime}`);
		} catch (error) {
			console.error("❌ Error clearing recording from IndexedDB:", error);
		}
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
