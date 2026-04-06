import type { ExercisePhase, ExercisePlanItem, RemainingUnit, SessionState } from "./types";

type WorkoutOverlaysProps = {
	sessionState: SessionState;
	exercisePhase: ExercisePhase;
	currentExercise: ExercisePlanItem | null;
	countdownRemaining: number;
	remainingValue: number;
	remainingUnit: RemainingUnit;
	overlayLatencyMs: number | null;
	onExit: () => void;
};

export function WorkoutOverlays({
	sessionState,
	exercisePhase,
	currentExercise,
	countdownRemaining,
	remainingValue,
	remainingUnit,
	overlayLatencyMs,
	onExit,
}: WorkoutOverlaysProps) {
	return (
		<>
			{overlayLatencyMs !== null && (
				<div className="absolute bottom-3 left-3 rounded-xl border border-gray-200/70 bg-gray-50/90 px-3 py-2 text-xs font-medium text-gray-900 shadow-lg backdrop-blur">
					<p className="uppercase tracking-wide text-gray-700">Overlay delay</p>
					<p className="text-sm font-semibold">{overlayLatencyMs.toFixed(1)} ms</p>
				</div>
			)}

			{sessionState === "running" &&
				exercisePhase === "countdown" &&
				currentExercise && (
					<div className="absolute inset-0 flex items-center justify-center bg-zinc-950/35 p-4">
						<div className="rounded-2xl border border-gray-200/80 bg-gray-50/95 px-6 py-5 text-center text-gray-900 shadow-xl backdrop-blur">
							<p className="text-xs font-semibold uppercase tracking-widest text-teal-600">
								Next exercise
							</p>
							<h2 className="mt-1 text-2xl font-semibold">{currentExercise.name}</h2>
							<p className="mt-2 text-sm text-gray-600">
								{typeof currentExercise.durationSeconds === "number"
									? `${currentExercise.durationSeconds}s duration`
									: `${currentExercise.repetitions ?? 0} repetitions`}
							</p>
							<p className="mt-3 text-lg font-bold text-teal-700">
								Starts in {countdownRemaining}s
							</p>
						</div>
					</div>
				)}

			{sessionState === "running" && exercisePhase === "active" && currentExercise && (
				<div className="absolute right-3 top-3 rounded-xl border border-orange-200/70 bg-orange-50/90 px-3 py-2 text-right text-sm text-orange-900 shadow-lg backdrop-blur">
					<p className="font-semibold">{currentExercise.name}</p>
					<p className="font-semibold text-orange-600">
						{remainingUnit === "seconds"
							? `${remainingValue}s left`
							: `${remainingValue} reps left`}
					</p>
				</div>
			)}

			{exercisePhase === "finished" && (
				<div className="absolute inset-0 flex items-center justify-center bg-zinc-950/50 p-4">
					<div className="rounded-2xl border border-gray-200/90 bg-gray-50/95 px-6 py-5 text-center text-gray-900 shadow-xl backdrop-blur">
						<h2 className="text-3xl font-bold text-teal-700">Workout complete</h2>
						<button
							type="button"
							onClick={onExit}
							className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
						>
							Exit
						</button>
					</div>
				</div>
			)}
		</>
	);
}
