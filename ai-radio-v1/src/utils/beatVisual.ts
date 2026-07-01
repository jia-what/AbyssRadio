/**
 * Map raw kick strength → visual pulse bump, normalized per-song (not per-track title).
 * Tracks recent hit levels so quiet songs and loud songs both get light/heavy contrast.
 */

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/** Smoothstep 0..1 */
function smooth01(t: number) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

export function createBeatVisualMapper() {
  let hitAvg = 0.34;
  let hitPeak = 0.5;
  let lastWeight = 0;

  return {
    reset() {
      hitAvg = 0.34;
      hitPeak = 0.5;
      lastWeight = 0;
    },

    /** Relative 0..1 weight of the latest hit within this song's recent range. */
    get lastWeight() {
      return lastWeight;
    },

    /**
     * Convert engine strength (0..1) to visual beatPulse bump (≈0.14..0.82).
     * Adapts floor/ceiling from recent hits — works for sparse ballads and dense EDM alike.
     */
    mapHit(strength: number, dt: number): number {
      const s = clamp01(strength);
      hitAvg += (s - hitAvg) * 0.2;
      hitPeak = Math.max(hitPeak * Math.pow(0.993, dt * 60), s, hitAvg * 1.08, 0.26);

      const floor = Math.max(0.16, hitAvg * 0.68);
      const span = Math.max(0.1, hitPeak - floor);
      const rel = clamp01((s - floor) / span);
      lastWeight = rel;

      // Gentle toe + open top: weak kicks stay visible, strong kicks punch harder.
      const curved = Math.pow(smooth01(rel), 0.82);
      return 0.14 + curved * 0.68;
    },

    /** Soft fallback for weak live onsets (no full hit) — scaled by current song baseline. */
    mapSoftOnset(bassOnset: number, rb: number): number {
      if (bassOnset < 0.04 || rb < 0.24) return 0;
      const rel = clamp01((rb - 0.22) / Math.max(0.18, hitPeak - hitAvg * 0.5));
      return Math.min(0.16, bassOnset * 0.12 * (0.35 + rel * 0.65));
    },

    tick(dt: number) {
      hitPeak = Math.max(hitAvg * 1.06, hitPeak * Math.pow(0.997, dt * 60));
      hitAvg += (0.34 - hitAvg) * 0.002 * dt * 60;
      lastWeight *= Math.pow(0.92, dt * 60);
    },
  };
}

/** Scale factor for UI/shader from smooth beatPulse envelope. */
export function beatPulseToScale(beatPulse: number): number {
  return 1 + beatPulse * 0.024;
}

export function beatPulseToGlow(beatPulse: number): number {
  return beatPulse * 1.28;
}
