import type { PoseWorkerInstance } from "./types";

export function createPoseWorker() {
	return new Worker(new URL("../poseLandmarker.worker.ts", import.meta.url), {
		type: "module",
	}) as unknown as PoseWorkerInstance;
}
