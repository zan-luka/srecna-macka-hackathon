"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
	PoseRecorder,
} from "@/components/pose-landmarker/poseRecorder";
import { KneePositionChart } from "@/components/charts/KneePositionChart";
import { HipLeanChart } from "../../components/charts/HipLeanChart";
import { TorsoAngleChart } from "@/components/charts/TorsoAngleChart";

type RecordingListItem = NonNullable<Awaited<ReturnType<typeof PoseRecorder.getRecordingsList>>>[number];
type LoadedRecording = NonNullable<Awaited<ReturnType<typeof PoseRecorder.loadFromLocalStorage>>>;

function formatDuration(ms?: number) {
	if (typeof ms !== "number" || Number.isNaN(ms)) {
		return "—";
	}

	return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(timestamp: number) {
	return new Date(timestamp).toLocaleString();
}

export default function AnalyticsPage() {
	const [recordings, setRecordings] = useState<RecordingListItem[]>([]);
	const [selectedStartTime, setSelectedStartTime] = useState<number | null>(null);
	const [selectedRecording, setSelectedRecording] = useState<LoadedRecording | null>(null);
	const [loadingList, setLoadingList] = useState(true);
	const [loadingRecording, setLoadingRecording] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let isCancelled = false;

		const loadRecordings = async () => {
			setLoadingList(true);
			setError(null);

			const data = await PoseRecorder.getRecordingsList();

			if (isCancelled) {
				return;
			}

			if (data === null) {
				setError("Could not read recordings from IndexedDB.");
				setRecordings([]);
				setSelectedStartTime(null);
				setLoadingList(false);
				return;
			}

			setRecordings(data);
			setSelectedStartTime((current) => current ?? data[0]?.startTime ?? null);
			setLoadingList(false);
		};

		void loadRecordings();

		return () => {
			isCancelled = true;
		};
	}, []);

	useEffect(() => {
		let isCancelled = false;

		const loadRecording = async () => {
			if (selectedStartTime === null) {
				setSelectedRecording(null);
				setLoadingRecording(false);
				return;
			}

			setLoadingRecording(true);
			const recording = await PoseRecorder.loadFromLocalStorage(selectedStartTime);

			if (isCancelled) {
				return;
			}

			setSelectedRecording(recording);
			setLoadingRecording(false);
		};

		void loadRecording();

		return () => {
			isCancelled = true;
		};
	}, [selectedStartTime]);

	const selectedSummary = useMemo<RecordingListItem | undefined>(
		() => recordings.find((recording) => recording.startTime === selectedStartTime),
		[recordings, selectedStartTime],
	);

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
			<header className="flex flex-col gap-3">
				<div className="flex items-center justify-between gap-4">
					<div>
						<h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Knee analytics</h1>
						<p className="mt-1 text-sm text-zinc-600">
							Reads pose sessions from IndexedDB and compares the left and right knee joint angles.
						</p>
					</div>
					<Link
						href="/"
						className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50"
					>
						Back to capture
					</Link>
				</div>

				{error ? (
					<p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
				) : null}
			</header>

			<section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
				<div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
					<div className="mb-4 flex items-center justify-between">
						<h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">Recordings</h2>
						<span className="text-xs text-zinc-500">{recordings.length} saved</span>
					</div>

					{loadingList ? (
						<p className="text-sm text-zinc-600">Loading recordings…</p>
					) : recordings.length === 0 ? (
						<p className="text-sm text-zinc-600">No recordings found in IndexedDB.</p>
					) : (
						<div className="space-y-2">
							{recordings.map((recording) => {
								const isSelected = recording.startTime === selectedStartTime;

								return (
									<button
										key={recording.startTime}
										type="button"
										onClick={() => setSelectedStartTime(recording.startTime)}
										className={`w-full rounded-xl border px-3 py-3 text-left transition ${
											isSelected
												? "border-sky-300 bg-sky-50"
												: "border-zinc-200 bg-white hover:bg-zinc-50"
										}`}
									>
										<div className="flex items-center justify-between gap-2">
											<p className="text-sm font-medium text-zinc-900">{formatDate(recording.startTime)}</p>
											<span className="text-xs text-zinc-500">{recording.frameCount} frames</span>
										</div>
										<div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-600">
											<span>{formatDuration(recording.sessionDuration)}</span>
											<span>•</span>
											<span>{recording.exerciseCount} exercises</span>
										</div>
									</button>
								);
							})}
						</div>
					)}
				</div>

				<div className="space-y-4">
					<div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
						<div>
							<h2 className="text-lg font-semibold text-zinc-900">Selected session</h2>
							<p className="text-sm text-zinc-600">
								{selectedSummary ? formatDate(selectedSummary.startTime) : "Choose a recording from the list"}
							</p>
						</div>

						<div className="mt-4 grid gap-3 sm:grid-cols-3">
							<div className="rounded-xl bg-zinc-50 p-3">
								<p className="text-xs uppercase tracking-widest text-zinc-500">Frames</p>
								<p className="mt-1 text-lg font-semibold text-zinc-900">{selectedSummary?.frameCount ?? 0}</p>
							</div>
							<div className="rounded-xl bg-zinc-50 p-3">
								<p className="text-xs uppercase tracking-widest text-zinc-500">Duration</p>
								<p className="mt-1 text-lg font-semibold text-zinc-900">{formatDuration(selectedSummary?.sessionDuration)}</p>
							</div>
							<div className="rounded-xl bg-zinc-50 p-3">
								<p className="text-xs uppercase tracking-widest text-zinc-500">Exercises</p>
								<p className="mt-1 text-lg font-semibold text-zinc-900">{selectedSummary?.exerciseCount ?? 0}</p>
							</div>
						</div>
					</div>

					<div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm">
						{loadingRecording ? (
							<p className="text-sm text-zinc-600">Loading selected recording…</p>
						) : selectedRecording ? (
							<div className="space-y-8">
								<div>
									<h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-zinc-500">Knee angles</h3>
									<KneePositionChart frames={selectedRecording.frames} exerciseGroups={selectedRecording.metadata.exerciseGroups} />
								</div>
								<div>
									<h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-zinc-500">Hip lean</h3>
									<HipLeanChart frames={selectedRecording.frames} exerciseGroups={selectedRecording.metadata.exerciseGroups} />
								</div>
								<div>
									<h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-zinc-500">Torso angle</h3>
									<TorsoAngleChart frames={selectedRecording.frames} exerciseGroups={selectedRecording.metadata.exerciseGroups} />
								</div>
							</div>
						) : (
							<p className="text-sm text-zinc-600">Pick a recording to visualize joint angles.</p>
						)}
					</div>
				</div>
			</section>
		</main>
	);
}
