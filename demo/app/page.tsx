"use client";

import { useState } from "react";
import PoseLandmarkerView from "@/components/PoseLandmarker";
import { EXERCISE_PLAN } from "@/components/pose-landmarker/exercisePlan";

export default function Home() {
	const [sessionState, setSessionState] = useState<"idle" | "running" | "paused">("idle");

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
        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        Start session
      </button>
      <button
        type="button"
        onClick={handlePause}
        disabled={sessionState === "idle"}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-orange-200 bg-orange-100 px-5 py-2.5 text-sm font-semibold text-orange-900 transition hover:bg-orange-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sessionState === "paused" ? "Resume" : "Pause"}
      </button>
      <button
        type="button"
        onClick={handleExit}
        disabled={sessionState === "idle"}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        End session
      </button>
    </>
  );

  return (
    <div className="min-h-screen px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
      <main className="mx-auto w-full max-w-7xl">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
          <section className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white/85 px-4 py-3 shadow-sm backdrop-blur sm:px-5 lg:hidden">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">
                    Personal Coach
                  </p>
                  <h1 className="text-lg font-semibold text-gray-900">Move with confidence</h1>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${stateClassName}`}>
                  {stateLabel}
                </span>
              </div>
            </div>

            <PoseLandmarkerView
              className="w-full"
              sessionState={sessionState}
              onExit={handleExit}
            />

            <div className="rounded-2xl border border-gray-200 bg-white/90 px-4 py-4 shadow-sm backdrop-blur lg:hidden">
              <p className="mb-3 text-sm font-medium text-gray-600">Session controls</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{renderControls()}</div>
            </div>
          </section>

          <aside className="hidden h-fit space-y-4 lg:block">
            <div className="rounded-2xl border border-gray-200 bg-white/90 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">Personal Coach</p>
              <h1 className="mt-1 text-2xl font-semibold text-gray-900">Train smarter at home</h1>
              <p className="mt-2 text-sm text-gray-600">
                Keep your full body visible and follow the prompts over the camera feed.
              </p>
              <div className="mt-4 flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                <span className="text-sm font-medium text-gray-600">Session status</span>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${stateClassName}`}>
                  {stateLabel}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white/90 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">Controls</h2>
              <div className="mt-3 grid gap-2">{renderControls()}</div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white/90 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">Today&apos;s routine</h2>
              <ul className="mt-3 space-y-2">
                {EXERCISE_PLAN.map((exercise) => (
                  <li
                    key={exercise.name}
                    className="rounded-xl border border-gray-200 bg-white/90 px-3 py-2 text-sm text-gray-800"
                  >
                    <p className="font-medium">{exercise.name}</p>
                    <p className="text-xs text-gray-600">
                      {typeof exercise.durationSeconds === "number"
                        ? `${exercise.durationSeconds} seconds`
                        : `${exercise.repetitions ?? 0} repetitions`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
