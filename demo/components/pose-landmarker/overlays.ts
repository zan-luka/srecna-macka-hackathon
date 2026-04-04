import { PoseLandmarker } from "@mediapipe/tasks-vision";
import type { OverlayRenderer } from "./types";

export const defaultPoseOverlay: OverlayRenderer = ({
	result,
	drawingUtils,
	ctx,
	width,
	height,
}) => {
	const normalizedPoses = result.landmarks;

	if (!normalizedPoses?.length) {
		return;
	}

	ctx.save();
	ctx.clearRect(0, 0, width, height);

	for (const landmarks of normalizedPoses) {
		drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
			color: "#fff",
			lineWidth: 3,
		});

		drawingUtils.drawLandmarks(landmarks, {
			color: "#fff",
			fillColor: "#22d3ee",
			lineWidth: 1.5,
			radius: 4,
		});
	}

	ctx.restore();
};
