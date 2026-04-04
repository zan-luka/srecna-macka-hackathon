import type { DrawingUtils, PoseLandmarkerResult } from "@mediapipe/tasks-vision";

export type SessionState = "idle" | "running" | "paused";

export type ExercisePhase = "idle" | "countdown" | "active" | "finished";

export type RemainingUnit = "seconds" | "repetitions";

export type OverlayRenderContext = {
	ctx: CanvasRenderingContext2D;
	drawingUtils: DrawingUtils;
	result: PoseLandmarkerResult;
	width: number;
	height: number;
};

export type OverlayRenderer = (context: OverlayRenderContext) => void;

export type PoseLandmarkerProps = {
	className?: string;
	modelPath?: string;
	overlays?: OverlayRenderer[];
	captureEveryNthFrame?: number;
	sessionState?: SessionState;
	onExit?: () => void;
};

export type ExercisePlanItem = {
	name: string;
	repetitions?: number;
	durationSeconds?: number;
};

export type Landmark = {
	x: number;
	y: number;
	z: number;
	visibility?: number;
	presence?: number;
};

export type PoseWorkerMessage = {
	type: "landmarks";
	frameIndex: number;
	timestamp: number;
	landmarks: Array<Array<Landmark>>;
};

export type ExerciseStartedWorkerMessage = {
	type: "exercise_started";
	frameIndex: number;
	timestamp: number;
	exerciseName: string;
	mode: "duration" | "repetitions";
	target: number;
};

export type PoseWorkerInboundMessage =
	| PoseWorkerMessage
	| ExerciseStartedWorkerMessage;

export type NormalizedLandmarksMessage = {
	type: "normalized_landmarks";
	frameIndex: number;
	timestamp: number;
	originalLandmarks: Array<Array<Landmark>>;
	normalizedLandmarks: Array<Array<Landmark>>;
	torsoSize?: number;
};

export type PoseWorkerInstance = {
	postMessage: (message: PoseWorkerInboundMessage) => void;
	terminate: () => void;
	onmessage:
		| ((event: MessageEvent<NormalizedLandmarksMessage>) => void)
		| null;
};

export type NormalizedStats = {
	originalRange: { minX: number; maxX: number; minY: number; maxY: number };
	normalizedRange: { minX: number; maxX: number; minY: number; maxY: number };
	torsoSize: number;
};
