import { useEffect, useRef, type RefObject } from 'react';

export interface PulseBands {
  bass: number;
  mid: number;
  treble: number;
  beat: number;
  energy: number;
  beatOnset: boolean;
}

export const IDLE_BANDS: PulseBands = {
  bass: 0,
  mid: 0,
  treble: 0,
  beat: 0,
  energy: 0,
  beatOnset: false,
};

function env(prev: number, next: number, attack: number, release: number) {
  const k = next > prev ? attack : release;
  return prev + (next - prev) * k;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/** Demo playlist only — fixed breathing, not tied to music. */
function simulatedBands(ts: number): PulseBands {
  const t = ts / 1000;
  const bass = 0.35 + Math.sin(t * 2.1) * 0.22 + Math.sin(t * 0.7) * 0.1;
  const mid = 0.28 + Math.sin(t * 3.3 + 1.2) * 0.18;
  const treble = 0.22 + Math.sin(t * 5.1 + 2.4) * 0.12;
  const beat = Math.sin(t * 2.1) > 0.85 ? 0.45 : 0.06;
  return {
    bass: clamp01(bass),
    mid: clamp01(mid),
    treble: clamp01(treble),
    beat,
    energy: clamp01(bass * 0.5 + mid * 0.3 + treble * 0.2),
    beatOnset: beat > 0.32,
  };
}

function isRealAudioPlaying(audio: HTMLAudioElement | null, isPlaying: boolean) {
  return !!(
    isPlaying &&
    audio?.src &&
    !audio.paused &&
    !audio.error &&
    audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  );
}

function resetDynamics(
  smoothRef: { current: { bass: number; mid: number; treble: number; energy: number; beat: number } },
  peakRef: { current: { bass: number; mid: number; treble: number; energy: number } },
) {
  smoothRef.current = { bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 };
  peakRef.current = { bass: 0.03, mid: 0.026, treble: 0.012, energy: 0.03 };
}

/** Map Hz → FFT bin for the current analyser (Mineradio bins assume fftSize≈2048; we use 512). */
function bandRanges(sampleRate: number, fftSize: number, binCount: number) {
  const toBin = (hz: number) => Math.min(binCount, Math.max(0, Math.round((hz * fftSize) / sampleRate)));
  const bassEnd = toBin(250);       // kick / sub-bass … 250 Hz
  const midEnd = toBin(4000);       // vocals, snare, guitars … 4 kHz
  return {
    bassEnd: Math.max(bassEnd, 1),
    midStart: Math.max(bassEnd, 1),
    midEnd: Math.max(midEnd, bassEnd + 1),
    trebleStart: Math.max(midEnd, bassEnd + 1),
  };
}

function avgBand(freq: Uint8Array, start: number, end: number) {
  const lo = Math.max(0, start);
  const hi = Math.min(freq.length, end);
  if (hi <= lo) return 0;
  let sum = 0;
  for (let i = lo; i < hi; i++) sum += freq[i] / 255;
  return sum / (hi - lo);
}

/**
 * Read FFT from the analyser wired in useRadioState (createMediaElementSource).
 */
export function usePulseAnalysis(
  audioRef: RefObject<HTMLAudioElement | null>,
  analyserRef: RefObject<AnalyserNode | null>,
  isPlaying: boolean,
  isDemoPlayback: boolean,
  publish: (bands: PulseBands) => void,
) {
  const smoothRef = useRef({ bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 });
  const peakRef = useRef({ bass: 0.03, mid: 0.026, treble: 0.018, energy: 0.03 });
  const prevEnergyRef = useRef(0);
  const prevBassRef = useRef(0);
  const rafRef = useRef(0);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const timeRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const lastTsRef = useRef(0);
  const lastPublishRef = useRef(0);
  const lastSrcRef = useRef('');
  const bandsRef = useRef<PulseBands>(IDLE_BANDS);
  const publishRef = useRef(publish);
  publishRef.current = publish;

  useEffect(() => {
    const analyser = analyserRef.current;
    if (analyser && !freqRef.current) {
      freqRef.current = new Uint8Array(analyser.frequencyBinCount);
      timeRef.current = new Uint8Array(analyser.fftSize);
    }
  }, [analyserRef, analyserRef.current]);

  useEffect(() => {
    const tick = (ts: number) => {
      const dt = lastTsRef.current ? Math.min(0.05, (ts - lastTsRef.current) / 1000) : 0.016;
      lastTsRef.current = ts;

      const audio = audioRef.current;
      const analyser = analyserRef.current;

      if (analyser && !freqRef.current) {
        freqRef.current = new Uint8Array(analyser.frequencyBinCount);
        timeRef.current = new Uint8Array(analyser.fftSize);
      }

      const src = audio?.src ?? '';
      if (src && src !== lastSrcRef.current) {
        lastSrcRef.current = src;
        resetDynamics(smoothRef, peakRef);
        prevEnergyRef.current = 0;
        prevBassRef.current = 0;
      }

      const freq = freqRef.current;
      const time = timeRef.current;
      const realPlaying = isRealAudioPlaying(audio, isPlaying) && !isDemoPlayback;

      if (realPlaying && analyser && freq && time) {
        analyser.getByteFrequencyData(freq);
        analyser.getByteTimeDomainData(time);

        const sr = analyser.context.sampleRate;
        const { bassEnd, midStart, midEnd, trebleStart } = bandRanges(sr, analyser.fftSize, freq.length);

        const bKick = avgBand(freq, 0, bassEnd);
        const mInst = avgBand(freq, midStart, midEnd);
        const tHigh = avgBand(freq, trebleStart, freq.length);

        let rms = 0;
        for (let j = 0; j < time.length; j++) {
          const tv = (time[j] - 128) / 128;
          rms += tv * tv;
        }
        rms = Math.sqrt(rms / time.length);

        const peaks = peakRef.current;
        peaks.bass = Math.max(peaks.bass * 0.994, bKick, 0.03);
        peaks.mid = Math.max(peaks.mid * 0.993, mInst, 0.022);
        peaks.treble = Math.max(peaks.treble * 0.992, tHigh, 0.008);
        peaks.energy = Math.max(peaks.energy * 0.995, rms, 0.03);

        const rb = clamp01(Math.pow(bKick / Math.max(0.038, peaks.bass * 0.66), 0.78));
        const rm = clamp01(Math.pow(mInst / Math.max(0.022, peaks.mid * 0.68), 0.86));
        const rt = clamp01(Math.pow(tHigh / Math.max(0.012, peaks.treble * 0.62), 0.88));
        const re = clamp01(Math.pow(rms / Math.max(0.034, peaks.energy * 0.68), 0.82));

        const bassOnset = Math.max(0, rb - prevBassRef.current);
        prevBassRef.current = prevBassRef.current * 0.88 + rb * 0.12;
        const energyOnset = Math.max(0, re - prevEnergyRef.current);
        prevEnergyRef.current = prevEnergyRef.current * 0.88 + re * 0.12;

        const s = smoothRef.current;
        let beatPulse = s.beat;
        if (bassOnset > 0.07 && rb > 0.32 && energyOnset > 0.018) {
          beatPulse = Math.max(beatPulse, Math.min(0.55, bassOnset * 0.65 + rb * 0.2));
        }
        beatPulse *= Math.pow(0.36, dt);

        s.bass = env(s.bass, Math.min(0.82, rb * 0.78 + re * 0.025), 0.28, 0.075);
        s.mid = env(s.mid, Math.min(0.68, rm * 0.64 + re * 0.025), 0.18, 0.06);
        s.treble = env(s.treble, Math.min(0.62, rt * 0.72), 0.2, 0.05);
        s.energy = env(s.energy, Math.min(0.72, re), 0.16, 0.055);
        s.beat = beatPulse;

        bandsRef.current = {
          bass: clamp01(s.bass * 1.05 + beatPulse * 0.18),
          mid: clamp01(s.mid * 1.12),
          treble: clamp01(s.treble * 1.35),
          beat: beatPulse,
          energy: Math.max(s.energy, beatPulse * 0.3),
          beatOnset: beatPulse > 0.12,
        };
      } else if (isPlaying && isDemoPlayback) {
        bandsRef.current = simulatedBands(ts);
      } else {
        const s = smoothRef.current;
        s.bass *= 0.91;
        s.mid *= 0.91;
        s.treble *= 0.91;
        s.energy *= 0.91;
        s.beat *= 0.82;
        bandsRef.current = {
          bass: s.bass,
          mid: s.mid,
          treble: s.treble,
          beat: s.beat,
          energy: s.energy,
          beatOnset: false,
        };
      }

      if (ts - lastPublishRef.current > 80) {
        lastPublishRef.current = ts;
        publishRef.current({ ...bandsRef.current });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [audioRef, analyserRef, isPlaying, isDemoPlayback]);
}
