import type { Landmark } from "./types";

const POSE_LANDMARKS = {
	LEFT_SHOULDER: 11,
	RIGHT_SHOULDER: 12,
	LEFT_HIP: 23,
	RIGHT_HIP: 24,
} as const;

function distance3D(p1: Landmark, p2: Landmark): number {
	const dx = p1.x - p2.x;
	const dy = p1.y - p2.y;
	const dz = p1.z - p2.z;
	return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function midpoint(p1: Landmark, p2: Landmark): Landmark {
	return {
		x: (p1.x + p2.x) / 2,
		y: (p1.y + p2.y) / 2,
		z: (p1.z + p2.z) / 2,
	};
}

export function normalizeLandmarks(landmarks: Landmark[]): {
	landmarks: Landmark[];
	torsoSize: number;
} {
	if (landmarks.length < 25) {
		return { landmarks, torsoSize: 0 };
	}

	const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
	const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
	const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
	const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];

	if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
		return { landmarks, torsoSize: 0 };
	}

	const shoulderCenter = midpoint(leftShoulder, rightShoulder);
	const hipCenter = midpoint(leftHip, rightHip);
	const torsoSize = distance3D(shoulderCenter, hipCenter);

	if (torsoSize === 0) {
		return { landmarks, torsoSize: 0 };
	}

	const normalized = landmarks.map((landmark) => ({
		x: (landmark.x - hipCenter.x) / torsoSize,
		y: (landmark.y - hipCenter.y) / torsoSize,
		z: (landmark.z - hipCenter.z) / torsoSize,
		visibility: landmark.visibility,
		presence: landmark.presence,
	}));

	return { landmarks: normalized, torsoSize };
}

export function getLandmarkStats(landmarks: Landmark[]): {
	count: number;
	avgX: number;
	avgY: number;
	avgZ: number;
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
	minZ: number;
	maxZ: number;
} {
	if (landmarks.length === 0) {
		return {
			count: 0,
			avgX: 0,
			avgY: 0,
			avgZ: 0,
			minX: 0,
			maxX: 0,
			minY: 0,
			maxY: 0,
			minZ: 0,
			maxZ: 0,
		};
	}

	let sumX = 0;
	let sumY = 0;
	let sumZ = 0;
	let minX = landmarks[0].x;
	let maxX = landmarks[0].x;
	let minY = landmarks[0].y;
	let maxY = landmarks[0].y;
	let minZ = landmarks[0].z;
	let maxZ = landmarks[0].z;

	for (const lm of landmarks) {
		sumX += lm.x;
		sumY += lm.y;
		sumZ += lm.z;
		minX = Math.min(minX, lm.x);
		maxX = Math.max(maxX, lm.x);
		minY = Math.min(minY, lm.y);
		maxY = Math.max(maxY, lm.y);
		minZ = Math.min(minZ, lm.z);
		maxZ = Math.max(maxZ, lm.z);
	}

	return {
		count: landmarks.length,
		avgX: sumX / landmarks.length,
		avgY: sumY / landmarks.length,
		avgZ: sumZ / landmarks.length,
		minX,
		maxX,
		minY,
		maxY,
		minZ,
		maxZ,
	};
}
