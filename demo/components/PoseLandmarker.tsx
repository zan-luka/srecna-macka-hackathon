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
import { JointAnglesPanel } from "./pose-landmarker/JointAnglesPanel";
import { RecordingPanel } from "./pose-landmarker/RecordingPanel";
import { WorkoutOverlays } from "./pose-landmarker/WorkoutOverlays";
import { createPoseWorker } from "./pose-landmarker/workerClient";
import type { RecordingMetadata } from "./pose-landmarker/poseRecorder";
import { GamificationPanel } from "./pose-landmarker/GamificationPanel";
import { FormFeedbackOverlay } from "./pose-landmarker/FormFeedbackOverlay";
import { AchievementUnlock } from "./pose-landmarker/AchievementUnlock";
import { useGameification, type UseGameificationReturn } from "./pose-landmarker/useGameification";

export default function PoseLandmarkerView({
	className,
	modelPath = DEFAULT_MODEL_PATH,
	overlays,
	captureEveryNthFrame = DEFAULT_CAPTURE_EVERY_NTH_FRAME,
	sessionState = "idle",
	onExit,
	showNormalizationStats = false,
}: PoseLandmarkerProps) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const rafRef = useRef<number | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const detectorRef = useRef<PoseLandmarker | null>(null);
	const workerRef = useRef<PoseWorkerInstance | null>(null);
	const lastPredictionRef = useRef<string | undefined>(undefined);
	const lastVideoTimeRef = useRef<number>(-1);
	const frameIndexRef = useRef(0);
	const captureInterval = Math.max(1, Math.floor(captureEveryNthFrame));
	const exerciseCompletedRef = useRef(false);
	const lastRepCountTimeRef = useRef(0);
	const latestWorkerMessageRef = useRef<NormalizedLandmarksMessage | null>(null);
	const lastSyncMessageRef = useRef<NormalizedLandmarksMessage | null>(null);

	// Gamification
	const gamification = useGameification();
	const sessionStartTimeRef = useRef<number | null>(null);

	const [error, setError] = useState<string | null>(null);
	const [isReady, setIsReady] = useState(false);
	const [exerciseIndex, setExerciseIndex] = useState(0);
	const [exercisePhase, setExercisePhase] = useState<"idle" | "countdown" | "active" | "finished">("idle");
	const [countdownRemaining, setCountdownRemaining] = useState(EXERCISE_PREVIEW_SECONDS);
	const [remainingValue, setRemainingValue] = useState(0);
	const [remainingUnit, setRemainingUnit] = useState<"seconds" | "repetitions">("seconds");
	const [normalizedStats, setNormalizedStats] = useState<NormalizedStats | null>(null);
	const [latestWorkerMessage, setLatestWorkerMessage] = useState<NormalizedLandmarksMessage | null>(null);
	const [overlayLatencyMs, setOverlayLatencyMs] = useState<number | null>(null);
	const [recordingData, setRecordingData] = useState<{
		frameCount: number;
		duration?: number;
		stats?: {
			frameCount: number;
			duration: number;
			avgFPS: number;
			recordedPeople: number;
		};
		metadata?: RecordingMetadata;
		buffer?: ArrayBuffer;
	} | null>(null);
	// Derive isRecording from exercise state to avoid cascading renders
	const isRecording = exercisePhase === "active" && sessionState === "running";
	const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const activeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const overlayLatencyEwmaRef = useRef<number | null>(null);
	const lastLatencyPublishRef = useRef(0);
	const recordingStateRef = useRef<"idle" | "should_record" | "should_stop">("idle");
	const exercisePhaseRef = useRef<"idle" | "countdown" | "active" | "finished">("idle");
	const remainingValueRef = useRef(0);
	const remainingUnitRef = useRef<"seconds" | "repetitions">("seconds");
	const currentExerciseRef = useRef<(typeof EXERCISE_PLAN)[number] | null>(null);

	const currentExercise = EXERCISE_PLAN[exerciseIndex] ?? null;
	const hasExercises = EXERCISE_PLAN.length > 0;

	// Sync worker message from ref to state periodically to avoid infinite loop
	useEffect(() => {
		const syncInterval = setInterval(() => {
			if (latestWorkerMessageRef.current && latestWorkerMessageRef.current !== lastSyncMessageRef.current) {
				setLatestWorkerMessage(latestWorkerMessageRef.current);
				setNormalizedStats(getNormalizedStats(latestWorkerMessageRef.current));
				lastSyncMessageRef.current = latestWorkerMessageRef.current;
			}
		}, 50); // Sync every 50ms

		return () => clearInterval(syncInterval);
	}, []);

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
		// Prevent multiple calls for the same exercise
		if (exerciseCompletedRef.current) {
			return;
		}
		exerciseCompletedRef.current = true;

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

		exerciseCompletedRef.current = false;
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
		lastPredictionRef.current = undefined;

		const nextUnit = isDurationExercise ? "seconds" : "repetitions";
		setRemainingUnit(nextUnit);
		remainingUnitRef.current = nextUnit;
		setRemainingValue((previous) => {
			const nextValue = previous > 0 ? previous : targetValue;
			remainingValueRef.current = nextValue;
			return nextValue;
		});

		workerRef.current?.postMessage({
			type: "exercise_started",
			frameIndex: frameIndexRef.current,
			timestamp: performance.now(),
			exerciseName: currentExercise.name,
			mode: isDurationExercise ? "duration" : "repetitions",
			target: targetValue,
			qualityParameters: currentExercise.qualityParameters,
		});

		activeIntervalRef.current = setInterval(() => {
			if (isDurationExercise) {
				setRemainingValue((previous) => {
					if (previous <= 1) {
						if (activeIntervalRef.current) {
							clearInterval(activeIntervalRef.current);
							activeIntervalRef.current = null;
						}
						remainingValueRef.current = 0;
						queueMicrotask(() => {
							finishCurrentExercise();
						});
						return 0;
					}

					const nextValue = previous - 1;
					remainingValueRef.current = nextValue;
					return nextValue;
				});
			}
		}, isDurationExercise ? 1000 : DEFAULT_SECONDS_PER_REPETITION * 1000);
	};

	const activeOverlays = useMemo(
		() => (overlays?.length ? overlays : [defaultPoseOverlay]),
		[overlays],
	);

	const deferWorkoutUpdate = (update: () => void) => {
		queueMicrotask(update);
	};

	const normalizeExerciseLabel = (value: string) =>
		value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "")
			.replace(/s$/, "");

	useEffect(() => {
		exercisePhaseRef.current = exercisePhase;
		remainingValueRef.current = remainingValue;
		remainingUnitRef.current = remainingUnit;
		currentExerciseRef.current = currentExercise;
	}, [exercisePhase, remainingValue, remainingUnit, currentExercise]);

	useEffect(() => {
		let isMounted = true;
		const latencyPublishIntervalMs = 150;
		const latencyEwmaAlpha = 0.2;

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
				const captureStartedAt = performance.now();
				lastVideoTimeRef.current = video.currentTime;
				frameIndexRef.current += 1;

				const result = detector.detectForVideo(video, captureStartedAt);

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

				const overlayRenderedAt = performance.now();
				const measuredLatency = overlayRenderedAt - captureStartedAt;
				const previousEwma = overlayLatencyEwmaRef.current;
				const smoothedLatency =
					previousEwma === null
						? measuredLatency
						: previousEwma + latencyEwmaAlpha * (measuredLatency - previousEwma);
				overlayLatencyEwmaRef.current = smoothedLatency;

				if (overlayRenderedAt - lastLatencyPublishRef.current >= latencyPublishIntervalMs) {
					lastLatencyPublishRef.current = overlayRenderedAt;
					setOverlayLatencyMs(smoothedLatency);
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
				overlayLatencyEwmaRef.current = null;
				lastLatencyPublishRef.current = 0;
				setOverlayLatencyMs(null);

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

				// Set up listener for messages from worker
				workerRef.current.onmessage = (event: MessageEvent) => {
					const message = event.data;
					if (message.type === "normalized_landmarks") {
						const nlm = message as NormalizedLandmarksMessage;
						const newLabel = nlm.predictions?.[0]?.label;
						const phase = exercisePhaseRef.current;
						const unit = remainingUnitRef.current;
						const exercise = currentExerciseRef.current;
						const normalizedNewLabel = newLabel
							? normalizeExerciseLabel(newLabel)
							: undefined;
						const normalizedExerciseLabel = exercise
							? normalizeExerciseLabel(exercise.name)
							: undefined;
						if (phase === "active" && normalizedNewLabel && normalizedNewLabel !== lastPredictionRef.current) {
							lastPredictionRef.current = normalizedNewLabel;
							if (
								exercise &&
								normalizedExerciseLabel &&
								normalizedNewLabel === normalizedExerciseLabel &&
								unit === "repetitions"
							) {
								setRemainingValue((prev) => {
									const nextValue = prev > 0 ? prev - 1 : 0;
									remainingValueRef.current = nextValue;
									if (nextValue <= 0) {
										if (activeIntervalRef.current) {
											clearInterval(activeIntervalRef.current);
											activeIntervalRef.current = null;
										}
										queueMicrotask(() => {
											finishCurrentExercise();
										});
									}
									return nextValue;
								});
							}
						}
						// Store in ref to avoid infinite loop, will sync to state via effect
						latestWorkerMessageRef.current = nlm;
					} else if (message.type === "recording_data") {
						// Handle recording export
						const { metadata, stats, buffer } = message;
						setRecordingData({
							frameCount: metadata.frameCount,
							duration: metadata.duration,
							stats,
							metadata,
							buffer,
						});
						console.log(`✅ Recording exported: ${metadata.frameCount} frames`);
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
			setOverlayLatencyMs(null);
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

		// Only proceed if currentExercise is valid
		if (!currentExercise) {
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

	// Handle recording based on exercise state
	useEffect(() => {
		if (!workerRef.current) {
			return;
		}

		// Determine desired recording state
		let desiredState: "should_record" | "should_stop" | "idle" = "idle";
		if (exercisePhase === "active" && sessionState === "running") {
			desiredState = "should_record";
		} else if (exercisePhase === "finished" || sessionState !== "running") {
			desiredState = "should_stop";
		}

		// Only take action if state changed
		if (desiredState !== recordingStateRef.current) {
			if (desiredState === "should_record") {
				sessionStartTimeRef.current = Date.now();
				workerRef.current.postMessage({
					type: "recording_start",
					exerciseName: currentExercise?.name || "Unknown",
				});
			} else if (desiredState === "should_stop") {
				workerRef.current.postMessage({
					type: "recording_stop",
				});
			}
			recordingStateRef.current = desiredState;
		}
	}, [exercisePhase, sessionState, currentExercise]);

	// Track gamification data when exercise finishes
	useEffect(() => {
		if (
			exercisePhase === "finished" &&
			gamification.sessionReps > 0 &&
			sessionStartTimeRef.current
		) {
			const duration = Date.now() - sessionStartTimeRef.current;
			// Use realistic accuracy based on current streak (higher streak = likely better form)
			const accuracy = Math.min(0.98, 0.7 + gamification.gameStats.currentStreak * 0.03);
			gamification.updateSessionAccuracy(accuracy);
			gamification.recordGameSession(duration);
			sessionStartTimeRef.current = null;
		}
	}, [exercisePhase, gamification]);

	// Update gamification reps from worker messages if available
	useEffect(() => {
		if (latestWorkerMessage && exercisePhase === "active") {
			// Calculate reps from predictions if available
			const predictions = latestWorkerMessage.predictions;
			if (predictions && predictions.length > 0) {
				const confirmedPredictions = predictions.filter(
					(p) => p && p.confidence > 0.6
				);
				
				// Apply 1-second debounce before counting reps
				const now = Date.now();
				if (confirmedPredictions.length > 0 && now - lastRepCountTimeRef.current >= 1000) {
					gamification.updateSessionReps(confirmedPredictions.length);
					lastRepCountTimeRef.current = now;
				}
			}
		}
	}, [latestWorkerMessage, exercisePhase, gamification]);

	const handleExit = () => {
		resetWorkoutState();
		if (isRecording && workerRef.current) {
			workerRef.current.postMessage({ type: "recording_stop" });
		}
		onExit?.();
	};

	return (
		<div className={`relative h-full w-full ${className ?? ""}`}>
			<div
				className="relative h-full w-full overflow-hidden border border-gray-200/90 bg-zinc-950 shadow-2xl shadow-teal-200/30 ring-1 ring-black/5"
			>
				<video
					ref={videoRef}
					className="h-full w-full object-cover"
					playsInline
					muted
					autoPlay
				/>
				<canvas
					ref={canvasRef}
					className="pointer-events-none absolute inset-0 h-full w-full object-cover"
				/>

				<WorkoutOverlays
					sessionState={sessionState}
					exercisePhase={exercisePhase}
					currentExercise={currentExercise}
					countdownRemaining={countdownRemaining}
					remainingValue={remainingValue}
					remainingUnit={remainingUnit}
					overlayLatencyMs={overlayLatencyMs}
					onExit={handleExit}
				/>

				<RecordingPanel
					isRecording={isRecording}
					recordingData={recordingData}
					exerciseName={currentExercise?.name}
					message={latestWorkerMessage}
				/>

				{/* Gamification UI */}
				<GamificationPanel
					gameStats={gamification.gameStats}
					sessionPoints={gamification.sessionPoints}
				/>

				<FormFeedbackOverlay
					accuracy={gamification.sessionAccuracy}
					pointsEarned={gamification.sessionPoints}
				totalSessionPoints={gamification.sessionPoints}
				currentStreak={gamification.gameStats.currentStreak}
				formQuality={gamification.sessionAccuracy > 0.7 ? "Good" : "Keep Trying"}
				showPoints={gamification.sessionPoints > 0}
				showAccuracy={exercisePhase === "active"}
			/>
			<AchievementUnlock
				achievement={gamification.unlockedAchievement}
				onDismiss={() => gamification.setUnlockedAchievement(null)}				/>

				{error ? (
					<p className="absolute bottom-3 left-1/2 z-20 w-[min(92%,40rem)] -translate-x-1/2 rounded-xl border border-orange-400 bg-orange-100 px-3 py-2 text-center text-sm font-medium text-orange-700 shadow-lg backdrop-blur">
						{error}
					</p>
				) : (
					<p className="absolute bottom-3 left-1/2 z-20 w-[min(92%,40rem)] -translate-x-1/2 rounded-xl border border-orange-100 bg-orange-50/80 px-3 py-2 text-center text-sm text-orange-900/90 shadow-lg backdrop-blur">
						{isReady
							? "Camera and pose tracking are active. Keep your full body in frame."
							: "Initializing webcam and model..."}
					</p>
				)}
			</div>

			{showNormalizationStats ? (
				<NormalizationStatsPanel normalizedStats={normalizedStats} />
			) : null}
			<JointAnglesPanel message={latestWorkerMessage} />
		</div>
	);
}

export type { OverlayRenderContext, OverlayRenderer };