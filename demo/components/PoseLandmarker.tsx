"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DrawingUtils, FilesetResolver, type PoseLandmarker } from "@mediapipe/tasks-vision";
import {
	DEFAULT_CAPTURE_EVERY_NTH_FRAME,
	DEFAULT_MODEL_PATH,
	DEFAULT_SECONDS_PER_REPETITION,
	EXERCISE_PREVIEW_SECONDS,
	MEDIAPIPE_WASM_BASE_URL,
} from "./pose-landmarker/constants";
import { EXERCISE_PLAN } from "./pose-landmarker/exercisePlan";
import { createPoseLandmarkerWithFallback } from "./pose-landmarker/mediapipe";
import { getNormalizedStats } from "./pose-landmarker/normalizationStats";
import { defaultPoseOverlay } from "./pose-landmarker/overlays";
import type {
	NormalizedLandmarksMessage,
	PoseWorkerInstance,
	PoseLandmarkerProps,
	OverlayRenderContext,
	OverlayRenderer,
	NormalizedStats,
} from "./pose-landmarker/types";
import { NormalizationStatsPanel } from "./pose-landmarker/NormalizationStatsPanel";
import { WorkoutOverlays } from "./pose-landmarker/WorkoutOverlays";
import { createPoseWorker } from "./pose-landmarker/workerClient";

export default function PoseLandmarkerView({
	className,
	modelPath = DEFAULT_MODEL_PATH,
	overlays,
	captureEveryNthFrame = DEFAULT_CAPTURE_EVERY_NTH_FRAME,
	sessionState = "idle",
	onExit,
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
	const [exerciseIndex, setExerciseIndex] = useState(0);
	const [exercisePhase, setExercisePhase] = useState<"idle" | "countdown" | "active" | "finished">("idle");
	const [countdownRemaining, setCountdownRemaining] = useState(EXERCISE_PREVIEW_SECONDS);
	const [remainingValue, setRemainingValue] = useState(0);
	const [remainingUnit, setRemainingUnit] = useState<"seconds" | "repetitions">("seconds");
	const [normalizedStats, setNormalizedStats] = useState<NormalizedStats | null>(null);
	const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const activeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const currentExercise = EXERCISE_PLAN[exerciseIndex] ?? null;
	const hasExercises = EXERCISE_PLAN.length > 0;

	const clearWorkoutIntervals = () => {
		if (countdownIntervalRef.current) {
			clearInterval(countdownIntervalRef.current);
			countdownIntervalRef.current = null;
		}

		if (activeIntervalRef.current) {
			clearInterval(activeIntervalRef.current);
			activeIntervalRef.current = null;
		}
	};

	const resetWorkoutState = () => {
		clearWorkoutIntervals();
		setExerciseIndex(0);
		setExercisePhase("idle");
		setCountdownRemaining(EXERCISE_PREVIEW_SECONDS);
		setRemainingValue(0);
		setRemainingUnit("seconds");
	};

	const finishCurrentExercise = () => {
		clearWorkoutIntervals();
		setExerciseIndex((previousIndex) => {
			const nextIndex = previousIndex + 1;
			if (nextIndex >= EXERCISE_PLAN.length) {
				setExercisePhase("finished");
				setCountdownRemaining(0);
				setRemainingValue(0);
				return previousIndex;
			}

			setExercisePhase("countdown");
			setCountdownRemaining(EXERCISE_PREVIEW_SECONDS);
			setRemainingValue(0);
			return nextIndex;
		});
	};

	const startCountdown = () => {
		if (!hasExercises || !currentExercise) {
			setExercisePhase("finished");
			return;
		}

		if (sessionState !== "running") {
			return;
		}

		setExercisePhase("countdown");
		setCountdownRemaining((previous) => (previous > 0 ? previous : EXERCISE_PREVIEW_SECONDS));
		if (countdownIntervalRef.current) {
			return;
		}

		countdownIntervalRef.current = setInterval(() => {
			setCountdownRemaining((previous) => {
				if (previous <= 1) {
					if (countdownIntervalRef.current) {
						clearInterval(countdownIntervalRef.current);
						countdownIntervalRef.current = null;
					}
					setExercisePhase("active");
					return 0;
				}

				return previous - 1;
			});
		}, 1000);
	};

	const startActiveExercise = () => {
		if (!currentExercise || sessionState !== "running") {
			return;
		}

		if (activeIntervalRef.current) {
			return;
		}

		const isDurationExercise = typeof currentExercise.durationSeconds === "number";
		const targetValue = isDurationExercise
			? Math.max(1, currentExercise.durationSeconds ?? 1)
			: Math.max(1, currentExercise.repetitions ?? 1);

		setRemainingUnit(isDurationExercise ? "seconds" : "repetitions");
		setRemainingValue((previous) => (previous > 0 ? previous : targetValue));

		workerRef.current?.postMessage({
			type: "exercise_started",
			frameIndex: frameIndexRef.current,
			timestamp: performance.now(),
			exerciseName: currentExercise.name,
			mode: isDurationExercise ? "duration" : "repetitions",
			target: targetValue,
		});

		activeIntervalRef.current = setInterval(() => {
			setRemainingValue((previous) => {
				if (previous <= 1) {
					if (activeIntervalRef.current) {
						clearInterval(activeIntervalRef.current);
						activeIntervalRef.current = null;
					}
					queueMicrotask(() => {
						finishCurrentExercise();
					});
					return 0;
				}

				return previous - 1;
			});
		}, isDurationExercise ? 1000 : DEFAULT_SECONDS_PER_REPETITION * 1000);
	};

	const activeOverlays = useMemo(
		() => (overlays?.length ? overlays : [defaultPoseOverlay]),
		[overlays],
	);

	const deferWorkoutUpdate = (update: () => void) => {
		queueMicrotask(update);
	};

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
			clearWorkoutIntervals();

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
						setNormalizedStats(getNormalizedStats(message));
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

	useEffect(() => {
		if (sessionState === "idle") {
			deferWorkoutUpdate(resetWorkoutState);
			return;
		}

		if (exercisePhase === "finished") {
			clearWorkoutIntervals();
			return;
		}

		if (sessionState === "paused") {
			clearWorkoutIntervals();
			return;
		}

		if (!hasExercises) {
			deferWorkoutUpdate(() => {
				setExercisePhase("finished");
			});
			return;
		}

		if (exercisePhase === "idle" || exercisePhase === "countdown") {
			deferWorkoutUpdate(startCountdown);
			return;
		}

		if (exercisePhase === "active") {
			deferWorkoutUpdate(startActiveExercise);
		}
	}, [
		sessionState,
		exercisePhase,
		exerciseIndex,
		hasExercises,
		currentExercise,
	]);

	const handleExit = () => {
		resetWorkoutState();
		onExit?.();
	};

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

				<WorkoutOverlays
					sessionState={sessionState}
					exercisePhase={exercisePhase}
					currentExercise={currentExercise}
					countdownRemaining={countdownRemaining}
					remainingValue={remainingValue}
					remainingUnit={remainingUnit}
					onExit={handleExit}
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

			<NormalizationStatsPanel normalizedStats={normalizedStats} />
		</div>
	);
}

export type { OverlayRenderContext, OverlayRenderer };
