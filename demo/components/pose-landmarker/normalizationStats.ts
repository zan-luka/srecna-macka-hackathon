import type { Landmark, NormalizedLandmarksMessage, NormalizedStats } from "./types";

function toRange(landmarks: Landmark[]) {
	const minX = Math.min(...landmarks.map((l) => l?.x || 0));
	const maxX = Math.max(...landmarks.map((l) => l?.x || 0));
	const minY = Math.min(...landmarks.map((l) => l?.y || 0));
	const maxY = Math.max(...landmarks.map((l) => l?.y || 0));

	return {
		minX: parseFloat(minX.toFixed(3)),
		maxX: parseFloat(maxX.toFixed(3)),
		minY: parseFloat(minY.toFixed(3)),
		maxY: parseFloat(maxY.toFixed(3)),
	};
}

export function getNormalizedStats(
	message: NormalizedLandmarksMessage,
): NormalizedStats | null {
	const originalLandmarks = message.originalLandmarks[0] || [];
	const normalizedLandmarks = message.normalizedLandmarks[0] || [];

	if (originalLandmarks.length === 0 || normalizedLandmarks.length === 0) {
		return null;
	}

	return {
		originalRange: toRange(originalLandmarks),
		normalizedRange: toRange(normalizedLandmarks),
		torsoSize: message.torsoSize || 0,
	};
}
