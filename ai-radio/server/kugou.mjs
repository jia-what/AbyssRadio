/**
 * KuGou account binding + user playlist APIs.
 */
import { parseCookie } from './session.mjs';
import {
  kugouAndroidRequest, kugouH5Request, kugouIdentity, decodeKugouNickName, signKey, poolToCookieString, randomDfid,
  md5, signatureAndroidParams, signatureWebParams, KUGOU_SRCAPPID,
} from './kugouSign.mjs';
import { refreshKugouToken, isKugouAuthError } from './kugouLogin.mjs';

/**
 * Verify a raw KuGou cookie string and extract identity.
 * KuGou stores userid in `KugooID` and token in `t` (or inside `KuGoo`).
 */
export function verifyKugouCookie(cookie) {
  const { userid, token, mid } = kugouIdentity(cookie);
  const c = parseCookie(cookie);

  let nickname = '酷狗用户';
  if (c.KuGoo) {
    const m = String(c.KuGoo).match(/NickName=([^&]+)/);
    if (m) nickname = decodeKugouNickName(m[1]) || nickname;
  }

  return { userId: String(userid), token, mid, nickname };
}

function normalizeCoverUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let u = raw.trim();
  if (!u) return '';
  if (u.startsWith('//')) u = 'https:' + u;
  if (u.includes('{size}')) u = u.replace(/\{size\}/gi, '400');
  if (!/^https?:\/\//i.test(u)) {
    u = u.replace(/^\/+/, '');
    if (/^(stdmusic|mcommon|upload)/i.test(u)) u = `https://imge.kugou.com/${u}`;
    else u = `https://${u}`;
  }
  if (u.startsWith('http://')) u = 'https://' + u.slice(7);
  return u;
}

function playlistCover(p) {
  const raw = p.pic || p.pic_img || p.img || p.cover || p.list_img || p.sizable_cover
    || p.custom_pic || p.list_icon || p.pic_u || p.imgurl || p.img_url
    || p.trans_param?.union_cover || '';
  return normalizeCoverUrl(typeof raw === 'string' ? raw : '');
}

function trackCover(t, fallback = '') {
  const raw = t.img || t.album_img || t.cover || t.album_cover || t.pic
    || t.trans_param?.union_cover || t.cover_url || fallback;
  return normalizeCoverUrl(typeof raw === 'string' ? raw : '');
}

function trackArtist(t) {
  if (t.singername) return String(t.singername);
  if (t.author_name) return String(t.author_name);
  if (Array.isArray(t.singerinfo)) {
    return t.singerinfo.map((s) => s.name || s.singername).filter(Boolean).join(', ');
  }
  if (Array.isArray(t.authors)) {
    return t.authors.map((a) => a.author_name || a.name).filter(Boolean).join(', ');
  }
  return '';
}

function trackDurationSec(t) {
  const raw = t.duration ?? t.timelen ?? t.time ?? 0;
  const n = Number(raw);
  if (!n) return 0;
  return n > 10000 ? Math.round(n / 1000) : Math.round(n);
}

/** Parse KuGou "Artist - Title.ext" filename into clean metadata. */
export function normalizeKugouFilename(raw) {
  if (!raw || typeof raw !== 'string') return { title: '', artist: '' };
  let s = raw.trim();
  if (!s) return { title: '', artist: '' };
  s = s.replace(/\.(mp3|flac|m4a|wav|ape|ogg|aac|wma)$/i, '').trim();
  const sep = s.indexOf(' - ');
  if (sep > 0) {
    return {
      artist: s.slice(0, sep).trim(),
      title: s.slice(sep + 3).trim(),
    };
  }
  return { title: s, artist: '' };
}

function trackTitleAndArtist(t) {
  const fromFile = normalizeKugouFilename(t.filename || t.fileName || '');
  let title = t.name || t.songname || t.song_name || t.audio_name || t.audio_name_128
    || fromFile.title || '未知曲目';
  let artist = trackArtist(t) || fromFile.artist;
  if (/\.(mp3|flac|m4a|wav|ape|ogg|aac|wma)$/i.test(title)) {
    const parsed = normalizeKugouFilename(title);
    title = parsed.title || title;
    if (!artist) artist = parsed.artist;
  }
  if (!artist && title.includes(' - ')) {
    const parsed = normalizeKugouFilename(title);
    if (parsed.artist) {
      artist = parsed.artist;
      title = parsed.title;
    }
  }
  return { title, artist };
}

/** hash|album_audio_id[|album_id] — keep ids as strings (mixsongid exceeds JS safe integer). */
function trackId(t) {
  const hash = String(t.hash || t.Hash || t.filehash || '').toLowerCase();
  const albumAudioId = t.album_audio_id || t.mixsongid || t.album_audio_id_32 || t.audio_id
    || t.mix_song_id || t.songid || '';
  const albumId = t.album_id || t.albumid || '';
  if (hash && albumAudioId) {
    return albumId ? `${hash}|${albumAudioId}|${albumId}` : `${hash}|${albumAudioId}`;
  }
  return String(hash || albumAudioId || t.fileid || '');
}

function parseSongIdParts(songId) {
  const parts = String(songId).split('|');
  return {
    hash: (parts[0] || '').toLowerCase(),
    albumAudioId: parts[1] || '0',
    albumId: parts[2] || '0',
  };
}

/** Keep mixsongid as string when it exceeds JS safe integer. */
function albumAudioIdForApi(raw) {
  if (!raw || String(raw) === '0') return 0;
  const s = String(raw);
  const n = Number(s);
  if (!Number.isFinite(n) || n > Number.MAX_SAFE_INTEGER) return s;
  return n;
}

function extractPlayUrl(json) {
  if (!json) return null;
  const pick = (val) => {
    if (typeof val === 'string' && /^https?:\/\//i.test(val)) return val;
    if (Array.isArray(val)) {
      for (const item of val) {
        const u = pick(item);
        if (u) return u;
      }
    }
    return null;
  };
  const candidates = [
    json.url,
    json.play_url,
    json.data?.url,
    json.data?.play_url,
    json.data?.backup_url,
    json.backupUrl,
  ];
  for (const c of candidates) {
    const u = pick(c);
    if (u) return u;
  }
  const data = json.data;
  if (Array.isArray(data)) {
    const sorted = data.slice().sort((a, b) => (b.bitRate || 0) - (a.bitRate || 0));
    for (const item of sorted) {
      const u = pick(item?.url) || pick(item?.play_url) || pick(item?.backupUrl);
      if (u) return u;
    }
  }
  return null;
}

const KUGOU_TRACKER_UA = 'Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi';
const KUGOU_APPID = 1005;
const KUGOU_CLIENTVER = 20489;
const KUGOU_V6_KEY_SALT = '185672dd44712f60bb1736df5a377e82';
// Mineradio-style H5/Web play path constants
const KUGOU_WEB_APPID = 1014;
const KUGOU_H5_SALT = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt';
const KUGOU_H5_SRC_APPID = '2919';
const KUGOU_H5_CLIENTVER = '20000';
const KUGOU_H5_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const KUGOU_PLAY_MOBILE = 'http://m.kugou.com/app/i/getSongInfo.php';
const KUGOU_PLAY_WEB = 'https://wwwapi.kugou.com/yy/index.php';
const KUGOU_GATEWAY = 'https://gateway.kugou.com';
const KUGOU_HEADERS = {
  Referer: 'https://www.kugou.com/',
  'User-Agent': KUGOU_H5_UA,
};

async function resolveRelateGoodsUrl(relateGoods) {
  if (!Array.isArray(relateGoods) || !relateGoods.length) return null;
  const sorted = relateGoods.slice().sort((a, b) => (b.info?.bitrate || 0) - (a.info?.bitrate || 0));
  for (const g of sorted) {
    const h = String(g.hash || '').toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(h)) continue;
    const key = md5(`${h}kgcloudv2`);
    try {
      const res = await fetch(
        `http://trackercdn.kugou.com/i/v2/?hash=${h}&key=${key}&pid=3&behavior=play&cmd=25&version=8990`,
      );
      const json = await res.json();
      const u = extractPlayUrl(json);
      if (u) return u;
    } catch {
      // try next quality hash
    }
  }
  return null;
}

async function extractPrivilegePlayUrl(json) {
  const items = json?.data ?? json?.list ?? [];
  const list = Array.isArray(items) ? items : [items];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const direct = extractPlayUrl(item);
    if (direct) return direct;
    const fromRelate = await resolveRelateGoodsUrl(item.relate_goods);
    if (fromRelate) return fromRelate;
    const offsetHash = item.hash_offset?.offset_hash;
    if (offsetHash) {
      const preview = await fetchKugouLegacyV2(String(offsetHash).toLowerCase());
      if (preview) return preview;
    }
  }
  return null;
}

/** Pull album_audio_id / play_url hints from wwwapi songinfo. */
async function enrichPlayContext(ctx) {
  const data = await fetchKugouSongInfoData(ctx);
  if (!data) return ctx;
  const aid = data.album_audio_id ?? data.album_audio_id_128 ?? data.audio_id;
  const albumAudioId = aid && String(aid) !== '0' ? String(aid) : ctx.albumAudioId;
  const albumId = data.album_id ? String(data.album_id) : ctx.albumId;
  return {
    ...ctx,
    albumAudioId,
    albumId,
    encodeAlbumAudioId: data.encode_album_audio_id || ctx.encodeAlbumAudioId,
    songinfoPlayUrl: data.play_url || data.play_backup_url || null,
  };
}

async function fetchKugouSongInfoData(ctx) {
  const { pool, identity, dfid, hash, albumAudioId } = ctx;
  const webMid = pool.kg_mid || pool.mid || identity.mid;
  const clienttime = Date.now();
  const base = {
    srcappid: String(KUGOU_SRCAPPID),
    clientver: '20000',
    clienttime: String(clienttime),
    mid: webMid,
    uuid: webMid,
    dfid,
    appid: '1014',
    platid: '4',
    token: identity.token,
    userid: identity.userid,
  };

  async function songinfo(params) {
    const signed = { ...params, signature: signatureWebParams(params) };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(signed)) qs.set(k, String(v));
    const res = await fetch(`https://wwwapi.kugou.com/play/songinfo?${qs.toString()}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Cookie: poolToCookieString(pool),
      },
    });
    const json = await res.json();
    return json?.data || null;
  }

  try {
    const req = { ...base, hash };
    if (albumAudioId && albumAudioId !== '0') req.album_audio_id = albumAudioId;
    return await songinfo(req);
  } catch {
    return null;
  }
}

async function fetchKugouWebPlayUrlWithEncode(ctx) {
  const { pool, identity, dfid, encodeAlbumAudioId } = ctx;
  if (!encodeAlbumAudioId) return null;
  const webMid = pool.kg_mid || pool.mid || identity.mid;
  const clienttime = Date.now();
  const params = {
    srcappid: String(KUGOU_SRCAPPID),
    clientver: '20000',
    clienttime: String(clienttime),
    mid: webMid,
    uuid: webMid,
    dfid,
    appid: '1014',
    platid: '4',
    token: identity.token,
    userid: identity.userid,
    encode_album_audio_id: encodeAlbumAudioId,
  };
  const signed = { ...params, signature: signatureWebParams(params) };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(signed)) qs.set(k, String(v));
  try {
    const res = await fetch(`https://wwwapi.kugou.com/play/songinfo?${qs.toString()}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Cookie: poolToCookieString(pool),
      },
    });
    const json = await res.json();
    return json?.data?.play_url || json?.data?.play_backup_url || null;
  } catch {
    return null;
  }
}

/** Authenticated privilege/lite — unlocks VIP tracks for logged-in users. */
async function fetchKugouPrivilegeLite(ctx, cookieStr) {
  const { hash, albumId } = ctx;
  const resource = {
    type: 'audio',
    page_id: 0,
    hash,
    album_id: Number(albumId) || 0,
  };
  try {
    const json = await kugouAndroidRequest({
      cookie: cookieStr,
      method: 'POST',
      url: '/v2/get_res_privilege/lite',
      router: 'media.store.kugou.com',
      body: {
        appid: KUGOU_APPID,
        area_code: 1,
        behavior: 'play',
        clientver: KUGOU_CLIENTVER,
        need_hash_offset: 1,
        relate: 1,
        support_verify: 1,
        resource: [resource],
        qualities: ['128', '320', 'flac', 'high'],
      },
    });
    return extractPrivilegePlayUrl(json);
  } catch {
    return null;
  }
}

/** Resolve a playable stream URL (needs bound user cookie + VIP credentials). */
export async function getKugouPlayUrl(songId, cookie, sessionKey) {
  if (!cookie || !songId) return null;
  const { hash, albumAudioId, albumId } = parseSongIdParts(songId);
  if (!/^[a-f0-9]{32}$/.test(hash)) return null;

  let activeCookie = cookie;
  try {
    activeCookie = await refreshKugouToken(cookie);
    if (sessionKey) {
      const { updateSessionCookie } = await import('./session.mjs');
      updateSessionCookie(sessionKey, activeCookie);
    }
  } catch {
    // continue with QR/browser cookie
  }

  let { pool, ...identity } = kugouIdentity(activeCookie);
  if (!pool.vip_token) {
    try {
      activeCookie = await refreshKugouToken(activeCookie);
      if (sessionKey) {
        const { updateSessionCookie } = await import('./session.mjs');
        updateSessionCookie(sessionKey, activeCookie);
      }
      ({ pool, ...identity } = kugouIdentity(activeCookie));
    } catch {
      // VIP play may fail without vip_token
    }
  }

  const dfid = !pool.dfid || pool.dfid === '-' ? randomDfid() : pool.dfid;
  pool.dfid = dfid;

  let ctx = { pool, identity, dfid, hash, albumAudioId, albumId };
  ctx = await enrichPlayContext(ctx);

  if (ctx.songinfoPlayUrl) return ctx.songinfoPlayUrl;

  let url = await fetchKugouWebPlayUrlWithEncode(ctx);
  if (url) return url;

  url = await fetchKugouPrivilegeLite(ctx, activeCookie);
  if (url) return url;

  // Mineradio-style paths — H5 gateway first (browser identity, VIP-capable)
  url = await fetchKugouH5PlayUrl(ctx, activeCookie);
  if (url) return url;

  url = await fetchKugouMobilePlayUrl(ctx, activeCookie);
  if (url) return url;

  url = await fetchKugouWebPlayData(ctx, activeCookie);
  if (url) return url;

  for (const pageId of [151369488, 1]) {
    for (const pid of ['2', '411']) {
      for (const isFreePart of [0, 1]) {
        url = await fetchKugouPrivUrlV6(ctx, { pid, isFreePart, pageId });
        if (url) return url;
      }
    }
  }

  for (const quality of [320, 128]) {
    url = await fetchKugouTrackerUrl({ ...ctx, quality });
    if (url) return url;
  }

  url = await fetchKugouWebPlayUrl(ctx);
  if (url) return url;

  // Legacy trial URLs often 403 for VIP tracks — skip when logged in
  if (!pool.userid && !pool.vip_token) return fetchKugouLegacyV2(hash);
  return null;
}

async function fetchKugouWebPlayUrl(ctx) {
  try {
    const data = await fetchKugouSongInfoData(ctx);
    if (!data) return null;
    let url = data.play_url || data.play_backup_url;
    if (url) return url;
    if (data.encode_album_audio_id) {
      return fetchKugouWebPlayUrlWithEncode({ ...ctx, encodeAlbumAudioId: data.encode_album_audio_id });
    }
  } catch {
    // fall through
  }
  return null;
}

/** Fetch KuGou LRC by hash (playlist ids are hash|album_audio_id). */
export async function getKugouLyric(songId, cookie) {
  const hash = String(songId).split('|')[0].toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(hash)) return '';

  const headers = { 'User-Agent': 'IPhone-8990-searchSong' };
  if (cookie) {
    try {
      const { pool } = kugouIdentity(cookie);
      headers.Cookie = poolToCookieString(pool);
    } catch {
      // search may still work without cookie
    }
  }

  try {
    const searchQs = new URLSearchParams({
      keyword: ' - ',
      ver: '1',
      hash,
      client: 'mobi',
      man: 'yes',
    });
    const searchRes = await fetch(`http://krcs.kugou.com/search?${searchQs.toString()}`, { headers });
    const searchJson = await searchRes.json();
    const candidate = searchJson?.candidates?.[0];
    if (!candidate?.id || !candidate?.accesskey) return '';

    const dlQs = new URLSearchParams({
      charset: 'utf8',
      accesskey: candidate.accesskey,
      id: String(candidate.id),
      client: 'mobi',
      fmt: 'lrc',
      ver: '1',
    });
    const dlRes = await fetch(`http://lyrics.kugou.com/download?${dlQs.toString()}`, { headers });
    const dlJson = await dlRes.json();
    if (!dlJson?.content) return '';
    return Buffer.from(dlJson.content, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

async function fetchKugouPrivUrlV6(ctx, opts = {}) {
  const { pool, identity, dfid, hash, albumAudioId } = ctx;
  const pid = opts.pid ?? '411';
  const isFreePart = opts.isFreePart ?? 0;
  const pageId = opts.pageId ?? 151369488;
  const clienttime = Math.floor(Date.now() / 1000);
  const clienttimeMs = Date.now();
  const userid = Number(identity.userid) || 0;
  const apiMid = pool.KUGOU_API_MID || identity.mid;
  const trackerKey = md5(`${hash}${KUGOU_V6_KEY_SALT}${KUGOU_APPID}${apiMid}${userid}`);

  const bodyObj = {
    area_code: '1',
    behavior: 'play',
    qualities: ['128', '320', 'flac', 'high', 'multitrack', 'viper_atmos', 'viper_tape', 'viper_clear', 'super'],
    resource: {
      album_audio_id: albumAudioIdForApi(albumAudioId),
      collect_list_id: '3',
      collect_time: clienttimeMs,
      hash,
      id: 0,
      page_id: 1,
      type: 'audio',
    },
    token: identity.token,
    tracker_param: {
      all_m: 1,
      auth: '',
      is_free_part: isFreePart,
      key: trackerKey,
      module_id: 0,
      need_climax: 1,
      need_xcdn: 1,
      open_time: '',
      pid: String(pid),
      pidversion: '3001',
      priv_vip_type: String(pool.vip_type || '6'),
      viptoken: pool.vip_token || pool.token || '',
    },
    userid: `${userid}`,
    // vip must be a STRING (upstream passes cookie vip_type as-is) — number breaks unmarshal
    vip: String(pool.vip_type || 0),
  };
  const bodyStr = JSON.stringify(bodyObj);
  const params = {
    dfid,
    mid: identity.mid,
    uuid: '-',
    appid: KUGOU_APPID,
    clientver: KUGOU_CLIENTVER,
    clienttime,
    token: identity.token,
    userid,
  };
  params.signature = signatureAndroidParams(params, bodyStr);

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));

  const headers = {
    'User-Agent': KUGOU_TRACKER_UA,
    Cookie: poolToCookieString(pool),
    dfid,
    mid: identity.mid,
    clienttime: String(clienttime),
    'Content-Type': 'application/json',
    'kg-rc': '1',
    'kg-thash': '5d816a0',
    'kg-rec': '1',
    'kg-rf': 'B9EDA08A64250DEFFBCADDEE00F8F25F',
  };

  try {
    const res = await fetch(`http://tracker.kugou.com/v6/priv_url?${qs.toString()}`, {
      method: 'POST',
      headers,
      body: bodyStr,
    });
    const json = await res.json();
    return extractPlayUrl(json);
  } catch {
    return null;
  }
}

async function fetchKugouLegacyV2(hash) {
  const key = md5(`${hash}kgcloudv2`);
  const trackUrl = `http://trackercdn.kugou.com/i/v2/?hash=${hash}&key=${key}&pid=2&cmd=25&behavior=play&appid=${KUGOU_APPID}&br=320`;
  try {
    const res = await fetch(trackUrl);
    const json = await res.json();
    return extractPlayUrl(json);
  } catch {
    return null;
  }
}

async function fetchKugouTrackerUrl(opts) {
  const { pool, identity, dfid, hash, albumAudioId, albumId, quality } = opts;
  const clienttime = Math.floor(Date.now() / 1000);
  // Upstream song_url.js: Number() fallbacks — undefined album ids break v5/url signature
  const albumIdNum = Number(albumId) || 0;
  const albumAudioIdNum = Number(albumAudioId) || 0;
  const params = {
    dfid,
    mid: identity.mid,
    uuid: '-',
    appid: 1005,
    clientver: 11430,
    clienttime,
    token: identity.token,
    userid: Number(identity.userid) || 0,
    album_id: albumIdNum,
    area_code: 1,
    hash,
    ssa_flag: 'is_fromtrack',
    version: 11430,
    page_id: 151369488,
    quality,
    album_audio_id: albumAudioIdNum,
    behavior: 'play',
    pid: 2,
    cmd: 26,
    pidversion: 3001,
    IsFreePart: 0,
    ppage_id: '463467626,350369493,788954147',
    cdnBackup: 1,
    module: '',
  };
  const apiMid = pool.KUGOU_API_MID || identity.mid;
  params.key = signKey(hash, apiMid, Number(identity.userid) || 0, 1005);

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const query = qs.toString();
  const headers = {
    'User-Agent': 'Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi',
    Cookie: poolToCookieString(pool),
    dfid,
    mid: identity.mid,
    clienttime: String(clienttime),
    'x-router': 'trackercdn.kugou.com',
    'kg-rc': '1',
    'kg-thash': '5d816a0',
    'kg-rec': '1',
    'kg-rf': 'B9EDA08A64250DEFFBCADDEE00F8F25F',
  };

  const urls = [
    `http://trackercdn.kugou.com/v5/url?${query}`,
    `https://gateway.kugou.com/v5/url?${query}`,
  ];

  for (let i = 0; i < urls.length; i++) {
    const reqHeaders = { ...headers };
    if (!urls[i].includes('gateway.kugou.com')) delete reqHeaders['x-router'];
    try {
      const res = await fetch(urls[i], { headers: reqHeaders });
      const json = await res.json();
      const url = extractPlayUrl(json);
      if (url) return url;
    } catch {
      // try next host
    }
  }
  return null;
}

// ===== Mineradio-style play paths (H5 gateway / mobile getSongInfo / web play/getdata) =====
// These are the paths a working desktop client (Mineradio) uses for VIP tracks.

function signatureH5Params(params) {
  const parts = Object.keys(params).sort().map(key => `${key}=${params[key]}`);
  return md5(`${KUGOU_H5_SALT}${parts.join('')}${KUGOU_H5_SALT}`);
}

function buildKugouH5Params(pool, identity, extra) {
  const now = Date.now();
  return Object.assign({
    srcappid: KUGOU_H5_SRC_APPID,
    clientver: KUGOU_H5_CLIENTVER,
    clienttime: now,
    mid: identity.mid || pool.kg_mid || '-',
    uuid: now,
    dfid: pool.dfid || '-',
    appid: KUGOU_WEB_APPID,
    token: identity.token || '',
    userid: Number(identity.userid) || 0,
  }, extra || {});
}

/** H5 gateway v5/url — browser-identity path (works for VIP with logged cookie). */
async function fetchKugouH5PlayUrl(ctx, cookieStr) {
  const { pool, identity, dfid, hash, albumAudioId, albumId, quality } = ctx;
  const q = quality || 128;
  const params = buildKugouH5Params(pool, identity, {
    album_id: Number(albumId) || 0,
    area_code: 1,
    hash,
    ssa_flag: 'is_fromtrack',
    version: 11430,
    quality: q,
    album_audio_id: Number(albumAudioId) || 0,
    behavior: 'play',
    pid: 2,
    cmd: 26,
    pidversion: 3001,
    IsFreePart: 0,
    cdnBackup: 1,
    module: '',
  });
  params.key = signKey(hash, identity.mid || pool.kg_mid || '', Number(identity.userid) || 0, KUGOU_WEB_APPID);
  params.signature = signatureH5Params(params);
  const u = new URL('/v5/url', KUGOU_GATEWAY);
  Object.keys(params).forEach(k => u.searchParams.set(k, String(params[k])));
  try {
    const res = await fetch(u.toString(), {
      headers: {
        ...KUGOU_HEADERS,
        'x-router': 'trackercdn.kugou.com',
        Cookie: poolToCookieString(pool),
      },
    });
    const json = await res.json();
    return extractPlayUrl(json) || null;
  } catch {
    return null;
  }
}

/** Mobile getSongInfo.php — classic mobile play path. */
async function fetchKugouMobilePlayUrl(ctx, cookieStr) {
  const { pool, identity, hash, albumId } = ctx;
  const key = md5(`${hash}kgcloud`);
  const u = new URL(KUGOU_PLAY_MOBILE);
  u.searchParams.set('cmd', 'playInfo');
  u.searchParams.set('hash', hash);
  u.searchParams.set('key', key);
  u.searchParams.set('album_id', albumId || '0');
  u.searchParams.set('pid', '1');
  u.searchParams.set('forceDown', '0');
  u.searchParams.set('vip', pool.vip_type ? '1' : '65530');
  if (identity.userid) u.searchParams.set('userid', identity.userid);
  if (identity.token) u.searchParams.set('token', identity.token);
  try {
    const res = await fetch(u.toString(), {
      headers: { ...KUGOU_HEADERS, Cookie: poolToCookieString(pool) },
    });
    const json = await res.json();
    return extractPlayUrl(json) || null;
  } catch {
    return null;
  }
}

/** Web play/getdata — wwwapi index.php play/getdata path. */
async function fetchKugouWebPlayData(ctx, cookieStr) {
  const { pool, identity, hash, albumAudioId, albumId } = ctx;
  const u = new URL(KUGOU_PLAY_WEB);
  u.searchParams.set('r', 'play/getdata');
  u.searchParams.set('hash', hash);
  u.searchParams.set('album_id', albumId || '0');
  if (albumAudioId) u.searchParams.set('album_audio_id', albumAudioId);
  u.searchParams.set('appid', String(KUGOU_WEB_APPID));
  u.searchParams.set('platid', '4');
  u.searchParams.set('mid', identity.mid || pool.kg_mid || '-');
  u.searchParams.set('dfid', pool.dfid || '-');
  u.searchParams.set('userid', identity.userid || '0');
  u.searchParams.set('token', identity.token || '');
  try {
    const res = await fetch(u.toString(), {
      headers: { ...KUGOU_HEADERS, Cookie: poolToCookieString(pool) },
    });
    const json = await res.json();
    const data = json && json.data;
    const url = data && (data.play_url || data.play_backup_url);
    return url ? String(url).replace(/\\\//g, '/').trim() : null;
  } catch {
    return null;
  }
}

/** Fetch all pages from a paginated KuGou cloudlist endpoint. */
async function fetchAllPages(fetchPage) {
  const all = [];
  let page = 1;
  const pagesize = 200;
  for (;;) {
    const batch = await fetchPage(page, pagesize);
    if (!batch.length) break;
    all.push(...batch);
    if (batch.length < pagesize) break;
    page += 1;
    if (page > 50) break;
  }
  return all;
}

/** Run cloudlist call; on auth failure try token refresh once. */
async function withKugouCookie(cookie, fn) {
  try {
    const value = await fn(cookie);
    return { value, cookie };
  } catch (e) {
    if (!isKugouAuthError(e)) throw e;
    try {
      const fresh = await refreshKugouToken(cookie);
      const value = await fn(fresh);
      return { value, cookie: fresh };
    } catch (refreshErr) {
      const msg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
      if (/无法连接酷狗/.test(msg) || msg === 'fetch failed') throw refreshErr;
      throw new Error(
        '酷狗登录已过期（20018）。请在 kugou.com 退出账号后重新登录，播放一首歌，再复制新的 Cookie 绑定',
      );
    }
  }
}

/**
 * Get a user's playlists from KuGou cloudlist (/v7/get_all_list) via H5 gateway.
 * Web cookie works directly — no login_by_token refresh needed.
 */
export async function getKugouPlaylistsByCookie(cookie) {
  const { userid, token } = kugouIdentity(cookie);

  const lists = await fetchAllPages(async (page, pagesize) => {
    const json = await kugouH5Request({
      cookie,
      method: 'POST',
      path: '/v7/get_all_list',
      router: 'cloudlist.service.kugou.com',
      query: { plat: 1 },
      body: {
        userid: Number(userid),
        token,
        total_ver: 979,
        type: 2,
        page,
        pagesize,
      },
    });
    const data = json.data || {};
    return data.info || data.lists || data.list || [];
  });

  return {
    playlists: lists.map((p) => ({
      id: String(p.listid || p.specialid || p.global_collection_id || ''),
      name: p.listname || p.name || p.title || '未命名歌单',
      cover: playlistCover(p),
      trackCount: Number(p.count || p.song_count || p.list_count || p.songcount || 0),
      playCount: Number(p.play_count || p.heat || 0),
      description: p.intro || p.desc || '',
      creator: p.nickname || p.username || '',
      source: 'kugou',
    })).filter((p) => p.id),
    cookie,
  };
}

/**
 * Get tracks of a KuGou playlist (/v4/get_list_all_file) via H5 gateway.
 * @param {string} listId - numeric listid from get_all_list
 */
export async function getKugouTracksByCookie(listId, cookie) {
  if (!listId) throw new Error('缺少歌单 ID');
  const { userid, token } = kugouIdentity(cookie);
  const listid = Number(listId);
  if (!listid) throw new Error('酷狗歌单 ID 无效');

  const songs = await fetchAllPages(async (page, pagesize) => {
    const json = await kugouH5Request({
      cookie,
      method: 'POST',
      path: '/v4/get_list_all_file',
      router: 'cloudlist.service.kugou.com',
      body: {
        listid,
        userid: Number(userid),
        token,
        area_code: 1,
        show_relate_goods: 0,
        pagesize,
        allplatform: 1,
        show_cover: 1,
        type: 0,
        page,
      },
    });
    const data = json.data || {};
    return data.info || data.songs || data.files || data.lists || [];
  });

  const fallbackCover = '';
  return {
    tracks: songs.map((t) => {
      const { title, artist } = trackTitleAndArtist(t);
      return {
        id: trackId(t),
        title,
        artist,
        cover: trackCover(t, fallbackCover),
        duration: trackDurationSec(t),
        source: 'kugou',
      };
    }).filter((t) => t.id),
    cookie,
  };
}
