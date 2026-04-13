/**
 * One Euro Filter - An adaptive low-pass filter for real-time pose smoothing
 * Reduces jitter while maintaining responsiveness to rapid movements
 * Reference: https://cristal.univ-lille.fr/~casiez/1euro/
 */

interface OneEuroFilterConfig {
	minCutoff: number; // Hz - baseline cutoff frequency
	beta: number; // Derivative smoothing coefficient (0-1)
	dCutoff: number; // Hz - cutoff for derivative
}

class LowPassFilter {
	private cutoff: number;
	private previousValue: number | null = null;
	private previousTimestamp: number | null = null;

	constructor(cutoff: number) {
		this.cutoff = cutoff;
	}

	filter(value: number, timestamp: number): number {
		const alpha = this.computeAlpha(timestamp);

		if (this.previousValue === null) {
			this.previousValue = value;
			this.previousTimestamp = timestamp;
			return value;
		}

		const filtered = alpha * value + (1 - alpha) * this.previousValue;
		this.previousValue = filtered;
		this.previousTimestamp = timestamp;
		return filtered;
	}

	private computeAlpha(timestamp: number): number {
		if (this.previousTimestamp === null) {
			return 1;
		}

		const dt = (timestamp - this.previousTimestamp) / 1000; // Convert to seconds
		const te = 1 / this.cutoff;
		return 1 / (1 + te / dt);
	}

	setCutoff(cutoff: number) {
		this.cutoff = cutoff;
	}

	reset() {
		this.previousValue = null;
		this.previousTimestamp = null;
	}
}

export class OneEuroFilter {
	private xFilter: LowPassFilter;
	private yFilter: LowPassFilter;
	private zFilter: LowPassFilter;
	private dxFilter: LowPassFilter;
	private dyFilter: LowPassFilter;
	private dzFilter: LowPassFilter;
	private config: OneEuroFilterConfig;
	private previousX: number | null = null;
	private previousY: number | null = null;
	private previousZ: number | null = null;
	private previousTimestamp: number | null = null;

	constructor(config: OneEuroFilterConfig) {
		this.config = config;
		this.xFilter = new LowPassFilter(config.minCutoff);
		this.yFilter = new LowPassFilter(config.minCutoff);
		this.zFilter = new LowPassFilter(config.minCutoff);
		this.dxFilter = new LowPassFilter(config.dCutoff);
		this.dyFilter = new LowPassFilter(config.dCutoff);
		this.dzFilter = new LowPassFilter(config.dCutoff);
	}

	filter(
		x: number,
		y: number,
		z: number,
		timestamp: number,
	): { x: number; y: number; z: number } {
		// Calculate derivatives (velocity)
		let dx = 0,
			dy = 0,
			dz = 0;

		if (this.previousTimestamp !== null) {
			const dt = (timestamp - this.previousTimestamp) / 1000; // seconds
			if (dt > 0) {
				dx = (x - this.previousX!) / dt;
				dy = (y - this.previousY!) / dt;
				dz = (z - this.previousZ!) / dt;
			}
		}

		// Smooth the derivatives
		const smoothedDx = this.dxFilter.filter(dx, timestamp);
		const smoothedDy = this.dyFilter.filter(dy, timestamp);
		const smoothedDz = this.dzFilter.filter(dz, timestamp);

		// Compute adaptive cutoff based on derivative magnitude (velocity)
		const speed = Math.sqrt(smoothedDx ** 2 + smoothedDy ** 2 + smoothedDz ** 2);
		const cutoff = this.config.minCutoff + this.config.beta * speed;

		// Apply low-pass filters with adaptive cutoff
		this.xFilter.setCutoff(cutoff);
		this.yFilter.setCutoff(cutoff);
		this.zFilter.setCutoff(cutoff);

		const filteredX = this.xFilter.filter(x, timestamp);
		const filteredY = this.yFilter.filter(y, timestamp);
		const filteredZ = this.zFilter.filter(z, timestamp);

		this.previousX = x;
		this.previousY = y;
		this.previousZ = z;
		this.previousTimestamp = timestamp;

		return { x: filteredX, y: filteredY, z: filteredZ };
	}

	reset() {
		this.xFilter.reset();
		this.yFilter.reset();
		this.zFilter.reset();
		this.dxFilter.reset();
		this.dyFilter.reset();
		this.dzFilter.reset();
		this.previousX = null;
		this.previousY = null;
		this.previousZ = null;
		this.previousTimestamp = null;
	}
}

export function createOneEuroFilters(
	landmarkCount: number,
	config: OneEuroFilterConfig = {
		minCutoff: 1.0,
		beta: 0.1,
		dCutoff: 1.0,
	},
): OneEuroFilter[] {
	return Array.from({ length: landmarkCount }, () => new OneEuroFilter(config));
}
