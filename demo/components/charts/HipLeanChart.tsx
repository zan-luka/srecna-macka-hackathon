"use client";

import { useMemo } from "react";
import {
	CategoryScale,
	Chart as ChartJS,
	Legend,
	LineElement,
	LinearScale,
	PointElement,
	Tooltip,
	type ChartData,
	type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { RecordedFrame } from "@/components/pose-landmarker/poseRecorder";
import { calculateLateralLeanAngle } from "@/components/pose-landmarker/jointAngles";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

type HipLeanChartProps = {
	frames: RecordedFrame[];
};

function getLeanAngle(frame: RecordedFrame) {
	const personLandmarks = frame.landmarks[0];
	if (!personLandmarks || personLandmarks.length < 25) {
		return null;
	}

	const leftShoulder = personLandmarks[11];
	const rightShoulder = personLandmarks[12];
	const leftHip = personLandmarks[23];
	const rightHip = personLandmarks[24];

	if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
		return null;
	}

	return calculateLateralLeanAngle(leftShoulder, rightShoulder, leftHip, rightHip);
}

export function HipLeanChart({ frames }: HipLeanChartProps) {
	const chartData = useMemo<ChartData<"line", Array<number | null>, string>>(() => {
		if (frames.length === 0) {
			return { labels: [], datasets: [] };
		}

		const firstTimestamp = frames[0]?.timestamp ?? 0;
		const labels = frames.map((frame) => `${((frame.timestamp - firstTimestamp) / 1000).toFixed(1)}s`);

		return {
			labels,
			datasets: [
				{
					label: "Signed lean angle",
					data: frames.map(getLeanAngle),
					borderColor: "rgb(168, 85, 247)",
					backgroundColor: "rgba(168, 85, 247, 0.18)",
					pointRadius: 1.5,
					tension: 0.25,
				},
			],
		};
	}, [frames]);

	const chartOptions = useMemo<ChartOptions<"line">>(
		() => ({
			responsive: true,
			maintainAspectRatio: false,
			interaction: {
				mode: "index",
				intersect: false,
			},
			plugins: {
				legend: {
					position: "bottom",
				},
				title: {
					display: true,
					text: "Hip lean over time",
				},
			},
			scales: {
				x: {
					title: {
						display: true,
						text: "Time",
					},
				},
				y: {
					title: {
						display: true,
						text: "Lean angle (degrees)",
					},
					suggestedMin: -45,
					suggestedMax: 45,
				},
			},
		}),
		[],
	);

	if (frames.length === 0) {
		return (
			<div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600">
				No frames available for this recording.
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<div className="h-80 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
				<Line data={chartData} options={chartOptions} />
			</div>
			<p className="text-xs text-zinc-500">
				Positive values indicate the hips drift to the right relative to the shoulders; negative values indicate a left lean.
			</p>
		</div>
	);
}
