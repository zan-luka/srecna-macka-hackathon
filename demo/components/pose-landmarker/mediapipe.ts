import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import {
	POSE_DETECTION_CONFIDENCE,
	POSE_PRESENCE_CONFIDENCE,
	TRACKING_CONFIDENCE,
} from "./constants";

export async function createPoseLandmarkerWithFallback(
	vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
	modelPath: string,
) {
	try {
		return await PoseLandmarker.createFromOptions(vision, {
			baseOptions: { modelAssetPath: modelPath, delegate: "GPU" },
			runningMode: "VIDEO",
			numPoses: 1,
			minPoseDetectionConfidence: POSE_DETECTION_CONFIDENCE,
			minPosePresenceConfidence: POSE_PRESENCE_CONFIDENCE,
			minTrackingConfidence: TRACKING_CONFIDENCE,
		});
	} catch {
		console.log("GPU delegate failed to initialize, falling back to CPU.");
		return PoseLandmarker.createFromOptions(vision, {
			baseOptions: { modelAssetPath: modelPath, delegate: "CPU" },
			runningMode: "VIDEO",
			numPoses: 1,
			minPoseDetectionConfidence: POSE_DETECTION_CONFIDENCE,
			minPosePresenceConfidence: POSE_PRESENCE_CONFIDENCE,
			minTrackingConfidence: TRACKING_CONFIDENCE,
		});
	}
}
