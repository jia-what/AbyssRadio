import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Readable } from 'stream';
import { searchBoth, searchNetease, searchKuGou, getUrl, getUrlSmart, getLyric, getKugouUrlWithCookie, isPlayableUrl } from './ncm.mjs';
import { getUrlNeteaseSmart } from './ncm-neapi.mjs';
import { chatWithDeepSeek } from './deepseek.mjs';
import { getDeepseekStatus, setDeepseekApiKey } from './settings.mjs';
import { searchLibrary, clearLibraryCache, searchLibraryAlbum, searchLibraryArtist } from './librarySearch.mjs';
import { addPlayHistory, getPlayHistory, toggleLike, getLikedSongs, isLiked } from './db.mjs';
import { verifyNeteaseCookie, getNeteasePlaylistsByCookie, getNeteaseTracksByCookie } from './login.mjs';
import { verifyKugouCookie, getKugouPlaylistsByCookie, getKugouTracksByCookie, getKugouPlayUrl } from './kugou.mjs';
import { normalizeCookieInput } from './kugouSign.mjs';
import { qrKeyForPlatform, qrImageForPlatform, qrCheckForPlatform } from './qrLogin.mjs';
import { createSession, getSession, updateSessionCookie, ensureFreshSession } from './session.mjs';
import { ok, fail, Err } from './response.mjs';
import { recordUrlResult, recordPlayResult, getMetrics } from './metrics.mjs';
import { queueAdd, playerPlay, getPlayerStatus } from './playerState.mjs';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

/** Pick Referer header for upstream CDN hotlink checks. */
function proxyRefererForUrl(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (host.includes('kugou.com')) return 'https://www.kugou.com/';
    if (host.includes('kuwo.cn')) return 'https://www.kuwo.cn/';
    if (host.includes('qpic.cn') || host.includes('qq.com')) return 'https://y.qq.com/';
    return 'https://music.163.com/';
  } catch {
    return 'https://music.163.com/';
  }
}

app.get('/api/health', function(req, res) {
  return ok(res, { status: 'ok', name: 'Abyss Radio API' });
});

app.get('/api/metrics', function(req, res) {
  return ok(res, getMetrics());
});

app.get('/api/music/search', async function(req, res) {
  const keyword = req.query.q || '';
  const source = req.query.source || 'both';
  if (!keyword) return res.status(400).json({ error: 'missing query param q' });
  try {
    let songs;
    if (source === 'netease') songs = await searchNetease(keyword);
    else if (source === 'kugou') songs = await searchKuGou(keyword);
    else songs = await searchBoth(keyword);
    res.json({ songs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/music/url', async function(req, res) {
  const id = req.query.id || '';
  const source = req.query.source || 'netease';
  if (!id) return res.status(400).json({ error: 'missing query param id' });
  try {
    const result = await getUrl(id, source);
    if (!result) return res.status(404).json({ error: 'no url found' });
    res.json({ url: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Smart URL — one primary auth chain + one Meting fallback.
 * Primary: session platform wins (netease NEAPI / kugou auth). Fallback: getUrlSmart once.
 */
app.get('/api/music/url-smart', async function(req, res) {
  const id = req.query.id || '';
  // Drop kuwo — Meting returns non-URL error JSON that used to leak into <audio>
  const sources = (req.query.sources ? req.query.sources.split(',') : ['netease', 'kugou'])
    .map((s) => String(s).trim())
    .filter((s) => s && s !== 'kuwo');
  const keyword = req.query.q || '';
  const key = req.query.key || '';
  if (!id) return res.status(400).json({ error: 'missing query param id' });
  try {
    let session = null;
    let neteaseCookie;
    let kugouCookie = process.env.KUGOU_COOKIE || undefined;
    if (key) {
      const fresh = await ensureFreshSession(key);
      session = fresh?.session || null;
      if (session?.platform === 'netease') neteaseCookie = fresh.cookie;
      if (session?.platform === 'kugou') kugouCookie = fresh.cookie;
    }

    // Primary: authenticated source matching session (or sources order)
    const primary = session?.platform && sources.includes(session.platform)
      ? session.platform
      : (sources.find((s) => s === 'netease' || s === 'kugou') || sources[0]);

    let url = null;
    let playable = true;
    let trial = false;
    let trialLen = 0;
    if (primary === 'netease' && sources.includes('netease')) {
      const nr = await getUrlNeteaseSmart(id, neteaseCookie);
      url = nr.url;
      playable = nr.playable;
      trial = nr.trial;
      trialLen = nr.trialLen;
    } else if (primary === 'kugou' && sources.includes('kugou') && kugouCookie) {
      url = await getKugouPlayUrl(id, kugouCookie, key, { quality: req.query.quality });
      if (!url) url = await getKugouUrlWithCookie(id, kugouCookie);
    } else if (sources.includes('netease')) {
      const nr = await getUrlNeteaseSmart(id, neteaseCookie);
      url = nr.url;
      playable = nr.playable;
      trial = nr.trial;
      trialLen = nr.trialLen;
    }

    // Exact playlist ids must not cross-source search-fallback
    if (!isPlayableUrl(url) && !String(id).includes('|')) {
      url = await getUrlSmart(id, sources, keyword, kugouCookie);
    }

    if (!isPlayableUrl(url)) {
      recordUrlResult(false);
      return res.status(404).json({ error: 'no url found from any source' });
    }
    recordUrlResult(true);
    res.json({ url: String(url).trim(), playable, trial, trialLen });
  } catch (e) {
    recordUrlResult(false);
    res.status(500).json({ error: e.message });
  }
});

// Image proxy — bypasses platform hotlink protection / mixed-content for cover art
app.get('/api/img', async function(req, res) {
  const raw = req.query.url || '';
  if (!raw || !/^https?:\/\//i.test(raw)) return res.status(400).end();
  try {
    const referer = proxyRefererForUrl(raw);
    const upstream = await fetch(raw, {
      headers: {
        Referer: referer,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
    });
    if (!upstream.ok) return res.status(upstream.status).end();
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (e) {
    res.status(502).end();
  }
});

// Audio proxy — Referer + session cookie + CORS so <audio> can read VIP streams
app.get('/api/audio', async function(req, res) {
  const raw = req.query.url || '';
  if (!raw || !/^https?:\/\//i.test(raw)) return res.status(400).end();
  try {
    const referer = proxyRefererForUrl(raw);
    let host = '';
    try { host = new URL(raw).hostname.toLowerCase(); } catch { /* ignore */ }
    const isKugou = /kugou\.com/i.test(host);
    const isNetease = /126\.net|netease/i.test(host);
    const upstreamHeaders = {
      Referer: referer,
      'User-Agent': isKugou
        ? 'Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    };
    const sessionKey = req.query.key || '';
    const session = sessionKey ? getSession(sessionKey) : null;
    if (session?.cookie) {
      if (isKugou && session.platform === 'kugou') upstreamHeaders.Cookie = session.cookie;
      else if (isNetease && session.platform === 'netease') upstreamHeaders.Cookie = session.cookie;
    }
    if (req.headers.range) upstreamHeaders['Range'] = req.headers.range;

    const upstream = await fetch(raw, { headers: upstreamHeaders });
    if (!upstream.ok && upstream.status !== 206) return res.status(upstream.status).end();

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Accept-Ranges', 'bytes');
    const ct = upstream.headers.get('content-type');
    if (ct) res.set('Content-Type', ct);
    const cr = upstream.headers.get('content-range');
    if (cr) res.set('Content-Range', cr);
    const cl = upstream.headers.get('content-length');
    if (cl) res.set('Content-Length', cl);
    res.status(upstream.status);

    if (upstream.body) {
      Readable.fromWeb(upstream.body).pipe(res);
    } else {
      res.end(Buffer.from(await upstream.arrayBuffer()));
    }
  } catch (e) {
    res.status(502).end();
  }
});

app.get('/api/music/lyric', async function(req, res) {
  const id = req.query.id || '';
  const source = req.query.source || 'netease';
  const key = req.query.key || '';
  const keyword = req.query.keyword || '';
  if (!id) return res.status(400).json({ error: 'missing query param id' });
  try {
    // Same session refresh as url-smart — QR login cookie must reach lyric/tlyric too.
    let platformCookie;
    if (key) {
      const fresh = await ensureFreshSession(key);
      const session = fresh?.session;
      if (session?.platform === 'kugou') platformCookie = fresh.cookie;
      else if (session?.platform === 'netease') platformCookie = fresh.cookie;
    }
    if (!platformCookie) {
      platformCookie = source === 'kugou'
        ? (process.env.KUGOU_COOKIE || undefined)
        : (process.env.NETEASE_COOKIE || undefined);
    }
    // keyword = "artist\ttitle" (defect 8) — used for Netease translation borrow
    const lyric = await getLyric(id, source, platformCookie, keyword);
    if (typeof lyric === 'string') res.json({ lyric, krc: '', tlyric: '' });
    else res.json({ lyric: lyric.lrc || '', krc: lyric.krc || '', tlyric: lyric.tlyric || '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DeepSeek AI DJ chat — injects current track (body.track or server player status)
app.post('/api/chat', express.json(), async function(req, res) {
  const { message, history, track } = req.body || {};
  if (!message) return res.status(400).json({ error: 'missing message' });
  try {
    const status = getPlayerStatus();
    const nowPlaying = track || status.current || null;
    const result = await chatWithDeepSeek(message, history || [], nowPlaying);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** DeepSeek API Key status (no secret leaked beyond hint). */
app.get('/api/settings/deepseek', function(_req, res) {
  res.json(getDeepseekStatus());
});

/** Save / clear DeepSeek API Key — hot-reloads in-process. */
app.post('/api/settings/deepseek', express.json(), function(req, res) {
  const key = req.body?.key;
  if (key === undefined || key === null) {
    return res.status(400).json({ error: 'missing key (pass empty string to clear)' });
  }
  const result = setDeepseekApiKey(String(key));
  res.json(result);
});

/**
 * Point-song within bound playlists only (no global search).
 * body: { key: sessionKey, q: query }
 */
app.post('/api/library/search', express.json(), async function(req, res) {
  const key = req.body?.key || req.body?.sessionKey || '';
  const q = req.body?.q || req.body?.query || '';
  const mode = String(req.body?.mode || 'song').toLowerCase();
  try {
    const result = mode === 'album'
      ? await searchLibraryAlbum(key, q)
      : mode === 'artist'
        ? await searchLibraryArtist(key, q)
        : await searchLibrary(key, q);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message, track: null, matches: [], message: e.message });
  }
});

app.post('/api/library/cache/clear', express.json(), function(req, res) {
  clearLibraryCache(req.body?.key || '');
  res.json({ ok: true });
});

// ===== Stable control plane (Jarvis / external) — { code, data, msg } =====

app.post('/api/queue/add', express.json(), function(req, res) {
  const body = req.body || {};
  const items = body.tracks || body.track || body;
  try {
    const data = queueAdd(items, { sessionKey: body.sessionKey || body.key });
    return ok(res, data, 'queued');
  } catch (e) {
    return fail(res, Err.BAD_REQUEST, e.message, 400);
  }
});

app.post('/api/player/play', express.json(), async function(req, res) {
  const body = req.body || {};
  try {
    const data = playerPlay({
      index: body.index,
      id: body.id,
      source: body.source,
      title: body.title,
      artist: body.artist,
      cover: body.cover,
      duration: body.duration,
      sessionKey: body.sessionKey || body.key,
    });
    // Resolve a playable URL for the current track when possible
    const cur = data.current;
    let playUrl = null;
    if (cur?.id) {
      const key = data.sessionKey || '';
      const fresh = key ? await ensureFreshSession(key) : null;
      const platform = cur.source || fresh?.session?.platform || 'netease';
      try {
        if (platform === 'kugou') {
          const cookie = fresh?.session?.platform === 'kugou'
            ? fresh.cookie
            : (process.env.KUGOU_COOKIE || undefined);
          if (cookie) {
            playUrl = await getKugouPlayUrl(cur.id, cookie, key);
            if (!playUrl) playUrl = await getKugouUrlWithCookie(cur.id, cookie);
          }
        } else {
          const cookie = fresh?.session?.platform === 'netease' ? fresh.cookie : undefined;
          const nr = await getUrlNeteaseSmart(cur.id, cookie);
          playUrl = nr.url;
        }
        if (!playUrl && !String(cur.id).includes('|')) {
          playUrl = await getUrlSmart(cur.id, [platform, 'netease', 'kugou'], cur.title, process.env.KUGOU_COOKIE);
        }
      } catch { /* leave playUrl null */ }
    }
    if (playUrl) {
      recordPlayResult(true);
      return ok(res, { ...data, url: playUrl }, 'playing');
    }
    recordPlayResult(false);
    return ok(res, { ...data, url: null }, 'playing (url unresolved)');
  } catch (e) {
    recordPlayResult(false);
    return fail(res, Err.BAD_REQUEST, e.message, 400);
  }
});

app.get('/api/player/status', function(req, res) {
  return ok(res, getPlayerStatus());
});

// ===== Database endpoints =====

// Record a play
app.post('/api/history/play', express.json(), async function(req, res) {
  const song = req.body;
  if (!song || !song.id) return res.status(400).json({ error: 'missing song data' });
  try {
    await addPlayHistory(song);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get play history
app.get('/api/history/plays', async function(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const rows = await getPlayHistory(limit);
    res.json({ history: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Toggle like on a song
app.post('/api/likes/toggle', express.json(), async function(req, res) {
  const song = req.body;
  if (!song || !song.id) return res.status(400).json({ error: 'missing song data' });
  try {
    const result = await toggleLike(song);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get liked songs
app.get('/api/likes', async function(req, res) {
  try {
    const rows = await getLikedSongs();
    res.json({ songs: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Check if a song is liked
app.get('/api/likes/check', async function(req, res) {
  const songId = req.query.id;
  if (!songId) return res.status(400).json({ error: 'missing song id' });
  try {
    const liked = await isLiked(songId);
    res.json({ liked });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== QR Login =====

// Step 1: Get QR key (required before creating QR code)
app.get('/api/login/qr-key', async function(req, res) {
  const platform = req.query.platform || 'netease';
  try {
    const result = await qrKeyForPlatform(platform);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Step 2: Generate QR code image from key
app.get('/api/login/qr', async function(req, res) {
  const key = req.query.key;
  const platform = req.query.platform || 'netease';
  if (!key) return res.status(400).json({ error: 'missing key' });
  try {
    const qr = await qrImageForPlatform(platform, key);
    res.json(qr);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Step 3: Poll QR login status — on success returns session key for playlists API
app.get('/api/login/qr-check', async function(req, res) {
  const key = req.query.key;
  const platform = req.query.platform || 'netease';
  if (!key) return res.status(400).json({ error: 'missing key' });
  const result = await qrCheckForPlatform(platform, key);
  res.json(result);
});

// ===== Cookie binding (manual) =====

// Bind a platform cookie -> returns a session key + user info
app.post('/api/session/bind', express.json(), async function(req, res) {
  const { platform, cookie: rawCookie } = req.body || {};
  if (!platform || !rawCookie) return res.status(400).json({ error: 'missing platform or cookie' });
  let cookie = platform === 'kugou' ? normalizeCookieInput(rawCookie) : String(rawCookie).trim();
  try {
    let user;
    if (platform === 'netease') {
      user = await verifyNeteaseCookie(cookie);
    } else if (platform === 'kugou') {
      user = verifyKugouCookie(cookie);
      process.env.KUGOU_COOKIE = cookie;
    } else {
      return res.status(400).json({ error: 'unsupported platform' });
    }
    const key = createSession(platform, cookie, user);
    res.json({ key, platform, user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Import KuGou web cookie saved by Mineradio desktop (%APPDATA%/Mineradio/.kugou-cookie)
app.get('/api/login/kugou/import-mineradio', async function(req, res) {
  const candidates = [
    join(process.env.APPDATA || '', 'Mineradio', '.kugou-cookie'),
    join(homedir(), 'AppData', 'Roaming', 'Mineradio', '.kugou-cookie'),
  ];
  for (const file of candidates) {
    try {
      if (!existsSync(file)) continue;
      const cookie = normalizeCookieInput(readFileSync(file, 'utf8'));
      if (!cookie) continue;
      const user = verifyKugouCookie(cookie);
      process.env.KUGOU_COOKIE = cookie;
      const key = createSession('kugou', cookie, user);
      return res.json({ ok: true, key, platform: 'kugou', user, source: file });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }
  res.status(404).json({ error: '未找到 Mineradio 酷狗登录文件（请先用 Mineradio 扫码登录，或直接粘贴 cookie）' });
});

// ===== Playlists =====

// Get user's playlists for a bound session
app.get('/api/playlists', async function(req, res) {
  const key = req.query.key;
  const fresh = key ? await ensureFreshSession(key) : null;
  const session = fresh?.session;
  if (!session) return res.status(401).json({ error: '会话已失效，请重新绑定账号' });
  try {
    let playlists;
    if (session.platform === 'netease') {
      playlists = await getNeteasePlaylistsByCookie(fresh.cookie);
    } else if (session.platform === 'kugou') {
      const result = await getKugouPlaylistsByCookie(fresh.cookie);
      if (result.cookie && result.cookie !== fresh.cookie) {
        updateSessionCookie(key, result.cookie);
        process.env.KUGOU_COOKIE = result.cookie;
      }
      playlists = result.playlists;
    } else {
      return res.status(400).json({ error: 'unsupported platform' });
    }
    res.json({ playlists });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get playlist tracks for a bound session
app.get('/api/playlist/tracks', async function(req, res) {
  const key = req.query.key;
  const listId = req.query.id;
  const fresh = key ? await ensureFreshSession(key) : null;
  const session = fresh?.session;
  if (!session) return res.status(401).json({ error: '会话已失效，请重新绑定账号' });
  if (!listId) return res.status(400).json({ error: 'missing playlist id' });
  try {
    let tracks;
    if (session.platform === 'netease') {
      tracks = await getNeteaseTracksByCookie(listId, fresh.cookie);
    } else if (session.platform === 'kugou') {
      const result = await getKugouTracksByCookie(listId, fresh.cookie);
      if (result.cookie && result.cookie !== fresh.cookie) {
        updateSessionCookie(key, result.cookie);
        process.env.KUGOU_COOKIE = result.cookie;
      }
      tracks = result.tracks;
    } else {
      return res.status(400).json({ error: 'unsupported platform' });
    }
    res.json({ tracks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve built frontend (Electron / production) — must be before the 404 catch-all.
const FRONTEND_DIST = process.env.FRONTEND_DIST || '';
if (FRONTEND_DIST && existsSync(join(FRONTEND_DIST, 'index.html'))) {
  app.use(express.static(FRONTEND_DIST));
  console.log('[static] serving frontend from ' + FRONTEND_DIST);
}

app.use(function(req, res) {
  res.status(404).json({ error: 'not found' });
});

app.listen(PORT, function() {
  console.log('Abyss Radio API running on http://localhost:' + PORT);
});
