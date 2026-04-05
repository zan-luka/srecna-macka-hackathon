// import { getLandmarkStats, normalizeLandmarks } from "./pose-landmarker/workerNormalization";
import { normalizeLandmarks } from "./pose-landmarker/workerNormalization";
import { calculateJointAngles } from "./pose-landmarker/jointAngles";
import type { PoseWorkerInboundMessage } from "./pose-landmarker/types";

self.addEventListener("message", (event: MessageEvent<PoseWorkerInboundMessage>) => {
	const message = event.data;

	if (message.type === "exercise_started") {
		console.log(
			`🏁 Exercise started: ${message.exerciseName} (${message.mode === "duration" ? `${message.target}s` : `${message.target} reps`})`,
		);
		return;
	}

	if (message.type !== "landmarks") {
		return;
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
	});
});

export {};
