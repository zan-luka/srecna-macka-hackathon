"use client";

import { useState } from "react";
import PoseLandmarkerView from "@/components/PoseLandmarker";

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

  return (
    <div className="min-h-screen bg-zinc-100 p-6 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <h1 className="text-2xl font-semibold">Realtime Pose Landmarker</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Webcam stream with MediaPipe body landmarks overlay.
        </p>
        <PoseLandmarkerView className="w-full" sessionState={sessionState} onExit={handleExit} />

        <div className="mt-4 flex items-center justify-end gap-3 border-t border-zinc-300 pt-4 dark:border-zinc-700">
          <button
            type="button"
            onClick={handleStart}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Start
          </button>
          <button
            type="button"
            onClick={handlePause}
            disabled={sessionState === "idle"}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sessionState === "paused" ? "Resume" : "Pause"}
          </button>
        </div>
      </main>
    </div>
  );
}
