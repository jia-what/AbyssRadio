import LeftSidebar from '../sidebar/LeftSidebar';
import CenterPlayer from '../player/CenterPlayer';
import AIBeam from '../chat/AIBeam';
import ViewToggle from './ViewToggle';
import type { ChatMessage, Track } from '../../types';
import type { LyricLine } from '../../utils/parseLRC';

interface Props {
  leftPanelOpen: boolean; aiPanelOpen: boolean; isPlaying: boolean;
  onToggleLeft: () => void; onToggleAI: () => void; onTogglePlay: () => void;
  onNext: () => void; onPrev: () => void;
  onSendMessage: (text: string) => void; chatMessages: ChatMessage[];
  viewMode: 'radio' | 'immersive';
  onViewModeChange: (m: 'radio' | 'immersive') => void;
  track: Track | null; progress: number; duration: number;
  volume: number; isMuted: boolean;
  onSeek: (pct: number) => void; onSeekToTime: (seconds: number) => void;
  onVolumeChange: (v: number) => void; onToggleMute: () => void;
  trackLyrics: string[]; lyricIndex: number; lyricLines: LyricLine[]; currentTime: number; realDuration: number;
  onToggleLoginPanel: () => void;
}

export default function RadioView(p: Props) {
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center">
      {/* 歌词层 — 脱离播放器，作为空间中的发光元素 */}
      {p.trackLyrics.length > 0 && p.lyricIndex >= 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-5" style={{ marginTop: '-8vh' }}>
          <div className="text-center max-w-3xl px-12">
            <div className="text-white/[0.06] text-[clamp(12px,1.8vw,18px)] font-serif italic leading-relaxed mb-2 transition-all duration-1000">
              {p.lyricIndex > 0 ? p.trackLyrics[p.lyricIndex - 1] : ''}
            </div>
            <div className="text-white/70 text-[clamp(24px,4vw,42px)] font-serif italic leading-relaxed tracking-wide transition-all duration-500"
              style={{ textShadow: '0 0 40px rgba(96,165,250,0.08), 0 2px 12px rgba(0,0,0,0.5)' }}>
              {p.trackLyrics[p.lyricIndex]}
            </div>
            <div className="text-white/[0.08] text-[clamp(12px,1.8vw,18px)] font-serif italic leading-relaxed mt-2 transition-all duration-1000">
              {p.lyricIndex + 1 < p.trackLyrics.length ? p.trackLyrics[p.lyricIndex + 1] : ''}
            </div>
          </div>
        </div>
      )}

      {/* 播放器 — 垂直单列 */}
      <div className="flex flex-col items-center" style={{ marginTop: p.trackLyrics.length > 0 ? '22vh' : '-2vh' }}>
        <CenterPlayer track={p.track} isPlaying={p.isPlaying} progress={p.progress} duration={p.duration}
          realDuration={p.realDuration} volume={p.volume} isMuted={p.isMuted}
          onTogglePlay={p.onTogglePlay} onNext={p.onNext} onPrev={p.onPrev}
          onSeek={p.onSeek} onSeekToTime={p.onSeekToTime}
          onVolumeChange={p.onVolumeChange} onToggleMute={p.onToggleMute}
          trackLyrics={p.trackLyrics} lyricIndex={p.lyricIndex}
          lyricLines={p.lyricLines} currentTime={p.currentTime} />
      </div>

      {/* 左右功能触发点 */}
      <div className="absolute left-5 z-10" style={{ top: '50%', transform: 'translateY(-50%)' }}>
        <LeftSidebar isOpen={p.leftPanelOpen} onToggle={p.onToggleLeft} />
      </div>
      <div className="absolute right-5 z-10" style={{ top: '50%', transform: 'translateY(-50%)' }}>
        <AIBeam isOpen={p.aiPanelOpen} onToggle={p.onToggleAI} messages={p.chatMessages} onSendMessage={p.onSendMessage} />
      </div>

      {/* 底部入口 */}
      <div className="absolute z-20" style={{ bottom: '4%' }}>
        <div className="flex items-center gap-6">
          <button onClick={p.onToggleLoginPanel}
            className="text-[9px] uppercase tracking-[3px] text-white/25 hover:text-white/50 transition-all duration-500">
            ☰ Playlists
          </button>
          <ViewToggle mode={p.viewMode} onChange={p.onViewModeChange} />
        </div>
      </div>
    </div>
  );
}
