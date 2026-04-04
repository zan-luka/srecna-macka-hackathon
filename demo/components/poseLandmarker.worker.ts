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
 */
function normalizeLandmarks(landmarks: Landmark[]): Landmark[] {
	if (landmarks.length < 25) {
		return landmarks;
	}

	// Get shoulder and hip landmarks
	const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
	const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
	const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
	const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];

	// Check if all required landmarks are present
	if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
		return landmarks;
	}

	// Calculate torso center and size
	const shoulderCenter = midpoint(leftShoulder, rightShoulder);
	const hipCenter = midpoint(leftHip, rightHip);
	const torsoSize = distance3D(shoulderCenter, hipCenter);

	// Avoid division by zero
	if (torsoSize === 0) {
		return landmarks;
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

	return normalized;
}

self.addEventListener("message", (event: MessageEvent<PoseLandmarksPayload>) => {
	const message = event.data;

	if (message.type !== "landmarks") {
		return;
	}

	// Normalize landmarks for each person detected
	const normalizedLandmarks = message.landmarks.map((personLandmarks) =>
		normalizeLandmarks(personLandmarks),
	);

	console.log("Pose landmarks received and normalized by worker:", {
		frameIndex: message.frameIndex,
		timestamp: message.timestamp,
		originalLandmarks: message.landmarks,
		normalizedLandmarks: normalizedLandmarks,
	});

	// Send normalized landmarks back to main thread if needed
	self.postMessage({
		type: "normalized_landmarks",
		frameIndex: message.frameIndex,
		timestamp: message.timestamp,
		landmarks: normalizedLandmarks,
	});
});

export {};
