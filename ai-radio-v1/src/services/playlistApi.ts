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
  sessionKey: string;
  user?: BoundUser;
}

/** @deprecated legacy cookie storage — migrated on read */
interface LegacyStoredBind {
  platform: Platform;
  cookie: string;
}

export function loadStoredBind(): StoredBind | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredBind | LegacyStoredBind;
    if ('sessionKey' in parsed && parsed.sessionKey) {
      return {
        platform: parsed.platform,
        sessionKey: parsed.sessionKey,
        user: 'user' in parsed ? parsed.user : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveStoredBind(platform: Platform, sessionKey: string, user?: BoundUser) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ platform, sessionKey, user }));
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

export type QrPollCode = 800 | 801 | 802 | 803 | 200;

export interface QrKeyResult {
  key: string;
  platform: Platform;
}

export interface QrImageResult {
  key: string;
  url?: string;
  qrimg: string;
}

export interface QrCheckResult {
  code: QrPollCode;
  key?: string;
  platform?: Platform;
  user?: BoundUser;
  message?: string;
}

export async function fetchQrKey(platform: Platform): Promise<QrKeyResult> {
  const res = await fetch(`/api/login/qr-key?platform=${platform}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '获取二维码失败');
  return data as QrKeyResult;
}

export async function fetchQrImage(platform: Platform, key: string): Promise<QrImageResult> {
  const res = await fetch(
    `/api/login/qr?platform=${platform}&key=${encodeURIComponent(key)}`,
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '生成二维码失败');
  return data as QrImageResult;
}

export async function checkQrLogin(platform: Platform, qrKey: string): Promise<QrCheckResult> {
  const res = await fetch(
    `/api/login/qr-check?platform=${platform}&key=${encodeURIComponent(qrKey)}`,
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '检查登录状态失败');
  return data as QrCheckResult;
}

/** Manual cookie bind (advanced fallback). */
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
