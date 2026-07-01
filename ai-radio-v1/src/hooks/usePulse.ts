import { useEffect, useRef, type RefObject } from 'react';
import { createBeatEngine } from '../utils/beatEngine';
import { createBeatVisualMapper } from '../utils/beatVisual';

export interface PulseBands {
  bass: number;
  mid: number;
  treble: number;
  beat: number;
  energy: number;
  beatOnset: boolean;
  /** 0..1 relative weight of current kick within this song's recent range */
  beatWeight: number;
}

export const IDLE_BANDS: PulseBands = {
  bass: 0,
  mid: 0,
  treble: 0,
  beat: 0,
  energy: 0,
  beatOnset: false,
  beatWeight: 0,
};

function env(prev: number, next: number, attack: number, release: number) {
  const k = next > prev ? attack : release;
  return prev + (next - prev) * k;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

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
    beatWeight: beat > 0.32 ? 0.5 : 0,
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
  smoothRef: { current: { bass: number; mid: number; treble: number; energy: number } },
  peakRef: { current: { bass: number; mid: number; treble: number; energy: number } },
) {
  smoothRef.current = { bass: 0, mid: 0, treble: 0, energy: 0 };
  peakRef.current = { bass: 0.03, mid: 0.026, treble: 0.012, energy: 0.03 };
}

/**
 * PULSE analysis — Mineradio-style: main analyser for bands, beat analyser for kick engine,
 * smooth beatPulse envelope drives uBeat / lyric glow (not binary flash).
 */
export function usePulseAnalysis(
  audioRef: RefObject<HTMLAudioElement | null>,
  analyserRef: RefObject<AnalyserNode | null>,
  beatAnalyserRef: RefObject<AnalyserNode | null>,
  isPlaying: boolean,
  isDemoPlayback: boolean,
  publish: (bands: PulseBands) => void,
  publishFrame?: (bands: PulseBands) => void,
) {
  const smoothRef = useRef({ bass: 0, mid: 0, treble: 0, energy: 0 });
  const peakRef = useRef({ bass: 0.03, mid: 0.026, treble: 0.018, energy: 0.03 });
  const smoothBassRef = useRef(0);
  const prevEnergyRef = useRef(0);
  const beatPulseRef = useRef(0);
  const beatEngineRef = useRef(createBeatEngine());
  const visualMapperRef = useRef(createBeatVisualMapper());
  const rafRef = useRef(0);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const timeRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const beatFreqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const beatTimeRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const lastTsRef = useRef(0);
  const lastPublishRef = useRef(0);
  const lastSrcRef = useRef('');
  const bandsRef = useRef<PulseBands>(IDLE_BANDS);
  const publishRef = useRef(publish);
  const publishFrameRef = useRef(publishFrame);
  publishRef.current = publish;
  publishFrameRef.current = publishFrame;

  useEffect(() => {
    const analyser = analyserRef.current;
    const beatAnalyser = beatAnalyserRef.current;
    if (analyser && !freqRef.current) {
      freqRef.current = new Uint8Array(analyser.frequencyBinCount);
      timeRef.current = new Uint8Array(analyser.fftSize);
    }
    if (beatAnalyser && !beatFreqRef.current) {
      beatFreqRef.current = new Uint8Array(beatAnalyser.frequencyBinCount);
      beatTimeRef.current = new Uint8Array(beatAnalyser.fftSize);
    }
  }, [analyserRef, beatAnalyserRef, analyserRef.current, beatAnalyserRef.current]);

  useEffect(() => {
    const tick = (ts: number) => {
      const dt = lastTsRef.current ? Math.min(0.05, (ts - lastTsRef.current) / 1000) : 0.016;
      lastTsRef.current = ts;

      const audio = audioRef.current;
      const analyser = analyserRef.current;
      const beatAnalyser = beatAnalyserRef.current;

      if (analyser && !freqRef.current) {
        freqRef.current = new Uint8Array(analyser.frequencyBinCount);
        timeRef.current = new Uint8Array(analyser.fftSize);
      }
      if (beatAnalyser && !beatFreqRef.current) {
        beatFreqRef.current = new Uint8Array(beatAnalyser.frequencyBinCount);
        beatTimeRef.current = new Uint8Array(beatAnalyser.fftSize);
      }

      const src = audio?.src ?? '';
      if (src && src !== lastSrcRef.current) {
        lastSrcRef.current = src;
        resetDynamics(smoothRef, peakRef);
        smoothBassRef.current = 0;
        prevEnergyRef.current = 0;
        beatPulseRef.current = 0;
        beatEngineRef.current.reset(audio?.currentTime ?? 0);
        visualMapperRef.current.reset();
      }

      const freq = freqRef.current;
      const time = timeRef.current;
      const beatFreq = beatFreqRef.current;
      const beatTime = beatTimeRef.current;
      const realPlaying = isRealAudioPlaying(audio, isPlaying) && !isDemoPlayback;

      if (realPlaying && analyser && beatAnalyser && freq && time && beatFreq && beatTime && audio) {
        analyser.getByteFrequencyData(freq);
        analyser.getByteTimeDomainData(time);
        beatAnalyser.getByteFrequencyData(beatFreq);
        beatAnalyser.getByteTimeDomainData(beatTime);

        const len = freq.length;
        const kickEnd = Math.max(1, Math.min(len, 7));
        const vocalEnd = Math.max(kickEnd + 1, Math.min(len, 140));
        const midEnd = Math.max(vocalEnd + 1, Math.min(len, 280));

        let bKick = 0;
        let voc = 0;
        let mInst = 0;
        let tHigh = 0;
        for (let i = 0; i < kickEnd; i++) bKick += freq[i] / 255;
        for (let i = kickEnd; i < vocalEnd; i++) voc += freq[i] / 255;
        for (let i = vocalEnd; i < midEnd; i++) mInst += freq[i] / 255;
        for (let i = midEnd; i < len; i++) tHigh += freq[i] / 255;
        bKick /= kickEnd;
        voc /= vocalEnd - kickEnd;
        mInst /= Math.max(1, midEnd - vocalEnd);
        tHigh /= Math.max(1, len - midEnd);

        let rms = 0;
        for (let j = 0; j < time.length; j++) {
          const tv = (time[j] - 128) / 128;
          rms += tv * tv;
        }
        rms = Math.sqrt(rms / time.length);

        const peaks = peakRef.current;
        peaks.bass = Math.max(peaks.bass * 0.994, bKick, 0.03);
        peaks.mid = Math.max(peaks.mid * 0.993, mInst, 0.026);
        peaks.treble = Math.max(peaks.treble * 0.992, tHigh, 0.018);
        peaks.energy = Math.max(peaks.energy * 0.995, rms, 0.03);

        const rb = clamp01(Math.pow(bKick / Math.max(0.038, peaks.bass * 0.66), 0.78));
        const rm = clamp01(Math.pow(mInst / Math.max(0.025, peaks.mid * 0.7), 0.86));
        const rt = clamp01(Math.pow(tHigh / Math.max(0.02, peaks.treble * 0.74), 0.92));
        const re = clamp01(Math.pow(rms / Math.max(0.034, peaks.energy * 0.68), 0.82));

        const bassOnset = Math.max(0, rb - smoothBassRef.current);
        const energyOnset = Math.max(0, re - prevEnergyRef.current);
        prevEnergyRef.current = prevEnergyRef.current * 0.88 + re * 0.12;

        const audioTime = audio.currentTime || 0;
        const sr = beatAnalyser.context.sampleRate;
        const realtimeBeat = beatEngineRef.current.process(
          beatFreq,
          beatTime,
          sr,
          beatAnalyser.fftSize,
          audioTime,
          dt,
        );

        let beatPulse = beatPulseRef.current;
        let beatOnset = false;
        const mapper = visualMapperRef.current;

        if (realtimeBeat.hit) {
          const rtPulse = mapper.mapHit(realtimeBeat.strength, dt);
          if (rtPulse > beatPulse + 0.07) beatOnset = true;
          beatPulse = Math.max(beatPulse, rtPulse);
        } else {
          const soft = mapper.mapSoftOnset(bassOnset, rb);
          if (soft > 0.01) beatPulse = Math.max(beatPulse, soft);
        }
        mapper.tick(dt);

        beatPulse *= Math.pow(0.36, dt);
        beatPulseRef.current = beatPulse;

        smoothBassRef.current = env(smoothBassRef.current, Math.min(0.82, rb * 0.78 + re * 0.025), 0.28, 0.075);
        const s = smoothRef.current;
        s.bass = smoothBassRef.current;
        s.mid = env(s.mid, Math.min(0.68, rm * 0.64 + re * 0.025), 0.18, 0.06);
        s.treble = env(s.treble, Math.min(0.56, rt * 0.54), 0.18, 0.055);
        s.energy = env(s.energy, Math.min(0.72, re), 0.16, 0.055);

        const bassOut = Math.min(0.9, s.bass * 1.05 + beatPulse * 0.18);
        const energyOut = Math.max(s.energy, beatPulse * 0.3);

        bandsRef.current = {
          bass: clamp01(bassOut),
          mid: clamp01(s.mid),
          treble: clamp01(s.treble),
          beat: beatPulse,
          energy: clamp01(energyOut),
          beatOnset,
          beatWeight: mapper.lastWeight,
        };
      } else if (isPlaying && isDemoPlayback) {
        bandsRef.current = simulatedBands(ts);
        beatPulseRef.current = bandsRef.current.beat;
      } else {
        const s = smoothRef.current;
        s.bass *= 0.91;
        s.mid *= 0.91;
        s.treble *= 0.91;
        s.energy *= 0.91;
        beatPulseRef.current *= 0.82;
        bandsRef.current = {
          bass: s.bass,
          mid: s.mid,
          treble: s.treble,
          beat: beatPulseRef.current,
          energy: s.energy,
          beatOnset: false,
          beatWeight: 0,
        };
      }

      if (ts - lastPublishRef.current > 80) {
        lastPublishRef.current = ts;
        publishRef.current({ ...bandsRef.current });
      }
      publishFrameRef.current?.({ ...bandsRef.current });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [audioRef, analyserRef, beatAnalyserRef, isPlaying, isDemoPlayback]);
}
