// import { getLandmarkStats, normalizeLandmarks } from "./pose-landmarker/workerNormalization";
import { normalizeLandmarks } from "./pose-landmarker/workerNormalization";
import { calculateJointAngles } from "./pose-landmarker/jointAngles";
import { createKNNClassifier, parseTrainingCsv, type KNNClassifier } from "./pose-landmarker/knnClassifier";
import { PoseRecorder, type RecordingMetadata } from "./pose-landmarker/poseRecorder";
import type { ExercisePrediction, JointAngle, PoseWorkerInboundMessage } from "./pose-landmarker/types";

let classifier: KNNClassifier | null = null;
let classifierStatus: "loading" | "ready" | "error" = "loading";
let classifierInitPromise: Promise<void> | null = null;
let recorder = new PoseRecorder();
let isRecording = false;
let recordingMetadata: RecordingMetadata | null = null;
let currentExerciseQualityParameters: Record<string, number> | null = null;

const QUALITY_PARAMETER_TOLERANCE_DEGREES = 20;

const QUALITY_PARAM_TO_ANGLE_NAME: Record<string, string> = {
	leftKnee: "LEFT_KNEE",
	rightKnee: "RIGHT_KNEE",
	leftElbow: "LEFT_ELBOW",
	rightElbow: "RIGHT_ELBOW",
	bodyTilt: "TORSO",
};

function resolveQualityTargetAngle(qualityParameterName: string, targetValue: number): number {
	// bodyTilt in exercise plans is stored as deviation from upright (0 = upright).
	// TORSO angle is measured as the hip joint angle (upright ~= 180°),
	// so we convert by subtracting tilt from 180.
	if (qualityParameterName === "bodyTilt") {
		return 180 - targetValue;
	}

	return targetValue;
}

function passesQualityParameters(
	prediction: ExercisePrediction | null,
	jointAngles: JointAngle[],
	qualityParameters: Record<string, number> | null,
): boolean {
	if (!prediction || prediction.label === "unknown") {
		return false;
	}

	if (!qualityParameters) {
		return true;
	}

	const angleMap = new Map(jointAngles.map((jointAngle) => [jointAngle.name, jointAngle.angle]));

	for (const [qualityParameterName, target] of Object.entries(qualityParameters)) {
		const angleName = QUALITY_PARAM_TO_ANGLE_NAME[qualityParameterName];
		if (!angleName) {
			continue;
		}

		const actualAngle = angleMap.get(angleName);
		if (actualAngle === undefined) {
			return false;
		}

		const targetAngle = resolveQualityTargetAngle(qualityParameterName, target);
		if (Math.abs(actualAngle - targetAngle) > QUALITY_PARAMETER_TOLERANCE_DEGREES) {
			return false;
		}
	}

	return true;
}

function applyQualityGate(
	prediction: ExercisePrediction | null,
	jointAngles: JointAngle[],
	qualityParameters: Record<string, number> | null,
): ExercisePrediction | null {
	if (!prediction) {
		return null;
	}

	if (prediction.label === "unknown") {
		return prediction;
	}

	if (prediction.confidence < 0.8) {
		return {
			label: "unknown",
			confidence: prediction.confidence,
			distance: prediction.distance,
		};
	}

	if (passesQualityParameters(prediction, jointAngles, qualityParameters)) {
		return prediction;
	}

	return {
		label: "unknown",
		confidence: 0,
		distance: prediction.distance,
	};
}

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
		console.log(
			`🏁 Exercise started: ${message.exerciseName} (${message.mode === "duration" ? `${message.target}s` : `${message.target} reps`})${currentExerciseQualityParameters ? `, quality params: ${Object.keys(currentExerciseQualityParameters).join(", ")}` : ""}`,
		);
		return;
	}

	if (message.type !== "landmarks") {
		return;
	}

	// Record frame if recording is active
	if (isRecording) {
		recorder.recordFrame(message.frameIndex, message.timestamp, message.landmarks);
	}

	// Normalize landmarks for each person detected
	const normalizedResults = message.landmarks.map((personLandmarks) =>
		normalizeLandmarks(personLandmarks),
	);

	const normalizedLandmarks = normalizedResults.map((r) => r.landmarks);
	const torsoSize = normalizedResults[0]?.torsoSize || 0;

	// Calculate joint angles from original landmarks
	const jointAngles = message.landmarks.map((personLandmarks) =>
		calculateJointAngles(personLandmarks),
	);

	if (classifierStatus === "loading") {
		void ensureClassifierReady();
	}

	const rawPredictions =
		classifierStatus === "ready" && classifier
			? message.landmarks.map((personLandmarks) => classifier?.predict(personLandmarks) ?? null)
			: message.landmarks.map(() => null);

	const predictions = rawPredictions.map((prediction, personIndex) =>
		applyQualityGate(prediction, jointAngles[personIndex] ?? [], currentExerciseQualityParameters),
	);

	/*
	// Get statistics for comparison
	const originalStats = message.landmarks.map((lm) => getLandmarkStats(lm));
	const normalizedStats = normalizedLandmarks.map((lm) => getLandmarkStats(lm));

	
	console.group(`🎯 Frame #${message.frameIndex} - Normalization Test`);
	console.log("ORIGINAL LANDMARKS STATS:");
	console.table(originalStats);
	console.log("NORMALIZED LANDMARKS STATS:");
	console.table(normalizedStats);
	console.log("First landmark comparison (Nose):");
	console.table({
		Original: message.landmarks[0]?.[0],
		Normalized: normalizedLandmarks[0]?.[0],
	});
	console.log(`Torso Size: ${torsoSize.toFixed(4)}`);
	console.groupEnd();
	*/

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
