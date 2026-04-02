import PoseLandmarkerView from "@/components/PoseLandmarker";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-100 p-6 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <h1 className="text-2xl font-semibold">Realtime Pose Landmarker</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Webcam stream with MediaPipe body landmarks overlay.
        </p>
        <PoseLandmarkerView className="w-full" />
      </main>
    </div>
  );
}
