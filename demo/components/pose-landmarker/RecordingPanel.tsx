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

	const shouldShow = isRecording || recordingData;

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
				filename = `pose_session_${timestamp}.pose`;
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
				filename = `pose_session_${timestamp}.json`;
				mimeType = "application/json";
				break;
			}
			case "csv": {
				// Create CSV with exercise groups summary
				const lines: string[] = [
					"# Full-Session Pose Recording Export",
					`# Session Duration: ${metadata.sessionDuration}ms`,
					`# Total Frames: ${metadata.frameCount}`,
					`# Exercises: ${metadata.exerciseGroups.length}`,
					`# Recorded At: ${new Date(metadata.startTime).toISOString()}`,
					"",
					"Exercise Groups:",
				];
				
				for (const ex of metadata.exerciseGroups) {
					lines.push(
						`${ex.name},Frames: ${ex.frameCount},Start Frame: ${ex.startFrameIndex},Duration: ${ex.duration ?? 0}ms`
					);
				}
				
				lines.push("", "Session Statistics:");
				lines.push(`Total Frames,${metadata.frameCount}`);
				lines.push(`Session Duration (ms),${metadata.sessionDuration}`);
				lines.push(`Average FPS,${stats?.avgFPS.toFixed(1) ?? "N/A"}`);
				lines.push(`Recorded People,${stats?.recordedPeople ?? "N/A"}`);
				
				data = lines.join("\n");
				filename = `pose_session_${timestamp}.csv`;
				mimeType = "text/csv";
				break;
			}
		}

		downloadRecording(data, filename, mimeType);
		onExport?.(format, data);
	};

	return (
		<div
			className="absolute left-3 top-3 max-w-xs rounded-lg border border-cyan-200/70 bg-cyan-50/90 px-3 py-2 text-sm text-cyan-950 shadow-lg backdrop-blur"
			style={{ display: shouldShow ? "block" : "none" }}
		>
			<div className="flex items-center justify-between">
				<div className="font-semibold">
					{isRecording ? (
						<span className="flex items-center gap-2">
							<span className="inline-block h-3 w-3 animate-pulse rounded-full bg-red-500"></span>
							Recording Session
						</span>
					) : (
						<span className="text-cyan-700">Session Complete</span>
					)}
				</div>
			</div>

			<div className="mt-2 space-y-1 text-xs">
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

				{recordingData?.metadata?.exerciseGroups && recordingData.metadata.exerciseGroups.length > 0 && (
					<div className="border-t border-cyan-200/50 pt-1 mt-1">
						<div className="text-cyan-700 font-semibold text-xs">Exercises:</div>
						<div className="text-xs space-y-1 mt-1">
							{recordingData.metadata.exerciseGroups.map((ex, idx) => (
								<div key={idx} className="flex justify-between text-cyan-900">
									<span>{ex.name}</span>
									<span className="font-mono text-cyan-700">{ex.frameCount} frames</span>
								</div>
							))}
						</div>
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
								title="Binary format (.pose) - Most compact, can be re-imported, includes exercise grouping"
								className="w-full rounded-md border border-cyan-400 bg-cyan-100 px-2 py-1 text-xs font-medium text-cyan-900 hover:bg-cyan-200 transition-colors"
							>
								Binary (.pose)
							</button>
							<button
								onClick={() => handleExport("json")}
								title="JSON format - Human readable, for debugging and analysis"
								className="w-full rounded-md border border-cyan-400 bg-cyan-100 px-2 py-1 text-xs font-medium text-cyan-900 hover:bg-cyan-200 transition-colors"
							>
								JSON (.json)
							</button>
							<button
								onClick={() => handleExport("csv")}
								title="CSV format - For spreadsheet analysis with exercise breakdown"
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
