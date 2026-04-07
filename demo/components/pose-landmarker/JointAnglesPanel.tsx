import type { NormalizedLandmarksMessage } from "./types";

type JointAnglesPanelProps = {
	message: NormalizedLandmarksMessage | null;
};

export function JointAnglesPanel({ message }: JointAnglesPanelProps) {
	const topPrediction = message?.predictions?.[0] ?? null;
	const classifierStatus = message?.classifierStatus ?? "loading";

	if (!message?.jointAngles?.[0] || message.jointAngles[0].length === 0) {
		return (
			<div className="absolute bottom-3 right-3 rounded-lg border border-teal-200/70 bg-teal-50/90 px-3 py-2 text-sm text-teal-900 shadow-lg backdrop-blur">
				<div className="font-semibold">Joint Angles</div>
				{topPrediction ? (
					<div className="mt-1 text-xs text-teal-700">
						Exercise: <span className="font-semibold text-teal-900">{topPrediction.label}</span>
					</div>
				) : (
					<div className="mt-1 text-xs text-teal-700">Exercise classifier: {classifierStatus}</div>
				)}
				<div className="text-xs text-teal-700">No pose detected</div>
			</div>
		);
	}

	const angles = message.jointAngles[0] || [];

	return (
		<div className="absolute bottom-3 right-3 rounded-lg border border-teal-200/70 bg-teal-50/90 px-3 py-2 text-sm text-teal-900 shadow-lg backdrop-blur">
			<div className="font-semibold text-teal-700 mb-2">Joint Angles (degrees)</div>
			{topPrediction ? (
				<div className="mb-2 rounded border border-teal-200/80 bg-white/70 px-2 py-1 text-xs">
					<div>
						Exercise: <span className="font-semibold text-teal-900">{topPrediction.label}</span>
					</div>
					<div className="text-teal-700">
						Confidence: {(topPrediction.confidence * 100).toFixed(0)}%
					</div>
				</div>
			) : (
				<div className="mb-2 text-xs text-teal-700">Exercise classifier: {classifierStatus}</div>
			)}
			<div className="grid grid-cols-2 gap-2 text-xs font-mono">
				{angles.map((angle) => (
					<div key={angle.name} className="flex justify-between gap-3">
						<span className="text-teal-700">{angle.name}:</span>
						<span className="font-semibold text-teal-900">{angle.angle.toFixed(1)}°</span>
					</div>
				))}
			</div>
		</div>
	);
}
