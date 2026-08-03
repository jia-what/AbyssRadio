import { useEffect, useRef, type RefObject } from 'react';
import { coverUrl, isImageUrl } from '../../utils/img';
import {
  DEFAULT_COVER_PALETTE,
  loadCoverPalette,
  paletteToWaveColors,
  type CoverPalette,
  type WaveColors,
} from '../../utils/coverPalette';

const BINS = 180;

interface Props {
  cover: string | null | undefined;
  audioRef: RefObject<HTMLAudioElement | null>;
  analyserRef: RefObject<AnalyserNode | null>;
  isPlaying: boolean;
  isDemoPlayback: boolean;
}

function simulatedSpectrum(t: number, out: Float32Array) {
  for (let i = 0; i < out.length; i++) {
    const x = i / out.length;
    const bass = 0.42 + Math.sin(t * 2.1 + x * 1.2) * 0.28;
    const mid = 0.28 + Math.sin(t * 3.4 + x * 4.5) * 0.22;
    const treble = 0.18 + Math.sin(t * 5.2 + x * 9) * 0.14;
    const mix = bass * (1 - x * 0.55) + mid * 0.45 + treble * (x * 0.65);
    out[i] = Math.max(0, Math.min(1, mix * (0.55 + Math.sin(t * 1.7 + i * 0.11) * 0.2)));
  }
}

function resampleFreq(freq: Uint8Array, out: Float32Array) {
  for (let i = 0; i < out.length; i++) {
    const t = (i / (out.length - 1)) * (freq.length - 1) * 0.92;
    const lo = Math.floor(t);
    const hi = Math.min(freq.length - 1, lo + 1);
    const f = t - lo;
    const v = (freq[lo] * (1 - f) + freq[hi] * f) / 255;
    out[i] = v;
  }
}

function smoothBins(prev: Float32Array, next: Float32Array, attack = 0.38, release = 0.12) {
  for (let i = 0; i < prev.length; i++) {
    const k = next[i] > prev[i] ? attack : release;
    prev[i] += (next[i] - prev[i]) * k;
  }
}

/** Matches BottomBar: progress (20) + gap (10) + pill (~64) + pb-4 (16) ≈ 110 */
const BOTTOM_BAR_TOP_PX = 110;
const WAVE_GAP_ABOVE_BAR_PX = 20;

function waveCenterY(height: number) {
  return height - BOTTOM_BAR_TOP_PX - WAVE_GAP_ABOVE_BAR_PX;
}

function drawWave(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bins: Float32Array,
  colors: WaveColors,
  phase: number,
  energy: number,
) {
  const cy = waveCenterY(height);
  const pts = bins.length;

  ctx.clearRect(0, 0, width, height);

  // Idle / near-flat: stay fully invisible (no baseline stroke).
  let peak = 0;
  for (let i = 0; i < pts; i++) peak = Math.max(peak, bins[i]);
  const activity = Math.max(peak, energy);
  if (activity < 0.025) return;

  const amp = Math.min(56, height * (0.038 + energy * 0.022));
  const visibility = Math.min(1, (activity - 0.025) / 0.12);

  // Gaussian envelope: tallest in the center, tapering to the edges
  const SIGMA = 0.28;
  const mid = (pts - 1) / 2;
  const sigmaN = SIGMA * pts;
  const envelope: number[] = new Array(pts);
  for (let i = 0; i < pts; i++) {
    const d = (i - mid) / sigmaN;
    envelope[i] = Math.exp(-0.5 * d * d);
  }

  // Only paint the lower band — keeps lyrics / cover clear
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, Math.max(0, cy - amp * 2.8), width, height - Math.max(0, cy - amp * 2.8));
  ctx.clip();
  ctx.globalAlpha = visibility;

  const top: number[] = [];
  const bot: number[] = [];
  for (let i = 0; i < pts; i++) {
    const v = bins[i];
    const ripple = Math.sin(i * 0.11 + phase) * 0.16;
    // No floor height — flat bins must sit on cy so nothing reads as a baseline
    const h = amp * Math.max(0, v * 0.88 + ripple * v + energy * 0.08 * v);
    const g = envelope[i];
    top.push(cy - h * g);
    bot.push(cy + h * 0.22 * g);
  }

  const [cr, cg, cb] = colors.core;
  const [gr, gg, gb] = colors.glow;
  const [hr, hg, hb] = colors.hi;

  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < pts; i++) {
    const x = (i / (pts - 1)) * width;
    if (i === 0) ctx.moveTo(x, top[i]);
    else ctx.lineTo(x, top[i]);
  }
  for (let i = pts - 1; i >= 0; i--) {
    const x = (i / (pts - 1)) * width;
    ctx.lineTo(x, bot[i]);
  }
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, cy - amp * 1.6, 0, cy + amp * 0.5);
  fill.addColorStop(0, `rgba(${gr},${gg},${gb},${0.03 + energy * 0.03})`);
  fill.addColorStop(0.5, `rgba(${cr},${cg},${cb},${0.08 + energy * 0.06})`);
  fill.addColorStop(1, `rgba(${gr},${gg},${gb},${0.02})`);
  ctx.fillStyle = fill;
  ctx.filter = 'blur(8px)';
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  for (let i = 0; i < pts; i++) {
    const x = (i / (pts - 1)) * width;
    if (i === 0) ctx.moveTo(x, top[i]);
    else ctx.lineTo(x, top[i]);
  }
  for (let i = pts - 1; i >= 0; i--) {
    const x = (i / (pts - 1)) * width;
    ctx.lineTo(x, bot[i]);
  }
  ctx.closePath();
  const coreFill = ctx.createLinearGradient(0, cy - amp, 0, cy + amp * 0.3);
  coreFill.addColorStop(0, `rgba(${hr},${hg},${hb},${0.12 + energy * 0.08})`);
  coreFill.addColorStop(0.55, `rgba(${cr},${cg},${cb},${0.2 + energy * 0.1})`);
  coreFill.addColorStop(1, `rgba(${gr},${gg},${gb},${0.06})`);
  ctx.fillStyle = coreFill;
  ctx.fill();

  // Soft crest only when there is real motion — never a full-width baseline stroke
  if (activity > 0.06) {
    ctx.beginPath();
    for (let i = 0; i < pts; i++) {
      const x = (i / (pts - 1)) * width;
      if (i === 0) ctx.moveTo(x, top[i]);
      else ctx.lineTo(x, top[i]);
    }
    ctx.strokeStyle = `rgba(${hr},${hg},${hb},${(0.1 + energy * 0.12) * visibility})`;
    ctx.lineWidth = 1.1;
    ctx.shadowColor = `rgba(${cr},${cg},${cb},0.28)`;
    ctx.shadowBlur = 6 + energy * 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

/**
 * Full-width audio ribbon just above the bottom playback bar — FFT-driven,
 * tinted from the playing track cover.
 */
export default function CoverPulseWave({
  cover,
  audioRef,
  analyserRef,
  isPlaying,
  isDemoPlayback,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paletteRef = useRef<CoverPalette>(DEFAULT_COVER_PALETTE);
  const colorsRef = useRef(paletteToWaveColors(DEFAULT_COVER_PALETTE));
  const smoothRef = useRef(new Float32Array(BINS));
  const phaseRef = useRef(0);
  const tokenRef = useRef(0);

  useEffect(() => {
    const raw = cover && isImageUrl(cover) ? coverUrl(cover) : '';
    if (!raw) {
      paletteRef.current = DEFAULT_COVER_PALETTE;
      colorsRef.current = paletteToWaveColors(DEFAULT_COVER_PALETTE);
      return;
    }
    const token = ++tokenRef.current;
    loadCoverPalette(raw).then((p) => {
      if (token !== tokenRef.current) return;
      paletteRef.current = p;
      colorsRef.current = paletteToWaveColors(p);
    });
  }, [cover]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let freq: Uint8Array | null = null;
    const raw = new Float32Array(BINS);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 1 || h < 1) return;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const tick = (ts: number) => {
      resize();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 1 || h < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const analyser = analyserRef.current;
      const audio = audioRef.current;
      const realPlay = !!(
        isPlaying &&
        audio?.src &&
        !audio.paused &&
        !audio.error &&
        audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        !isDemoPlayback &&
        analyser
      );

      let energy = 0;
      if (realPlay && analyser) {
        if (!freq || freq.length !== analyser.frequencyBinCount) {
          freq = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(freq);
        resampleFreq(freq, raw);
        for (let i = 0; i < raw.length; i++) energy += raw[i];
        energy /= raw.length;
      } else if (isPlaying && isDemoPlayback) {
        simulatedSpectrum(ts / 1000, raw);
        for (let i = 0; i < raw.length; i++) energy += raw[i];
        energy /= raw.length;
      } else {
        raw.fill(0);
        energy = 0;
      }

      smoothBins(smoothRef.current, raw, 0.34, isPlaying ? 0.1 : 0.18);
      if (!isPlaying) {
        for (let i = 0; i < smoothRef.current.length; i++) {
          smoothRef.current[i] *= 0.92;
        }
      }

      phaseRef.current += 0.018 + energy * 0.04;
      drawWave(ctx, w, h, smoothRef.current, colorsRef.current, phaseRef.current, energy);

      raf = requestAnimationFrame(tick);
    };

    resize();
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [analyserRef, audioRef, isPlaying, isDemoPlayback]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-[0]"
      aria-hidden
    />
  );
}
