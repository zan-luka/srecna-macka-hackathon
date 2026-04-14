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
import { calculateJointAngles } from "@/components/pose-landmarker/jointAngles";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

type KneePositionChartProps = {
	frames: RecordedFrame[];
};

function getKneeAngles(frame: RecordedFrame) {
	const personLandmarks = frame.landmarks[0];
	if (!personLandmarks || personLandmarks.length < 29) {
		return { left: null as number | null, right: null as number | null };
	}

	const angleMap = new Map(
		calculateJointAngles(personLandmarks).map((jointAngle) => [jointAngle.name, jointAngle.angle]),
	);

	return {
		left: angleMap.get("LEFT_KNEE") ?? null,
		right: angleMap.get("RIGHT_KNEE") ?? null,
	};
}

export function KneePositionChart({ frames }: KneePositionChartProps) {
	const chartData = useMemo<ChartData<"line", Array<number | null>, string>>(() => {
		if (frames.length === 0) {
			return { labels: [], datasets: [] };
		}

		const firstTimestamp = frames[0]?.timestamp ?? 0;
		const labels = frames.map((frame) => `${((frame.timestamp - firstTimestamp) / 1000).toFixed(1)}s`);
		const kneeAngles = frames.map(getKneeAngles);

		return {
			labels,
			datasets: [
				{
					label: "Left knee angle",
					data: kneeAngles.map((angles) => angles.left),
					borderColor: "rgb(14, 165, 233)",
					backgroundColor: "rgba(14, 165, 233, 0.18)",
					pointRadius: 1.5,
					tension: 0.25,
				},
				{
					label: "Right knee angle",
					data: kneeAngles.map((angles) => angles.right),
					borderColor: "rgb(244, 63, 94)",
					backgroundColor: "rgba(244, 63, 94, 0.18)",
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
					text: "Left vs right knee angle",
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
						text: "Angle (degrees)",
					},
					suggestedMin: 0,
					suggestedMax: 180,
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
				Angles are computed using <span className="font-medium">hip → knee → ankle</span> for each side via
				 the joint-angle utilities.
			</p>
		</div>
	);
}
