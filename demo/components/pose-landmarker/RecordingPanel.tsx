import { useRef, useState } from "react";
import type { NormalizedLandmarksMessage } from "./types";
import { downloadRecording, PoseRecorder, type RecordingMetadata } from "./poseRecorder";

type RecordingPanelProps = {
	isRecording: boolean;
	recordingData: {
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
	} | null;
	exerciseName?: string;
	onExport?: (format: "binary" | "json" | "csv", data: ArrayBuffer | string) => void;
	message?: NormalizedLandmarksMessage | null;
};

export function RecordingPanel({
	isRecording,
	recordingData,
	exerciseName,
	onExport,
	message,
}: RecordingPanelProps) {
	const [showExportOptions, setShowExportOptions] = useState(false);
	const recorderRef = useRef(new PoseRecorder());

	if (!isRecording && !recordingData) {
		return null;
	}

	const frameCount = message?.recordingFrameCount ?? recordingData?.frameCount ?? 0;
	const duration = recordingData?.duration ?? recordingData?.stats?.duration ?? 0;
	const stats = recordingData?.stats;

	const handleExport = (format: "binary" | "json" | "csv") => {
		if (!recordingData?.metadata) {
			console.error("No recording metadata available");
			return;
		}

		let data: ArrayBuffer | string;
		let filename: string;
		let mimeType: string;

		const metadata = recordingData.metadata;
		const timestamp = new Date(metadata.startTime).toISOString().slice(0, 19).replace(/:/g, "-");

		switch (format) {
			case "binary": {
				if (!recordingData.buffer) {
					console.error("No binary data available");
					return;
				}
				data = recordingData.buffer;
				filename = `pose_${metadata.exerciseName}_${timestamp}.pose`;
				mimeType = "application/octet-stream";
				break;
			}
			case "json": {
				data = JSON.stringify(
					{
						metadata,
						stats,
					},
					null,
					2,
				);
				filename = `pose_${metadata.exerciseName}_${timestamp}.json`;
				mimeType = "application/json";
				break;
			}
			case "csv": {
				// Create CSV from metadata
				const lines: string[] = [
					"# Pose Recording Export",
					`# Exercise: ${metadata.exerciseName}`,
					`# Duration: ${metadata.duration}ms`,
					`# Frames: ${metadata.frameCount}`,
					`# Recorded At: ${new Date(metadata.startTime).toISOString()}`,
					"",
					"Frame Statistics:",
					`Total Frames,${metadata.frameCount}`,
					`Duration (ms),${metadata.duration}`,
					`Average FPS,${stats?.avgFPS.toFixed(1) ?? "N/A"}`,
					`Recorded People,${stats?.recordedPeople ?? "N/A"}`,
				];
				data = lines.join("\n");
				filename = `pose_${metadata.exerciseName}_${timestamp}.csv`;
				mimeType = "text/csv";
				break;
			}
		}

		downloadRecording(data, filename, mimeType);
		onExport?.(format, data);
	};

	return (
		<div className="absolute left-3 top-3 max-w-xs rounded-lg border border-cyan-200/70 bg-cyan-50/90 px-3 py-2 text-sm text-cyan-950 shadow-lg backdrop-blur">
			<div className="flex items-center justify-between">
				<div className="font-semibold">
					{isRecording ? (
						<span className="flex items-center gap-2">
							<span className="inline-block h-3 w-3 animate-pulse rounded-full bg-red-500"></span>
							Recording
						</span>
					) : (
						<span className="text-cyan-700">Recording Complete</span>
					)}
				</div>
			</div>

			<div className="mt-2 space-y-1 text-xs">
				{exerciseName && <div className="text-cyan-700">Exercise: {exerciseName}</div>}

				<div>
					<span className="text-cyan-700">Frames: </span>
					<span className="font-mono font-semibold">{frameCount}</span>
				</div>

				{duration > 0 && (
					<div>
						<span className="text-cyan-700">Duration: </span>
						<span className="font-mono font-semibold">{(duration / 1000).toFixed(1)}s</span>
					</div>
				)}

				{stats && (
					<div className="border-t border-cyan-200/50 pt-1">
						<div>
							<span className="text-cyan-700">Avg FPS: </span>
							<span className="font-mono font-semibold">{stats.avgFPS.toFixed(1)}</span>
						</div>
						<div>
							<span className="text-cyan-700">People: </span>
							<span className="font-mono font-semibold">{stats.recordedPeople}</span>
						</div>
					</div>
				)}
			</div>

			{recordingData && !isRecording && (
				<div className="mt-2 border-t border-cyan-200/50 pt-2">
					<button
						onClick={() => setShowExportOptions(!showExportOptions)}
						className="w-full rounded-md bg-cyan-600 px-2 py-1 text-xs font-semibold text-white hover:bg-cyan-700 transition-colors"
					>
						{showExportOptions ? "Hide Exports" : "Export Data"}
					</button>

					{showExportOptions && (
						<div className="mt-2 space-y-1">
							<button
								onClick={() => handleExport("binary")}
								title="Binary format (.pose) - Most compact, can be re-imported"
								className="w-full rounded-md border border-cyan-400 bg-cyan-100 px-2 py-1 text-xs font-medium text-cyan-900 hover:bg-cyan-200 transition-colors"
							>
								Binary (.pose)
							</button>
							<button
								onClick={() => handleExport("json")}
								title="JSON format - Human readable, for debugging"
								className="w-full rounded-md border border-cyan-400 bg-cyan-100 px-2 py-1 text-xs font-medium text-cyan-900 hover:bg-cyan-200 transition-colors"
							>
								JSON (.json)
							</button>
							<button
								onClick={() => handleExport("csv")}
								title="CSV format - For spreadsheet analysis"
								className="w-full rounded-md border border-cyan-400 bg-cyan-100 px-2 py-1 text-xs font-medium text-cyan-900 hover:bg-cyan-200 transition-colors"
							>
								CSV (.csv)
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
