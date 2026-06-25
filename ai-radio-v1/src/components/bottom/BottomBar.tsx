import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { Track } from '../../types';
import { formatTime } from '../../utils/formatTime';
import { coverUrl, isImageUrl } from '../../utils/img';

interface Props {
  visible: boolean;
  track: Track | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  realDuration: number;
  currentTime: number;
  volume: number;
  isMuted: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (pct: number) => void;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
  onPin: () => void;
  onUnpin: () => void;
}

export default function BottomBar({
  visible, track, isPlaying, progress, duration, realDuration, currentTime,
  volume, isMuted, onTogglePlay, onNext, onPrev, onSeek, onVolumeChange, onToggleMute,
  onPin, onUnpin,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [localProgress, setLocalProgress] = useState(progress);
  const [volHover, setVolHover] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeBarRef = useRef<HTMLDivElement>(null);

  const displayDur = realDuration || duration || 1;
  const vol = isMuted ? 0 : volume;
  const displayProgress = isDragging ? localProgress : progress;

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
  }, [calcVolPct, onVolumeChange]);

  const coverStyle = isImageUrl(track?.cover)
    ? { backgroundImage: `url(${coverUrl(track?.cover)})` }
    : { background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(10,10,26,0.8))' };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-4 pt-2"
          onMouseEnter={onPin}
          onMouseLeave={onUnpin}
        >
          {/* Progress line on top edge */}
          <div
            ref={progressRef}
            className="absolute top-0 left-4 right-4 h-[2px] cursor-pointer group/progress"
            onMouseDown={handleProgressDown}
          >
            <div className="h-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full transition-all duration-150"
                style={{
                  width: `${displayProgress}%`,
                  background: 'linear-gradient(90deg, rgba(96,165,250,0.5), rgba(139,92,246,0.6))',
                }}
              />
            </div>
          </div>

          <div
            className="mx-auto max-w-4xl liquid-glass rounded-full px-5 py-3 flex items-center gap-4"
            style={{ backdropFilter: 'blur(12px)' }}
          >
            {/* Track info */}
            <div className="flex items-center gap-3 min-w-0 flex-shrink-0 w-[200px]">
              <div className="w-10 h-10 rounded-lg bg-cover bg-center flex-shrink-0 border border-white/[0.06]" style={coverStyle} />
              <div className="min-w-0">
                <div className="text-white/70 text-sm truncate leading-tight">{track?.title ?? '— — —'}</div>
                <div className="text-white/30 text-[11px] truncate">{track?.artist ?? ''}</div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-5 flex-1">
              <button onClick={onPrev} className="text-white/35 hover:text-white/65 transition-colors duration-500">
                <SkipBack size={16} />
              </button>
              <button
                onClick={onTogglePlay}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-opacity duration-500 hover:opacity-80"
                style={{ background: 'rgba(59,130,246,0.18)' }}
              >
                {isPlaying
                  ? <Pause size={16} className="text-white/75 fill-white/75" />
                  : <Play size={16} className="text-white/75 fill-white/75 ml-0.5" />}
              </button>
              <button onClick={onNext} className="text-white/35 hover:text-white/65 transition-colors duration-500">
                <SkipForward size={16} />
              </button>
            </div>

            {/* Time + volume */}
            <div className="flex items-center gap-4 flex-shrink-0">
              <span className="text-[10px] text-white/25 tracking-wide tabular-nums whitespace-nowrap">
                {formatTime(isDragging ? (displayProgress / 100) * displayDur : currentTime)}
                {' / '}
                {formatTime(displayDur)}
              </span>
              <div
                className="flex items-center gap-2"
                onMouseEnter={() => setVolHover(true)}
                onMouseLeave={() => setVolHover(false)}
              >
                <button onClick={onToggleMute} className="text-white/25 hover:text-white/50 transition-colors duration-500">
                  {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <div
                  ref={volumeBarRef}
                  className="relative h-5 w-0.5 rounded-full cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.08)' }}
                  onMouseDown={handleVolumeDown}
                >
                  <div
                    className="absolute bottom-0 w-full rounded-full transition-all duration-300"
                    style={{ height: `${vol * 100}%`, background: 'rgba(150,200,255,0.35)' }}
                  />
                  <div
                    className={`absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white/40 transition-opacity duration-300 pointer-events-none ${volHover ? 'opacity-100' : 'opacity-0'}`}
                    style={{ bottom: `calc(${vol * 100}% - 3px)` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
