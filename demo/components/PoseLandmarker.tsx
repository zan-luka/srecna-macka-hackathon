"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
	DrawingUtils,
	FilesetResolver,
	PoseLandmarker,
	type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

type OverlayRenderContext = {
	ctx: CanvasRenderingContext2D;
	drawingUtils: DrawingUtils;
	result: PoseLandmarkerResult;
	width: number;
	height: number;
};

type OverlayRenderer = (context: OverlayRenderContext) => void;

type PoseLandmarkerProps = {
	className?: string;
	modelPath?: string;
	overlays?: OverlayRenderer[];
	captureEveryNthFrame?: number;
};

const DEFAULT_MODEL_PATH = "/models/pose_landmarker_full.task";
const MEDIAPIPE_WASM_BASE_URL =
	"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const DEFAULT_CAPTURE_EVERY_NTH_FRAME = 1;

type PoseWorkerMessage = {
	type: "landmarks";
	frameIndex: number;
	timestamp: number;
	landmarks: PoseLandmarkerResult["landmarks"];
};

type NormalizedLandmarksMessage = {
	type: "normalized_landmarks";
	frameIndex: number;
	timestamp: number;
	originalLandmarks: Array<Array<{ x: number; y: number; z: number; visibility?: number; presence?: number }>>;
	normalizedLandmarks: Array<Array<{ x: number; y: number; z: number; visibility?: number; presence?: number }>>;
	torsoSize?: number;
};

type PoseWorkerInstance = {
	postMessage: (message: PoseWorkerMessage) => void;
	terminate: () => void;
	onmessage: ((event: MessageEvent<NormalizedLandmarksMessage>) => void) | null;
};

function createPoseWorker() {
	return new Worker(
		new URL("./poseLandmarker.worker.ts", import.meta.url),
		{ type: "module" },
	) as unknown as PoseWorkerInstance;
}

const defaultPoseOverlay: OverlayRenderer = ({
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
		drawingUtils.drawConnectors(
			landmarks,
			PoseLandmarker.POSE_CONNECTIONS,
			{
				color: "#22d3ee",
				lineWidth: 3,
			},
		);

		drawingUtils.drawLandmarks(landmarks, {
			color: "#f97316",
			fillColor: "#f97316",
			lineWidth: 1.5,
			radius: 4,
		});
	}

	ctx.restore();
};

async function createPoseLandmarkerWithFallback(vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>, modelPath: string) {
  try {
    return await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelPath, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  } catch {
    console.log("GPU delegate failed to initialize, falling back to CPU.");
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelPath, delegate: "CPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  }
}

export default function PoseLandmarkerView({
	className,
	modelPath = DEFAULT_MODEL_PATH,
	overlays,
	captureEveryNthFrame = DEFAULT_CAPTURE_EVERY_NTH_FRAME,
}: PoseLandmarkerProps) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const rafRef = useRef<number | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const detectorRef = useRef<PoseLandmarker | null>(null);
	const workerRef = useRef<PoseWorkerInstance | null>(null);
	const lastVideoTimeRef = useRef<number>(-1);
	const frameIndexRef = useRef(0);
	const captureInterval = Math.max(1, Math.floor(captureEveryNthFrame));

	const [error, setError] = useState<string | null>(null);
	const [isReady, setIsReady] = useState(false);
	const [normalizedStats, setNormalizedStats] = useState<{
		originalRange: { minX: number; maxX: number; minY: number; maxY: number };
		normalizedRange: { minX: number; maxX: number; minY: number; maxY: number };
		torsoSize: number;
	} | null>(null);

	const activeOverlays = useMemo(
		() => (overlays?.length ? overlays : [defaultPoseOverlay]),
		[overlays],
	);

	useEffect(() => {
		let isMounted = true;

		const stopLoop = () => {
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
		};

		const stopCamera = () => {
			if (streamRef.current) {
				streamRef.current.getTracks().forEach((track) => track.stop());
				streamRef.current = null;
			}

			if (videoRef.current) {
				videoRef.current.srcObject = null;
			}
		};

		const teardown = () => {
			stopLoop();
			stopCamera();

			detectorRef.current?.close();
			detectorRef.current = null;

			workerRef.current?.terminate();
			workerRef.current = null;
		};

		const syncCanvasWithVideo = () => {
			const video = videoRef.current;
			const canvas = canvasRef.current;
			if (!video || !canvas) {
				return;
			}

			const targetWidth = video.videoWidth || 0;
			const targetHeight = video.videoHeight || 0;

			if (!targetWidth || !targetHeight) {
				return;
			}

			if (canvas.width !== targetWidth) {
				canvas.width = targetWidth;
			}

			if (canvas.height !== targetHeight) {
				canvas.height = targetHeight;
			}
		};

		const drawFrame = () => {
			const video = videoRef.current;
			const canvas = canvasRef.current;
			const detector = detectorRef.current;

			if (!video || !canvas || !detector || !isMounted) {
				return;
			}

			syncCanvasWithVideo();

			const ctx = canvas.getContext("2d");
			if (!ctx) {
				rafRef.current = requestAnimationFrame(drawFrame);
				return;
			}

			if (video.currentTime !== lastVideoTimeRef.current) {
				lastVideoTimeRef.current = video.currentTime;
				frameIndexRef.current += 1;

				const result = detector.detectForVideo(video, performance.now());

				ctx.clearRect(0, 0, canvas.width, canvas.height);
				const drawingUtils = new DrawingUtils(ctx);

				for (const renderOverlay of activeOverlays) {
					renderOverlay({
						ctx,
						drawingUtils,
						result,
						width: canvas.width,
						height: canvas.height,
					});
				}

				if (workerRef.current && frameIndexRef.current % captureInterval === 0) {
					workerRef.current.postMessage({
						type: "landmarks",
						frameIndex: frameIndexRef.current,
						timestamp: performance.now(),
						landmarks: result.landmarks,
					});
				}
			}

			rafRef.current = requestAnimationFrame(drawFrame);
		};

		const start = async () => {
			try {
				setError(null);

				const video = videoRef.current;
				if (!video) {
					return;
				}

				const mediaStream = await navigator.mediaDevices.getUserMedia({
					video: {
						facingMode: "user",
					},
					audio: false,
				});

				if (!isMounted) {
					mediaStream.getTracks().forEach((track) => track.stop());
					return;
				}

				streamRef.current = mediaStream;
				video.srcObject = mediaStream;
				workerRef.current = createPoseWorker();

				// Set up listener for normalized landmarks from worker
				workerRef.current.onmessage = (event: MessageEvent<NormalizedLandmarksMessage>) => {
					const message = event.data;
					if (message.type === "normalized_landmarks") {
						// Calculate statistics for visualization
						const originalLandmarks = message.originalLandmarks[0] || [];
						const normalizedLandmarks = message.normalizedLandmarks[0] || [];

						if (originalLandmarks.length > 0 && normalizedLandmarks.length > 0) {
							const origMinX = Math.min(...originalLandmarks.map((l) => l?.x || 0));
							const origMaxX = Math.max(...originalLandmarks.map((l) => l?.x || 0));
							const origMinY = Math.min(...originalLandmarks.map((l) => l?.y || 0));
							const origMaxY = Math.max(...originalLandmarks.map((l) => l?.y || 0));

							const normMinX = Math.min(...normalizedLandmarks.map((l) => l?.x || 0));
							const normMaxX = Math.max(...normalizedLandmarks.map((l) => l?.x || 0));
							const normMinY = Math.min(...normalizedLandmarks.map((l) => l?.y || 0));
							const normMaxY = Math.max(...normalizedLandmarks.map((l) => l?.y || 0));

							setNormalizedStats({
								originalRange: {
									minX: parseFloat(origMinX.toFixed(3)),
									maxX: parseFloat(origMaxX.toFixed(3)),
									minY: parseFloat(origMinY.toFixed(3)),
									maxY: parseFloat(origMaxY.toFixed(3)),
								},
								normalizedRange: {
									minX: parseFloat(normMinX.toFixed(3)),
									maxX: parseFloat(normMaxX.toFixed(3)),
									minY: parseFloat(normMinY.toFixed(3)),
									maxY: parseFloat(normMaxY.toFixed(3)),
								},
								torsoSize: message.torsoSize || 0,
							});
						}
					}
				};

				await video.play();

				const vision = await FilesetResolver.forVisionTasks(
					MEDIAPIPE_WASM_BASE_URL,
				);

				if (!isMounted) {
					return;
				}

				frameIndexRef.current = 0;
				detectorRef.current = await createPoseLandmarkerWithFallback(vision, modelPath);

				if (!isMounted) {
					return;
				}

				setIsReady(true);
				drawFrame();
			} catch (startError) {
				workerRef.current?.terminate();
				workerRef.current = null;

				const message =
					startError instanceof Error
						? startError.message
						: "Could not start webcam pose detection.";
				setError(message);
			}
		};

		void start();

		return () => {
			isMounted = false;
			setIsReady(false);
			teardown();
		};
	}, [activeOverlays, captureInterval, modelPath]);

	return (
		<div className={className}>
			<div className="relative w-full overflow-hidden rounded-xl bg-black">
				<video
					ref={videoRef}
					className="h-auto w-full"
					playsInline
					muted
					autoPlay
				/>
				<canvas
					ref={canvasRef}
					className="pointer-events-none absolute inset-0 h-full w-full"
				/>
			</div>

			{error ? (
				<p className="mt-3 text-sm text-red-600">{error}</p>
			) : (
				<p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
					{isReady
						? "Pose tracking is active."
						: "Initializing webcam and model..."}
				</p>
			)}

			{/* Normalization Debug Stats */}
			{normalizedStats && (
				<div className="mt-4 rounded-lg border border-zinc-300 bg-zinc-50 p-4 text-xs font-mono dark:border-zinc-700 dark:bg-zinc-900">
					<h3 className="mb-3 font-semibold">🧪 Normalization Test Stats</h3>
					<div className="mb-3 rounded bg-blue-50 p-2 dark:bg-blue-950">
						<p className="text-blue-700 dark:text-blue-300">
							<strong>Torso Size:</strong> {normalizedStats.torsoSize.toFixed(4)}
						</p>
						<p className="text-xs text-blue-600 dark:text-blue-400">
							(Body scale reference - consistent across different body sizes)
						</p>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div>
							<p className="mb-2 font-semibold text-zinc-700 dark:text-zinc-300">Original Landmarks</p>
							<div className="space-y-1 text-zinc-600 dark:text-zinc-400">
								<p>X: {normalizedStats.originalRange.minX.toFixed(3)} → {normalizedStats.originalRange.maxX.toFixed(3)}</p>
								<p>Y: {normalizedStats.originalRange.minY.toFixed(3)} → {normalizedStats.originalRange.maxY.toFixed(3)}</p>
								<p className="text-xs text-zinc-500">(Pixel coordinates, 0-1 range)</p>
							</div>
						</div>
						<div>
							<p className="mb-2 font-semibold text-zinc-700 dark:text-zinc-300">Normalized Landmarks</p>
							<div className="space-y-1 text-zinc-600 dark:text-zinc-400">
								<p>X: {normalizedStats.normalizedRange.minX.toFixed(3)} → {normalizedStats.normalizedRange.maxX.toFixed(3)}</p>
								<p>Y: {normalizedStats.normalizedRange.minY.toFixed(3)} → {normalizedStats.normalizedRange.maxY.toFixed(3)}</p>
								<p className="text-xs text-zinc-500">✓ Normalized &amp; scale-invariant</p>
							</div>
						</div>
					</div>
					<p className="mt-3 text-xs text-zinc-500">
						Check browser console (F12) for detailed frame-by-frame stats → Groups starting with "🎯 Frame"
					</p>
				</div>
			)}
		</div>
	);
}

export type { OverlayRenderContext, OverlayRenderer };
