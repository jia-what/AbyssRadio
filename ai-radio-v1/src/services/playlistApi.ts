export type Platform = 'kugou' | 'netease';

export interface BoundUser {
  userId: string;
  nickname: string;
  avatar?: string;
}

export interface Playlist {
  id: string;
  name: string;
  cover: string;
  trackCount: number;
  playCount: number;
  description?: string;
  creator?: string;
  source: string;
}

export interface PlaylistTrack {
  id: string;
  title: string;
  artist: string;
  cover: string;
  duration: number;
  source: string;
}

const STORAGE_KEY = 'ai-radio-bind';

interface StoredBind {
  platform: Platform;
  cookie: string;
}

export function loadStoredBind(): StoredBind | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredBind) : null;
  } catch {
    return null;
  }
}

export function saveStoredBind(platform: Platform, cookie: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ platform, cookie }));
  } catch {
    // ignore
  }
}

export function clearStoredBind() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export interface BindResult {
  key: string;
  platform: Platform;
  user: BoundUser;
}

export async function bindCookie(platform: Platform, cookie: string): Promise<BindResult> {
  const res = await fetch('/api/session/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, cookie }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '绑定失败');
  return data as BindResult;
}

export async function fetchPlaylists(key: string): Promise<Playlist[]> {
  const res = await fetch(`/api/playlists?key=${encodeURIComponent(key)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '获取歌单失败');
  return data.playlists ?? [];
}

export async function fetchPlaylistTracks(key: string, id: string): Promise<PlaylistTrack[]> {
  const res = await fetch(`/api/playlist/tracks?key=${encodeURIComponent(key)}&id=${encodeURIComponent(id)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '获取歌曲失败');
  return data.tracks ?? [];
}
