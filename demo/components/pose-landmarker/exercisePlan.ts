import type { ExercisePlanItem } from "./types";

export const EXERCISE_PLAN: ExercisePlanItem[] = [
	{ name: "Squat", repetitions: 5, qualityParameters: {LEFT_KNEE: 90, RIGHT_KNEE: 90, BODY_TILT: 30} },
	{ name: "Warrior_2", durationSeconds: 15, qualityParameters: {LEFT_KNEE: 180, RIGHT_KNEE: 90, BODY_TILT: 0, leftElbow: 0, rightElbow: 0} },
	{ name: "Lunge", durationSeconds: 15, qualityParameters: {LEFT_KNEE: 90, RIGHT_KNEE: 90, BODY_TILT: 30} },
	{ name: "Bridge", durationSeconds: 15, qualityParameters: {LEFT_KNEE: 90, RIGHT_KNEE: 90, BODY_TILT: 0} },
];
