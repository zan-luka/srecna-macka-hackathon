import type { NormalizedLandmarksMessage } from "./types";

type JointAnglesPanelProps = {
	message: NormalizedLandmarksMessage | null;
};

export function JointAnglesPanel({ message }: JointAnglesPanelProps) {
	if (!message?.jointAngles?.[0] || message.jointAngles[0].length === 0) {
		return (
			<div className="absolute bottom-3 right-3 rounded-lg border border-purple-200/70 bg-purple-50/90 px-3 py-2 text-sm text-purple-950 shadow-lg backdrop-blur">
				<div className="font-semibold">Joint Angles</div>
				<div className="text-xs text-purple-700">No pose detected</div>
			</div>
		);
	}

	const angles = message.jointAngles[0] || [];

	return (
		<div className="absolute bottom-3 right-3 rounded-lg border border-purple-200/70 bg-purple-50/90 px-3 py-2 text-sm text-purple-950 shadow-lg backdrop-blur">
			<div className="font-semibold text-purple-700 mb-2">Joint Angles (degrees)</div>
			<div className="grid grid-cols-2 gap-2 text-xs font-mono">
				{angles.map((angle) => (
					<div key={angle.name} className="flex justify-between gap-3">
						<span className="text-purple-700">{angle.name}:</span>
						<span className="font-semibold text-purple-900">{angle.angle.toFixed(1)}°</span>
					</div>
				))}
			</div>
		</div>
	);
}
