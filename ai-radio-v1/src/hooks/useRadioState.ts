import { useState, useRef, useCallback, useEffect } from 'react';
import type { Track } from '../types';
import { searchMusic, getMusicUrl, getMusicLyric, type SearchResult } from '../services/api';
import { parseLRC, parseKRC, findLyricIndex, type LyricLine } from '../utils/parseLRC';
import { pickBestTrack, parseSongQuery, MIN_SONG_SCORE } from '../utils/songMatch';
import { parseAlbumQuery, pickAlbumTrack } from '../utils/albumPlay';
import { parseArtistQuery, pickArtistTrack } from '../utils/artistPlay';

function searchResultToTrack(s: SearchResult): Track {
  return {
    id: s.id, title: s.title, artist: s.artist || 'Unknown',
    cover: s.cover || '', duration: s.duration || 200,
  };
}

export function useRadioState() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [messages, setMessages] = useState<{ id: string; role: string; text: string }[]>([]);
  const [isPortaling, setIsPortaling] = useState(false);

  // 空队列起步：无假专辑/假歌词；扫码点播后 playPlaylist / searchAndPlay 注入真曲
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);

  const [trackSources, setTrackSources] = useState<Record<string, string>>({});
  const [lyricLines, setLyricLines] = useState<LyricLine[]>([]);
  const [translationLines, setTranslationLines] = useState<LyricLine[]>([]);
  const [lyricMode, setLyricMode] = useState<'off' | 'original' | 'dual'>('dual');
  /** Netease free-trial clip info (trial=true → URL is a 30s/60s preview) */
  const [trialInfo, setTrialInfo] = useState<{ trial: boolean; trialLen: number } | null>(null);
  const [realDuration, setRealDuration] = useState(0); // actual audio duration from <audio>
  const [isSimulatedPlayback, setIsSimulatedPlayback] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pulseAnalyserRef = useRef<AnalyserNode | null>(null);
  const beatAnalyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const pulseCtxRef = useRef<AudioContext | null>(null);
  const isPlayingRef = useRef(false);
  const progressRef = useRef(0);
  const rafRef = useRef(0);
  const lastTickRef = useRef(0);
  const trackIndexRef = useRef(0);
  const playlistRef = useRef(playlist);
  const lyricLinesRef = useRef<LyricLine[]>([]);
  const playNextRef = useRef<() => void>(() => {});
  const trackSourcesRef = useRef(trackSources);
  const sessionKeyRef = useRef<string>('');
  const loadGenRef = useRef(0);
  const lastAdvanceRef = useRef(0);
  const tickRef = useRef<(timestamp: number) => void>(() => {});

  useEffect(() => { playlistRef.current = playlist; }, [playlist]);
  useEffect(() => { trackIndexRef.current = currentTrackIndex; }, [currentTrackIndex]);
  useEffect(() => { lyricLinesRef.current = lyricLines; }, [lyricLines]);
  useEffect(() => { trackSourcesRef.current = trackSources; }, [trackSources]);

  const currentTrack = playlist[currentTrackIndex] ?? null;
  const duration = currentTrack?.duration ?? 0;

  const clearAudioSrc = useCallback((audio: HTMLAudioElement) => {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }, []);

  const resumePulseCtx = useCallback(() => {
    void pulseCtxRef.current?.resume();
  }, []);

  // ===== Audio element setup =====
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;

    // Main analyser (smooth bands) + beat analyser (sharp kick) — Mineradio wiring.
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      const beatAnalyser = ctx.createAnalyser();
      const gainNode = ctx.createGain();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.58;
      beatAnalyser.fftSize = 2048;
      beatAnalyser.smoothingTimeConstant = 0.1;

      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      source.connect(beatAnalyser);
      analyser.connect(gainNode);
      gainNode.connect(ctx.destination);

      pulseCtxRef.current = ctx;
      pulseAnalyserRef.current = analyser;
      beatAnalyserRef.current = beatAnalyser;
      gainNodeRef.current = gainNode;
      gainNode.gain.value = volume;

      audio.addEventListener('playing', () => { void ctx.resume(); });
    } catch (err) {
      console.warn('Pulse analyser unavailable:', err);
    }

    audio.ontimeupdate = () => {
      if (audio.duration && audio.duration > 0 && audio.duration !== Infinity) {
        const pct = (audio.currentTime / audio.duration) * 100;
        progressRef.current = pct;
        setProgress(pct);
        setRealDuration(audio.duration);
      }
    };

    // High-frequency currentTime updates for lyrics
    const interval = setInterval(() => {
      if (audio.src && !audio.paused && audio.duration && audio.duration > 0 && audio.duration !== Infinity) {
        const pct = (audio.currentTime / audio.duration) * 100;
        // Only update if meaningful change
        if (Math.abs(pct - progressRef.current) > 0.5) {
          progressRef.current = pct;
          setProgress(pct);
        }
      }
    }, 100);

    audio.onloadedmetadata = () => {
      if (audio.duration && audio.duration > 0 && audio.duration !== Infinity) {
        setRealDuration(audio.duration);
      }
    };

    audio.onended = () => {
      // Use ref to avoid stale closure
      const fn = playNextRef.current;
      if (fn) fn();
    };

    audio.onerror = () => {
      const track = playlistRef.current[trackIndexRef.current];
      const hasRealSource = !!(track && trackSourcesRef.current[track.id]);
      clearAudioSrc(audio);
      if (hasRealSource) {
        console.warn('音频加载失败，以歌词模式继续');
        if (!isPlayingRef.current) {
          isPlayingRef.current = true;
          setIsPlaying(true);
        }
        setIsSimulatedPlayback(true);
        cancelAnimationFrame(rafRef.current);
        lastTickRef.current = 0;
        rafRef.current = requestAnimationFrame(ts => tickRef.current(ts));
        return;
      }
      console.warn('Audio error, falling back to simulated playback');
      if (isPlayingRef.current) {
        cancelAnimationFrame(rafRef.current);
        lastTickRef.current = 0;
        rafRef.current = requestAnimationFrame(ts => tickRef.current(ts));
      }
    };

    return () => {
      clearInterval(interval);
      audio.pause();
      audio.src = '';
      audioRef.current = null;
      pulseAnalyserRef.current = null;
      beatAnalyserRef.current = null;
      gainNodeRef.current = null;
      void pulseCtxRef.current?.close();
      pulseCtxRef.current = null;
    };
  }, [clearAudioSrc]);

  // Volume via GainNode — audio.volume is ignored once MediaElementSource is wired.
  useEffect(() => {
    const gain = gainNodeRef.current;
    if (gain) gain.gain.value = isMuted ? 0 : volume;
    if (audioRef.current) audioRef.current.volume = 1;
  }, [volume, isMuted]);

  const tick = useCallback((timestamp: number) => {
    if (!isPlayingRef.current) return;
    const tracks = playlistRef.current;
    if (tracks.length === 0) return;
    if (!lastTickRef.current) lastTickRef.current = timestamp;
    const delta = (timestamp - lastTickRef.current) / 1000;
    lastTickRef.current = timestamp;
    const trackDuration = tracks[trackIndexRef.current]?.duration ?? 1;
    const newProgress = Math.min(progressRef.current + (delta / trackDuration) * 100, 100);
    progressRef.current = newProgress;
    setProgress(newProgress);
    if (newProgress >= 100) {
      const nextIndex = (trackIndexRef.current + 1) % tracks.length;
      trackIndexRef.current = nextIndex;
      setCurrentTrackIndex(nextIndex);
      progressRef.current = 0; setProgress(0);
      lastTickRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => { tickRef.current = tick; }, [tick]);

  const startSimulatedPlayback = useCallback(() => {
    isPlayingRef.current = true;
    setIsPlaying(true);
    setIsSimulatedPlayback(true);
    setRealDuration(duration);
    lastTickRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
  }, [duration, tick]);

  const stopSimulatedPlayback = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsSimulatedPlayback(false);
    cancelAnimationFrame(rafRef.current);
  }, []);

  // ===== Load and play a real audio track =====
  const loadAndPlayTrack = useCallback(async (trackId: string, source: string, trackName?: string) => {
    const gen = ++loadGenRef.current;
    resumePulseCtx();
    try {
      const [url, lrcPayload] = await Promise.all([
        // Always request the highest available quality — server falls back down
        // the chain (hires → lossless → exhigh → standard) per track's rights.
        getMusicUrl(trackId, source, trackName, sessionKeyRef.current, 'hires'),
        getMusicLyric(trackId, source, trackName, sessionKeyRef.current),
      ]);

      if (gen !== loadGenRef.current) return;

      const tracks = playlistRef.current;
      const idx = trackIndexRef.current;
      if (tracks[idx]?.id !== trackId) return;

      const parsed = parseLRC(lrcPayload.lyric);
      const parsedKrc = parseKRC(lrcPayload.krc);
      setLyricLines(parsedKrc.length > 0 ? parsedKrc : parsed);
      setTranslationLines(parseLRC(lrcPayload.tlyric));

      const audio = audioRef.current;
      const stream = url?.url ?? null;
      if (stream && audio) {
        if (gen !== loadGenRef.current) return;
        setIsSimulatedPlayback(false);
        // Netease free-trial clip → still playable; keep trial flag visible to UI
        setTrialInfo(url?.trial ? { trial: true, trialLen: url.trialLen } : null);
        audio.src = stream;
        audio.currentTime = 0;
        await audio.play();
        if (gen !== loadGenRef.current) {
          audio.pause();
          return;
        }
        if (audio.duration && audio.duration > 0 && audio.duration !== Infinity) {
          setRealDuration(audio.duration);
        }
        setIsPlaying(true);
        isPlayingRef.current = true;
        progressRef.current = 0;
        setProgress(0);
      } else {
        if (gen !== loadGenRef.current) return;
        const hasRealSource = !!trackSourcesRef.current[trackId];
        if (hasRealSource) {
          console.warn('无法获取播放地址，以歌词模式继续（无音频）');
        }
        startSimulatedPlayback();
      }
    } catch (err) {
      if (gen !== loadGenRef.current) return;
      console.warn('loadAndPlayTrack failed:', err);
      const audio = audioRef.current;
      if (audio) clearAudioSrc(audio);
      startSimulatedPlayback();
    }
  }, [startSimulatedPlayback, clearAudioSrc, resumePulseCtx]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.src) {
      resumePulseCtx();
      if (audio.paused) { void audio.play(); setIsPlaying(true); isPlayingRef.current = true; }
      else { audio.pause(); setIsPlaying(false); isPlayingRef.current = false; }
      return;
    }
    const tracks = playlistRef.current;
    if (tracks.length === 0) return;
    const track = tracks[trackIndexRef.current];
    const src = track && trackSourcesRef.current[track.id];
    if (src) {
      resumePulseCtx();
      if (isPlayingRef.current) {
        stopSimulatedPlayback();
      } else {
        loadAndPlayTrack(track.id, src, `${track.artist}\t${track.title}`);
      }
      return;
    }
    if (isPlayingRef.current) stopSimulatedPlayback();
    else startSimulatedPlayback();
  }, [startSimulatedPlayback, stopSimulatedPlayback, resumePulseCtx, loadAndPlayTrack]);

  // Keep playNextRef in sync so audio.onended always calls latest
  const playNext = useCallback(() => {
    const tracks = playlistRef.current;
    if (tracks.length === 0) return;
    const now = Date.now();
    if (now - lastAdvanceRef.current < 600) return;
    lastAdvanceRef.current = now;

    cancelAnimationFrame(rafRef.current);
    loadGenRef.current += 1;
    const nextIndex = (trackIndexRef.current + 1) % tracks.length;
    trackIndexRef.current = nextIndex;
    setCurrentTrackIndex(nextIndex);
    setRealDuration(0);
    progressRef.current = 0;
    setProgress(0);
    const nextTrack = tracks[nextIndex];
    if (nextTrack && trackSourcesRef.current[nextTrack.id]) {
      const audio = audioRef.current;
      if (audio) { audio.pause(); audio.src = ''; }
      loadAndPlayTrack(nextTrack.id, trackSourcesRef.current[nextTrack.id], `${nextTrack.artist}\t${nextTrack.title}`);
    } else {
      const audio = audioRef.current;
      if (audio) { audio.pause(); audio.src = ''; }
      progressRef.current = 0; setProgress(0);
      lastTickRef.current = 0;
      if (isPlayingRef.current) rafRef.current = requestAnimationFrame(tick);
    }
  }, [tick, loadAndPlayTrack]);
  useEffect(() => { playNextRef.current = playNext; }, [playNext]);

  const playPrev = useCallback(() => {
    const tracks = playlistRef.current;
    if (tracks.length === 0) return;
    lastAdvanceRef.current = Date.now();
    cancelAnimationFrame(rafRef.current);
    loadGenRef.current += 1;
    const prevIndex = (trackIndexRef.current - 1 + tracks.length) % tracks.length;
    trackIndexRef.current = prevIndex;
    setCurrentTrackIndex(prevIndex);
    setRealDuration(0);
    progressRef.current = 0;
    setProgress(0);
    const prevTrack = tracks[prevIndex];
    if (prevTrack && trackSourcesRef.current[prevTrack.id]) {
      const audio = audioRef.current;
      if (audio) { audio.pause(); audio.src = ''; }
      loadAndPlayTrack(prevTrack.id, trackSourcesRef.current[prevTrack.id], `${prevTrack.artist}\t${prevTrack.title}`);
    } else {
      const audio = audioRef.current;
      if (audio) { audio.pause(); audio.src = ''; }
      progressRef.current = 0; setProgress(0);
      lastTickRef.current = 0;
      if (isPlayingRef.current) rafRef.current = requestAnimationFrame(tick);
    }
  }, [tick, trackSources, loadAndPlayTrack]);

  const seek = useCallback((pct: number) => {
    const audio = audioRef.current;
    if (audio && audio.duration && audio.duration > 0 && audio.duration !== Infinity) {
      audio.currentTime = (pct / 100) * audio.duration;
    }
    progressRef.current = pct;
    setProgress(pct);
    lastTickRef.current = 0;
    if (!audio?.src && isPlayingRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [tick]);

  const seekToTime = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (audio && audio.duration && audio.duration > 0 && audio.duration !== Infinity) {
      audio.currentTime = seconds;
    } else {
      // Simulated: convert time to progress percentage
      const d = duration || 1;
      const pct = (seconds / d) * 100;
      seek(pct);
    }
  }, [seek, duration]);

  const setVolumeValue = useCallback((v: number) => {
    setVolume(v);
    if (v > 0 && isMuted) setIsMuted(false);
  }, [isMuted]);

  const toggleMute = useCallback(() => setIsMuted(v => !v), []);

  // ===== Search and play =====
  const searchAndPlay = useCallback(async (query: string): Promise<Track | null> => {
    try {
      const results = await searchMusic(query, 'both', 10);
      if (!results || results.length === 0) return null;
      const tracks = results.map(searchResultToTrack);
      const sources: Record<string, string> = {};
      results.forEach(r => { sources[r.id] = r.source; });
      setTrackSources(sources);
      setPlaylist(tracks);
      setLyricLines([]);
      setTranslationLines([]);
      setTrialInfo(null);
      setRealDuration(0);
      const audio = audioRef.current;
      if (audio) { audio.pause(); audio.src = ''; }
      cancelAnimationFrame(rafRef.current);
      loadGenRef.current += 1;
      trackIndexRef.current = 0;
      setCurrentTrackIndex(0);
      progressRef.current = 0; setProgress(0);
      // Skip to a random song from results instead of always playing the first
      const randomIndex = Math.floor(Math.random() * Math.min(tracks.length, 10));
      trackIndexRef.current = randomIndex;
      setCurrentTrackIndex(randomIndex);
      const chosen = results[randomIndex];
      loadAndPlayTrack(chosen.id, chosen.source || 'netease', (chosen.artist || '') + '\t' + chosen.title);
      return tracks[randomIndex];
    } catch { return null; }
  }, [loadAndPlayTrack]);

  /**
   * 在当前播放队列里找歌（用户正在听的那张歌单），优先于后端扫库 / 全网。
   * 命中则用队列里的 id+source，避免全网搜到「同名不同源」。
   */
  const findInQueue = useCallback((query: string) => {
    const q = String(query || '').trim();
    if (!q) return null;
    const hit = pickBestTrack(playlistRef.current, q, MIN_SONG_SCORE);
    if (!hit) return null;
    const t = hit.track;
    const source = trackSourcesRef.current[t.id];
    if (!source) return null;
    return {
      id: t.id,
      title: t.title,
      artist: t.artist,
      cover: t.cover || '',
      duration: t.duration || 200,
      source,
    };
  }, []);

  /**
   * AI 插播：只把这一首插到当前曲后面并立刻播放；
   * 下一首 / 播完仍回到原歌单顺序（不会整队替换成单曲或一堆翻唱）。
   */
  const insertAndPlay = useCallback((
    track: { id: string; title: string; artist: string; cover: string; duration: number; source: string },
    sessionKey?: string,
  ): Track | null => {
    if (!track?.id) return null;
    if (sessionKey) sessionKeyRef.current = sessionKey;

    const incoming: Track = {
      id: track.id,
      title: track.title,
      artist: track.artist || 'Unknown',
      cover: track.cover || '',
      duration: track.duration || 200,
    };
    const source = track.source || 'netease';
    const queue = [...playlistRef.current];
    const sources = { ...trackSourcesRef.current, [incoming.id]: source };

    let playIdx: number;
    const existingIdx = queue.findIndex((t) => String(t.id) === String(incoming.id));
    if (existingIdx >= 0) {
      // Already in queue — jump there, keep order
      playIdx = existingIdx;
    } else if (queue.length === 0) {
      queue.push(incoming);
      playIdx = 0;
    } else {
      const cur = Math.max(0, Math.min(trackIndexRef.current, queue.length - 1));
      queue.splice(cur + 1, 0, incoming);
      playIdx = cur + 1;
    }

    cancelAnimationFrame(rafRef.current);
    loadGenRef.current += 1;
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.src = ''; }

    playlistRef.current = queue;
    trackSourcesRef.current = sources;
    setPlaylist(queue);
    setTrackSources(sources);
    setLyricLines([]);
    setTranslationLines([]);
    setTrialInfo(null);
    setRealDuration(0);
    trackIndexRef.current = playIdx;
    setCurrentTrackIndex(playIdx);
    progressRef.current = 0;
    setProgress(0);

    loadAndPlayTrack(incoming.id, source, `${incoming.artist}\t${incoming.title}`);
    return incoming;
  }, [loadAndPlayTrack]);

  /** 全网搜一首最优结果并插播；歌名对不上宁可不播，绝不拿第一首凑数 */
  const searchAndInsertPlay = useCallback(async (
    query: string,
    sessionKey?: string,
  ): Promise<Track | { ambiguous: string[] } | null> => {
    try {
      const q = String(query || '').trim();
      if (!q) return null;
      // 拆词：搜「歌名」，艺人只做硬过滤（修 "HABIBTI by Drake" 整串搜索搜不到）
      const { titlePart, artistPart } = parseSongQuery(q);
      const searchTerm = titlePart || q;
      const results = await searchMusic(searchTerm, 'both', 12);
      if (!results || results.length === 0) return null;

      // 同名歧义检测：与查询同名的候选里出现多个不同艺人 → 不猜，交上层澄清
      // （修 播放 HABIBTI → 乱播 Ard Adz；宁可多问一句，绝不猜曲）
      const normT = (s: string) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
      const nq = normT(titlePart || q);
      const sameTitle = results.filter((r) => normT(r.title || '') === nq || (nq.length >= 3 && normT(r.title || '').includes(nq)));
      if (sameTitle.length > 1) {
        const artists = [...new Set(sameTitle.map((r) => (r.artist || '').trim()).filter(Boolean))];
        if (artists.length > 1) return { ambiguous: artists.slice(0, 4) };
      }

      // 与歌单同一套打分：必须歌名命中；带艺人必须匹配（否决制）；禁止 fallback 到 results[0]
      const hit = pickBestTrack(results, q, MIN_SONG_SCORE);
      if (!hit) return null;

      const chosen = hit.track;
      return insertAndPlay({
        id: chosen.id,
        title: chosen.title,
        artist: chosen.artist || '',
        cover: chosen.cover || '',
        duration: chosen.duration || 200,
        source: chosen.source || 'netease',
      }, sessionKey);
    } catch {
      return null;
    }
  }, [insertAndPlay]);

  /** 专辑抽曲：全网结果按 album 字段 / 提示曲目过滤，没把握则返回 null（由上层澄清） */
  const searchAndInsertAlbum = useCallback(async (
    albumQuery: string,
    sessionKey?: string,
  ): Promise<{ track: Track; album: string } | null> => {
    try {
      const { album, artist, raw } = parseAlbumQuery(albumQuery);
      if (!album) return null;
      const results = await searchMusic(`${album} ${artist || ''}`.trim(), 'both', 16);
      if (!results?.length) return null;
      const chosen = pickAlbumTrack(results, album, artist);
      if (!chosen) return null;
      const track = insertAndPlay({
        id: chosen.id,
        title: chosen.title,
        artist: chosen.artist || '',
        cover: chosen.cover || '',
        duration: chosen.duration || 200,
        source: chosen.source || 'netease',
      }, sessionKey);
      return track ? { track, album: album || raw } : null;
    } catch {
      return null;
    }
  }, [insertAndPlay]);

  /** 歌手级全网抽曲：搜歌手名，结果艺人必须命中，随机抽一首；无把握返回 null */
  const searchAndInsertArtist = useCallback(async (
    artistQuery: string,
    sessionKey?: string,
  ): Promise<Track | null> => {
    try {
      const { artist } = parseArtistQuery(artistQuery);
      if (!artist) return null;
      const results = await searchMusic(artist, 'both', 16);
      if (!results?.length) return null;
      const chosen = pickArtistTrack(results, artist);
      if (!chosen) return null;
      return insertAndPlay({
        id: chosen.id,
        title: chosen.title,
        artist: chosen.artist || '',
        cover: chosen.cover || '',
        duration: chosen.duration || 200,
        source: chosen.source || 'netease',
      }, sessionKey);
    } catch {
      return null;
    }
  }, [insertAndPlay]);

  // ===== Play a real playlist in order (queue = the playlist itself) =====
  const playPlaylist = useCallback((
    tracks: { id: string; title: string; artist: string; cover: string; duration: number; source: string }[],
    startIndex: number,
    sessionKey: string,
  ) => {
    if (!tracks || tracks.length === 0) return;
    const idx = Math.max(0, Math.min(startIndex, tracks.length - 1));
    const queue: Track[] = tracks.map(t => ({
      id: t.id, title: t.title, artist: t.artist || 'Unknown',
      cover: t.cover || '', duration: t.duration || 200,
    }));
    const sources: Record<string, string> = {};
    tracks.forEach(t => { sources[t.id] = t.source || 'netease'; });

    cancelAnimationFrame(rafRef.current);
    loadGenRef.current += 1;
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.src = ''; }

    sessionKeyRef.current = sessionKey || '';
    playlistRef.current = queue;
    trackSourcesRef.current = sources;
    setPlaylist(queue);
    setTrackSources(sources);
    setLyricLines([]);
    setTranslationLines([]);
    setTrialInfo(null);
    setRealDuration(0);
    trackIndexRef.current = idx;
    setCurrentTrackIndex(idx);
    progressRef.current = 0;
    setProgress(0);

    const chosen = tracks[idx];
    loadAndPlayTrack(chosen.id, chosen.source || 'netease', `${chosen.artist}\t${chosen.title}`);
  }, [loadAndPlayTrack]);

  const requestSong = useCallback((query: string) => {
    const tracks = playlistRef.current;
    if (tracks.length === 0) return null;
    const lower = query.toLowerCase();
    let idx = tracks.findIndex(t =>
      t.title.toLowerCase().includes(lower) || t.artist.toLowerCase().includes(lower)
    );
    if (idx === -1) idx = Math.floor(Math.random() * tracks.length);
    trackIndexRef.current = idx;
    setCurrentTrackIndex(idx);
    setRealDuration(0);
    progressRef.current = 0;
    setProgress(0);
    const track = tracks[idx];
    if (track && trackSources[track.id]) {
      const audio = audioRef.current;
      if (audio) { audio.pause(); audio.src = ''; }
      loadAndPlayTrack(track.id, trackSources[track.id], `${track.artist}\t${track.title}`);
    } else {
      const audio = audioRef.current;
      if (audio) { audio.pause(); audio.src = ''; }
      progressRef.current = 0; setProgress(0);
      lastTickRef.current = 0;
      if (isPlayingRef.current) rafRef.current = requestAnimationFrame(tick);
    }
    return tracks[idx];
  }, [tick, trackSources, loadAndPlayTrack]);

  // Cleanup
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ===== currentTime — from Audio if available =====
  const audio = audioRef.current;
  const hasRealAudio = !!(audio?.src && audio?.duration && audio.duration > 0 && audio.duration !== Infinity);
  const currentTime = hasRealAudio ? audio!.currentTime : (progress / 100) * duration;
  const displayDuration = hasRealAudio ? audio!.duration : (realDuration || duration);

  // ===== Lyrics（仅真歌词；不再塞 demo 假词）=====
  const trackLyrics = lyricLines.length > 0 ? lyricLines.map(l => l.text) : [];
  const lyricIndex = lyricLines.length > 0 ? findLyricIndex(lyricLines, currentTime) : -1;

  return {
    isPlaying, messages, isPortaling,
    currentTrack, playlist, progress, currentTime, duration, volume, isMuted,
    trackLyrics, lyricIndex, lyricLines, realDuration: displayDuration,
    translationLines, lyricMode, setLyricMode, trialInfo,
    isDemoPlayback: isSimulatedPlayback && isPlaying,
    audioRef,
    pulseAnalyserRef,
    beatAnalyserRef,
    togglePlay, playNext, playPrev, seek, seekToTime, setVolumeValue, toggleMute,
    requestSong, searchAndPlay, searchAndInsertPlay, searchAndInsertAlbum, searchAndInsertArtist, insertAndPlay, findInQueue, playPlaylist,
    addChatMessage: (msg: { id: string; role: string; text: string }) => setMessages(prev => [...prev, msg]),
    endPortal: () => setIsPortaling(false),
  };
}
