import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useEdgePanels } from '../../hooks/useEdgePanels';
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
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (pct: number) => void;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
  onSendMessage: (text: string) => void;
  onPlayPlaylist: (tracks: PlaylistTrack[], startIndex: number, sessionKey: string) => void;
}

export default function SpatialLayout(p: Props) {
  const { panels, pin, unpin } = useEdgePanels();
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative w-full h-full">
      {/* Center — lyrics only */}
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

      {/* Left — AI */}
      <AIColumn
        visible={panels.left}
        messages={p.messages}
        onSendMessage={p.onSendMessage}
        onPin={() => pin('left')}
        onUnpin={() => unpin('left')}
      />

      {/* Right — playlist */}
      <PlaylistColumn
        visible={panels.right}
        onPlayPlaylist={p.onPlayPlaylist}
        onPin={() => pin('right')}
        onUnpin={() => unpin('right')}
      />

      {/* Bottom — playback bar */}
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

      {/* First-visit hint */}
      <AnimatePresence>
        {showHint && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <div className="liquid-glass rounded-full px-4 py-1.5 text-[10px] text-white/30 tracking-wide">
              控制条自动隐藏已开启
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
