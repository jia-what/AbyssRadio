import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import ElasticSlider from '../ui/ElasticSlider';
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
  lyricMode: 'off' | 'original' | 'dual';
  onLyricModeChange: (m: 'off' | 'original' | 'dual') => void;
  trialInfo: { trial: boolean; trialLen: number } | null;
}

const LYRIC_MODE_LABEL: Record<'off' | 'original' | 'dual', string> = {
  off: '歌词关',
  original: '仅原词',
  dual: '原词+译',
};

export default function BottomBar({
  visible, track, isPlaying, progress, duration, realDuration, currentTime,
  volume, isMuted, onTogglePlay, onNext, onPrev, onSeek, onVolumeChange, onToggleMute,
  onPin, onUnpin, lyricMode, onLyricModeChange, trialInfo,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [localProgress, setLocalProgress] = useState(progress);
  const [snapProgress, setSnapProgress] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const trackIdRef = useRef(track?.id);

  const displayDur = realDuration || duration || 1;
  const vol = isMuted ? 0 : volume;
  const displayProgress = isDragging ? localProgress : progress;

  useEffect(() => {
    if (!isDragging) setLocalProgress(progress);
  }, [progress, isDragging]);

  // Instant reset when track changes — no width transition from previous song.
  useEffect(() => {
    if (track?.id === trackIdRef.current) return;
    trackIdRef.current = track?.id;
    setLocalProgress(0);
    setSnapProgress(true);
    const t = window.setTimeout(() => setSnapProgress(false), 80);
    return () => window.clearTimeout(t);
  }, [track?.id]);

  const calcProgressPct = useCallback((clientX: number) => {
    if (!progressRef.current) return 0;
    const rect = progressRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  }, []);

  const beginSeek = useCallback((clientX: number) => {
    setLocalProgress(calcProgressPct(clientX));
    setIsDragging(true);
    setSnapProgress(true);
  }, [calcProgressPct]);

  const handleProgressDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    beginSeek(e.clientX);
  }, [beginSeek]);

  const handleProgressTouch = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    e.preventDefault();
    beginSeek(touch.clientX);
  }, [beginSeek]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (clientX: number) => setLocalProgress(calcProgressPct(clientX));
    const onMouseMove = (e: MouseEvent) => onMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) onMove(touch.clientX);
    };
    const finish = (clientX: number) => {
      onSeek(calcProgressPct(clientX));
      setIsDragging(false);
      setSnapProgress(false);
    };
    const onMouseUp = (e: MouseEvent) => finish(e.clientX);
    const onTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      if (touch) finish(touch.clientX);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [isDragging, calcProgressPct, onSeek]);

  const coverStyle = isImageUrl(track?.cover)
    ? { backgroundImage: `url(${coverUrl(track?.cover)})` }
    : { background: 'linear-gradient(135deg, rgba(80,120,180,0.12), rgba(8,10,18,0.9))' };

  const fillTransition = snapProgress || isDragging
    ? 'none'
    : 'width 120ms linear';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-0 inset-x-0 z-40 px-4 pb-4 pointer-events-auto flex flex-col items-center gap-2.5"
          onMouseEnter={onPin}
          onMouseLeave={onUnpin}
        >
          {/* Progress — same width as the glass pill so L/R margins stay equal (esp. Electron) */}
          <div
            ref={progressRef}
            className="w-full max-w-4xl h-5 flex items-center shrink-0 cursor-pointer touch-none group/progress"
            onMouseDown={handleProgressDown}
            onTouchStart={handleProgressTouch}
            role="slider"
            aria-label="播放进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(displayProgress)}
          >
            <div className="relative w-full h-[3px] rounded-full overflow-visible" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${displayProgress}%`,
                  background: 'linear-gradient(90deg, rgba(96,165,250,0.55), rgba(139,92,246,0.65))',
                  transition: fillTransition,
                }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full pointer-events-none transition-opacity duration-150"
                style={{
                  left: `calc(${displayProgress}% - 5px)`,
                  background: 'rgba(200,220,255,0.85)',
                  boxShadow: '0 0 8px rgba(96,165,250,0.45)',
                  opacity: isDragging ? 1 : 0,
                }}
              />
            </div>
          </div>

          <div
            className="w-full max-w-4xl liquid-glass rounded-full px-5 py-3 flex items-center gap-3 shrink-0"
            style={{ backdropFilter: 'blur(12px)' }}
          >
            {/* Track info — left third */}
            <div className="flex items-center gap-3 min-w-0 flex-1 basis-0 justify-start">
              <div className="w-10 h-10 rounded-lg bg-cover bg-center flex-shrink-0 border border-white/[0.06]" style={coverStyle} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-white/70 text-sm truncate leading-tight">{track?.title ?? '等待点播'}</div>
                  {trialInfo?.trial && (
                    <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full border border-amber-300/30 text-amber-200/70 bg-amber-400/10 leading-none">
                      试听{trialInfo.trialLen > 0 ? ` ${trialInfo.trialLen}s` : ''}
                    </span>
                  )}
                </div>
                <div className="text-white/30 text-[11px] truncate">{track?.artist ?? '右侧歌单 · 扫码后播放'}</div>
              </div>
            </div>

            {/* Controls — true center */}
            <div className="flex items-center justify-center gap-5 flex-shrink-0">
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

            {/* Time + volume — right third, mirrored width of left */}
            <div className="flex items-center gap-3 min-w-0 flex-1 basis-0 justify-end">
              <span className="text-[10px] text-white/25 tracking-wide tabular-nums whitespace-nowrap">
                {formatTime(isDragging ? (displayProgress / 100) * displayDur : currentTime)}
                {' / '}
                {formatTime(displayDur)}
              </span>
              <button
                type="button"
                onClick={() => {
                  const order: ('off' | 'original' | 'dual')[] = ['dual', 'original', 'off'];
                  const next = order[(order.indexOf(lyricMode) + 1) % order.length];
                  onLyricModeChange(next);
                }}
                className="text-[10px] px-2 py-1 rounded-full border border-white/10 text-white/30 hover:text-white/70 hover:border-white/25 transition-colors duration-300 shrink-0"
                title="歌词显示模式"
              >
                {LYRIC_MODE_LABEL[lyricMode]}
              </button>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="text-white/25 hover:text-white/50 transition-colors duration-500 shrink-0"
                >
                  {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <ElasticSlider
                  className="!w-28"
                  defaultValue={Math.round(vol * 100)}
                  startingValue={0}
                  maxValue={100}
                  isStepped
                  stepSize={1}
                  onChange={(v) => onVolumeChange(v / 100)}
                  leftIcon={null}
                  rightIcon={<Volume2 size={13} className="text-white/30" />}
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
