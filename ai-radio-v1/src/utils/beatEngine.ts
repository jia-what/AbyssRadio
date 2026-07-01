/**
 * Mineradio processRealtimeBeatEngine (dj=false) — real-time kick detection.
 */

const REALTIME_MIN_INTERVAL = 0.46;

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function bandRms(freq: Uint8Array, sampleRate: number, fftSize: number, hz0: number, hz1: number) {
  const binHz = sampleRate / fftSize;
  const a = Math.max(0, Math.floor(hz0 / binHz));
  const b = Math.min(freq.length - 1, Math.ceil(hz1 / binHz));
  if (b < a) return 0;
  let sum = 0;
  for (let i = a; i <= b; i++) {
    const v = freq[i] / 255;
    sum += v * v;
  }
  return Math.sqrt(sum / (b - a + 1));
}

export interface RealtimeBeatResult {
  hit: boolean;
  strength: number;
  score: number;
  low: number;
}

interface RtBeatState {
  subFast: number;
  subSlow: number;
  lowFast: number;
  lowSlow: number;
  bodyFast: number;
  bodySlow: number;
  vocalFast: number;
  vocalSlow: number;
  snapFast: number;
  snapSlow: number;
  prevSub: number;
  prevLow: number;
  prevBody: number;
  prevVocal: number;
  prevSnap: number;
  prevRms: number;
  onsetAvg: number;
  onsetPeak: number;
  subPeak: number;
  lowPeak: number;
  bodyPeak: number;
  vocalPeak: number;
  snapPeak: number;
  lastHitAt: number;
  tempoGap: number;
  tempoConfidence: number;
  beatCount: number;
  primedFrames: number;
  warmupUntil: number;
  pulse: number;
  score: number;
}

function createRtBeatState(): RtBeatState {
  return {
    subFast: 0, subSlow: 0, lowFast: 0, lowSlow: 0,
    bodyFast: 0, bodySlow: 0, vocalFast: 0, vocalSlow: 0, snapFast: 0, snapSlow: 0,
    prevSub: 0, prevLow: 0, prevBody: 0, prevVocal: 0, prevSnap: 0, prevRms: 0,
    onsetAvg: 0.012, onsetPeak: 0.06,
    subPeak: 0.14, lowPeak: 0.18, bodyPeak: 0.16, vocalPeak: 0.16, snapPeak: 0.14,
    lastHitAt: -10,
    tempoGap: 0,
    tempoConfidence: 0,
    beatCount: 0,
    primedFrames: 0,
    warmupUntil: 0,
    pulse: 0,
    score: 0,
  };
}

export function createBeatEngine() {
  const rt = createRtBeatState();

  return {
    reset(audioTime = 0) {
      Object.assign(rt, createRtBeatState());
      rt.warmupUntil = audioTime + 0.55;
    },

    process(
      freq: Uint8Array,
      timeDomain: Uint8Array,
      sampleRate: number,
      fftSize: number,
      audioTime: number,
      dt: number,
    ): RealtimeBeatResult {
      const dj = false;
      dt = Math.max(0.001, Math.min(0.08, dt));

      const sub = bandRms(freq, sampleRate, fftSize, 38, 74);
      const kick = bandRms(freq, sampleRate, fftSize, 52, 165);
      const body = bandRms(freq, sampleRate, fftSize, 165, 420);
      const vocal = bandRms(freq, sampleRate, fftSize, 420, 2600);
      const snap = bandRms(freq, sampleRate, fftSize, 1800, 9200);
      const low = Math.min(1, kick * 0.86 + sub * 0.42);

      let rms = 0;
      for (let i = 0; i < timeDomain.length; i++) {
        const tv = (timeDomain[i] - 128) / 128;
        rms += tv * tv;
      }
      rms = Math.sqrt(rms / timeDomain.length);

      const follow = (cur: number, next: number, upTau: number, downTau: number) => {
        const tau = next > cur ? upTau : downTau;
        return cur + (next - cur) * (1 - Math.exp(-dt / Math.max(0.001, tau)));
      };

      rt.subFast = follow(rt.subFast, sub, 0.018, 0.064);
      rt.subSlow = follow(rt.subSlow, sub, 0.32, 0.52);
      rt.lowFast = follow(rt.lowFast, low, 0.016, 0.07);
      rt.lowSlow = follow(rt.lowSlow, low, 0.3, 0.54);
      rt.bodyFast = follow(rt.bodyFast, body, 0.02, 0.082);
      rt.bodySlow = follow(rt.bodySlow, body, 0.36, 0.6);
      rt.vocalFast = follow(rt.vocalFast, vocal, 0.026, 0.09);
      rt.vocalSlow = follow(rt.vocalSlow, vocal, 0.34, 0.58);
      rt.snapFast = follow(rt.snapFast, snap, 0.012, 0.06);
      rt.snapSlow = follow(rt.snapSlow, snap, 0.3, 0.52);

      rt.subPeak = Math.max(rt.subPeak * Math.pow(0.99, dt * 60), sub, 0.045);
      rt.lowPeak = Math.max(rt.lowPeak * Math.pow(0.989, dt * 60), low, 0.06);
      rt.bodyPeak = Math.max(rt.bodyPeak * Math.pow(0.99, dt * 60), body, 0.04);
      rt.vocalPeak = Math.max(rt.vocalPeak * Math.pow(0.99, dt * 60), vocal, 0.04);
      rt.snapPeak = Math.max(rt.snapPeak * Math.pow(0.99, dt * 60), snap, 0.035);

      const subFlux = Math.max(0, sub - rt.prevSub);
      const lowFlux = Math.max(0, low - rt.prevLow);
      const bodyFlux = Math.max(0, body - rt.prevBody);
      const vocalFlux = Math.max(0, vocal - rt.prevVocal);
      const snapFlux = Math.max(0, snap - rt.prevSnap);
      const rmsFlux = Math.max(0, rms - rt.prevRms);
      const subRise = Math.max(0, rt.subFast - rt.subSlow);
      const lowRise = Math.max(0, rt.lowFast - rt.lowSlow);
      const bodyRise = Math.max(0, rt.bodyFast - rt.bodySlow);
      const vocalRise = Math.max(0, rt.vocalFast - rt.vocalSlow);
      const snapRise = Math.max(0, rt.snapFast - rt.snapSlow);

      const drumOnset = subRise * 0.88 + subFlux * 0.66 + lowRise * 1.62 + lowFlux * 1.34;
      const musicalOnset = bodyRise * 0.34 + bodyFlux * 0.24 + vocalRise * 0.52
        + vocalFlux * 0.36 + snapRise * 0.08 + snapFlux * 0.06 + rmsFlux * 0.2;
      const onset = drumOnset + musicalOnset * 0.16;

      const avgTau = onset > rt.onsetAvg ? 1.1 : 0.34;
      rt.onsetAvg = follow(rt.onsetAvg, onset, avgTau, avgTau);
      rt.onsetPeak = Math.max(rt.onsetPeak * Math.pow(0.988, dt * 60), onset, 0.032);

      const floor = rt.onsetAvg * 0.84;
      const score = clamp01((onset - floor) / Math.max(0.014, rt.onsetPeak - floor));

      const subNorm = clamp01(sub / Math.max(0.045, rt.subPeak * 0.7));
      const lowNorm = clamp01(low / Math.max(0.06, rt.lowPeak * 0.72));
      const bodyNorm = clamp01(body / Math.max(0.045, rt.bodyPeak * 0.72));
      const vocalNorm = clamp01(vocal / Math.max(0.045, rt.vocalPeak * 0.72));

      rt.primedFrames += 1;
      const warmingUp = audioTime < rt.warmupUntil || rt.primedFrames < 18;
      const gapFromLast = audioTime - rt.lastHitAt;
      const expectedGap = rt.tempoGap > 0 ? rt.tempoGap : 0;
      const phaseWindow = expectedGap > 0
        ? Math.max(0.055, Math.min(0.105, expectedGap * 0.16))
        : 0;
      const tempoDue = expectedGap > 0
        && gapFromLast > expectedGap - phaseWindow
        && gapFromLast < expectedGap + phaseWindow;

      const lowPresence = Math.max(lowNorm, subNorm * 0.74);
      const lowAttack = lowRise + lowFlux * 0.72 + subRise * 0.58 + subFlux * 0.4;
      const lowDominance = low / Math.max(0.001, vocal * 0.84 + body * 0.36 + snap * 0.1);
      const lowFluxDominance = (lowFlux + subFlux * 0.58)
        / Math.max(0.001, vocalFlux * 0.72 + bodyFlux * 0.42 + snapFlux * 0.16);

      const voiceMask = vocalNorm > 0.58 && lowDominance < 0.86 && lowFluxDominance < 1.1;
      let drumGate = lowPresence > 0.38
        && lowAttack > Math.max(0.014, rt.onsetAvg * 0.34)
        && !voiceMask;
      drumGate = drumGate && (lowDominance > 0.72 || lowFluxDominance > 1.02 || subNorm > 0.56);

      const strongTransient = drumGate && score > 0.54 && drumOnset > rt.onsetAvg * 0.84;
      const kickTransient = drumGate && score > 0.4 && lowAttack > Math.max(0.018, rt.onsetAvg * 0.46);
      const tempoAssist = tempoDue
        && rt.tempoConfidence > 0.42
        && drumGate
        && lowPresence > 0
        && score > 0.22
        && lowAttack > Math.max(0.016, rt.onsetAvg * 0.34);

      let candidateHit = strongTransient || kickTransient || tempoAssist;
      if (warmingUp) candidateHit = false;

      const hasTempoLock = expectedGap >= 0.42 && expectedGap <= 0.88 && rt.tempoConfidence > 0.38;
      const lockedWindow = hasTempoLock
        ? Math.max(0.07, Math.min(0.11, expectedGap * 0.16))
        : 0;
      const gapRaw = audioTime - rt.lastHitAt;

      let rhythmAccept = false;
      if (candidateHit) {
        if (rt.lastHitAt < 0) {
          rhythmAccept = strongTransient && score > 0.62 && lowPresence > 0.48;
        } else if (hasTempoLock) {
          const oneBeatErr = Math.abs(gapRaw - expectedGap);
          const twoBeatErr = Math.abs(gapRaw - expectedGap * 2);
          rhythmAccept = oneBeatErr <= lockedWindow && (kickTransient || strongTransient);
          rhythmAccept = rhythmAccept || (twoBeatErr <= lockedWindow * 1.35 && strongTransient && score > 0.58);
          rhythmAccept = rhythmAccept || (gapRaw > expectedGap * 1.55 && strongTransient && lowPresence > 0.44);
        } else {
          rhythmAccept = gapRaw >= REALTIME_MIN_INTERVAL
            && strongTransient
            && score > 0.58
            && lowPresence > 0.44;
        }
      }

      let hit = candidateHit && rhythmAccept;
      const minGap = hasTempoLock
        ? Math.max(0.4, Math.min(0.54, expectedGap * 0.72))
        : REALTIME_MIN_INTERVAL;
      if (hit && gapRaw < minGap) hit = false;

      rt.prevSub = sub;
      rt.prevLow = low;
      rt.prevBody = body;
      rt.prevVocal = vocal;
      rt.prevSnap = snap;
      rt.prevRms = rms;
      rt.score = score;
      rt.pulse *= Math.pow(0.18, dt);
      rt.tempoConfidence *= Math.pow(0.996, dt * 60);

      if (!hit) {
        return { hit: false, strength: 0, score, low: lowPresence };
      }

      if (rt.lastHitAt > 0) {
        let gap = audioTime - rt.lastHitAt;
        while (gap > 0.88) gap *= 0.5;
        while (gap < 0.42) gap *= 2;
        if (gap >= 0.42 && gap <= 0.88) {
          const tempoEase = hasTempoLock ? 0.1 : 0.22;
          rt.tempoGap = rt.tempoGap ? rt.tempoGap * (1 - tempoEase) + gap * tempoEase : gap;
          rt.tempoConfidence = Math.min(1, rt.tempoConfidence + (tempoAssist ? 0.04 : 0.18));
        }
      }

      rt.lastHitAt = audioTime;
      rt.beatCount += 1;

      let strength = clamp01(
        0.24 + score * 0.36 + lowPresence * 0.34 + Math.min(1.25, lowDominance) * 0.07 + rmsFlux * 0.95,
      );
      if (tempoAssist) {
        strength = Math.max(strength, 0.48 + rt.tempoConfidence * 0.1 + lowPresence * 0.14);
      }
      rt.pulse = Math.max(rt.pulse, strength);

      return { hit: true, strength, score, low: Math.max(0.05, lowPresence) };
    },
  };
}
