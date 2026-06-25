/**
 * Netease QR Login module.
 * Flow: get key → create QR code → poll check → save cookie
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const loginQrKey = require('@neteasecloudmusicapienhanced/api/module/login_qr_key.js');
const loginQrCreate = require('@neteasecloudmusicapienhanced/api/module/login_qr_create.js');
const loginQrCheck = require('@neteasecloudmusicapienhanced/api/module/login_qr_check.js');
const userPlaylist = require('@neteasecloudmusicapienhanced/api/module/user_playlist.js');
const playlistDetail = require('@neteasecloudmusicapienhanced/api/module/playlist_detail.js');
const createRequest = require('@neteasecloudmusicapienhanced/api/util/request.js');

// In-memory session store
const sessions = new Map();

export async function getQrKey() {
  // Build a proper cookie with device info to avoid security blocks
  const deviceId = 'YD_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const cookie = `osver=android; appver=8.7.01; os=android; deviceId=${deviceId}; channel=netease; __remember_me=true;`;
  const result = await loginQrKey({ cookie, crypto: 'weapi' }, createRequest);
  const key = result?.body?.data?.unikey;
  if (!key) throw new Error('Failed to get QR key');
  return key;
}

export async function createQr(key) {
  const result = await loginQrCreate({ key, qrimg: true, platform: 'pc' }, createRequest);
  return {
    key,
    qrimg: result?.body?.data?.qrimg || '',
    url: result?.body?.data?.qrurl || `https://music.163.com/login?codekey=${key}`,
  };
}

/**
 * Check QR login status.
 * Returns: { code: 800=expired, 801=pending, 802=scanned, 200=success }
 * On success, also returns the full cookie string.
 */
export async function checkQr(key) {
  const result = await loginQrCheck({ key }, createRequest);
  const body = result?.body || {};
  const code = body.code || 801;

  if (code === 200 && result.cookie) {
    const cookieStr = Array.isArray(result.cookie)
      ? result.cookie.join('; ')
      : (result.body?.cookie || '');

    // Store in sessions
    sessions.set(key, { cookie: cookieStr, loginAt: Date.now() });

    return { code, cookie: cookieStr };
  }

  return { code };
}

export function getSessionCookie(key) {
  const session = sessions.get(key);
  return session?.cookie || null;
}

// ===== Cookie-based access (manual cookie binding) =====

const loginStatusModule = require('@neteasecloudmusicapienhanced/api/module/login_status.js');

/**
 * Verify a raw Netease cookie string and return basic profile info.
 */
export async function verifyNeteaseCookie(cookie) {
  if (!cookie) throw new Error('缺少 Cookie');
  const profile = await loginStatusModule({ cookie }, createRequest);
  const p = profile?.body?.data?.profile;
  const userId = p?.userId || profile?.body?.data?.account?.id;
  if (!userId) throw new Error('网易云 Cookie 无效或已过期，请重新复制');
  return {
    userId: String(userId),
    nickname: p?.nickname || '网易云用户',
    avatar: p?.avatarUrl || '',
  };
}

/**
 * Get a user's playlists directly from a cookie string.
 */
export async function getNeteasePlaylistsByCookie(cookie) {
  const { userId } = await verifyNeteaseCookie(cookie);
  const result = await userPlaylist({ uid: userId, cookie }, createRequest);
  const playlists = result?.body?.playlist || [];
  const mapped = playlists.map(p => ({
    id: String(p.id),
    name: p.name,
    cover: p.coverImgUrl || p.picUrl || p.coverImgUrl_str || '',
    trackCount: p.trackCount,
    playCount: p.playCount,
    description: p.description,
    creator: p.creator?.nickname,
    source: 'netease',
  }));
  return mapped;
}

/**
 * Get tracks of a playlist directly from a cookie string.
 */
export async function getNeteaseTracksByCookie(listId, cookie) {
  if (!cookie) throw new Error('缺少 Cookie');
  const result = await playlistDetail({ id: listId, cookie, s: 0 }, createRequest);
  const tracks = result?.body?.playlist?.tracks || [];
  const mapped = tracks.map(t => ({
    id: String(t.id),
    title: t.name,
    artist: (t.ar || t.artists || []).map(a => a.name).join(', '),
    cover: t.al?.picUrl || t.album?.picUrl || t.al?.pic_str || '',
    duration: t.dt ? t.dt / 1000 : 0,
    source: 'netease',
  }));
  return mapped;
}

// ===== Playlists =====

export async function getUserPlaylists(key) {
  const cookie = getSessionCookie(key);
  if (!cookie) throw new Error('Not logged in');

  // Get profile first to find uid
  const loginStatus = require('@neteasecloudmusicapienhanced/api/module/login_status.js');
  const profile = await loginStatus({ cookie }, createRequest);
  const userId = profile?.body?.data?.profile?.userId || profile?.body?.data?.account?.id;

  if (!userId) throw new Error('Could not get user ID. Try QR login again.');

  const result = await userPlaylist({ uid: userId, cookie }, createRequest);
  const playlists = result?.body?.playlist || [];

  return playlists.map(p => ({
    id: p.id,
    name: p.name,
    cover: p.coverImgUrl,
    trackCount: p.trackCount,
    playCount: p.playCount,
    description: p.description,
    creator: p.creator?.nickname,
  }));
}

export async function getPlaylistTracks(listId, key) {
  const cookie = getSessionCookie(key);
  if (!cookie) throw new Error('Not logged in');

  const result = await playlistDetail({ id: listId, cookie, s: 0 }, createRequest);
  const tracks = result?.body?.playlist?.tracks || [];

  return tracks.map(t => ({
    id: String(t.id),
    title: t.name,
    artist: (t.ar || []).map(a => a.name).join(', '),
    cover: t.al?.picUrl || '',
    duration: t.dt ? t.dt / 1000 : 0,
    source: 'netease',
  }));
}
