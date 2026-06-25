import SpatialLayout from './components/layout/SpatialLayout';
import BioParticles from './components/background/BioParticles';
import PortalAnimation from './components/portal/PortalAnimation';
import { useRadioState } from './hooks/useRadioState';

export default function App() {
  const {
    isPlaying, messages, togglePlay, playNext, playPrev, addChatMessage,
    isPortaling, endPortal, currentTrack, progress, duration, currentTime,
    volume, isMuted, seek, setVolumeValue, toggleMute, searchAndPlay, playPlaylist,
    trackLyrics, lyricIndex, lyricLines, realDuration,
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

  return (
    <div className="relative w-full h-screen bg-[#050508] overflow-hidden font-sans">
      <div className="absolute inset-0" style={{
        background: `
          radial-gradient(ellipse 70% 40% at 50% 20%, rgba(59,130,246,0.05) 0%, transparent 60%),
          radial-gradient(ellipse 50% 50% at 50% 60%, rgba(96,165,250,0.03) 0%, transparent 50%),
          radial-gradient(ellipse 80% 30% at 30% 80%, rgba(59,130,246,0.02) 0%, transparent 50%),
          radial-gradient(ellipse 80% 30% at 70% 80%, rgba(96,165,250,0.02) 0%, transparent 50%),
          linear-gradient(180deg, rgba(5,5,10,1) 0%, rgba(8,8,20,1) 40%, rgba(10,10,25,1) 60%, rgba(5,5,10,1) 100%)
        `,
      }} />
      {isPortaling ? <PortalAnimation onComplete={endPortal} /> : <BioParticles />}
      <div className="relative w-full h-full">
        <SpatialLayout
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
          messages={messages}
          onTogglePlay={togglePlay}
          onNext={playNext}
          onPrev={playPrev}
          onSeek={seek}
          onVolumeChange={setVolumeValue}
          onToggleMute={toggleMute}
          onSendMessage={handleSend}
          onPlayPlaylist={playPlaylist}
        />
      </div>
    </div>
  );
}
