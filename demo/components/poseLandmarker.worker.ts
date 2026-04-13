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

const QUALITY_PARAMETER_TOLERANCE_DEGREES = 20;

const QUALITY_PARAM_TO_ANGLE_NAME: Record<string, string> = {
	leftKnee: "LEFT_KNEE",
	rightKnee: "RIGHT_KNEE",
	leftElbow: "LEFT_ELBOW",
	rightElbow: "RIGHT_ELBOW",
	bodyTilt: "TORSO",
};

type QualityParametersResult = {
	passes: boolean;
	accuracy: number; // 0-1 range
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
): QualityParametersResult {
	if (!prediction || prediction.label === "unknown") {
		return { passes: false, accuracy: 0 };
	}

	if (!qualityParameters) {
		return { passes: true, accuracy: 1 };
	}

	const angleMap = new Map(jointAngles.map((jointAngle) => [jointAngle.name, jointAngle.angle]));
	const accuracyScores: number[] = [];

	for (const [qualityParameterName, target] of Object.entries(qualityParameters)) {
		const angleName = QUALITY_PARAM_TO_ANGLE_NAME[qualityParameterName];
		if (!angleName) {
			continue;
		}

		const actualAngle = angleMap.get(angleName);
		if (actualAngle === undefined) {
			return { passes: false, accuracy: 0 };
		}

		const targetAngle = resolveQualityTargetAngle(qualityParameterName, target);
		const angleDifference = Math.abs(actualAngle - targetAngle);

		// Calculate accuracy for this parameter: 0 at tolerance boundary, 1 at target
		const paramAccuracy = Math.max(0, 1 - angleDifference / QUALITY_PARAMETER_TOLERANCE_DEGREES);
		accuracyScores.push(paramAccuracy);

		if (angleDifference > QUALITY_PARAMETER_TOLERANCE_DEGREES) {
			// Still calculate accuracy for this parameter but mark overall as not passing
		}
	}

	const overallAccuracy = accuracyScores.length > 0
		? accuracyScores.reduce((sum, score) => sum + score, 0) / accuracyScores.length
		: 1;

	const passes = accuracyScores.every((score) => score > (1 - QUALITY_PARAMETER_TOLERANCE_DEGREES / QUALITY_PARAMETER_TOLERANCE_DEGREES));

	return { passes, accuracy: overallAccuracy };
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

	const qualityResult = passesQualityParameters(prediction, jointAngles, qualityParameters);

	if (qualityResult.passes) {
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

	const rawPredictions =
		classifierStatus === "ready" && classifier
			? smoothedLandmarks.map((personLandmarks) => classifier?.predict(personLandmarks) ?? null)
			: smoothedLandmarks.map(() => null);

	const qualityResults = rawPredictions.map((prediction, personIndex) =>
		passesQualityParameters(prediction, jointAngles[personIndex] ?? [], currentExerciseQualityParameters),
	);

	const predictions = qualityResults.map((result) => {
		if (!result.passes) {
			return {
				label: result.accuracy > 0 ? rawPredictions[qualityResults.indexOf(result)]?.label ?? "unknown" : "unknown",
				confidence: 0,
				distance: rawPredictions[qualityResults.indexOf(result)]?.distance ?? 0,
			};
		}
		const index = qualityResults.indexOf(result);
		return rawPredictions[index] ?? null;
	});

	const accuracyValues = qualityResults.map((result) => result.accuracy);

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
		accuracyValues,
	});
});

export {};
