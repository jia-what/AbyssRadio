import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { Track } from '../../types';
import type { LyricLine } from '../../utils/parseLRC';

interface Props {
  track: Track | null;
  trackLyrics: string[];
  lyricIndex: number;
  lyricLines: LyricLine[];
  translationLines: LyricLine[];
  lyricMode: 'off' | 'original' | 'dual';
  onLyricModeChange: (m: 'off' | 'original' | 'dual') => void;
  currentTime: number;
  realDuration: number;
  duration: number;
  isPlaying: boolean;
}

export default function LyricLight({
  track, trackLyrics, lyricIndex, lyricLines, translationLines, lyricMode, onLyricModeChange,
  currentTime, realDuration, duration, isPlaying,
}: Props) {
  const displayDur = realDuration || duration || 1;
  const hasLyrics = lyricMode !== 'off' && trackLyrics.length > 0 && lyricIndex >= 0;
  const activeLine = hasLyrics ? trackLyrics[lyricIndex] : '';
  // Translation matched by TIME (defect 7): tlyric lines rarely align by index —
  // find the translation whose timestamp is closest to the active lyric line.
  let activeTranslation = '';
  if (lyricMode === 'dual' && lyricIndex >= 0 && lyricLines[lyricIndex]) {
    const t0 = lyricLines[lyricIndex].time;
    let best = '';
    let bestDist = Infinity;
    for (const tl of translationLines) {
      const d = Math.abs(tl.time - t0);
      if (d < bestDist) {
        bestDist = d;
        best = tl.text;
      }
    }
    if (bestDist < 1.5) activeTranslation = best;
  }
  const hasAnyTranslation = translationLines.length > 0;

  // ===== Smooth clock: interpolate between throttled currentTime updates with rAF =====
  const [smoothTime, setSmoothTime] = useState(currentTime);
  const baseRef = useRef({ t: currentTime, at: performance.now() });
  const rafRef = useRef(0);

  useEffect(() => {
    baseRef.current = { t: currentTime, at: performance.now() };
    if (!isPlaying) setSmoothTime(currentTime);
  }, [currentTime, isPlaying]);

  useEffect(() => {
    if (!isPlaying) return;
    const loop = () => {
      const elapsed = (performance.now() - baseRef.current.at) / 1000;
      setSmoothTime(baseRef.current.t + elapsed);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  // ===== Highlight progress — KRC word timings when available, else estimate =====
  const line = lyricLines[lyricIndex];
  const lineStart = line?.time ?? 0;
  const lineEnd = lyricLines[lyricIndex + 1]?.time ?? displayDur;
  const words = line?.words;

  let charProgress = 0;
  let wordProgress = 0;
  if (words && words.length > 0) {
    // KRC: precise word timings drive the karaoke fill
    let filled = 0;
    let total = 0;
    for (const w of words) {
      const wStart = w.start;
      const wEnd = w.start + w.duration;
      total += w.text.length;
      if (smoothTime >= wEnd) filled += w.text.length;
      else if (smoothTime > wStart) {
        const f = (smoothTime - wStart) / Math.max(0.05, wEnd - wStart);
        filled += w.text.length * Math.min(1, Math.max(0, f));
      }
    }
    wordProgress = total > 0 ? filled / total : 0;
    charProgress = wordProgress;
  } else {
    // LRC fallback: estimate singing pace (unchanged behaviour)
    const rawGap = Math.max(lineEnd - lineStart, 0.1);
    const cjk = (activeLine.match(/[\u3400-\u9fff\uac00-\ud7a3\u3040-\u30ff]/g) || []).length;
    const wordsN = (activeLine.replace(/[\u3400-\u9fff\uac00-\ud7a3\u3040-\u30ff]/g, ' ').trim().match(/\S+/g) || []).length;
    const estSing = cjk * 0.3 + wordsN * 0.34 + 0.6;
    const lineDuration = Math.min(rawGap, Math.max(estSing, 0.6));
    charProgress = Math.min(1, Math.max(0, (smoothTime - lineStart) / lineDuration));
  }

  // 3-line scrolling window (prev / active / next), identified by real index
  const windowLines: { idx: number; dist: number }[] = [];
  if (hasLyrics) {
    for (let d = -1; d <= 1; d++) {
      const idx = lyricIndex + d;
      if (idx >= 0 && idx < trackLyrics.length) windowLines.push({ idx, dist: d });
    }
  }

  return (
    <div className="text-center w-full">
      {lyricMode === 'off' ? (
        <div className="text-[clamp(20px,3.5vw,40px)] font-bold text-white/25 tracking-tight">
          {track?.title ?? '— — —'}
        </div>
      ) : hasLyrics ? (
        <div className="flex flex-col items-center justify-center gap-5">
          <AnimatePresence mode="popLayout" initial={false}>
            {windowLines.map(({ idx, dist }) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0 }}
                animate={{ opacity: dist === 0 ? 1 : 0.22 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className={
                  dist === 0
                    ? 'text-[clamp(22px,4.4vw,46px)] font-bold leading-tight tracking-tight'
                    : 'text-[clamp(13px,1.9vw,20px)] font-medium text-white/70 leading-snug'
                }
                style={dist === 0 ? {
                  textShadow: [
                    '0 1px 0 rgba(255,255,255,0.35)',
                    '0 2px 0 rgba(200,220,255,0.22)',
                    '0 3px 0 rgba(150,190,255,0.14)',
                    '0 0 40px rgba(143,233,255,0.28)',
                    '0 0 80px rgba(96,165,250,0.16)',
                    '0 4px 24px rgba(0,0,0,0.55)',
                  ].join(', '),
                } : undefined}
              >
                {dist === 0 ? (
                  <CharFill
                    text={trackLyrics[idx]}
                    progress={idx === lyricIndex ? charProgress : 0}
                  />
                ) : trackLyrics[idx]}
                {dist === 0 && lyricMode === 'dual' && (
                  <div
                    className={`mt-1 text-[clamp(11px,1.5vw,16px)] font-normal leading-snug tracking-normal ${
                      activeTranslation ? 'text-cyan-200/60' : 'text-white/15'
                    }`}
                    style={{ textShadow: '0 0 24px rgba(96,165,250,0.18)' }}
                  >
                    {activeTranslation || (hasAnyTranslation ? '' : '暂无翻译')}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-2"
        >
          <div
            className="text-[clamp(20px,3.5vw,40px)] font-bold text-white/50 tracking-tight"
            style={{ textShadow: '0 0 40px rgba(96,165,250,0.08)' }}
          >
            {track?.title ?? '— — —'}
          </div>
          <div className="text-[clamp(12px,1.8vw,18px)] text-white/25 font-light tracking-wide">
            {track?.artist ?? ''}
          </div>
        </motion.div>
      )}

      {/* Lyric mode toggle lives in BottomBar (defect 7 — no floating buttons) */}
    </div>
  );
}

/**
 * Renders the active lyric with a smooth, reading-order fill. Each glyph's
 * brightness is a soft function of the playhead position (a ~1-glyph-wide
 * gradient edge), so the highlight flows word-by-word across wrapped lines
 * instead of wiping the whole block vertically.
 */
function CharFill({ text, progress }: { text: string; progress: number }) {
  const chars = Array.from(text);
  const head = progress * chars.length;
  return (
    <span>
      {chars.map((ch, i) => {
        const b = Math.max(0, Math.min(1, head - i));
        const opacity = 0.32 + 0.63 * b;
        const onEdge = b > 0.04 && b < 0.96;
        return (
          <span
            key={i}
            style={{
              color: `rgba(255,255,255,${opacity})`,
              textShadow: onEdge ? '0 0 18px rgba(150,190,255,0.55)' : undefined,
              whiteSpace: ch === ' ' ? 'pre' : undefined,
            }}
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
}
