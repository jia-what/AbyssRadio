import { useState, useRef, useCallback, useEffect } from 'react';
import type { Track } from '../types';
import { searchMusic, getMusicUrl, getMusicLyric, type SearchResult } from '../services/api';
import { parseLRC, findLyricIndex, type LyricLine } from '../utils/parseLRC';

const DEFAULT_PLAYLIST: Track[] = [
  { id: '1', title: 'Neon Dusk', artist: 'Abyss Collective', cover: '#1a0a2e-#16213e', duration: 187 },
  { id: '2', title: 'Depth Charge', artist: 'Luna Waveform', cover: '#0f0c29-#302b63', duration: 243 },
  { id: '3', title: 'Hydrostatic', artist: 'Mariana', cover: '#020111-#20124d', duration: 201 },
  { id: '4', title: 'Echo Locate', artist: 'Soma Drift', cover: '#0a0a2e-#1a1a4e', duration: 176 },
  { id: '5', title: 'Biolume', artist: 'Abyss Collective', cover: '#0b0b1a-#1a3a5c', duration: 214 },
];

const DEFAULT_LYRICS: Record<string, string[]> = {
  '1': [
    "under the neon dusk", "the city hums a low frequency", "streets of glass and rust",
    "we move like ghosts in memory", "the signal finds us anyway", "through static and decay",
    "neon dusk, hold me close", "before the light fades away",
  ],
  '2': [
    "descending into pressure", "where the light has never been", "silent bells of the abyss",
    "ringing somewhere within", "depth charge, depth charge", "waking something ancient",
    "in the crushing dark", "we listen for the spark",
  ],
  '3': [
    "hydrostatic equilibrium", "between the surface and the floor", "my lungs are full of ocean",
    "and I don't need air anymore", "the weight of all that water", "is holding me together",
    "hydrostatic, hear my voice", "I've made my choice",
  ],
  '4': [
    "echo locate, echo locate", "send a pulse into the void", "wait for it to resonate",
    "tell me I'm not destroyed", "the signal bounces back to me", "a ghost of what used to be",
    "echo locate, I'm still here", "barely alive but clear",
  ],
  '5': [
    "biolume, biolume", "light from where the sun can't reach", "every cell a tiny moon",
    "teaching creatures how to speak", "in the dark we make our own", "a frequency unknown",
    "biolume, biolume", "we bloom inside the gloom",
  ],
};

function searchResultToTrack(s: SearchResult): Track {
  return {
    id: s.id, title: s.title, artist: s.artist || 'Unknown',
    cover: s.cover || '#0a0a1a-#050508', duration: s.duration || 200,
  };
}

export function useRadioState() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [messages, setMessages] = useState<{ id: string; role: string; text: string }[]>([]);
  const [isPortaling, setIsPortaling] = useState(false);

  const [playlist, setPlaylist] = useState<Track[]>(DEFAULT_PLAYLIST);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);

  const [trackSources, setTrackSources] = useState<Record<string, string>>({});
  const [lyricLines, setLyricLines] = useState<LyricLine[]>([]);
  const [realDuration, setRealDuration] = useState(0); // actual audio duration from <audio>

  const audioRef = useRef<HTMLAudioElement | null>(null);
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

  useEffect(() => { playlistRef.current = playlist; }, [playlist]);
  useEffect(() => { trackIndexRef.current = currentTrackIndex; }, [currentTrackIndex]);
  useEffect(() => { lyricLinesRef.current = lyricLines; }, [lyricLines]);
  useEffect(() => { trackSourcesRef.current = trackSources; }, [trackSources]);

  const currentTrack = playlist[currentTrackIndex] ?? null;
  const duration = currentTrack?.duration ?? 0;

  // ===== Audio element setup =====
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;

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
      console.warn('Audio error, falling back to simulated playback');
    };

    return () => {
      clearInterval(interval);
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, []);

  // Volume sync
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // ===== Load and play a real audio track =====
  const loadAndPlayTrack = useCallback(async (trackId: string, source: string, trackName?: string) => {
    try {
      const [url, lrcRaw] = await Promise.all([
        getMusicUrl(trackId, source, trackName, sessionKeyRef.current),
        getMusicLyric(trackId, source),
      ]);

      const parsed = parseLRC(lrcRaw);
      setLyricLines(parsed);

      const audio = audioRef.current;
      if (url && audio) {
        audio.src = url;
        audio.currentTime = 0;
        await audio.play();
        // If audio.duration is known immediately, use it
        if (audio.duration && audio.duration > 0 && audio.duration !== Infinity) {
          setRealDuration(audio.duration);
        }
        setIsPlaying(true);
        isPlayingRef.current = true;
        progressRef.current = 0;
        setProgress(0);
      } else {
        startSimulatedPlayback();
      }
    } catch {
      startSimulatedPlayback();
    }
  }, []);

  const startSimulatedPlayback = useCallback(() => {
    isPlayingRef.current = true;
    setIsPlaying(true);
    setRealDuration(duration);
    lastTickRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
  }, [duration]);

  const stopSimulatedPlayback = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    cancelAnimationFrame(rafRef.current);
  }, []);

  const tick = useCallback((timestamp: number) => {
    if (!isPlayingRef.current) return;
    if (!lastTickRef.current) lastTickRef.current = timestamp;
    const delta = (timestamp - lastTickRef.current) / 1000;
    lastTickRef.current = timestamp;
    const tracks = playlistRef.current;
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

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.src) {
      if (audio.paused) { audio.play(); setIsPlaying(true); isPlayingRef.current = true; }
      else { audio.pause(); setIsPlaying(false); isPlayingRef.current = false; }
    } else {
      if (isPlayingRef.current) stopSimulatedPlayback();
      else startSimulatedPlayback();
    }
  }, [startSimulatedPlayback, stopSimulatedPlayback]);

  // Keep playNextRef in sync so audio.onended always calls latest
  const playNext = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const tracks = playlistRef.current;
    const nextIndex = (trackIndexRef.current + 1) % tracks.length;
    trackIndexRef.current = nextIndex;
    setCurrentTrackIndex(nextIndex);
    setRealDuration(0);
    const nextTrack = tracks[nextIndex];
    if (nextTrack && trackSourcesRef.current[nextTrack.id]) {
      const audio = audioRef.current;
      if (audio) { audio.pause(); audio.src = ''; }
      loadAndPlayTrack(nextTrack.id, trackSourcesRef.current[nextTrack.id], `${nextTrack.title} ${nextTrack.artist}`);
    } else {
      const audio = audioRef.current;
      if (audio) { audio.pause(); audio.src = ''; }
      progressRef.current = 0; setProgress(0);
      lastTickRef.current = 0;
      if (isPlayingRef.current) rafRef.current = requestAnimationFrame(tick);
    }
  }, [tick, trackSources, loadAndPlayTrack]);
  useEffect(() => { playNextRef.current = playNext; }, [playNext]);

  const playPrev = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const tracks = playlistRef.current;
    const prevIndex = (trackIndexRef.current - 1 + tracks.length) % tracks.length;
    trackIndexRef.current = prevIndex;
    setCurrentTrackIndex(prevIndex);
    setRealDuration(0);
    const prevTrack = tracks[prevIndex];
    if (prevTrack && trackSourcesRef.current[prevTrack.id]) {
      const audio = audioRef.current;
      if (audio) audio.pause();
      loadAndPlayTrack(prevTrack.id, trackSourcesRef.current[prevTrack.id], `${prevTrack.title} ${prevTrack.artist}`);
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
      setRealDuration(0);
      const audio = audioRef.current;
      if (audio) { audio.pause(); audio.src = ''; }
      cancelAnimationFrame(rafRef.current);
      trackIndexRef.current = 0;
      setCurrentTrackIndex(0);
      progressRef.current = 0; setProgress(0);
      const first = results[0];
      // Skip to a random song from results instead of always playing the first
      const randomIndex = Math.floor(Math.random() * Math.min(tracks.length, 10));
      trackIndexRef.current = randomIndex;
      setCurrentTrackIndex(randomIndex);
      const chosen = results[randomIndex];
      loadAndPlayTrack(chosen.id, chosen.source || 'netease', chosen.title + ' ' + (chosen.artist || ''));
      return tracks[randomIndex];
    } catch { return null; }
  }, [loadAndPlayTrack]);

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
      cover: t.cover || '#0a0a1a-#050508', duration: t.duration || 200,
    }));
    const sources: Record<string, string> = {};
    tracks.forEach(t => { sources[t.id] = t.source || 'netease'; });

    cancelAnimationFrame(rafRef.current);
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.src = ''; }

    sessionKeyRef.current = sessionKey || '';
    playlistRef.current = queue;
    trackSourcesRef.current = sources;
    setPlaylist(queue);
    setTrackSources(sources);
    setLyricLines([]);
    setRealDuration(0);
    trackIndexRef.current = idx;
    setCurrentTrackIndex(idx);
    progressRef.current = 0;
    setProgress(0);

    const chosen = tracks[idx];
    loadAndPlayTrack(chosen.id, chosen.source || 'netease', `${chosen.title} ${chosen.artist}`);
  }, [loadAndPlayTrack]);

  const requestSong = useCallback((query: string) => {
    const lower = query.toLowerCase();
    const tracks = playlistRef.current;
    let idx = tracks.findIndex(t =>
      t.title.toLowerCase().includes(lower) || t.artist.toLowerCase().includes(lower)
    );
    if (idx === -1) idx = Math.floor(Math.random() * tracks.length);
    trackIndexRef.current = idx;
    setCurrentTrackIndex(idx);
    setRealDuration(0);
    const track = tracks[idx];
    if (track && trackSources[track.id]) {
      const audio = audioRef.current;
      if (audio) audio.pause();
      loadAndPlayTrack(track.id, trackSources[track.id]);
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

  // ===== Lyrics =====
  const trackId = currentTrack?.id ?? '';
  let trackLyrics: string[];
  let lyricIndex: number;

  if (lyricLines.length > 0) {
    trackLyrics = lyricLines.map(l => l.text);
    lyricIndex = findLyricIndex(lyricLines, currentTime);
  } else if (DEFAULT_LYRICS[trackId]) {
    trackLyrics = DEFAULT_LYRICS[trackId];
    lyricIndex = trackLyrics.length > 0
      ? Math.min(Math.floor((progress / 100) * trackLyrics.length), trackLyrics.length - 1)
      : -1;
  } else {
    trackLyrics = [];
    lyricIndex = -1;
  }

  return {
    isPlaying, messages, isPortaling,
    currentTrack, playlist, progress, currentTime, duration, volume, isMuted,
    trackLyrics, lyricIndex, lyricLines, realDuration: displayDuration,
    togglePlay, playNext, playPrev, seek, seekToTime, setVolumeValue, toggleMute,
    requestSong, searchAndPlay, playPlaylist,
    addChatMessage: (msg: { id: string; role: string; text: string }) => setMessages(prev => [...prev, msg]),
    endPortal: () => setIsPortaling(false),
  };
}
