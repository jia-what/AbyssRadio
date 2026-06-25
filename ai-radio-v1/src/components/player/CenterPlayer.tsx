import { Play, Pause, SkipBack, SkipForward, Heart, Volume2, VolumeX, ChevronDown } from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { Track } from '../../types';
import { formatTime } from '../../utils/formatTime';
import type { LyricLine } from '../../utils/parseLRC';

interface Props {
  track: Track | null; isPlaying: boolean; progress: number; duration: number;
  realDuration: number; volume: number; isMuted: boolean;
  onTogglePlay: () => void; onNext: () => void; onPrev: () => void;
  onSeek: (pct: number) => void; onSeekToTime: (seconds: number) => void;
  onVolumeChange: (v: number) => void; onToggleMute: () => void;
  trackLyrics: string[]; lyricIndex: number; lyricLines: LyricLine[]; currentTime: number;
}

function splitLine(line: string): string[] {
  return line.split(/(\s+)/).filter(Boolean);
}

export default function CenterPlayer({
  track, isPlaying, progress, duration, realDuration, volume, isMuted,
  onTogglePlay, onNext, onPrev, onSeek, onSeekToTime, onVolumeChange, onToggleMute,
  trackLyrics, lyricIndex, lyricLines, currentTime,
}: Props) {
  const [liked, setLiked] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeBarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isVolDragging, setIsVolDragging] = useState(false);
  const [localProgress, setLocalProgress] = useState(progress);
  const [volHover, setVolHover] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualScrollCountRef = useRef(0);

  // Auto-scroll: 2s after user stops scrolling
  useEffect(() => {
    if (!showLyrics || !lyricLines.length) return;
    if (userScrolled) return;
    const container = lyricsContainerRef.current;
    if (!container) return;
    const currentEl = container.querySelector(`[data-lyric-idx="${lyricIndex}"]`) as HTMLElement | null;
    if (currentEl) {
      currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [lyricIndex, showLyrics, lyricLines.length, userScrolled]);

  const handleLyricScroll = useCallback(() => {
    if (!showLyrics) return;
    setUserScrolled(true);
    manualScrollCountRef.current++;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      setUserScrolled(false);
    }, 2000); // reduced to 2s
  }, [showLyrics]);

  const title = track?.title ?? '— — —';
  const artist = track?.artist ?? '— — —';
  const album = '— — —';
  const displayDur = realDuration || duration || 1;
  const time = currentTime;
  const trackKey = track?.id ?? 'no-track';
  const vol = isMuted ? 0 : volume;

  useEffect(() => { if (!isDragging) setLocalProgress(progress); }, [progress, isDragging]);

  const calcProgressPct = useCallback((clientX: number) => {
    if (!progressRef.current) return 0;
    const rect = progressRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  }, []);

  const handleProgressDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setLocalProgress(calcProgressPct(e.clientX));
    setIsDragging(true);
  }, [calcProgressPct]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => setLocalProgress(calcProgressPct(e.clientX));
    const onUp = (e: MouseEvent) => { onSeek(calcProgressPct(e.clientX)); setIsDragging(false); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging, calcProgressPct, onSeek]);

  const calcVolPct = useCallback((clientY: number) => {
    if (!volumeBarRef.current) return 0;
    const rect = volumeBarRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
  }, []);

  const handleVolumeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onVolumeChange(calcVolPct(e.clientY));
    setIsVolDragging(true);
  }, [calcVolPct, onVolumeChange]);

  useEffect(() => {
    if (!isVolDragging) return;
    const onMove = (e: MouseEvent) => onVolumeChange(calcVolPct(e.clientY));
    const onUp = () => setIsVolDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isVolDragging, calcVolPct, onVolumeChange]);

  const displayProgress = isDragging ? localProgress : progress;

  // ===== Character-level progress: read audio.currentTime directly via RAF =====
  const targetLine = lyricLines[lyricIndex];
  const targetNextLine = lyricLines[lyricIndex + 1];
  const targetLineStart = targetLine?.time ?? 0;
  const targetNextTime = targetNextLine?.time ?? displayDur;
  const charLineDuration = Math.max(targetNextTime - targetLineStart, 0.1);
  const charLineProgress = Math.min(1, Math.max(0, (currentTime - targetLineStart) / charLineDuration));
  const currentChars = (trackLyrics[lyricIndex] || '').split('');
  const charCount = currentChars.length;

  return (
    <div className="flex flex-col items-center justify-center h-full select-none">
      <AnimatePresence mode="wait">
        {!showLyrics ? (
          <motion.div
            key="cover"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center"
          >
            <div key={trackKey} className="flex flex-col items-center">
              <div className="relative flex-shrink-0 cursor-pointer" onClick={() => trackLyrics.length > 0 && setShowLyrics(true)}>
                <div className="absolute -inset-8 rounded-[40px] opacity-30 blur-3xl" style={{ background: 'radial-gradient(ellipse at center, rgba(96,165,250,0.06) 0%, transparent 70%)' }} />
                <div className="relative w-[340px] h-[340px] rounded-[20px] overflow-hidden" style={{ boxShadow: '0 30px 80px rgba(0,0,0,0.7), inset 0 1px 1px rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  {track ? (() => {
                    const isUrlCover = track.cover?.startsWith('http');
                    return isUrlCover ? (
                      <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${track.cover})` }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"
                        style={{ background: `linear-gradient(135deg, ${track.cover?.split('-')[0] ?? '#0a0a1a'}, ${track.cover?.split('-')[1] ?? '#050508'})` }}>
                        <div className="text-center pointer-events-none">
                          <div className="text-white/20 text-[10px] uppercase tracking-[3px] mb-2">{track.artist}</div>
                          <div className="text-white/40 text-sm font-light tracking-wide">{track.title}</div>
                        </div>
                      </div>
                    );
                  })() : (
                    <div className="w-full h-full bg-gradient-to-br from-white/[0.04] via-transparent to-transparent flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-white/10 text-[10px] uppercase tracking-[3px] mb-2">AI Radio</div>
                        <div className="w-10 h-px bg-white/10 mx-auto" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-[28px] text-center" style={{ maxWidth: '340px' }}>
                <div className="text-white font-medium text-[22px] leading-[1.2] tracking-[-0.01em] truncate">{title}</div>
              </div>

              <div className="mt-[8px] text-center" style={{ maxWidth: '340px' }}>
                <div className="text-[14px] text-white/45 tracking-[-0.01em] truncate">{artist} · {album}</div>
              </div>

              <div className="mt-[22px] w-[320px] h-px bg-gradient-to-r from-transparent via-white/8 to-transparent flex-shrink-0" />

              {trackLyrics.length > 0 && (
                <div className="mt-3 text-center max-w-[260px] flex-shrink-0 h-8 flex items-center justify-center overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`radio-line-${lyricIndex}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      className="font-serif italic text-[13px] leading-relaxed whitespace-nowrap"
                    >
                      {currentChars.map((ch, ci) => {
                        const charPos = ci / charCount;
                        const isActive = charPos <= charLineProgress;
                        return (
                          <span key={ci} className={`transition-colors duration-150 ease-linear ${isActive ? 'text-blue-400/70' : 'text-white/30'}`}>
                            {ch}
                          </span>
                        );
                      })}
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="lyrics"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center w-full"
          >
            <div className="flex items-center justify-between w-full max-w-[280px] mb-4">
              <div className="text-left overflow-hidden">
                <div className="text-white/70 text-sm font-light tracking-wide truncate">{title}</div>
                <div className="text-white/30 text-[11px] truncate">{artist}</div>
              </div>
              <button onClick={() => setShowLyrics(false)} className="text-white/30 hover:text-white/60 transition-all duration-200 hover:scale-105 active:scale-95 shrink-0 ml-2">
                <ChevronDown size={18} />
              </button>
            </div>

            <div ref={lyricsContainerRef} className="w-full max-w-[280px] overflow-y-auto lyrics-scroll" style={{ maxHeight: '260px' }} onScroll={handleLyricScroll}>
              <div className="space-y-6 py-4">
                {trackLyrics.map((line, li) => {
                  const isCurrent = li === lyricIndex;
                  const isPast = li < lyricIndex;
                  const lineChars = line.split('');
                  const currentLineStart = lyricLines[li]?.time ?? 0;
                  const currentLineNext = lyricLines[li + 1]?.time ?? displayDur;
                  const currentLineDur = Math.max(currentLineNext - currentLineStart, 1);
                  const currentTimeInLine = Math.max(0, currentTime - currentLineStart);

                  const currentLineTargetProgress = isCurrent ? Math.min(1, currentTimeInLine / currentLineDur) : 0;
                  const lineCharCount = lineChars.length;

                  return (
                    <div
                      key={li}
                      data-lyric-idx={li}
                      onClick={() => {
                        const t = lyricLines[li]?.time;
                        if (t !== undefined) onSeekToTime(t);
                      }}
                      className={`text-center font-serif italic leading-relaxed transition-all duration-700 cursor-pointer hover:opacity-80 ${
                        isCurrent ? 'text-base scroll-mt-20' : 'text-xs text-white/[0.05]'
                      }`}
                    >
                      {lineChars.map((ch, ci) => {
                        if (isPast) return <span key={ci} className="text-blue-400/40 text-[13px]">{ch}</span>;
                        if (!isCurrent) return <span key={ci} className="text-white/20">{ch}</span>;
                        const charPos = ci / lineCharCount;
                        const isActive = charPos <= currentLineTargetProgress;
                        return (
                          <span key={ci} className={`transition-colors duration-100 ease-linear ${isActive ? 'text-blue-400/80' : 'text-white/60'}`}>
                            {ch}
                          </span>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress bar */}
      <div className="mt-[22px] w-[320px] flex-shrink-0 cursor-pointer py-2 group/progress" ref={progressRef} onMouseDown={handleProgressDown}>
        <div className="w-full h-[1.5px] rounded-full overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="absolute -inset-0.5 blur-sm opacity-20 transition-all duration-300" style={{ width: `${displayProgress}%`, background: 'rgba(150,200,255,0.5)', borderRadius: '1px' }} />
          <div className="h-full relative transition-all duration-150" style={{ width: `${displayProgress}%`, background: 'rgba(150,200,255,0.4)', borderRadius: '1px' }} />
          <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white/30 group-hover/progress:opacity-60 opacity-0 transition-opacity duration-300 pointer-events-none" style={{ left: `calc(${displayProgress}% - 4px)` }} />
        </div>
      </div>

      {/* Time */}
      <div className="mt-[2px] w-[320px] flex justify-between flex-shrink-0">
        <span className="text-[9px] tracking-[1px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{formatTime(isDragging ? (displayProgress / 100) * (displayDur || 1) : time)}</span>
        <span className="text-[9px] tracking-[1px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{formatTime(displayDur)}</span>
      </div>

      {/* Buttons */}
      <div className="mt-[24px] flex items-center flex-shrink-0" style={{ gap: '28px' }}>
        <div className="flex items-center" style={{ gap: '22px' }}>
          <button onClick={onPrev} className="w-10 h-10 rounded-full flex items-center justify-center text-white/40 hover:text-white/70 transition-all duration-500"><SkipBack size={14} /></button>
          <button onClick={onTogglePlay} className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 hover:opacity-80" style={{ background: 'rgba(59,130,246,0.15)' }}>
            {isPlaying ? <Pause size={18} className="text-white/70 fill-white/70" /> : <Play size={18} className="text-white/70 fill-white/70 ml-0.5" />}
          </button>
          <button onClick={onNext} className="w-10 h-10 rounded-full flex items-center justify-center text-white/40 hover:text-white/70 transition-all duration-500"><SkipForward size={14} /></button>
          <button onClick={() => setLiked(!liked)} className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500">
            <Heart size={13} className={liked ? 'fill-blue-400/40 text-blue-400/40' : 'text-white/30 hover:text-white/50'} />
          </button>
        </div>
        <div className="w-px h-6 bg-white/[0.04]" />
        <div className="flex items-center gap-3" onMouseEnter={() => setVolHover(true)} onMouseLeave={() => setVolHover(false)}>
          <button onClick={onToggleMute} className="text-white/25 hover:text-white/50 transition-all duration-500">
            {isMuted || volume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>
          <div className="relative h-6 w-0.5 rounded-full cursor-pointer group/vol" ref={volumeBarRef} onMouseDown={handleVolumeDown} style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="absolute bottom-0 w-full rounded-full transition-all duration-200" style={{ height: `${vol * 100}%`, background: 'rgba(150,200,255,0.25)' }} />
            <div className={`absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white/40 transition-all duration-300 pointer-events-none ${volHover || isVolDragging ? 'opacity-100' : 'opacity-0'}`} style={{ bottom: `calc(${vol * 100}% - 3px)` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
