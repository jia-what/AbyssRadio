import { useState, useEffect, type RefObject } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useEdgePanels } from '../../hooks/useEdgePanels';
import type { OrbitRotation } from '../../hooks/useSpatialOrbit';
import LyricLight from '../center/LyricLight';
import LyricStage from '../center/LyricStage';
import BottomBar from '../bottom/BottomBar';
import SignalColumn from '../columns/SignalColumn';
import PlaylistColumn from '../columns/PlaylistColumn';
import type { ParticleCameraState } from '../background/coverParticle/camera';
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
  translationLines: LyricLine[];
  lyricMode: 'off' | 'original' | 'dual';
  onLyricModeChange: (m: 'off' | 'original' | 'dual') => void;
  lyricMeshActive: boolean;
  trialInfo: { trial: boolean; trialLen: number } | null;
  messages: AIMessage[];
  orbit: OrbitRotation;
  cameraRef: RefObject<ParticleCameraState>;
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

/** Lyrics/UI parallax — camera-lock feel (Mineradio-style): the 3D cover
 *  rotates around, while the lyric stage stays nearly fixed with a tiny
 *  counter-sway (lag) instead of following the orbit. That counter-motion is
 *  what creates the depth contrast between lyrics and particles. */
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
    x: `${-orbit.y * 0.055}px`,
    y: `${-orbit.x * 0.04}px`,
    scale: 1 + Math.abs(orbit.x) * 0.0006,
    opacity: 1,
    filter: 'blur(0px)',
  };
}

export default function SpatialLayout(p: Props) {
  const { panels, pin, unpin, toggle, setBottomEnabled } = useEdgePanels();
  const [showHint, setShowHint] = useState(true);
  const [rightFocused, setRightFocused] = useState(false);
  const hasTrack = !!p.track;

  // 有真曲才启用底栏；空闲英雄页完全不出现播放栏
  useEffect(() => {
    setBottomEnabled(hasTrack);
  }, [hasTrack, setBottomEnabled]);

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

  const toggleLeft = () => toggle('left');

  const toggleRight = () => {
    if (rightFocused || panels.right) {
      handleRightBlur();
    } else {
      handleRightFocus();
    }
  };

  return (
    <div className="relative w-full h-full pointer-events-none">
      <LyricStage cameraRef={p.cameraRef} dimmed={rightFocused}>
        {!p.lyricMeshActive && p.track && (
          <LyricLight
            track={p.track}
            trackLyrics={p.trackLyrics}
            lyricIndex={p.lyricIndex}
            lyricLines={p.lyricLines}
            translationLines={p.translationLines}
            lyricMode={p.lyricMode}
            onLyricModeChange={p.onLyricModeChange}
            currentTime={p.currentTime}
            realDuration={p.realDuration}
            duration={p.duration}
            isPlaying={p.isPlaying}
            parallax={p.orbit}
          />
        )}
      </LyricStage>

      {/* HUD — fixed to viewport; must stay outside orbit parallax (transform clips fixed children). */}
      <SignalColumn
        visible={panels.left}
        messages={p.messages}
        isPlaying={p.isPlaying}
        onSendMessage={p.onSendMessage}
        onPin={() => pin('left')}
        onUnpin={() => unpin('left')}
        onToggle={toggleLeft}
        parallax={p.orbit}
      />

      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={stageParallax(p.orbit, rightFocused)}
        transition={STAGE_SPRING}
      >
        <BottomBar
          visible={hasTrack && panels.bottom}
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
          lyricMode={p.lyricMode}
          onLyricModeChange={p.onLyricModeChange}
          trialInfo={p.trialInfo}
        />
      </motion.div>

      {/* HUD — playlist stays screen-fixed, not dragged with the universe */}
      <PlaylistColumn
        visible={panels.right}
        focused={rightFocused}
        onPlayPlaylist={p.onPlayPlaylist}
        onFocus={handleRightFocus}
        onBlur={handleRightBlur}
        onToggle={toggleRight}
      />

      <AnimatePresence>
        {showHint && !rightFocused && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-5 inset-x-0 z-50 flex justify-center pointer-events-none"
          >
            <div className="liquid-glass rounded-full px-4 py-1.5 text-[10px] text-white/30 tracking-wide">
              贴边唤出 · 左 AI · 右歌单 · 下播放
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export { stageParallax };
