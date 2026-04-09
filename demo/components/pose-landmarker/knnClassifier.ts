import { normalizeLandmarks } from "./workerNormalization";
import {
	KNN_UNKNOWN_DISTANCE_FALLBACK,
	KNN_UNKNOWN_DISTANCE_MARGIN,
	KNN_UNKNOWN_DISTANCE_MIN,
	KNN_UNKNOWN_DISTANCE_PERCENTILE,
} from "./constants";
import type { ExercisePrediction, Landmark } from "./types";

type TrainingSample = {
	label: string;
	vector: number[];
};

export type KNNClassifier = {
	predict: (landmarks: Landmark[]) => ExercisePrediction | null;
	labels: string[];
	sampleCount: number;
	unknownDistanceThreshold: number;
};

const DEFAULT_TOP_N_BY_MAX_DISTANCE = 30;
const DEFAULT_TOP_N_BY_MEAN_DISTANCE = 10;
const MIN_LANDMARK_COUNT = 33;

// Matches the Python pipeline's axes_weights=(1.0, 1.0, 0.2).
// Z is down-weighted because it's an estimated depth value and less reliable.
const AXES_WEIGHTS = [1.0, 1.0, 0.2];

// Landmark indices for the 33 MediaPipe pose landmarks.
// Must match the order in the Python pipeline's _landmark_names list.
const LM = {
	LEFT_SHOULDER: 11,
	RIGHT_SHOULDER: 12,
	LEFT_ELBOW: 13,
	RIGHT_ELBOW: 14,
	LEFT_WRIST: 15,
	RIGHT_WRIST: 16,
	LEFT_HIP: 23,
	RIGHT_HIP: 24,
	LEFT_KNEE: 25,
	RIGHT_KNEE: 26,
	LEFT_ANKLE: 27,
	RIGHT_ANKLE: 28,
	LEFT_PINKY: 17,
	RIGHT_PINKY: 18,
	LEFT_INDEX: 19,
	RIGHT_INDEX: 20,
	LEFT_THUMB: 21,
	RIGHT_THUMB: 22,
	LEFT_HEEL: 29,
	RIGHT_HEEL: 30,
	LEFT_FOOT_INDEX: 31,
	RIGHT_FOOT_INDEX: 32,
} as const;

type Point3D = [number, number, number];

function getPoint(landmarks: Landmark[], index: number): Point3D | null {
	const lm = landmarks[index];
	if (!lm) return null;
	return [lm.x, lm.y, lm.z];
}

function avgPoints(a: Point3D, b: Point3D): Point3D {
	return [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5];
}

// Returns the signed difference vector (to - from), preserving direction.
// Matches Python's _get_distance which returns lmk_to - lmk_from.
function diffVector(from: Point3D, to: Point3D): Point3D {
	return [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
}

/**
 * Converts normalized landmarks into a pairwise-distance embedding.
 *
 * Mirrors the Python FullBodyPoseEmbedder._get_pose_distance_embedding method.
 * Each "distance" is actually a signed 3D difference vector (x, y, z),
 * giving 3 values per pair. The result is flattened into a 1D array.
 */
function getPoseEmbedding(landmarks: Landmark[]): number[] | null {
	const ls = getPoint(landmarks, LM.LEFT_SHOULDER);
	const rs = getPoint(landmarks, LM.RIGHT_SHOULDER);
	const le = getPoint(landmarks, LM.LEFT_ELBOW);
	const re = getPoint(landmarks, LM.RIGHT_ELBOW);
	const lw = getPoint(landmarks, LM.LEFT_WRIST);
	const rw = getPoint(landmarks, LM.RIGHT_WRIST);
	const lh = getPoint(landmarks, LM.LEFT_HIP);
	const rh = getPoint(landmarks, LM.RIGHT_HIP);
	const lk = getPoint(landmarks, LM.LEFT_KNEE);
	const rk = getPoint(landmarks, LM.RIGHT_KNEE);
	const la = getPoint(landmarks, LM.LEFT_ANKLE);
	const ra = getPoint(landmarks, LM.RIGHT_ANKLE);

	if (!ls || !rs || !le || !re || !lw || !rw || !lh || !rh || !lk || !rk || !la || !ra) {
		return null;
	}

	const hipsCenter = avgPoints(lh, rh);
	const shouldersCenter = avgPoints(ls, rs);

	const pairs: [Point3D, Point3D][] = [
		// One joint — torso
		[hipsCenter, shouldersCenter],
		// One joint — arms
		[ls, le],
		[rs, re],
		[le, lw],
		[re, rw],
		// One joint — legs
		[lh, lk],
		[rh, rk],
		[lk, la],
		[rk, ra],
		// Two joints — full arm / full leg
		[ls, lw],
		[rs, rw],
		[lh, la],
		[rh, ra],
		// Four joints — hip to wrist
		[lh, lw],
		[rh, rw],
		// Five joints — shoulder to ankle
		[ls, la],
		[rs, ra],
		// Duplicate hip-to-wrist (matches Python source exactly)
		[lh, lw],
		[rh, rw],
		// Cross-body
		[le, re],
		[lk, rk],
		[lw, rw],
		[la, ra],
	];

	const embedding: number[] = [];
	for (const [from, to] of pairs) {
		const d = diffVector(from, to);
		embedding.push(d[0], d[1], d[2]);
	}

	return embedding;
}

/**
 * Builds the feature vector from raw (un-normalized) landmarks.
 * Normalization happens first (matching the Python pipeline), then embedding.
 */
function toFeatureVector(landmarks: Landmark[]): number[] | null {
	if (landmarks.length < MIN_LANDMARK_COUNT) {
		return null;
	}

	const { landmarks: normalizedLandmarks, torsoSize } = normalizeLandmarks(landmarks);
	if (!torsoSize) {
		return null;
	}

	return getPoseEmbedding(normalizedLandmarks as Landmark[]);
}

/**
 * Produces the feature vector for the horizontally flipped pose.
 * Mirrors Python's use of `pose_landmarks * np.array([-1, 1, 1])` on the
 * already-normalized landmarks before re-embedding, which handles poses
 * where the person faces or moves in the opposite direction.
 */
function toFlippedFeatureVector(landmarks: Landmark[]): number[] | null {
	if (landmarks.length < MIN_LANDMARK_COUNT) {
		return null;
	}

	const { landmarks: normalizedLandmarks, torsoSize } = normalizeLandmarks(landmarks);
	if (!torsoSize) {
		return null;
	}

	const flipped = (normalizedLandmarks as Landmark[]).map((lm) => ({
		...lm,
		x: -lm.x,
	}));

	return getPoseEmbedding(flipped);
}

/**
 * Weighted absolute difference between two embedding vectors.
 * Weights cycle through AXES_WEIGHTS (x=1.0, y=1.0, z=0.2) per the Python
 * axes_weights=(1., 1., 0.2) parameter, down-weighting unreliable z depth.
 */
function weightedAbsDiff(a: number[], b: number[]): number[] {
	const result: number[] = new Array(a.length);
	for (let i = 0; i < a.length; i += 1) {
		const weight = AXES_WEIGHTS[i % 3] ?? 1.0;
		result[i] = Math.abs((a[i] - b[i]) * weight);
	}
	return result;
}

/**
 * Two-stage nearest-neighbor distance matching from the Python pipeline:
 *
 * Stage 1 — filter by MAX distance:
 *   Keep the top-N samples whose worst single-dimension difference is smallest.
 *   This removes samples that are nearly identical except for one badly bent
 *   joint, which would otherwise represent a different pose class.
 *
 * Stage 2 — filter by MEAN distance:
 *   From the survivors, keep the top-N by average difference across all
 *   embedding dimensions. These are the true nearest neighbours.
 */
function twoStageKNN(
	query: number[],
	flippedQuery: number[],
	samples: TrainingSample[],
	topNByMaxDistance: number,
	topNByMeanDistance: number,
): Array<{ label: string; distanceSquared: number }> {
	// Stage 1: filter by max distance (take the better of normal vs flipped).
	const stage1 = samples
		.map((sample) => {
			const diffNormal = weightedAbsDiff(query, sample.vector);
			const diffFlipped = weightedAbsDiff(flippedQuery, sample.vector);
			const maxNormal = Math.max(...diffNormal);
			const maxFlipped = Math.max(...diffFlipped);
			return { sample, maxDist: Math.min(maxNormal, maxFlipped) };
		})
		.sort((a, b) => a.maxDist - b.maxDist)
		.slice(0, topNByMaxDistance);

	// Stage 2: filter survivors by mean distance.
	return stage1
		.map(({ sample }) => {
			const diffNormal = weightedAbsDiff(query, sample.vector);
			const diffFlipped = weightedAbsDiff(flippedQuery, sample.vector);
			const meanNormal = diffNormal.reduce((s, v) => s + v, 0) / diffNormal.length;
			const meanFlipped = diffFlipped.reduce((s, v) => s + v, 0) / diffFlipped.length;
			return {
				label: sample.label,
				// Store as squared for consistency with the threshold / confidence path.
				distanceSquared: Math.min(meanNormal, meanFlipped) ** 2,
			};
		})
		.sort((a, b) => a.distanceSquared - b.distanceSquared)
		.slice(0, topNByMeanDistance);
}

function percentile(sortedValues: number[], p: number): number {
	if (sortedValues.length === 0) {
		return KNN_UNKNOWN_DISTANCE_FALLBACK;
	}

	const clampedP = Math.max(0, Math.min(1, p));
	const index = Math.floor((sortedValues.length - 1) * clampedP);
	return sortedValues[index] ?? KNN_UNKNOWN_DISTANCE_FALLBACK;
}

function estimateUnknownDistanceThreshold(samples: TrainingSample[]): number {
	if (samples.length < 2) {
		return KNN_UNKNOWN_DISTANCE_FALLBACK;
	}

	const nearestDistances: number[] = [];

	for (let i = 0; i < samples.length; i += 1) {
		let nearestDistance = Number.POSITIVE_INFINITY;
		const source = samples[i];

		for (let j = 0; j < samples.length; j += 1) {
			if (i === j) continue;

			const candidate = samples[j];
			const diff = weightedAbsDiff(source.vector, candidate.vector);
			const mean = diff.reduce((s, v) => s + v, 0) / diff.length;
			if (mean < nearestDistance) {
				nearestDistance = mean;
			}
		}

		if (Number.isFinite(nearestDistance)) {
			nearestDistances.push(nearestDistance);
		}
	}

	if (nearestDistances.length === 0) {
		return KNN_UNKNOWN_DISTANCE_FALLBACK;
	}

	nearestDistances.sort((a, b) => a - b);
	const base = percentile(nearestDistances, KNN_UNKNOWN_DISTANCE_PERCENTILE);
	const threshold = base * KNN_UNKNOWN_DISTANCE_MARGIN;

	if (!Number.isFinite(threshold) || threshold <= 0) {
		return KNN_UNKNOWN_DISTANCE_FALLBACK;
	}

	return Math.max(KNN_UNKNOWN_DISTANCE_MIN, threshold);
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

export function createKNNClassifier(
	samples: TrainingSample[],
	topNByMaxDistance = DEFAULT_TOP_N_BY_MAX_DISTANCE,
	topNByMeanDistance = DEFAULT_TOP_N_BY_MEAN_DISTANCE,
): KNNClassifier {
	const labels = [...new Set(samples.map((sample) => sample.label))].sort();
	const unknownDistanceThreshold = estimateUnknownDistanceThreshold(samples);

	return {
		labels,
		sampleCount: samples.length,
		unknownDistanceThreshold,
		predict: (landmarks: Landmark[]) => {
			if (samples.length === 0) {
				return null;
			}

			const query = toFeatureVector(landmarks);
			if (!query) {
				return null;
			}

			const flippedQuery = toFlippedFeatureVector(landmarks);
			if (!flippedQuery) {
				return null;
			}

			const nearest = twoStageKNN(
				query,
				flippedQuery,
				samples,
				topNByMaxDistance,
				topNByMeanDistance,
			);

			// nearest[0] distance here is a mean weighted diff (not Euclidean),
			// so compare directly against the threshold which was computed the same way.
			const nearestDistance = Math.sqrt(nearest[0]?.distanceSquared ?? Number.POSITIVE_INFINITY);
			if (!Number.isFinite(nearestDistance) || nearestDistance > unknownDistanceThreshold) {
				return {
					label: "unknown",
					confidence: 0,
					distance: nearestDistance,
				};
			}

			// Majority vote with tie-breaking by best distance, matching Python's
			// {class_name: n_samples} result dictionary approach.
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
				confidence: bestCount / topNByMeanDistance,
				distance: Math.sqrt(bestDistanceSquared),
			};
		},
	};
}