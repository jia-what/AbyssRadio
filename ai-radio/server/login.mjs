/**
 * Netease QR Login module.
 * Flow: get key → create QR code → poll check → save cookie
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const loginQrKey = require('@neteasecloudmusicapienhanced/api/module/login_qr_key.js');
const loginQrCreate = require('@neteasecloudmusicapienhanced/api/module/login_qr_create.js');
const loginRefresh = require('@neteasecloudmusicapienhanced/api/module/login_refresh.js');
const createOption = require('@neteasecloudmusicapienhanced/api/util/option.js');
const userPlaylist = require('@neteasecloudmusicapienhanced/api/module/user_playlist.js');
const playlistDetail = require('@neteasecloudmusicapienhanced/api/module/playlist_detail.js');
const songDetail = require('@neteasecloudmusicapienhanced/api/module/song_detail.js');
const createRequest = require('@neteasecloudmusicapienhanced/api/util/request.js');

// In-memory session store
const sessions = new Map();
/** QR key → device cookie used when the key was created (must reuse on poll). */
const pendingQr = new Map();
let lastQrKeyAt = 0;
const QR_KEY_COOLDOWN_MS = 5000;

function isRateLimited(err) {
  const body = err?.body || {};
  const code = body.code || err?.status;
  return code === 406 || /频繁/.test(body.msg || body.message || '');
}

export async function getQrKey() {
  const now = Date.now();
  if (now - lastQrKeyAt < QR_KEY_COOLDOWN_MS) {
    throw new Error('请求过于频繁，请 5 秒后再试');
  }
  lastQrKeyAt = now;

  // Build a proper cookie with device info to avoid security blocks
  const deviceId = 'YD_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const deviceCookie = `osver=android; appver=8.7.01; os=android; deviceId=${deviceId}; channel=netease; __remember_me=true;`;
  let result;
  try {
    result = await loginQrKey({ cookie: deviceCookie, crypto: 'weapi' }, createRequest);
  } catch (err) {
    if (isRateLimited(err)) throw new Error('网易接口限流，请稍候再试');
    throw err;
  }
  const key = result?.body?.data?.unikey;
  if (!key) throw new Error('Failed to get QR key');
  pendingQr.set(key, { deviceCookie, createdAt: Date.now() });
  return key;
}

export async function createQr(key) {
  const pending = pendingQr.get(key);
  const result = await loginQrCreate({
    key,
    qrimg: true,
    platform: 'pc',
    cookie: pending?.deviceCookie,
    crypto: 'weapi',
  }, createRequest);
  return {
    key,
    qrimg: result?.body?.data?.qrimg || '',
    url: result?.body?.data?.qrurl || `https://music.163.com/login?codekey=${key}`,
  };
}

function extractNeteaseCookie(result) {
  if (Array.isArray(result?.cookie) && result.cookie.length) {
    return result.cookie.map((c) => {
      if (typeof c === 'string') return c.split(';')[0].trim();
      if (c && typeof c === 'object' && c.name) return `${c.name}=${c.value}`;
      return String(c);
    }).filter(Boolean).join('; ');
  }
  const body = result?.body || {};
  if (typeof body.cookie === 'string' && body.cookie) return body.cookie;
  return '';
}

/**
 * Check QR login status.
 * Returns: { code: 800=expired, 801=pending, 802=scanned, 803=confirming, 200=success }
 * On success, also returns the full cookie string.
 */
export async function checkQr(key) {
  const pending = pendingQr.get(key);
  let result;
  try {
    // Bypass login_qr_check.js — its catch block references undefined `result` and throws 500.
    result = await createRequest(
      '/api/login/qrcode/client/login',
      { key, type: 3 },
      createOption({ key, cookie: pending?.deviceCookie, crypto: 'weapi' }),
    );
  } catch (err) {
    const body = err?.body || {};
    const code = Number(body.code) || 0;
    // Prefer real QR progress (802 scanned / 803 confirm) over rate-limit rewrite
    if (code === 802 || code === 803) {
      return { code, message: body.message || body.msg };
    }
    if (code === 800) {
      pendingQr.delete(key);
      return { code: 800, message: body.message || body.msg };
    }
    if (isRateLimited(err) || code === 406) {
      return { code: 801, message: '操作频繁，请稍候再试' };
    }
    return { code: code || 801, message: body.message || body.msg };
  }

  const body = result?.body || {};
  const code = Number(body.code) || 801;

  if (code === 406 || isRateLimited({ body, status: code })) {
    return { code: 801, message: '操作频繁，请稍候再试' };
  }

  if (code === 200 || (code === 803 && (result?.cookie || body.cookie))) {
    // Netease's current QR flow: the "authorized" (803) response already
    // carries the login cookie — polling again returns 800 (QR consumed),
    // so 803+cookie must be treated as success, not "wait for 200".
    const cookieStr = extractNeteaseCookie({
      ...result,
      cookie: result?.cookie || body.cookie,
    });
    if (cookieStr) {
      pendingQr.delete(key);
      sessions.set(key, { cookie: cookieStr, loginAt: Date.now() });
      return { code: 200, cookie: cookieStr };
    }
    if (code === 200) {
      // Cookie not yet in response — keep client on confirm step
      return { code: 803, message: '请在手机上确认登录' };
    }
  }

  if (code === 800) pendingQr.delete(key);
  // 801 waiting / 802 scanned / 803 confirming — pass through with message
  return { code, message: body.message || body.msg };
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
  try {
    const profile = await loginStatusModule({ cookie }, createRequest);
    const p = profile?.body?.data?.profile;
    const userId = p?.userId || profile?.body?.data?.account?.id;
    if (!userId) throw new Error('网易云 Cookie 无效或已过期，请重新复制');
    return {
      userId: String(userId),
      nickname: p?.nickname || '网易云用户',
      avatar: p?.avatarUrl || '',
    };
  } catch (err) {
    if (isRateLimited(err)) {
      return { userId: '', nickname: '网易云用户' };
    }
    throw err;
  }
}

/**
 * Refresh a Netease MUSIC_U cookie via /api/login/token/refresh.
 * Returns the merged cookie string, or the original on soft failure.
 */
export async function refreshNeteaseCookie(cookie) {
  if (!cookie) return cookie;
  try {
    const result = await loginRefresh({ cookie }, createRequest);
    const body = result?.body || {};
    if (body.code !== 200) return cookie;
    const next =
      (typeof body.cookie === 'string' && body.cookie) ||
      (Array.isArray(result?.cookie) ? result.cookie.map((c) => String(c).split(';')[0]).join('; ') : '');
    if (!next) return cookie;
    // Merge refreshed tokens into the existing cookie jar
    const jar = {};
    for (const part of String(cookie).split(';')) {
      const idx = part.indexOf('=');
      if (idx < 0) continue;
      jar[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    }
    for (const part of String(next).split(';')) {
      const idx = part.indexOf('=');
      if (idx < 0) continue;
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k) jar[k] = v;
    }
    return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  } catch {
    return cookie;
  }
}

function normalizeCoverUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let u = raw.trim();
  if (!u) return '';
  if (u.startsWith('//')) u = 'https:' + u;
  if (u.startsWith('http://')) u = 'https://' + u.slice(7);
  return u;
}

function trackCover(t) {
  const al = t.al || t.album;
  if (!al) return '';
  const raw = al.picUrl || (al.pic_str ? `https://p1.music.126.net/${al.pic_str}/${al.pic_str}.jpg` : '');
  return normalizeCoverUrl(raw);
}

function playlistCover(p) {
  return normalizeCoverUrl(p.coverImgUrl || p.coverImgUrl_str || p.picUrl || '');
}

/** Batch-fetch song/detail for ids missing album art (playlist_detail often omits al.picUrl). */
async function fetchCoverMap(ids, cookie) {
  const map = new Map();
  const unique = [...new Set(ids.map(String))];
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const result = await songDetail({ ids: chunk.join(','), cookie }, createRequest);
    const songs = result?.body?.songs || [];
    for (const s of songs) {
      const cover = trackCover(s);
      if (cover) map.set(String(s.id), cover);
    }
  }
  return map;
}

/**
 * Get a user's playlists directly from a cookie string.
 */
export async function getNeteasePlaylistsByCookie(cookie) {
  let userId = '';
  let nickname = '网易云用户';
  try {
    const user = await verifyNeteaseCookie(cookie);
    userId = user.userId;
    nickname = user.nickname;
  } catch {
    // fall through — login_status may rate-limit right after QR scan
  }
  if (!userId) {
    const profile = await loginStatusModule({ cookie }, createRequest);
    userId = String(
      profile?.body?.data?.profile?.userId || profile?.body?.data?.account?.id || '',
    );
    nickname = profile?.body?.data?.profile?.nickname || nickname;
  }
  if (!userId) throw new Error('无法获取网易云用户信息，请稍后重试');
  const result = await userPlaylist({ uid: userId, cookie }, createRequest);
  const playlists = result?.body?.playlist || [];
  const mapped = playlists.map(p => ({
    id: String(p.id),
    name: p.name,
    cover: playlistCover(p),
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
  const result = await playlistDetail({ id: listId, cookie, s: 8 }, createRequest);
  const playlist = result?.body?.playlist || {};
  const tracks = playlist.tracks || [];
  const fallbackCover = playlistCover(playlist);

  const needIds = tracks
    .filter(t => !trackCover(t))
    .map(t => String(t.id));
  const coverMap = needIds.length > 0 ? await fetchCoverMap(needIds, cookie) : new Map();

  const mapped = tracks.map(t => ({
    id: String(t.id),
    title: t.name,
    artist: (t.ar || t.artists || []).map(a => a.name).join(', '),
    cover: trackCover(t) || coverMap.get(String(t.id)) || fallbackCover || '',
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
    cover: trackCover(t) || '',
    duration: t.dt ? t.dt / 1000 : 0,
    source: 'netease',
  }));
}
