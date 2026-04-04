import type { NormalizedStats } from "./types";

type NormalizationStatsPanelProps = {
	normalizedStats: NormalizedStats | null;
};

export function NormalizationStatsPanel({
	normalizedStats,
}: NormalizationStatsPanelProps) {
	if (!normalizedStats) {
		return null;
	}

	return (
		<div className="mt-4 rounded-lg border border-zinc-300 bg-zinc-50 p-4 text-xs font-mono dark:border-zinc-700 dark:bg-zinc-900">
			<h3 className="mb-3 font-semibold">🧪 Normalization Test Stats</h3>
			<div className="mb-3 rounded bg-blue-50 p-2 dark:bg-blue-950">
				<p className="text-blue-700 dark:text-blue-300">
					<strong>Torso Size:</strong> {normalizedStats.torsoSize.toFixed(4)}
				</p>
				<p className="text-xs text-blue-600 dark:text-blue-400">
					(Body scale reference - consistent across different body sizes)
				</p>
			</div>
			<div className="grid grid-cols-2 gap-4">
				<div>
					<p className="mb-2 font-semibold text-zinc-700 dark:text-zinc-300">
						Original Landmarks
					</p>
					<div className="space-y-1 text-zinc-600 dark:text-zinc-400">
						<p>
							X: {normalizedStats.originalRange.minX.toFixed(3)} → {" "}
							{normalizedStats.originalRange.maxX.toFixed(3)}
						</p>
						<p>
							Y: {normalizedStats.originalRange.minY.toFixed(3)} → {" "}
							{normalizedStats.originalRange.maxY.toFixed(3)}
						</p>
						<p className="text-xs text-zinc-500">
							(Pixel coordinates, 0-1 range)
						</p>
					</div>
				</div>
				<div>
					<p className="mb-2 font-semibold text-zinc-700 dark:text-zinc-300">
						Normalized Landmarks
					</p>
					<div className="space-y-1 text-zinc-600 dark:text-zinc-400">
						<p>
							X: {normalizedStats.normalizedRange.minX.toFixed(3)} → {" "}
							{normalizedStats.normalizedRange.maxX.toFixed(3)}
						</p>
						<p>
							Y: {normalizedStats.normalizedRange.minY.toFixed(3)} → {" "}
							{normalizedStats.normalizedRange.maxY.toFixed(3)}
						</p>
						<p className="text-xs text-zinc-500">✓ Normalized &amp; scale-invariant</p>
					</div>
				</div>
			</div>
			<p className="mt-3 text-xs text-zinc-500">
				Check browser console (F12) for detailed frame-by-frame stats → Groups
				starting with "🎯 Frame"
			</p>
		</div>
	);
}
