import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import SpatialLayout from './components/layout/SpatialLayout';
import PortalAnimation from './components/portal/PortalAnimation';
import CoverParticleField from './components/background/CoverParticleField';
import CoverAmbientLight from './components/background/CoverAmbientLight';
import CoverPulseWave from './components/background/CoverPulseWave';
import StandbyScreen from './components/intro/StandbyScreen';
import { PulseProvider } from './context/PulseContext';
import { useRadioState } from './hooks/useRadioState';
import { useParticleCamera } from './hooks/useParticleCamera';
import { loadCoverPalette, paletteToWaveColors, type CoverPalette } from './utils/coverPalette';

export default function App() {
  // 状态机: boot(开场动画, 暂未启用) → standby(待机界面, 当前默认入口) → main(主界面)
  const [phase, setPhase] = useState<'boot' | 'standby' | 'main'>('standby');
  const enterStandby = useCallback(() => setPhase('standby'), []);
  const enterMain = useCallback(() => setPhase('main'), []);
  const [rightFocused, setRightFocused] = useState(false);
  const { parallax, cameraRef, layerRef, handlers } = useParticleCamera(!rightFocused);
  const {
    isPlaying, messages, togglePlay, playNext, playPrev, addChatMessage,
    isPortaling, endPortal, currentTrack, progress, duration, currentTime,
    volume, isMuted, seek, setVolumeValue, toggleMute, searchAndPlay, playPlaylist,
    trackLyrics, lyricIndex, lyricLines, realDuration, audioRef, pulseAnalyserRef, beatAnalyserRef, isDemoPlayback,
    translationLines, lyricMode, setLyricMode, trialInfo,
  } = useRadioState();

  const handleSend = async (text: string) => {
    addChatMessage({ id: Date.now().toString(), role: 'user', text });

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-10),
          track: currentTrack,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        addChatMessage({ id: (Date.now() + 1).toString(), role: 'ai', text: data.text });

        if (data.type === 'skip') {
          playNext();
          return;
        }

        if (data.type === 'play' && data.songQuery) {
          setTimeout(async () => {
            const found = await searchAndPlay(data.songQuery);
            if (found) {
              addChatMessage({
                id: (Date.now() + 2).toString(), role: 'ai',
                text: `◉  Now playing — ${found.title} by ${found.artist}`,
              });
            }
          }, 300);
          return;
        }

        const songTriggers = ['play ', '放 ', '听 ', '点歌 ', '换一首', '换歌', '下一首', '换'];
        const isSongReq = songTriggers.some(t => text.toLowerCase().includes(t));
        if (isSongReq) {
          let query = text;
          const cleanMatch = text.match(/换(?:一首)?(.+?)(?:歌|听听)?$/);
          if (cleanMatch && cleanMatch[1].trim()) {
            query = cleanMatch[1].trim();
          } else {
            for (const t of songTriggers) {
              const idx = text.toLowerCase().indexOf(t);
              if (idx >= 0) {
                const before = text.substring(0, idx);
                const after = text.substring(idx + t.length);
                if (!before.trim() || /[，。！？,\.!?]/.test(before.trim().slice(-1))) {
                  query = after.trim();
                  break;
                }
              }
            }
          }
          if (query) {
            setTimeout(async () => {
              const found = await searchAndPlay(query);
              if (found) {
                addChatMessage({
                  id: (Date.now() + 2).toString(), role: 'ai',
                  text: `◉  Now playing — ${found.title} by ${found.artist}`,
                });
              }
            }, 300);
          } else {
            playNext();
          }
        }
        return;
      }
    } catch {
      // ignore fetch errors
    }

    const songTriggers = ['play ', '放 ', '听 ', '点歌 '];
    const isSongReq = songTriggers.some(t => text.toLowerCase().startsWith(t));
    if (isSongReq) {
      const query = text.replace(/^(play |放 |听 |点歌 )/i, '');
      const found = await searchAndPlay(query);
      addChatMessage({
        id: (Date.now() + 2).toString(), role: 'ai',
        text: found
          ? `◉  Now playing — ${found.title} by ${found.artist}`
          : `Sorry, I couldn't find that track.`,
      });
    } else {
      setTimeout(() => {
        addChatMessage({ id: (Date.now() + 1).toString(), role: 'ai', text: 'Signal received. Processing your request...' });
      }, 600);
    }
  };

  // ——— Cover palette → lyric highlight (Mineradio same-source color) ———
  const [coverPalette, setCoverPalette] = useState<CoverPalette | null>(null);
  useEffect(() => {
    let alive = true;
    const cover = currentTrack?.cover ?? '';
    if (!cover) { setCoverPalette(null); return; }
    void loadCoverPalette(cover).then((p) => { if (alive) setCoverPalette(p); });
    return () => { alive = false; };
  }, [currentTrack?.cover]);

  // ——— Lyric mesh (cover-plane): title card + lyrics share one world scale ———
  // DOM LyricLight stays hidden whenever mesh is active (avoids title→lyric shrink).
  const lyricMesh = useMemo(() => {
    if (lyricMode === 'off' || !currentTrack) return null;
    const palette = coverPalette
      ? (() => {
          const w = paletteToWaveColors(coverPalette);
          return { highlight: w.core, glow: w.hi };
        })()
      : undefined;

    // Before / between lyric lines: same mesh as lyrics, title + artist
    const activeLine = lyricIndex >= 0 ? trackLyrics[lyricIndex] : undefined;
    if (!activeLine) {
      return {
        active: currentTrack.title,
        prev: '',
        next: '',
        progress: 0,
        translation: currentTrack.artist || undefined,
        hasTranslationData: !!currentTrack.artist,
        variant: 'title' as const,
        palette,
      };
    }

    const lines = lyricLines.length > 0 ? lyricLines : [];
    const line = lines[lyricIndex];
    const lineStart = line?.time ?? 0;
    const lineEnd = lines[lyricIndex + 1]?.time ?? (realDuration || duration || 1);
    const words = line?.words;
    let progress = 0;
    if (words && words.length > 0) {
      let filled = 0;
      let total = 0;
      for (const w of words) {
        const wEnd = w.start + w.duration;
        total += w.text.length;
        if (currentTime >= wEnd) filled += w.text.length;
        else if (currentTime > w.start) {
          const f = (currentTime - w.start) / Math.max(0.05, wEnd - w.start);
          filled += w.text.length * Math.min(1, Math.max(0, f));
        }
      }
      progress = total > 0 ? filled / total : 0;
    } else {
      const rawGap = Math.max(lineEnd - lineStart, 0.1);
      const cjk = (activeLine.match(/[\u3400-\u9fff\uac00-\ud7a3\u3040-\u30ff]/g) || []).length;
      const wordsN = (activeLine.replace(/[\u3400-\u9fff\uac00-\ud7a3\u3040-\u30ff]/g, ' ').trim().match(/\S+/g) || []).length;
      const estSing = cjk * 0.3 + wordsN * 0.34 + 0.6;
      progress = Math.min(1, Math.max(0, (currentTime - lineStart) / Math.min(rawGap, Math.max(estSing, 0.6))));
    }

    let translation: string | undefined;
    const hasTranslationData = translationLines.length > 0;
    if (lyricMode === 'dual') {
      const t0 = lines[lyricIndex]?.time ?? 0;
      let best = '';
      let bestDist = Infinity;
      for (const tl of translationLines) {
        const d = Math.abs(tl.time - t0);
        if (d < bestDist) { bestDist = d; best = tl.text; }
      }
      if (bestDist < 1.5) translation = best;
    }

    return {
      active: activeLine,
      prev: '',
      next: '',
      progress,
      translation,
      hasTranslationData,
      variant: 'lyrics' as const,
      palette,
    };
  }, [lyricMode, lyricIndex, trackLyrics, lyricLines, translationLines, currentTime, realDuration, duration, coverPalette, currentTrack]);

  return (
    <div className="relative w-full h-full min-h-0 bg-[#050508] overflow-hidden font-sans">
      {phase === 'boot' && null /* BootIntro 已备份在 git 1f6fc4b, 暂未启用 */}
      {phase === 'standby' && <StandbyScreen onEnter={enterMain} />}
      <PulseProvider
        audioRef={audioRef}
        analyserRef={pulseAnalyserRef}
        beatAnalyserRef={beatAnalyserRef}
        isPlaying={isPlaying}
        isDemoPlayback={isDemoPlayback}
        trackCover={currentTrack?.cover ?? null}
        trackId={currentTrack?.id ?? null}
        trackLabel={currentTrack ? `${currentTrack.title}` : null}
      >
        <CoverAmbientLight cover={currentTrack?.cover} />
        <CoverPulseWave
          cover={currentTrack?.cover}
          audioRef={audioRef}
          analyserRef={pulseAnalyserRef}
          isPlaying={isPlaying}
          isDemoPlayback={isDemoPlayback}
        />
        <CoverParticleField cameraRef={cameraRef} lyricMesh={lyricMesh} />
        {isPortaling && <PortalAnimation onComplete={endPortal} />}

        <div
          ref={layerRef}
          className="absolute inset-0 z-[2] touch-none cursor-grab active:cursor-grabbing"
          {...handlers}
        />

        <div className="relative w-full h-full z-[3] pointer-events-none">
          <SpatialLayout
            orbit={parallax}
            cameraRef={cameraRef}
            track={currentTrack}
            isPlaying={isPlaying}
            progress={progress}
            duration={duration}
            realDuration={realDuration}
            currentTime={currentTime}
            volume={volume}
            isMuted={isMuted}
            trackLyrics={trackLyrics}
            lyricIndex={lyricIndex}
            lyricLines={lyricLines}
            translationLines={translationLines}
            lyricMode={lyricMode}
            onLyricModeChange={setLyricMode}
            lyricMeshActive={!!lyricMesh}
            trialInfo={trialInfo}
            messages={messages}
            onTogglePlay={togglePlay}
            onNext={playNext}
            onPrev={playPrev}
            onSeek={seek}
            onVolumeChange={setVolumeValue}
            onToggleMute={toggleMute}
            onSendMessage={handleSend}
            onPlayPlaylist={playPlaylist}
            onRightFocusChange={setRightFocused}
          />
        </div>
      </PulseProvider>
    </div>
  );
}
