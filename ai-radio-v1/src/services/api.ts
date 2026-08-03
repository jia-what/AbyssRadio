const BASE = '';

export interface SearchResult {
  id: string;
  title: string;
  artist: string;
  cover: string;
  duration: number;
  source: string;
}

interface SearchResponse {
  songs: SearchResult[];
}

/**
 * Search music from the backend API.
 * source: 'netease' | 'kugou' | 'both'
 */
export async function searchMusic(
  keyword: string,
  source: 'netease' | 'kugou' | 'both' = 'both',
  limit = 10
): Promise<SearchResult[]> {
  const url = `/api/music/search?q=${encodeURIComponent(keyword)}&source=${source}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  const data: SearchResponse = await res.json();
  return data.songs ?? [];
}

/**
 * Get a playable URL for a song, with smart fallback across sources.
 * Tries Netease first, falls back to KuGou/Kuwo if it's a VIP trial.
 * @param keyword - search keyword for cross-source lookup
 * @param quality - KuGou quality tier: standard|exhigh|lossless|hires (default standard)
 */
export async function getMusicUrl(
  id: string,
  source: string,
  keyword?: string,
  sessionKey?: string,
  quality?: string
): Promise<string | null> {
  // Only netease + kugou — kuwo Meting returns error JSON strings, not stream URLs
  const sources = source === 'kugou' ? 'kugou,netease' : 'netease,kugou';
  let apiUrl = `/api/music/url-smart?id=${encodeURIComponent(id)}&sources=${encodeURIComponent(sources)}`;
  // Playlist-precision ids (hash|album_audio_id): never pass keyword — avoids wrong-song search fallback
  // keyword arrives as "artist\t title" — for search fallback, normalize to "title artist" (defect 8)
  if (keyword && !String(id).includes('|')) {
    const searchKw = String(keyword).includes('\t')
      ? String(keyword).split('\t').reverse().join(' ')
      : String(keyword);
    apiUrl += `&q=${encodeURIComponent(searchKw)}`;
  }
  if (sessionKey) apiUrl += `&key=${encodeURIComponent(sessionKey)}`;
  if (quality) apiUrl += `&quality=${encodeURIComponent(quality)}`;
  const res = await fetch(apiUrl);
  if (!res.ok) return null;
  const data = await res.json();
  const streamUrl = data.url ?? null;
  if (!streamUrl || !/^https?:\/\//i.test(String(streamUrl))) return null;
  let proxy = `/api/audio?url=${encodeURIComponent(streamUrl)}`;
  // KuGou VIP CDN often requires the bound session cookie on fetch
  if (sessionKey) proxy += `&key=${encodeURIComponent(sessionKey)}`;
  return proxy;
}

/**
 * Get lyrics for a song — returns line-level LRC plus word-level KRC (karaoke)
 * and a Netease-borrowed translation line when the source has none.
 */
export interface LyricPayload {
  lyric: string;
  krc: string;
  tlyric: string;
}

export async function getMusicLyric(
  id: string,
  source: string,
  trackName?: string,
  sessionKey?: string
): Promise<LyricPayload> {
  // Keyword travels as "artist<TAB>title" so the backend can borrow a Netease
  // translation with reliable artist/title splitting (defect 8).
  let url = `/api/music/lyric?id=${encodeURIComponent(id)}&source=${encodeURIComponent(source)}`;
  if (trackName) url += `&keyword=${encodeURIComponent(trackName)}`;
  if (sessionKey) url += `&key=${encodeURIComponent(sessionKey)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { lyric: '', krc: '', tlyric: '' };
    const data = await res.json();
    return {
      lyric: data.lyric ?? '',
      krc: data.krc ?? '',
      tlyric: data.tlyric ?? '',
    };
  } catch {
    return { lyric: '', krc: '', tlyric: '' };
  }
}
