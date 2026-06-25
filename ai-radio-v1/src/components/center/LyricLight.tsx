import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { Track } from '../../types';
import type { LyricLine } from '../../utils/parseLRC';

interface Props {
  track: Track | null;
  trackLyrics: string[];
  lyricIndex: number;
  lyricLines: LyricLine[];
  currentTime: number;
  realDuration: number;
  duration: number;
  isPlaying: boolean;
}

export default function LyricLight({
  track, trackLyrics, lyricIndex, lyricLines, currentTime, realDuration, duration, isPlaying,
}: Props) {
  const displayDur = realDuration || duration || 1;
  const hasLyrics = trackLyrics.length > 0 && lyricIndex >= 0;
  const activeLine = hasLyrics ? trackLyrics[lyricIndex] : '';

  // ===== Smooth clock: interpolate between throttled currentTime updates with rAF =====
  const [smoothTime, setSmoothTime] = useState(currentTime);
  const baseRef = useRef({ t: currentTime, at: performance.now() });
  const rafRef = useRef(0);

  useEffect(() => {
    baseRef.current = { t: currentTime, at: performance.now() };
    setSmoothTime(currentTime);
  }, [currentTime]);

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

  // ===== Highlight progress — track the singer, not the interlude =====
  const lineStart = lyricLines[lyricIndex]?.time ?? 0;
  const lineEnd = lyricLines[lyricIndex + 1]?.time ?? displayDur;
  const rawGap = Math.max(lineEnd - lineStart, 0.1);
  // LRC only carries line-level timestamps. When a long interlude follows a
  // line, cap the wipe to a realistic singing pace so it finishes ~when the
  // singer does, then holds full during the instrumental gap.
  const cjk = (activeLine.match(/[\u3400-\u9fff\uac00-\ud7a3\u3040-\u30ff]/g) || []).length;
  const words = (activeLine.replace(/[\u3400-\u9fff\uac00-\ud7a3\u3040-\u30ff]/g, ' ').trim().match(/\S+/g) || []).length;
  const estSing = cjk * 0.3 + words * 0.34 + 0.6;
  const lineDuration = Math.min(rawGap, Math.max(estSing, 0.6));
  const charProgress = Math.min(1, Math.max(0, (smoothTime - lineStart) / lineDuration));

  // 3-line scrolling window (prev / active / next), identified by real index
  const windowLines: { idx: number; dist: number }[] = [];
  if (hasLyrics) {
    for (let d = -1; d <= 1; d++) {
      const idx = lyricIndex + d;
      if (idx >= 0 && idx < trackLyrics.length) windowLines.push({ idx, dist: d });
    }
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]">
      <div className="text-center max-w-4xl px-8 md:px-16 w-full">
        {hasLyrics ? (
          <div className="flex flex-col items-center justify-center gap-5">
            <AnimatePresence mode="popLayout" initial={false}>
              {windowLines.map(({ idx, dist }) => (
                <motion.div
                  key={idx}
                  layout
                  initial={{ opacity: 0, y: 22 }}
                  animate={{ opacity: dist === 0 ? 1 : 0.22, y: 0 }}
                  exit={{ opacity: 0, y: -22 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className={
                    dist === 0
                      ? 'text-[clamp(22px,4.4vw,46px)] font-bold leading-tight tracking-tight'
                      : 'text-[clamp(13px,1.9vw,20px)] font-medium text-white/70 leading-snug'
                  }
                  style={dist === 0 ? { textShadow: '0 0 50px rgba(96,165,250,0.18), 0 2px 24px rgba(0,0,0,0.6)' } : undefined}
                >
                  {dist === 0 ? <CharFill text={trackLyrics[idx]} progress={charProgress} /> : trackLyrics[idx]}
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
      </div>
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
