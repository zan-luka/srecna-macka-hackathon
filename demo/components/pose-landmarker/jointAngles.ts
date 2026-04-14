import type { Landmark } from "./types";

/**
 * Joint angle definitions for MediaPipe pose landmarks.
 * Angle is calculated at the middle landmark (joint) between two other points.
 */
export interface JointAngle {
	name: string;
	point1Index: number; // Start point
	jointIndex: number; // Middle point (where angle is calculated)
	point2Index: number; // End point
	angle: number; // In degrees (0-360)
}

/**
 * Common joint angle definitions using MediaPipe 33-landmark model.
 * Indices reference: https://developers.google.com/mediapipe/solutions/vision/pose_landmarker#pose_landmarks
 */
export const COMMON_JOINT_ANGLES = {
	// Arms
	LEFT_ELBOW: { point1: 11, joint: 13, point2: 15 }, // shoulder -> elbow -> wrist
	RIGHT_ELBOW: { point1: 12, joint: 14, point2: 16 },
	LEFT_SHOULDER: { point1: 13, joint: 11, point2: 23 }, // elbow -> shoulder -> hip
	RIGHT_SHOULDER: { point1: 14, joint: 12, point2: 24 },

	// Legs
	LEFT_KNEE: { point1: 23, joint: 25, point2: 27 }, // hip -> knee -> ankle
	RIGHT_KNEE: { point1: 24, joint: 26, point2: 28 },
	LEFT_HIP: { point1: 25, joint: 23, point2: 11 }, // knee -> hip -> shoulder
	RIGHT_HIP: { point1: 26, joint: 24, point2: 12 },

	// Neck
	NECK: { point1: 11, joint: 0, point2: 12 }, // left shoulder -> nose -> right shoulder

	// Torso
	TORSO: { point1: 11, joint: 23, point2: 25 }, // left shoulder -> left hip -> left knee (approximates torso lean)
} as const;

/**
 * Calculate a signed lateral lean angle from shoulder midpoint to hip midpoint.
 * Positive values indicate a lean toward the right side of the screen.
 * Negative values indicate a lean toward the left side of the screen.
 *
 * This is useful for comparing whether the pelvis shifts sideways relative to the shoulders.
 */
export function calculateLateralLeanAngle(leftShoulder: Landmark, rightShoulder: Landmark, leftHip: Landmark, rightHip: Landmark): number {
	const shoulderMidpoint = {
		x: (leftShoulder.x + rightShoulder.x) / 2,
		y: (leftShoulder.y + rightShoulder.y) / 2,
		z: ((leftShoulder.z ?? 0) + (rightShoulder.z ?? 0)) / 2,
	};

	const hipMidpoint = {
		x: (leftHip.x + rightHip.x) / 2,
		y: (leftHip.y + rightHip.y) / 2,
		z: ((leftHip.z ?? 0) + (rightHip.z ?? 0)) / 2,
	};

	const dx = hipMidpoint.x - shoulderMidpoint.x;
	const dy = hipMidpoint.y - shoulderMidpoint.y;

	if (dx === 0 && dy === 0) {
		return 0;
	}

	return Math.round((Math.atan2(dx, dy) * 180) / Math.PI * 10) / 10;
}

/**
 * Calculate the angle (in degrees) at a joint between three landmarks.
 * Uses atan2 for robust angle calculation working with any orientation.
 *
 * Formula: angle = atan2(point2.y - joint.y, point2.x - joint.x) - atan2(point1.y - joint.y, point1.x - joint.x)
 *
 * @param point1 - The first landmark (start point)
 * @param joint - The joint landmark (where angle is calculated)
 * @param point2 - The third landmark (end point)
 * @returns Angle in degrees (0-180)
 */
export function calculateAngle(point1: Landmark, joint: Landmark, point2: Landmark): number {
    // 3D vectors from joint to each point
    const v1 = {
        x: point1.x - joint.x,
        y: point1.y - joint.y,
        z: (point1.z ?? 0) - (joint.z ?? 0),
    };
    const v2 = {
        x: point2.x - joint.x,
        y: point2.y - joint.y,
        z: (point2.z ?? 0) - (joint.z ?? 0),
    };

    const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2 + v1.z ** 2);
    const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2 + v2.z ** 2);

    if (mag1 === 0 || mag2 === 0) return 0;

    // Clamp to [-1, 1] to avoid NaN from floating point drift
    const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return Math.round(Math.acos(cosAngle) * (180 / Math.PI) * 10) / 10;
}

/**
 * Calculate multiple joint angles from landmarks.
 * Returns only angles for landmarks that are present (visibility > 0.5).
 *
 * @param landmarks - Array of 33 MediaPipe pose landmarks
 * @param angleDefs - Object mapping angle names to point indices
 * @returns Array of calculated joint angles
 */
export function calculateJointAngles(
	landmarks: Landmark[],
	angleDefs: Readonly<Record<string, { point1: number; joint: number; point2: number }>> = COMMON_JOINT_ANGLES,
): JointAngle[] {
	const angles: JointAngle[] = [];

	for (const [name, def] of Object.entries(angleDefs)) {
		const point1 = landmarks[def.point1];
		const joint = landmarks[def.joint];
		const point2 = landmarks[def.point2];

		// Skip if any landmark is missing or has low visibility
		if (
			!point1 ||
			!joint ||
			!point2 ||
			(point1.visibility ?? 1) < 0.5 ||
			(joint.visibility ?? 1) < 0.5 ||
			(point2.visibility ?? 1) < 0.5
		) {
			continue;
		}

		const angle = calculateAngle(point1, joint, point2);

		angles.push({
			name,
			point1Index: def.point1,
			jointIndex: def.joint,
			point2Index: def.point2,
			angle,
		});
	}

	return angles;
}

/**
 * Check if a joint angle is within a target range (with tolerance).
 * Useful for exercise form validation.
 *
 * @param angle - The joint angle in degrees
 * @param targetMin - Minimum target angle (inclusive)
 * @param targetMax - Maximum target angle (inclusive)
 * @param tolerance - Angle tolerance in degrees (default: 10)
 * @returns True if angle is within range with tolerance
 */
export function isAngleInRange(
	angle: number,
	targetMin: number,
	targetMax: number,
	tolerance: number = 10,
): boolean {
	const adjustedMin = targetMin - tolerance;
	const adjustedMax = targetMax + tolerance;
	return angle >= adjustedMin && angle <= adjustedMax;
}

/**
 * Classify a pose based on joint angle thresholds.
 * Example: Detect if a squat is "down" (knee angle < 90°) or "up" (knee angle > 150°)
 *
 * @param angles - Array of calculated joint angles
 * @param angleThresholds - Map of angle names to {min, max} degree ranges for the pose
 * @returns True if all specified angles are within their ranges, false otherwise

export function classifyPoseByAngles(
	angles: JointAngle[],
	angleThresholds: Record<string, { min: number; max: number }>,
): boolean {
	const angleMap = new Map(angles.map((a) => [a.name, a.angle]));

	for (const [angleName, range] of Object.entries(angleThresholds)) {
		const angle = angleMap.get(angleName);
		if (angle === undefined) {
			return false; // Required angle not present
		}

		if (!isAngleInRange(angle, range.min, range.max)) {
			return false; // Angle not in acceptable range
		}
	}

	return true; // All angle conditions met
}
 */
