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
 */
export async function getMusicUrl(
  id: string,
  source: string,
  keyword?: string,
  sessionKey?: string
): Promise<string | null> {
  let apiUrl = `/api/music/url-smart?id=${encodeURIComponent(id)}&sources=${encodeURIComponent(source)},kugou,kuwo`;
  if (keyword) apiUrl += `&q=${encodeURIComponent(keyword)}`;
  if (sessionKey) apiUrl += `&key=${encodeURIComponent(sessionKey)}`;
  const res = await fetch(apiUrl);
  if (!res.ok) return null;
  const data = await res.json();
  const streamUrl = data.url ?? null;
  if (!streamUrl) return null;
  return `/api/audio?url=${encodeURIComponent(streamUrl)}`;
}

/**
 * Get lyrics for a song.
 */
export async function getMusicLyric(
  id: string,
  source: string
): Promise<string> {
  const url = `/api/music/lyric?id=${encodeURIComponent(id)}&source=${encodeURIComponent(source)}`;
  const res = await fetch(url);
  if (!res.ok) return '';
  const data = await res.json();
  return data.lyric ?? '';
}
