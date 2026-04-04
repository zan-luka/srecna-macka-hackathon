import type { ExercisePhase, ExercisePlanItem, RemainingUnit, SessionState } from "./types";

type WorkoutOverlaysProps = {
	sessionState: SessionState;
	exercisePhase: ExercisePhase;
	currentExercise: ExercisePlanItem | null;
	countdownRemaining: number;
	remainingValue: number;
	remainingUnit: RemainingUnit;
	onExit: () => void;
};

export function WorkoutOverlays({
	sessionState,
	exercisePhase,
	currentExercise,
	countdownRemaining,
	remainingValue,
	remainingUnit,
	onExit,
}: WorkoutOverlaysProps) {
	return (
		<>
			{sessionState === "running" &&
				exercisePhase === "countdown" &&
				currentExercise && (
					<div className="absolute inset-0 flex items-center justify-center bg-black/35 p-4">
						<div className="rounded-xl border border-white/40 bg-black/70 px-6 py-5 text-center text-white shadow-lg backdrop-blur">
							<p className="text-xs uppercase tracking-widest text-cyan-300">
								Next exercise
							</p>
							<h2 className="mt-1 text-2xl font-semibold">{currentExercise.name}</h2>
							<p className="mt-2 text-sm text-zinc-100">
								{typeof currentExercise.durationSeconds === "number"
									? `${currentExercise.durationSeconds}s duration`
									: `${currentExercise.repetitions ?? 0} repetitions`}
							</p>
							<p className="mt-3 text-lg font-medium text-amber-300">
								Starts in {countdownRemaining}s
							</p>
						</div>
					</div>
				)}

			{sessionState === "running" && exercisePhase === "active" && currentExercise && (
				<div className="absolute right-3 top-3 rounded-lg bg-black/75 px-3 py-2 text-right text-sm text-white shadow">
					<p className="font-semibold">{currentExercise.name}</p>
					<p className="text-cyan-300">
						{remainingUnit === "seconds"
							? `${remainingValue}s left`
							: `${remainingValue} reps left`}
					</p>
				</div>
			)}

			{exercisePhase === "finished" && (
				<div className="absolute inset-0 flex items-center justify-center bg-black/45 p-4">
					<div className="rounded-xl border border-white/40 bg-black/75 px-6 py-5 text-center text-white shadow-lg backdrop-blur">
						<h2 className="text-3xl font-bold text-emerald-300">Finish</h2>
						<button
							type="button"
							onClick={onExit}
							className="mt-4 rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
						>
							Exit
						</button>
					</div>
				</div>
			)}
		</>
	);
}
