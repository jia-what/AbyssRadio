/**
 * Offline BeatMap pre-analysis — Mineradio-inspired, rewritten from scratch.
 *
 * Flow: fetch full audio → decode (OfflineAudioContext) → isolate the low-drum
 * band (38–155 Hz) → 10ms frame RMS energy → onset (positive energy delta) →
 * adaptive percentile threshold → peak detection → precise kick timestamps.
 *
 * The kick list is played back via a cursor in the pulse loop, so visuals fire
 * exactly on the drums instead of approximating from live spectrum (which lags
 * and blurs). Falls back gracefully when analysis is unavailable.
 */

export interface KickEvent {
  /** seconds from track start */
  time: number;
  /** 0..1 relative strength within this track's dynamic range */
  strength: number;
}

export interface BeatMap {
  songKey: string;
  kicks: KickEvent[];
  duration: number;
  analyzedAt: number;
}

const MEM_CACHE = new Map<string, BeatMap>();
const STORE_KEY = 'abyss-beatmap-v1';
const STORE_MAX_ENTRIES = 24;

function percentile(sorted: Float32Array | number[], p: number): number {
  if (!sorted.length) return 0.001;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx] || 0.001;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function readDiskCache(): Record<string, { kicks: KickEvent[]; duration: number; analyzedAt: number }> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeDiskCache(songKey: string, map: BeatMap) {
  try {
    const all = readDiskCache();
    all[songKey] = { kicks: map.kicks, duration: map.duration, analyzedAt: map.analyzedAt };
    const keys = Object.keys(all);
    if (keys.length > STORE_MAX_ENTRIES) {
      // Drop oldest by analyzedAt
      const sorted = keys.sort((a, b) => (all[b].analyzedAt || 0) - (all[a].analyzedAt || 0));
      for (const k of sorted.slice(STORE_MAX_ENTRIES)) delete all[k];
    }
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    // storage full / unavailable — memory cache still works
  }
}

function loadDiskCache(songKey: string): BeatMap | null {
  const all = readDiskCache();
  const entry = all[songKey];
  if (!entry || !Array.isArray(entry.kicks) || !entry.kicks.length) return null;
  return { songKey, kicks: entry.kicks, duration: entry.duration || 0, analyzedAt: entry.analyzedAt || 0 };
}

export function getCachedBeatMap(songKey: string): BeatMap | null {
  return MEM_CACHE.get(songKey) ?? loadDiskCache(songKey);
}

interface WindowWithWebkit {
  OfflineAudioContext?: typeof OfflineAudioContext;
  webkitOfflineAudioContext?: typeof OfflineAudioContext;
  webkitAudioContext?: typeof AudioContext;
}

/**
 * Analyze a full track's low-drum band and extract precise kick times.
 * Returns null if the audio cannot be fetched/decoded (caller falls back to live).
 * @param audioUrl full playable URL (proxied through backend /api/audio)
 * @param songKey stable track identity for caching
 */
export async function analyzeBeatMap(audioUrl: string, songKey: string): Promise<BeatMap | null> {
  const cached = getCachedBeatMap(songKey);
  if (cached) return cached;

  const W = window as WindowWithWebkit;
  const OfflineCtx = W.OfflineAudioContext || W.webkitOfflineAudioContext;
  if (!OfflineCtx) return null;

  let ab: ArrayBuffer;
  try {
    const resp = await fetch(audioUrl, { headers: { Range: 'bytes=0-' } });
    if (!resp.ok && resp.status !== 206) return null;
    ab = await resp.arrayBuffer();
  } catch {
    return null;
  }

  // Decode with a throwaway AudioContext (OfflineAudioContext can't decode directly in all engines)
  let buffer: AudioBuffer;
  try {
    const DecodeCtx = window.AudioContext || (window as WindowWithWebkit).webkitAudioContext;
    if (!DecodeCtx) return null;
    const dc = new DecodeCtx();
    buffer = await new Promise<AudioBuffer>((resolve, reject) => {
      dc.decodeAudioData(ab.slice(0), resolve, reject);
    });
    await dc.close();
  } catch {
    return null;
  }

  // Isolate low drum band 38–155 Hz via OfflineAudioContext band-pass render
  let lowPcm: Float32Array;
  try {
    const sr = buffer.sampleRate;
    const off = new OfflineCtx(1, buffer.length, sr);
    const src = off.createBufferSource();
    src.buffer = buffer;
    const hp = off.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 38;
    hp.Q.value = 0.85;
    const lp = off.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(155, sr * 0.45);
    lp.Q.value = 0.9;
    src.connect(hp);
    hp.connect(lp);
    lp.connect(off.destination);
    src.start(0);
    const rendered = await off.startRendering();
    lowPcm = rendered.getChannelData(0);
  } catch {
    return null;
  }

  // Frame RMS energy with 10ms windows
  const winSize = Math.max(1, Math.floor(buffer.sampleRate * 0.010));
  const frames = Math.floor(lowPcm.length / winSize);
  if (frames < 40) return null;
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    const off = f * winSize;
    for (let i = 0; i < winSize; i++) {
      const v = lowPcm[off + i];
      s += v * v;
    }
    energy[f] = Math.sqrt(s / winSize);
  }

  // Onset = positive energy delta
  const onset = new Float32Array(frames);
  for (let f = 1; f < frames; f++) {
    onset[f] = Math.max(0, energy[f] - energy[f - 1]);
  }

  // Adaptive thresholds from high percentiles
  const energyRef = Math.max(0.0008, percentile(energy, 0.86));
  const onsetRef = Math.max(0.00025, percentile(onset, 0.88));

  // Peak detection: local max within ±1 frame, above thresholds, min 100ms spacing
  const kicks: KickEvent[] = [];
  const minGapFrames = Math.max(1, Math.round(0.10 / 0.010));
  let lastKickFrame = -minGapFrames;
  const onsetCeil = Math.max(onsetRef * 1.8, percentile(onset, 0.97));
  const energyFloor = energyRef * 0.42;

  for (let f = 2; f < frames - 1; f++) {
    if (f - lastKickFrame < minGapFrames) continue;
    if (onset[f] < onsetRef) continue;
    if (energy[f] < energyFloor) continue;
    if (onset[f] < onset[f - 1] || onset[f] <= onset[f + 1]) continue; // local max
    const rel = clamp01((onset[f] - onsetRef) / Math.max(onsetCeil - onsetRef, 1e-6));
    // Combine onset sharpness with energy mass; strong kicks score higher
    const mass = clamp01(energy[f] / Math.max(energyRef * 2.2, 1e-6));
    const strength = clamp01(0.38 + rel * 0.42 + mass * 0.2);
    kicks.push({ time: f * 0.010, strength });
    lastKickFrame = f;
  }

  // ——— Tempo-grid alignment (Mineradio-style) ———
  // Raw detection catches bass-note onsets too (too many, uneven). Find the
  // dominant inter-kick interval (the beat), then snap kicks to that grid and
  // keep only grid-aligned hits — this is what makes the visual beat *musical*.
  if (kicks.length >= 8) {
    const grid = alignKicksToGrid(kicks, buffer.duration);
    kicks.length = 0;
    for (const k of grid) kicks.push(k);
  }

  const map: BeatMap = {
    songKey,
    kicks,
    duration: buffer.duration,
    analyzedAt: Date.now(),
  };
  MEM_CACHE.set(songKey, map);
  writeDiskCache(songKey, map);
  return map;
}

/** Snap raw onsets to the dominant beat grid; returns grid-aligned kicks. */
function alignKicksToGrid(raw: KickEvent[], duration: number): KickEvent[] {
  if (raw.length < 4) return raw;

  // 1) Dominant interval: histogram of inter-kick gaps, 0.40s–1.20s (50–150 BPM).
  //    Narrower than raw onset spacing on purpose: we want the *beat* grid, not
  //    every 16th-note roll — those are merged into their nearest beat cell.
  const GAP_MIN = 0.40;
  const GAP_MAX = 1.2;
  const gaps: number[] = [];
  for (let i = 1; i < raw.length; i++) {
    const g = raw[i].time - raw[i - 1].time;
    if (g >= GAP_MIN && g <= GAP_MAX) gaps.push(g);
  }
  if (gaps.length < 3) return raw;
  const bin = 0.02;
  const hist = new Map<number, number>();
  for (const g of gaps) {
    const key = Math.round(g / bin) * bin;
    hist.set(key, (hist.get(key) || 0) + 1);
  }
  let bestGap = 0.5;
  let bestCount = 0;
  for (const [gap, count] of hist) {
    // Weight slightly toward musical tempos (0.35–0.65s = 92–171 BPM)
    const musicalBoost = gap >= 0.33 && gap <= 0.67 ? 1.25 : 1;
    if (count * musicalBoost > bestCount) {
      bestCount = count * musicalBoost;
      bestGap = gap;
    }
  }
  if (bestGap < GAP_MIN || bestGap > GAP_MAX) return raw;

  // 2) Grid origin: pick the raw kick with the most grid neighbors
  const gridStep = bestGap;
  const tol = Math.max(0.035, gridStep * 0.08);
  let bestOrigin = raw[0].time;
  let bestOriginScore = -1;
  for (const cand of raw) {
    let score = 0;
    for (const k of raw) {
      const d = Math.abs((k.time - cand.time) % gridStep);
      if (d < tol || gridStep - d < tol) score += k.strength;
    }
    if (score > bestOriginScore) {
      bestOriginScore = score;
      bestOrigin = cand.time;
    }
  }

  // 3) Snap: bucket kicks into grid cells, keep strongest per cell
  const buckets = new Map<number, KickEvent>();
  for (const k of raw) {
    let cell = Math.round((k.time - bestOrigin) / gridStep);
    let cellTime = bestOrigin + cell * gridStep;
    // allow half-beat tolerance when the kick is stronger than the beat
    const d = Math.abs(k.time - cellTime);
    if (d > tol * 1.6) {
      // try neighbor cells too
      for (const c of [cell - 1, cell + 1]) {
        const t2 = bestOrigin + c * gridStep;
        if (Math.abs(k.time - t2) < tol * 1.6 && Math.abs(k.time - t2) < d) {
          cell = c;
          cellTime = t2;
        }
      }
    }
    if (Math.abs(k.time - cellTime) > tol * 2.4) continue; // off-grid noise
    const existing = buckets.get(cell);
    if (!existing || k.strength > existing.strength) {
      buckets.set(cell, { time: Math.max(0, cellTime), strength: k.strength });
    }
  }

  const out = Array.from(buckets.values()).sort((a, b) => a.time - b.time);
  // Keep only cells that actually had a hit (cellTime may land slightly off); ensure monotonic
  return out.filter((k, i) => i === 0 || k.time > out[i - 1].time + 0.12);
}
