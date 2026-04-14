"use client";

import Link from "next/link";
import { useState } from "react";
import PoseLandmarkerView from "@/components/PoseLandmarker";
import { EXERCISE_PLAN } from "@/components/pose-landmarker/exercisePlan";

export default function Home() {
	const [sessionState, setSessionState] = useState<"idle" | "running" | "paused">("idle");
  const [showControls, setShowControls] = useState(false);

	const handleStart = () => {
		setSessionState("running");
	};

	const handlePause = () => {
		setSessionState((previous) => (previous === "paused" ? "running" : "paused"));
	};

	const handleExit = () => {
		setSessionState("idle");
	};

  const stateLabel =
    sessionState === "running"
      ? "In progress"
      : sessionState === "paused"
        ? "Paused"
        : "Ready";

  const stateClassName =
    sessionState === "running"
      ? "border-teal-200 bg-teal-100 text-teal-900"
      : sessionState === "paused"
        ? "border-orange-200 bg-orange-100 text-orange-900"
        : "border-gray-200 bg-gray-100 text-gray-900";

  const renderControls = () => (
    <>
      <button
        type="button"
        onClick={handleStart}
        className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        Start
      </button>
      <button
        type="button"
        onClick={handlePause}
        disabled={sessionState === "idle"}
        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-orange-200 bg-orange-100 px-4 py-2 text-sm font-semibold text-orange-900 transition hover:bg-orange-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sessionState === "paused" ? "Resume" : "Pause"}
      </button>
      <button
        type="button"
        onClick={handleExit}
        disabled={sessionState === "idle"}
        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        End
      </button>
    </>
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-zinc-950">
      <PoseLandmarkerView
        className="h-full w-full"
        sessionState={sessionState}
        onExit={handleExit}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 p-3 sm:p-4">
        {/* Always-visible control bar */}
        <div className="pointer-events-auto mx-auto flex justify-center items-center gap-3 rounded-xl border border-gray-200/80 bg-white/90 px-4 py-3 shadow-lg backdrop-blur w-fit">
          {/* Status badge */}
          <span className={`rounded-full border px-3 py-1.5 text-xs font-bold ${stateClassName}`}>
            {stateLabel}
          </span>

          {/* Primary action buttons */}
          <div className="flex gap-2">
            {renderControls()}
          </div>

          {/* Toggle exercise plan */}
          <button
            type="button"
            onClick={() => setShowControls((previous) => !previous)}
            className="ml-2 rounded-lg border border-blue-200 bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-900 transition hover:bg-blue-200"
          >
            {showControls ? "▼ Plan" : "▶ Plan"}
          </button>

          <Link
            href="/analytics"
            className="ml-2 rounded-lg border border-emerald-200 bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-200"
          >
            Analytics
          </Link>
        </div>

        {/* Expandable exercise plan */}
        {showControls && (
          <div className="pointer-events-auto mt-2 rounded-xl border border-gray-200/80 bg-white/88 p-3 shadow-xl backdrop-blur sm:p-4 mx-auto w-fit max-w-2xl">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-700 mb-2">Workout Plan</h3>
            <ul className="grid max-h-40 grid-cols-1 gap-2 overflow-auto pr-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
              {EXERCISE_PLAN.map((exercise) => (
                <li
                  key={exercise.name}
                  className="rounded-lg border border-gray-200/90 bg-gradient-to-br from-gray-50 to-gray-100 px-3 py-2 text-gray-800"
                >
                  <p className="font-semibold">{exercise.name}</p>
                  <p className="text-[11px] text-gray-600 mt-1">
                    {typeof exercise.durationSeconds === "number"
                      ? `⏱️ ${exercise.durationSeconds}s`
                      : `🔁 ${exercise.repetitions ?? 0} reps`}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
