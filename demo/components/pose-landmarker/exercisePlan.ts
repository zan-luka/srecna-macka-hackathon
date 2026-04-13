import type { ExercisePlanItem } from "./types";

export const EXERCISE_PLAN: ExercisePlanItem[] = [
	{ name: "Squat", repetitions: 10, qualityParameters: {leftKnee: 90, rightKnee: 90, bodyTilt: 30} },
	{ name: "Warrior_2", durationSeconds: 20, qualityParameters: {leftKnee: 180, rightKnee: 90, bodyTilt: 0, leftElbow: 0, rightElbow: 0} },
	{ name: "Lunge", durationSeconds: 10, qualityParameters: {leftKnee: 90, rightKnee: 90, bodyTilt: 30} },
	{ name: "Bridge", durationSeconds: 20, qualityParameters: {leftKnee: 90, rightKnee: 90, bodyTilt: 0} },
];
