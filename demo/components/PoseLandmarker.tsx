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
};

const DEFAULT_MODEL_PATH = "/models/pose_landmarker_full.task";
const MEDIAPIPE_WASM_BASE_URL =
	"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";

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
}: PoseLandmarkerProps) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const rafRef = useRef<number | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const detectorRef = useRef<PoseLandmarker | null>(null);
	const lastVideoTimeRef = useRef<number>(-1);

	const [error, setError] = useState<string | null>(null);
	const [isReady, setIsReady] = useState(false);

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

				await video.play();

				const vision = await FilesetResolver.forVisionTasks(
					MEDIAPIPE_WASM_BASE_URL,
				);

				if (!isMounted) {
					return;
				}

				detectorRef.current = await createPoseLandmarkerWithFallback(vision, modelPath);

				if (!isMounted) {
					return;
				}

				setIsReady(true);
				drawFrame();
			} catch (startError) {
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
	}, [activeOverlays, modelPath]);

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
		</div>
	);
}

export type { OverlayRenderContext, OverlayRenderer };
