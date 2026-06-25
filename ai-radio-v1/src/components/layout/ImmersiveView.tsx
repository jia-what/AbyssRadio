import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { Track } from '../../types';

interface Props {
  onBackToRadio: () => void;
  onPrev: () => void;
  onNext: () => void;
  progress: number;
  duration: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  trackLyrics: string[];
  lyricIndex: number;
  lyricsEnabled: boolean;
  onToggleLyrics: () => void;
  currentTrack: Track | null;
}

export default function ImmersiveView({
  onBackToRadio, onPrev, onNext, progress, duration, isPlaying, onTogglePlay,
  trackLyrics, lyricIndex, lyricsEnabled, onToggleLyrics, currentTrack,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showHint, setShowHint] = useState(true);
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<1 | -1>(1);
  const swipeStartX = useRef(0);
  const [trackKey, setTrackKey] = useState(0);

  useEffect(() => { if (isPlaying) setShowHint(false); }, [isPlaying]);

  // ===== Waveform =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let time = 0;
    const draw = (ts: number) => {
      if (!ctx || !canvas) return;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (isPlaying) time = ts;
      const barW = (w - 159 * 1.5) / 160;
      for (let i = 0; i < 160; i++) {
        let bh: number;
        if (isPlaying) {
          const amp = Math.sin(time * 0.0015 + i * 0.08) * 0.35
                    + Math.sin(time * 0.004 + i * 0.15) * 0.25
                    + Math.sin(time * 0.008 + i * 0.03) * 0.15;
          bh = Math.max(1, (0.2 + amp * 0.5) * h);
        } else {
          bh = 1;
        }
        ctx.fillStyle = `rgba(150,200,255,${0.04})`;
        ctx.fillRect(i * (barW + 1.5), (h - bh) / 2, barW, bh);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  // ===== Swipe =====
  const handleDown = useCallback((e: React.MouseEvent) => {
    swipeStartX.current = e.clientX;
    setIsSwiping(true);
    setSwipeX(0);
  }, []);

  useEffect(() => {
    if (!isSwiping) return;
    const onMove = (e: MouseEvent) => setSwipeX(e.clientX - swipeStartX.current);
    const onUp = (e: MouseEvent) => {
      const dx = e.clientX - swipeStartX.current;
      setIsSwiping(false);
      setSwipeX(0);
      if (Math.abs(dx) > 50) {
        const dir = dx < 0 ? 1 : -1;
        setSwipeDirection(dir);
        setTrackKey(k => k + 1);
        if (dir === 1) onNext(); else onPrev();
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isSwiping, onNext, onPrev]);

  const activeLyric = trackLyrics[lyricIndex] ?? '';
  const nextLyric = trackLyrics[lyricIndex + 1] ?? '';
  const prevLyric = lyricIndex > 0 ? trackLyrics[lyricIndex - 1] : '';
  const hasLyrics = trackLyrics.length > 0;

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none">
      {/* Vinyl carousel — original size & position */}
      <div
        className="relative z-10 cursor-grab active:cursor-grabbing"
        onMouseDown={handleDown}
        onClick={onTogglePlay}
        style={{ width: 'min(50vw, 500px)', height: 'min(50vw, 500px)' }}
      >
        <AnimatePresence mode="popLayout">
          <motion.div
            key={trackKey}
            initial={{ opacity: 0, x: swipeDirection * 200, scale: 0.85, rotate: swipeDirection * 15 }}
            animate={{
              opacity: 1,
              x: isSwiping ? swipeX : 0,
              scale: isSwiping ? 0.95 : 1,
              rotate: isSwiping ? (swipeX * 0.05) : 0,
              transition: isSwiping ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
            }}
            exit={{ opacity: 0, x: swipeDirection * -250, scale: 0.7, rotate: swipeDirection * -20 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            <div className="absolute inset-0 rounded-full blur-3xl bg-blue-500/5 animate-pulse-soft" />
            <div
              className={`relative w-full h-full rounded-full bg-gradient-to-br from-white/[0.06] via-transparent to-white/[0.02]
                          border border-white/10 flex items-center justify-center shadow-2xl
                          before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-br before:from-white/5 before:via-transparent before:to-transparent
                          ${isPlaying ? 'animate-spin-slow' : ''}`}
              style={{ boxShadow: '0 30px 80px rgba(0,0,0,0.6), inset 0 -40px 80px rgba(0,0,0,0.4), inset 0 2px 2px rgba(255,255,255,0.04)' }}
            >
              {currentTrack?.cover?.startsWith('http') ? (
                <div className="absolute inset-[12%] rounded-full overflow-hidden border-2 border-white/[0.06]">
                  <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${currentTrack.cover})` }} />
                </div>
              ) : (
                <>
                  <div className="absolute w-[88%] h-[88%] rounded-full border border-white/[0.03]" />
                  <div className="absolute w-[75%] h-[75%] rounded-full border border-white/[0.02]" />
                  <div className="absolute w-[60%] h-[60%] rounded-full border border-white/[0.02]" />
                </>
              )}
              <div className="w-[22%] h-[22%] rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center z-10">
                <div className="w-3 h-3 rounded-full bg-white/20" />
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Lyrics — overlay on top of vinyl, pointer-events-none so clicks pass through to vinyl */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20" style={{ marginTop: 'clamp(10px, 3vh, 40px)' }}>
        {showHint ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="text-white/30 font-serif italic text-[clamp(14px,2.5vw,24px)]">awaiting your voice</div>
          </motion.div>
        ) : lyricsEnabled && hasLyrics ? (
          <div className="max-w-2xl text-center font-serif italic leading-relaxed tracking-wide px-6 space-y-1" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6), 0 0 20px rgba(5,5,8,0.9)' }}>
            {prevLyric && (
              <div className="text-white/[0.06] text-[clamp(12px,2vw,18px)] transition-all duration-700">
                {prevLyric}
              </div>
            )}
            <AnimatePresence mode="wait">
              <motion.div
                key={`line-${lyricIndex}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="text-white/80 text-[clamp(16px,3.2vw,30px)]"
              >
                {activeLyric || '· · ·'}
              </motion.div>
            </AnimatePresence>
            {nextLyric && (
              <div className="text-white/[0.12] text-[clamp(11px,1.8vw,16px)]">
                {nextLyric}
              </div>
            )}
          </div>
        ) : (
          <div className="text-white/[0.06] font-serif italic text-[clamp(14px,2.5vw,24px)]">· · ·</div>
        )}
      </div>

      {/* Waveform */}
      <div className="absolute bottom-[15%] left-0 w-full h-[10vh] max-h-20 pointer-events-none opacity-30 z-0">
        <canvas ref={canvasRef} width={1920} height={80} className="w-full h-full" />
      </div>

      {/* Bottom bar */}
      <div className="absolute bottom-[6%] left-1/2 -translate-x-1/2 z-20 flex items-center gap-6">
        <button onClick={onBackToRadio} className="text-[10px] uppercase tracking-[2px] text-white/20 hover:text-white/40 transition-all duration-200 hover:scale-105 active:scale-95">
          ← Radio
        </button>
        <button onClick={onToggleLyrics}
          className={`text-[9px] uppercase tracking-[2px] transition-all duration-200 hover:scale-105 active:scale-95 ${lyricsEnabled ? 'text-white/30' : 'text-white/[0.08]'}`}>
          ✦ Lyrics
        </button>
      </div>
    </div>
  );
}
