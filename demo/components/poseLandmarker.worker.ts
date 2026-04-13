// import { getLandmarkStats, normalizeLandmarks } from "./pose-landmarker/workerNormalization";
import { normalizeLandmarks } from "./pose-landmarker/workerNormalization";
import { calculateJointAngles } from "./pose-landmarker/jointAngles";
import { createKNNClassifier, parseTrainingCsv, type KNNClassifier } from "./pose-landmarker/knnClassifier";
import { PoseRecorder, type RecordingMetadata } from "./pose-landmarker/poseRecorder";
import { createOneEuroFilters, type OneEuroFilter } from "./pose-landmarker/oneEuroFilter";
import type { ExercisePrediction, JointAngle, PoseWorkerInboundMessage } from "./pose-landmarker/types";

let classifier: KNNClassifier | null = null;
let classifierStatus: "loading" | "ready" | "error" = "loading";
let classifierInitPromise: Promise<void> | null = null;
let recorder = new PoseRecorder();
let isRecording = false;
let recordingMetadata: RecordingMetadata | null = null;
let currentExerciseQualityParameters: Record<string, number> | null = null;
let oneEuroFilters: OneEuroFilter[] = [];


async function ensureClassifierReady() {
	if (classifierStatus === "ready" || classifierStatus === "error") {
		return;
	}

	if (!classifierInitPromise) {
		classifierInitPromise = (async () => {
			try {
				const response = await fetch("/api/training-data");
				if (!response.ok) {
					throw new Error(`Failed to load training data (${response.status})`);
				}

				const csvText = await response.text();
				const samples = parseTrainingCsv(csvText);
				classifier = createKNNClassifier(samples);
				classifierStatus = "ready";
				console.log(
					`✅ Exercise classifier ready (${classifier.sampleCount} samples, ${classifier.labels.length} labels, unknown threshold=${classifier.unknownDistanceThreshold.toFixed(3)})`,
				);
			} catch (error) {
				classifierStatus = "error";
				const message = error instanceof Error ? error.message : "Unknown classifier error";
				console.error(`❌ Failed to initialize classifier: ${message}`);
			}
		})();
	}

	await classifierInitPromise;
}

void ensureClassifierReady();

self.addEventListener("message", (event: MessageEvent<PoseWorkerInboundMessage>) => {
	const message = event.data;

	if (message.type === "recording_start") {
		recorder = new PoseRecorder();
		recorder.startRecording(message.exerciseName || "Unknown Exercise");
		isRecording = true;
		console.log(`📹 Recording started for: ${message.exerciseName}`);
		return;
	}

	if (message.type === "recording_stop") {
		recordingMetadata = recorder.stopRecording();
		isRecording = false;
		const stats = recorder.getStats();
		console.log(`📊 Recording stats:`, stats);
		// Send recording data back to main thread
		const binaryData = recorder.exportAsBinary(recordingMetadata);
		self.postMessage({
			type: "recording_data",
			metadata: recordingMetadata,
			stats: stats,
			buffer: binaryData,
		});
		return;
	}

	if (message.type === "exercise_started") {
		currentExerciseQualityParameters = message.qualityParameters ?? null;
		// Reset filters for new exercise
		oneEuroFilters = [];
		console.log(
			`🏁 Exercise started: ${message.exerciseName} (${message.mode === "duration" ? `${message.target}s` : `${message.target} reps`})${currentExerciseQualityParameters ? `, quality params: ${Object.keys(currentExerciseQualityParameters).join(", ")}` : ""}`,
		);
		return;
	}

	if (message.type !== "landmarks") {
		return;
	}

	// Initialize filters on first frame if needed
	if (oneEuroFilters.length === 0 && message.landmarks.length > 0) {
		const landmarkCount = message.landmarks[0]?.length || 33; // MediaPipe has 33 landmarks per pose
		oneEuroFilters = createOneEuroFilters(landmarkCount, {
			minCutoff: 1.0,
			beta: 0.1,
			dCutoff: 1.0,
		});
	}

	// Apply 1€ filter to smooth landmarks
	const smoothedLandmarks = message.landmarks.map((personLandmarks) =>
		personLandmarks.map((landmark, index) => {
			if (index >= oneEuroFilters.length) {
				return landmark; // Fallback if filter count doesn't match
			}

			const filtered = oneEuroFilters[index]!.filter(
				landmark.x,
				landmark.y,
				landmark.z,
				message.timestamp,
			);

			return {
				...landmark,
				x: filtered.x,
				y: filtered.y,
				z: filtered.z,
			};
		}),
	);

	// Record frame if recording is active
	if (isRecording) {
		recorder.recordFrame(message.frameIndex, message.timestamp, smoothedLandmarks);
	}

	// Normalize landmarks for each person detected
	const normalizedResults = smoothedLandmarks.map((personLandmarks) =>
		normalizeLandmarks(personLandmarks),
	);

	const normalizedLandmarks = normalizedResults.map((r) => r.landmarks);
	const torsoSize = normalizedResults[0]?.torsoSize || 0;

	// Calculate joint angles from smoothed landmarks
	const jointAngles = smoothedLandmarks.map((personLandmarks) =>
		calculateJointAngles(personLandmarks),
	);

	if (classifierStatus === "loading") {
		void ensureClassifierReady();
	}

	const predictions =
		classifierStatus === "ready" && classifier
			? message.landmarks.map((personLandmarks) => classifier?.predict(personLandmarks) ?? null)
			: message.landmarks.map(() => null);

	// Send normalized landmarks and joint angles back to main thread
	self.postMessage({
		type: "normalized_landmarks",
		frameIndex: message.frameIndex,
		timestamp: message.timestamp,
		originalLandmarks: message.landmarks,
		normalizedLandmarks: normalizedLandmarks,
		torsoSize: torsoSize,
		jointAngles: jointAngles,
		predictions,
		classifierStatus,
		recordingFrameCount: isRecording ? recorder.getFrameCount() : undefined,
	});
});

export {};
