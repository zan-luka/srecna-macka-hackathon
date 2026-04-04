type Landmark = { x: number; y: number; z: number; visibility?: number; presence?: number };

type PoseLandmarksPayload = {
	type: "landmarks";
	frameIndex: number;
	timestamp: number;
	landmarks: Array<Array<Landmark>>;
};

// MediaPipe Pose landmark indices
const POSE_LANDMARKS = {
	LEFT_SHOULDER: 11,
	RIGHT_SHOULDER: 12,
	LEFT_HIP: 23,
	RIGHT_HIP: 24,
} as const;

/**
 * Calculates the distance between two 3D points
 */
function distance3D(p1: Landmark, p2: Landmark): number {
	const dx = p1.x - p2.x;
	const dy = p1.y - p2.y;
	const dz = p1.z - p2.z;
	return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculates the midpoint between two 3D points
 */
function midpoint(p1: Landmark, p2: Landmark): Landmark {
	return {
		x: (p1.x + p2.x) / 2,
		y: (p1.y + p2.y) / 2,
		z: (p1.z + p2.z) / 2,
	};
}

/**
 * Normalizes pose landmarks using torso-based normalization
 * This makes poses invariant to body size and camera position
 * 
 * Algorithm:
 * 1. Calculate torso size (distance between shoulder midpoint and hip midpoint)
 * 2. For each landmark, compute its position relative to hip center
 * 3. Scale by torso size to normalize for different body sizes
 * 
 * Returns: { landmarks, torsoSize }
 */
function normalizeLandmarks(landmarks: Landmark[]): {
	landmarks: Landmark[];
	torsoSize: number;
} {
	if (landmarks.length < 25) {
		return { landmarks, torsoSize: 0 };
	}

	// Get shoulder and hip landmarks
	const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
	const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
	const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
	const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];

	// Check if all required landmarks are present
	if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
		return { landmarks, torsoSize: 0 };
	}

	// Calculate torso center and size
	const shoulderCenter = midpoint(leftShoulder, rightShoulder);
	const hipCenter = midpoint(leftHip, rightHip);
	const torsoSize = distance3D(shoulderCenter, hipCenter);

	// Avoid division by zero
	if (torsoSize === 0) {
		return { landmarks, torsoSize: 0 };
	}

	// Normalize each landmark
	const normalized: Landmark[] = landmarks.map((landmark) => {
		if (!landmark) return landmark;

		// Calculate relative position from hip center
		const relX = (landmark.x - hipCenter.x) / torsoSize;
		const relY = (landmark.y - hipCenter.y) / torsoSize;
		const relZ = (landmark.z - hipCenter.z) / torsoSize;

		return {
			x: relX,
			y: relY,
			z: relZ,
			visibility: landmark.visibility,
			presence: landmark.presence,
		};
	});

	return { landmarks: normalized, torsoSize };
}

/**
 * Helper function to get statistics about landmarks
 */
function getLandmarkStats(landmarks: Landmark[]): {
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
		return { count: 0, avgX: 0, avgY: 0, avgZ: 0, minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
	}

	let sumX = 0, sumY = 0, sumZ = 0;
	let minX = landmarks[0].x, maxX = landmarks[0].x;
	let minY = landmarks[0].y, maxY = landmarks[0].y;
	let minZ = landmarks[0].z, maxZ = landmarks[0].z;

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

self.addEventListener("message", (event: MessageEvent<PoseLandmarksPayload>) => {
	const message = event.data;

	if (message.type !== "landmarks") {
		return;
	}

	// Normalize landmarks for each person detected
	const normalizedResults = message.landmarks.map((personLandmarks) =>
		normalizeLandmarks(personLandmarks),
	);

	const normalizedLandmarks = normalizedResults.map((r) => r.landmarks);
	const torsoSize = normalizedResults[0]?.torsoSize || 0;

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

	// Send normalized landmarks back to main thread if needed
	self.postMessage({
		type: "normalized_landmarks",
		frameIndex: message.frameIndex,
		timestamp: message.timestamp,
		originalLandmarks: message.landmarks,
		normalizedLandmarks: normalizedLandmarks,
		torsoSize: torsoSize,
	});
});

export {};
