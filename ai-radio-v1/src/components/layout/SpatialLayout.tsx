import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useEdgePanels } from '../../hooks/useEdgePanels';
import type { OrbitRotation } from '../../hooks/useSpatialOrbit';
import LyricLight from '../center/LyricLight';
import BottomBar from '../bottom/BottomBar';
import AIColumn from '../columns/AIColumn';
import PlaylistColumn from '../columns/PlaylistColumn';
import type { Track } from '../../types';
import type { LyricLine } from '../../utils/parseLRC';
import type { PlaylistTrack } from '../../services/playlistApi';

export interface AIMessage { id: string; role: string; text: string }

interface Props {
  track: Track | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  realDuration: number;
  currentTime: number;
  volume: number;
  isMuted: boolean;
  trackLyrics: string[];
  lyricIndex: number;
  lyricLines: LyricLine[];
  messages: AIMessage[];
  orbit: OrbitRotation;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (pct: number) => void;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
  onSendMessage: (text: string) => void;
  onPlayPlaylist: (tracks: PlaylistTrack[], startIndex: number, sessionKey: string) => void;
  onRightFocusChange?: (focused: boolean) => void;
}

const STAGE_SPRING = { type: 'spring' as const, stiffness: 170, damping: 26, mass: 0.85 };

/** Lyrics/UI parallax — orbit is handled by the 3D canvas camera, not CSS plane rotation. */
function stageParallax(orbit: OrbitRotation, rightFocused: boolean) {
  if (rightFocused) {
    return {
      x: '-10%',
      y: '0%',
      scale: 0.86,
      opacity: 0.5,
      filter: 'blur(2px)',
    };
  }
  return {
    x: `${orbit.y * 0.12}px`,
    y: `${orbit.x * 0.08}px`,
    scale: 1 - Math.abs(orbit.x) * 0.0012,
    opacity: 1,
    filter: 'blur(0px)',
  };
}

export default function SpatialLayout(p: Props) {
  const { panels, pin, unpin } = useEdgePanels();
  const [showHint, setShowHint] = useState(true);
  const [rightFocused, setRightFocused] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 4000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    p.onRightFocusChange?.(rightFocused);
  }, [rightFocused, p.onRightFocusChange]);

  const handleRightFocus = () => {
    pin('right');
    setRightFocused(true);
  };

  const handleRightBlur = () => {
    setRightFocused(false);
    unpin('right');
  };

  return (
    <div className="relative w-full h-full pointer-events-none" style={{ transformStyle: 'preserve-3d' }}>
      {/* Universe layer — lyrics + side panels orbit with the scene */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={stageParallax(p.orbit, rightFocused)}
        transition={STAGE_SPRING}
      >
        <LyricLight
          track={p.track}
          trackLyrics={p.trackLyrics}
          lyricIndex={p.lyricIndex}
          lyricLines={p.lyricLines}
          currentTime={p.currentTime}
          realDuration={p.realDuration}
          duration={p.duration}
          isPlaying={p.isPlaying}
        />

        <AIColumn
          visible={panels.left}
          messages={p.messages}
          onSendMessage={p.onSendMessage}
          onPin={() => pin('left')}
          onUnpin={() => unpin('left')}
        />

        <BottomBar
          visible={panels.bottom}
          track={p.track}
          isPlaying={p.isPlaying}
          progress={p.progress}
          duration={p.duration}
          realDuration={p.realDuration}
          currentTime={p.currentTime}
          volume={p.volume}
          isMuted={p.isMuted}
          onTogglePlay={p.onTogglePlay}
          onNext={p.onNext}
          onPrev={p.onPrev}
          onSeek={p.onSeek}
          onVolumeChange={p.onVolumeChange}
          onToggleMute={p.onToggleMute}
          onPin={() => pin('bottom')}
          onUnpin={() => unpin('bottom')}
        />
      </motion.div>

      {/* HUD — playlist stays screen-fixed, not dragged with the universe */}
      <PlaylistColumn
        visible={panels.right}
        focused={rightFocused}
        onPlayPlaylist={p.onPlayPlaylist}
        onFocus={handleRightFocus}
        onBlur={handleRightBlur}
      />

      <AnimatePresence>
        {showHint && !rightFocused && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <div className="liquid-glass rounded-full px-4 py-1.5 text-[10px] text-white/30 tracking-wide">
              拖拽平移视角 · 控制条贴边浮出
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export { stageParallax };
