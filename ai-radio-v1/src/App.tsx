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
import { searchLibrary, fetchDeepseekStatus } from './services/aiSettingsApi';
import { albumClarifySuggestions, findAlbumHint, parseAlbumQuery } from './utils/albumPlay';
import { parseSongQuery, extractSongQuery } from './utils/songMatch';
import { looksLikeArtistRequest, parseArtistQuery } from './utils/artistPlay';

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
    insertAndPlay, searchAndInsertPlay, searchAndInsertAlbum, searchAndInsertArtist, findInQueue,
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
        insertAndPlay({ ...lib.track, ephemeral: true }, bind.sessionKey);
        addChatMessage({
          id: (Date.now() + 2).toString(),
          role: 'ai',
          text: `◉  ${lib.message}`,
        });
        return true;
      }

      if (allowGlobal) {
        const found = await searchAndInsertAlbum(q, bind.sessionKey);
        if (found) {
          addChatMessage({
            id: (Date.now() + 2).toString(),
            role: 'ai',
            text: found.track.fromLibrary
              ? `◉  从专辑「${found.album}」抽了一首（你歌单里的版本）— ${found.track.title} by ${found.track.artist}`
              : `◉  从专辑「${found.album}」抽了一首 — ${found.track.title} by ${found.track.artist}`,
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
          : `◉  「${album}」听起来像一张专辑，我还没把握抽曲。${hint}`,
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
   * 歌手级点播 (第 2 项)：歌单里按艺人抽一首；没有则全网搜艺人（艺人必须命中）抽一首；
   * 都没有 → 诚实说明，绝不拿无关艺人凑。
   */
  const playArtistForAi = useCallback(async (
    query: string,
    opts: { allowGlobal?: boolean } = {},
  ) => {
    const allowGlobal = opts.allowGlobal === true;
    const bind = loadStoredBind();
    if (!bind?.sessionKey) {
      addChatMessage({
        id: (Date.now() + 2).toString(),
        role: 'ai',
        text: '请先在右侧扫码登录，再从歌单里抽歌。',
      });
      return false;
    }

    const q = String(query || '').replace(/^artist:\s*/i, '').trim();
    if (!q) return false;
    let { artist } = parseArtistQuery(q);
    // 「换一首他/她的歌」「其他他的歌」→ 代词，取当前播放曲目的歌手（没有就老实说）
    if (!artist || /^(?:他|她|它|他们|她们|这|那)$/.test(artist)) {
      const cur = currentTrack?.artist;
      if (cur) {
        artist = cur;
      } else {
        addChatMessage({
          id: (Date.now() + 2).toString(),
          role: 'ai',
          text: '现在没有在放任何歌，「他」指谁呢？可以点名说「放 XX 的歌」。',
        });
        return false;
      }
    }
    if (!artist) {
      addChatMessage({
        id: (Date.now() + 2).toString(),
        role: 'ai',
        text: '没听清要听谁的歌，再说一次？',
      });
      return false;
    }

    try {
      // 1) 歌单
      const lib = await searchLibrary(bind.sessionKey, q, 'artist');
      if (lib.track) {
        insertAndPlay({ ...lib.track, ephemeral: true }, bind.sessionKey);
        addChatMessage({
          id: (Date.now() + 2).toString(),
          role: 'ai',
          text: `◉  ${lib.message}`,
        });
        return true;
      }

      // 2) 全网（艺人必须命中，由 searchAndInsertArtist 保证）
      if (allowGlobal) {
        const found = await searchAndInsertArtist(q, bind.sessionKey);
        if (found) {
          addChatMessage({
            id: (Date.now() + 2).toString(),
            role: 'ai',
            text: found.fromLibrary
              ? `◉  歌单里没有 ${artist} 的歌，我全网找到一首（你歌单里的版本）— ${found.title} by ${found.artist}`
              : `◉  歌单里没有 ${artist} 的歌，我全网找了一首 — ${found.title} by ${found.artist}`,
          });
          return true;
        }
      }

      // 3) 诚实失败
      addChatMessage({
        id: (Date.now() + 2).toString(),
        role: 'ai',
        text: allowGlobal
          ? `全网也没找到 ${artist} 的歌 — 平台可能没收录这位歌手。`
          : `歌单里没有 ${artist} 的歌。导入 DeepSeek Key 后就能全网找。`,
      });
      return false;
    } catch (e) {
      addChatMessage({
        id: (Date.now() + 2).toString(),
        role: 'ai',
        text: e instanceof Error ? e.message : '歌手点播失败，请稍后重试。',
      });
      return false;
    }
  }, [insertAndPlay, searchAndInsertArtist, addChatMessage]);

  /**
   * AI 点歌策略：
   * 1) 未登录 → 引导登录（不再全网搜，避免 VIP 30s 试听）
   * 2) 已登录 → 先搜用户歌单（优先原曲/已收藏）
   * 3) 歌单没有且 allowGlobal → 再全网搜索
   * 4) 单曲全失败且像专辑 → 走 A+C 专辑抽曲 / 澄清
   */
  const playSongForAi = useCallback(async (
    query: string,
    opts: { allowGlobal?: boolean; userText?: string; triedNormalize?: boolean } = {},
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
    // 歌手级请求优先走歌手链路（artist: 前缀 / 「放 X 的歌」）
    if (/^artist:/i.test(q) || looksLikeArtistRequest(opts.userText || '', q)) {
      return playArtistForAi(q, { allowGlobal });
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
          text: `◉  在当前歌单找到了：${queued.title} — ${queued.artist}`,
        });
        return true;
      }

      // 2) 后端扫登录账号下的歌单曲库
      const lib = await searchLibrary(bind.sessionKey, q);
      if (lib.track) {
        insertAndPlay({ ...lib.track, ephemeral: true }, bind.sessionKey);
        addChatMessage({
          id: (Date.now() + 2).toString(),
          role: 'ai',
          text: `◉  ${lib.message}`,
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
            text: `同名歌曲有多个版本：${found.ambiguous.map((a) => `「${parseSongQuery(q).titlePart || q}」by ${a}`).join('，')}。告诉我要谁的，例如「放 ${parseSongQuery(q).titlePart || q} by 谁」。`,
          });
          return true;
        }
        if (found) {
          addChatMessage({
            id: (Date.now() + 2).toString(),
            role: 'ai',
            text: found.fromLibrary
              ? `◉  歌单里没有，但找到了你歌单里的版本 — ${found.title} by ${found.artist}`
              : `◉  歌单里没这首，我全网找了一首 — ${found.title} by ${found.artist}`,
          });
          return true;
        }
      }

      // 全网兜底失败：先试 AI 别名规范化（火星哥→Bruno Mars 等），再诚实说明
      if (allowGlobal && !opts.triedNormalize) {
        try {
          const nr = await fetch('/api/ai/normalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q }),
          });
          const nd = await nr.json();
          const normalized = String(nd?.normalized || '').trim();
          // 规范化结果必须和原查询不同才重试（防死循环），且仍走打分硬过滤
          if (normalized && normalized !== q && normalized.length <= 80) {
            addChatMessage({
              id: (Date.now() + 1).toString(),
              role: 'ai',
              text: `换个说法再找一次：「${normalized}」`,
            });
            return playSongForAi(normalized, { allowGlobal, triedNormalize: true, userText: q });
          }
        } catch {
          // 规范化失败不影响原话术
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
  }, [findInQueue, insertAndPlay, searchAndInsertPlay, playAlbumForAi, playArtistForAi, playNext, addChatMessage]);

  const handleSend = async (text: string) => {
    addChatMessage({ id: Date.now().toString(), role: 'user', text });

    // 第 6 项：前端强制本地解析点歌意图，命中即本地执行，模型只聊纯聊天
    // （修 模型漏写/乱写 PLAY:、闲聊误触发）
    const localQ = extractSongQuery(text);
    if (localQ !== null) {
      let allowGlobal = false;
      try {
        const st = await fetchDeepseekStatus();
        allowGlobal = st.configured;
      } catch {
        allowGlobal = false;
      }
      if (localQ === '') {
        // 纯切歌（换一首 / 随便来一首）
        playNext();
        addChatMessage({
          id: (Date.now() + 1).toString(),
          role: 'ai',
          text: '换一首，让思绪随节奏沉入深海。',
        });
        return;
      }
      // 第 11 项：先给即时反馈（首次扫库可能几秒），再执行
      addChatMessage({
        id: (Date.now() + 1).toString(),
        role: 'ai',
        text: `正在翻你的歌单，找「${localQ}」...`,
      });
      void playSongForAi(localQ, { allowGlobal, userText: text });
      return;
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-20),
          track: currentTrack,
          sessionKey: loadStoredBind()?.sessionKey || '',
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

        if (data.type === 'artist') {
          const q = data.artistQuery || data.songQuery || '';
          setTimeout(() => {
            void playArtistForAi(q, { allowGlobal: true });
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
