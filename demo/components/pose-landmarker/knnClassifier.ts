import { normalizeLandmarks } from "./workerNormalization";
import type { ExercisePrediction, Landmark } from "./types";

type TrainingSample = {
	label: string;
	vector: number[];
};

export type KNNClassifier = {
	predict: (landmarks: Landmark[]) => ExercisePrediction | null;
	labels: string[];
	sampleCount: number;
};

const DEFAULT_K = 5;
const MIN_LANDMARK_COUNT = 33;

function toFeatureVector(landmarks: Landmark[]): number[] | null {
	if (landmarks.length < MIN_LANDMARK_COUNT) {
		return null;
	}

	const { landmarks: normalizedLandmarks, torsoSize } = normalizeLandmarks(landmarks);
	if (!torsoSize) {
		return null;
	}

	const vector: number[] = [];
	for (let i = 0; i < MIN_LANDMARK_COUNT; i += 1) {
		const point = normalizedLandmarks[i];
		if (!point) {
			return null;
		}
		vector.push(point.x, point.y, point.z);
	}

	return vector;
}

function squaredEuclideanDistance(a: number[], b: number[]): number {
	if (a.length !== b.length) {
		return Number.POSITIVE_INFINITY;
	}

	let total = 0;
	for (let i = 0; i < a.length; i += 1) {
		const diff = a[i] - b[i];
		total += diff * diff;
	}
	return total;
}

export function parseTrainingCsv(csvText: string): TrainingSample[] {
	const rows = csvText
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	const samples: TrainingSample[] = [];

	for (const row of rows) {
		const cols = row.split(",");
		if (cols.length < 2 + MIN_LANDMARK_COUNT * 3) {
			continue;
		}

		const label = cols[1]?.trim();
		if (!label) {
			continue;
		}

		const values = cols.slice(2).map((value) => Number.parseFloat(value));
		if (values.some((value) => Number.isNaN(value))) {
			continue;
		}

		const landmarks: Landmark[] = [];
		for (let i = 0; i < MIN_LANDMARK_COUNT; i += 1) {
			const offset = i * 3;
			landmarks.push({
				x: values[offset],
				y: values[offset + 1],
				z: values[offset + 2],
			});
		}

		const vector = toFeatureVector(landmarks);
		if (!vector) {
			continue;
		}

		samples.push({ label, vector });
	}

	return samples;
}

export function createKNNClassifier(samples: TrainingSample[], k = DEFAULT_K): KNNClassifier {
	const labels = [...new Set(samples.map((sample) => sample.label))].sort();
	const effectiveK = Math.max(1, Math.min(k, samples.length));

	return {
		labels,
		sampleCount: samples.length,
		predict: (landmarks: Landmark[]) => {
			if (samples.length === 0) {
				return null;
			}

			const query = toFeatureVector(landmarks);
			if (!query) {
				return null;
			}

			const nearest = samples
				.map((sample) => ({
					label: sample.label,
					distanceSquared: squaredEuclideanDistance(query, sample.vector),
				}))
				.sort((a, b) => a.distanceSquared - b.distanceSquared)
				.slice(0, effectiveK);

			const votes = new Map<string, { count: number; bestDistanceSquared: number }>();
			for (const neighbor of nearest) {
				const existing = votes.get(neighbor.label);
				if (!existing) {
					votes.set(neighbor.label, {
						count: 1,
						bestDistanceSquared: neighbor.distanceSquared,
					});
					continue;
				}

				existing.count += 1;
				existing.bestDistanceSquared = Math.min(existing.bestDistanceSquared, neighbor.distanceSquared);
			}

			let bestLabel = "unknown";
			let bestCount = -1;
			let bestDistanceSquared = Number.POSITIVE_INFINITY;

			for (const [label, stats] of votes.entries()) {
				if (
					stats.count > bestCount ||
					(stats.count === bestCount && stats.bestDistanceSquared < bestDistanceSquared)
				) {
					bestLabel = label;
					bestCount = stats.count;
					bestDistanceSquared = stats.bestDistanceSquared;
				}
			}

			return {
				label: bestLabel,
				confidence: bestCount / effectiveK,
				distance: Math.sqrt(bestDistanceSquared),
			};
		},
	};
}
