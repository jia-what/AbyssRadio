import { useState, useMemo, useEffect, useCallback, startTransition } from 'react';
import SpatialLayout from './components/layout/SpatialLayout';
import PortalAnimation from './components/portal/PortalAnimation';
import CoverParticleField from './components/background/CoverParticleField';
import CoverAmbientLight from './components/background/CoverAmbientLight';
import CoverPulseWave from './components/background/CoverPulseWave';
import IdleHero from './components/background/IdleHero';
import StandbyScreen from './components/intro/StandbyScreen';
import { PulseProvider } from './context/PulseContext';
import { useRadioState } from './hooks/useRadioState';
import { useParticleCamera } from './hooks/useParticleCamera';
import { loadCoverPalette, paletteToWaveColors, type CoverPalette } from './utils/coverPalette';
import { loadStoredBind } from './services/playlistApi';
import { searchLibrary } from './services/aiSettingsApi';
import { albumClarifySuggestions, findAlbumHint, parseAlbumQuery } from './utils/albumPlay';
import { parseSongQuery } from './utils/songMatch';

function extractSongQuery(text: string): string | null {
  const raw = String(text || '').trim();
  if (!raw) return null;

  // 纯切歌，无搜索词
  if (/^(?:换一首|换歌|下一首|换一下|随便来一首|来一首|随便放一首)$/i.test(raw)) {
    return '';
  }

  const stripTail = (q: string) =>
    q
      .replace(/(?:听一下|来听听?|听听|播放|放一下|吧|呗|啊|呀|哦)+$/u, '')
      .replace(/[。！？.!?]+$/g, '')
      .trim();

  // play xxx / 放一首xxx / 放xxx / 听一下xxx / 点歌 xxx
  // 注意：不能匹配「听起来…」这类闲聊（听 后面必须是 一首/一下/空白/再一个听）
  const head = raw.match(
    /^(?:play\s+|放(?:一?首)?|听(?:听|一?首|一?下|\s+)|点歌\s*)(.+)$/i,
  );
  if (head) {
    const q = stripTail(head[1]);
    // 「放」单独不成点歌；「放一首」无歌名 → 空=切歌
    return q;
  }

  const cleanMatch = raw.match(/换(?:一首)?(.+?)(?:歌|听听)?$/);
  if (cleanMatch && cleanMatch[1].trim()) return stripTail(cleanMatch[1]);

  // 句中点歌：「帮我放一首 X」
  const mid = raw.match(/(?:帮我|给我|请)?放(?:一?首)(.+)$/i);
  if (mid) return stripTail(mid[1]);

  return null;
}

/** 用户话里是否像在点专辑 */
function looksLikeAlbumRequest(text: string, query: string): boolean {
  if (/专辑|这张|那张|album/i.test(text)) return true;
  if (/^album:/i.test(query)) return true;
  return !!findAlbumHint(query);
}

export default function App() {
  // 待机默认入口：主场景延后挂载，避免开局同时起 3 套 WebGL（环/按钮/封面粒子）卡顿。
  // 点击进入 → 立刻暖机挂载 main（叠在淡出底下）→ 淡出结束再卸待机。
  const [mainActive, setMainActive] = useState(false);
  const [standbyVisible, setStandbyVisible] = useState(true);
  const warmMain = useCallback(() => {
    startTransition(() => setMainActive(true));
  }, []);
  const dismissStandby = useCallback(() => setStandbyVisible(false), []);
  const [rightFocused, setRightFocused] = useState(false);
  const { parallax, cameraRef, layerRef, handlers } = useParticleCamera(!rightFocused);
  const {
    isPlaying, messages, togglePlay, playNext, playPrev, addChatMessage,
    isPortaling, endPortal, currentTrack, progress, duration, currentTime,
    volume, isMuted, seek, setVolumeValue, toggleMute, searchAndPlay, playPlaylist,
    insertAndPlay, searchAndInsertPlay, searchAndInsertAlbum, findInQueue,
    trackLyrics, lyricIndex, lyricLines, realDuration, audioRef, pulseAnalyserRef, beatAnalyserRef, isDemoPlayback,
    translationLines, lyricMode, setLyricMode, trialInfo,
  } = useRadioState();

  /**
   * A+C 专辑点播：有把握抽一首插播；没把握列出候选澄清，绝不拿同歌手无关单曲凑。
   */
  const playAlbumForAi = useCallback(async (
    query: string,
    opts: { allowGlobal?: boolean } = {},
  ) => {
    const allowGlobal = opts.allowGlobal === true;
    const bind = loadStoredBind();
    if (!bind?.sessionKey) {
      addChatMessage({
        id: (Date.now() + 2).toString(),
        role: 'ai',
        text: '请先在右侧扫码登录，再从专辑里抽歌。',
      });
      return false;
    }

    const q = String(query || '').replace(/^album:\s*/i, '').trim();
    if (!q) return false;
    const { album, artist } = parseAlbumQuery(q);

    try {
      const lib = await searchLibrary(bind.sessionKey, q, 'album');
      if (lib.track) {
        insertAndPlay(lib.track, bind.sessionKey);
        addChatMessage({
          id: (Date.now() + 2).toString(),
          role: 'ai',
          text: `◉  ${lib.message}（插播）`,
        });
        return true;
      }

      if (allowGlobal) {
        const found = await searchAndInsertAlbum(q, bind.sessionKey);
        if (found) {
          addChatMessage({
            id: (Date.now() + 2).toString(),
            role: 'ai',
            text: `◉  从专辑「${found.album}」抽了一首 — ${found.track.title} by ${found.track.artist}（插播）`,
          });
          return true;
        }
      }

      const suggestions = lib.suggestions?.length
        ? lib.suggestions
        : albumClarifySuggestions(album, artist);
      const hint = suggestions.length
        ? `想听哪首？可以说：${suggestions.slice(0, 3).join(' / ')}`
        : '可以说专辑里的具体歌名。';
      addChatMessage({
        id: (Date.now() + 2).toString(),
        role: 'ai',
        text: lib.message?.includes('想听哪首')
          ? `◉  ${lib.message}`
          : `◉  「${album}」更像专辑名，我还不能有把握抽曲。${hint}`,
      });
      return false;
    } catch (e) {
      addChatMessage({
        id: (Date.now() + 2).toString(),
        role: 'ai',
        text: e instanceof Error ? e.message : '专辑点播失败，请稍后重试。',
      });
      return false;
    }
  }, [insertAndPlay, searchAndInsertAlbum, addChatMessage]);

  /**
   * AI 点歌策略：
   * 1) 未登录 → 引导登录（不再全网搜，避免 VIP 30s 试听）
   * 2) 已登录 → 先搜用户歌单（优先原曲/已收藏）
   * 3) 歌单没有且 allowGlobal → 再全网搜索
   * 4) 单曲全失败且像专辑 → 走 A+C 专辑抽曲 / 澄清
   */
  const playSongForAi = useCallback(async (
    query: string,
    opts: { allowGlobal?: boolean; userText?: string } = {},
  ) => {
    const allowGlobal = opts.allowGlobal === true;
    const bind = loadStoredBind();

    if (!bind?.sessionKey) {
      addChatMessage({
        id: (Date.now() + 2).toString(),
        role: 'ai',
        text: '请先在右侧扫码登录。登录后我会优先从你的歌单点歌，完整播放、少翻唱。',
      });
      return false;
    }

    let q = String(query || '').trim();
    if (/^album:/i.test(q)) {
      return playAlbumForAi(q, { allowGlobal });
    }
    // 主C：像专辑的请求（专辑字样 / album: / 命中专辑提示表）优先走专辑链路，
    // 避免同名单曲抢先命中（修 放 Scorpion → 播 Chris Schweizer 的 Scorpion）
    if (looksLikeAlbumRequest(opts.userText || '', q)) {
      return playAlbumForAi(q, { allowGlobal });
    }
    if (!q) {
      playNext();
      return true;
    }

    try {
      // 1) 当前播放队列（右侧正在听的那张歌单）—— id/source 最准
      const queued = findInQueue(q);
      if (queued) {
        insertAndPlay(queued, bind.sessionKey);
        addChatMessage({
          id: (Date.now() + 2).toString(),
          role: 'ai',
          text: `◉  在当前歌单找到了：${queued.title} — ${queued.artist}（插播）`,
        });
        return true;
      }

      // 2) 后端扫登录账号下的歌单曲库
      const lib = await searchLibrary(bind.sessionKey, q);
      if (lib.track) {
        insertAndPlay(lib.track, bind.sessionKey);
        addChatMessage({
          id: (Date.now() + 2).toString(),
          role: 'ai',
          text: `◉  ${lib.message}（插播，下一首回原歌单）`,
        });
        return true;
      }

      // 3) 全网兜底（容易同名错源；仅 Key 点歌路径）
      if (allowGlobal) {
        const found = await searchAndInsertPlay(q, bind.sessionKey);
        if (found && 'ambiguous' in found) {
          // 主C：同名多艺人 → 列出候选让老板选，绝不猜
          addChatMessage({
            id: (Date.now() + 2).toString(),
            role: 'ai',
            text: `同名歌曲有多个版本：${found.ambiguous.map((a) => `「${q}」by ${a}`).join('，')}。告诉我要谁的，例如「放 ${q} by 谁」。`,
          });
          return true;
        }
        if (found) {
          addChatMessage({
            id: (Date.now() + 2).toString(),
            role: 'ai',
            text: `◉  歌单未命中，插播 — ${found.title} by ${found.artist}（下一首回原歌单）`,
          });
          return true;
        }
      }

      // 全网兜底失败：不要显示歌单的"配 Key"话术（已搜过全网），诚实说明
      const { titlePart, artistPart } = parseSongQuery(q);
      const missText = artistPart
        ? `全网也没找到 ${artistPart} 的《${titlePart}》— 平台可能没收录这个版本。`
        : allowGlobal
          ? `没找到与「${titlePart || q}」歌名匹配的曲目。若是专辑，可以说「放专辑 ${q}」。`
          : `歌单里没有「${q}」。导入 DeepSeek Key 后可搜全库。`;
      addChatMessage({
        id: (Date.now() + 2).toString(),
        role: 'ai',
        text: missText,
      });
      return false;
    } catch (e) {
      addChatMessage({
        id: (Date.now() + 2).toString(),
        role: 'ai',
        text: e instanceof Error ? e.message : '点歌失败，请稍后重试。',
      });
      return false;
    }
  }, [findInQueue, insertAndPlay, searchAndInsertPlay, playAlbumForAi, playNext, addChatMessage]);

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

        // No API key — library-only (must be logged in)
        if (data.type === 'nokey') {
          const query = extractSongQuery(text);
          if (query !== null) {
            addChatMessage({ id: (Date.now() + 1).toString(), role: 'ai', text: data.text });
            setTimeout(() => {
              void playSongForAi(query, { allowGlobal: false, userText: text });
            }, 280);
            return;
          }
          addChatMessage({ id: (Date.now() + 1).toString(), role: 'ai', text: data.text });
          return;
        }

        addChatMessage({ id: (Date.now() + 1).toString(), role: 'ai', text: data.text });

        if (data.type === 'skip') {
          playNext();
          return;
        }

        if (data.type === 'album') {
          const userQ = extractSongQuery(text);
          const q = data.albumQuery || data.songQuery
            || (userQ && userQ.trim()) || '';
          setTimeout(() => {
            void playAlbumForAi(q, { allowGlobal: true });
          }, 300);
          return;
        }

        if (data.type === 'play') {
          // 用户原话里的歌名优先；若模型给了 album: 则走专辑
          const userQ = extractSongQuery(text);
          let q = (userQ && userQ.trim()) ? userQ.trim() : (data.songQuery || '');
          if (/^album:/i.test(String(data.songQuery || ''))) {
            q = String(data.songQuery);
          }
          setTimeout(() => {
            void playSongForAi(q, { allowGlobal: true, userText: text });
          }, 300);
          return;
        }

        const query = extractSongQuery(text);
        if (query !== null) {
          setTimeout(() => {
            void playSongForAi(query, { allowGlobal: true, userText: text });
          }, 300);
        }
        return;
      }
    } catch {
      // fall through
    }

    const query = extractSongQuery(text);
    if (query !== null) {
      await playSongForAi(query, { allowGlobal: false, userText: text });
    } else {
      setTimeout(() => {
        addChatMessage({
          id: (Date.now() + 1).toString(),
          role: 'ai',
          text: '信号不稳。可点「导入 Key」配置 DeepSeek，或先登录后用「放 歌名」在歌单里点歌。',
        });
      }, 400);
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
      if (bestDist < 2.5) translation = best;
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
      {standbyVisible && (
        <StandbyScreen onWarmMain={warmMain} onDismiss={dismissStandby} />
      )}
      {mainActive && (
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
        {/* 未点播英雄层 ↔ 封面粒子交叉淡入淡出 */}
        <IdleHero active={!currentTrack} />
        {isPortaling && <PortalAnimation onComplete={endPortal} />}

        {/* 拖拽层: 未点播 (Hero 界面) 时放行点击, 让引导/外链按钮可点; 点播后接管拖拽 */}
        <div
          ref={layerRef}
          className={`absolute inset-0 z-[2] touch-none ${currentTrack ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
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
      )}
    </div>
  );
}
