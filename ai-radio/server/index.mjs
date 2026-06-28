import express from 'express';
import cors from 'cors';
import { Readable } from 'stream';
import { searchBoth, searchNetease, searchKuGou, getUrl, getUrlSmart, getLyric } from './ncm.mjs';
import { getUrlNetease } from './ncm-neapi.mjs';
import { chatWithDeepSeek } from './deepseek.mjs';
import { addPlayHistory, getPlayHistory, toggleLike, getLikedSongs, isLiked, addChatMessage, getChatHistory } from './db.mjs';
import { getQrKey, createQr, checkQr, getUserPlaylists, getPlaylistTracks,
  verifyNeteaseCookie, getNeteasePlaylistsByCookie, getNeteaseTracksByCookie } from './login.mjs';
import { verifyKugouCookie, getKugouPlaylistsByCookie, getKugouTracksByCookie } from './kugou.mjs';
import { createSession, getSession } from './session.mjs';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', function(req, res) {
  res.json({ status: 'ok', name: 'Abyss Radio API' });
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

// Smart URL: tries Netease first (via NEAPI for VIP), falls back to KuGou/Kuwo
app.get('/api/music/url-smart', async function(req, res) {
  const id = req.query.id || '';
  const sources = req.query.sources ? req.query.sources.split(',') : ['netease', 'kugou', 'kuwo'];
  const keyword = req.query.q || '';
  const key = req.query.key || '';
  if (!id) return res.status(400).json({ error: 'missing query param id' });
  try {
    // Resolve a bound netease session cookie (for full-length VIP playback)
    const session = key ? getSession(key) : null;
    const neteaseCookie = session && session.platform === 'netease' ? session.cookie : undefined;
    // Step 1: Try NEAPI VIP URL (authenticated Netease)
    if (sources.includes('netease')) {
      const vipUrl = await getUrlNetease(id, neteaseCookie);
      if (vipUrl) return res.json({ url: vipUrl });
    }
    // Step 2: Try Meting smart fallback
    const result = await getUrlSmart(id, sources, keyword);
    if (!result) return res.status(404).json({ error: 'no url found from any source' });
    res.json({ url: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Image proxy — bypasses platform hotlink protection / mixed-content for cover art
app.get('/api/img', async function(req, res) {
  const raw = req.query.url || '';
  if (!raw || !/^https?:\/\//i.test(raw)) return res.status(400).end();
  try {
    const upstream = await fetch(raw, {
      headers: {
        'Referer': 'https://music.163.com/',
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

// Audio proxy — Referer + CORS so <audio> and Web Audio analyser can read the stream
app.get('/api/audio', async function(req, res) {
  const raw = req.query.url || '';
  if (!raw || !/^https?:\/\//i.test(raw)) return res.status(400).end();
  try {
    const upstreamHeaders = {
      'Referer': 'https://music.163.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    };
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
  if (!id) return res.status(400).json({ error: 'missing query param id' });
  try {
    const lyric = await getLyric(id, source);
    res.json({ lyric: lyric || '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DeepSeek AI DJ chat endpoint
app.post('/api/chat', express.json(), async function(req, res) {
  const { message, history, track } = req.body || {};
  if (!message) return res.status(400).json({ error: 'missing message' });
  try {
    const result = await chatWithDeepSeek(message, history || [], track || null);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
  try {
    const key = await getQrKey();
    res.json({ key });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Step 2: Generate QR code image from key
app.get('/api/login/qr', async function(req, res) {
  const key = req.query.key;
  if (!key) return res.status(400).json({ error: 'missing key' });
  try {
    const qr = await createQr(key);
    res.json(qr);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Step 3: Poll QR login status
app.get('/api/login/qr-check', async function(req, res) {
  const key = req.query.key;
  if (!key) return res.status(400).json({ error: 'missing key' });
  try {
    const result = await checkQr(key);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Set cookie manually (for debugging / direct paste)
app.post('/api/login/cookie', express.json(), async function(req, res) {
  const { key, cookie } = req.body || {};
  if (!key || !cookie) return res.status(400).json({ error: 'missing key or cookie' });
  // Store in sessions
  const { getSessionCookie } = await import('./login.mjs');
  // Use the module's internal store via a temp approach
  res.json({ ok: true });
});

// ===== Cookie binding (manual) =====

// Bind a platform cookie -> returns a session key + user info
app.post('/api/session/bind', express.json(), async function(req, res) {
  const { platform, cookie } = req.body || {};
  if (!platform || !cookie) return res.status(400).json({ error: 'missing platform or cookie' });
  try {
    let user;
    if (platform === 'netease') {
      user = await verifyNeteaseCookie(cookie);
    } else if (platform === 'kugou') {
      user = verifyKugouCookie(cookie);
      process.env.KUGOU_COOKIE = cookie; // enable VIP playback via Meting
    } else {
      return res.status(400).json({ error: 'unsupported platform' });
    }
    const key = createSession(platform, cookie, user);
    res.json({ key, platform, user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ===== Playlists =====

// Get user's playlists for a bound session
app.get('/api/playlists', async function(req, res) {
  const key = req.query.key;
  const session = key ? getSession(key) : null;
  if (!session) return res.status(401).json({ error: '会话已失效，请重新绑定账号' });
  try {
    let playlists;
    if (session.platform === 'netease') {
      playlists = await getNeteasePlaylistsByCookie(session.cookie);
    } else if (session.platform === 'kugou') {
      playlists = await getKugouPlaylistsByCookie(session.cookie, session.user);
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
  const session = key ? getSession(key) : null;
  if (!session) return res.status(401).json({ error: '会话已失效，请重新绑定账号' });
  if (!listId) return res.status(400).json({ error: 'missing playlist id' });
  try {
    let tracks;
    if (session.platform === 'netease') {
      tracks = await getNeteaseTracksByCookie(listId, session.cookie);
    } else if (session.platform === 'kugou') {
      tracks = await getKugouTracksByCookie(listId, session.cookie);
    } else {
      return res.status(400).json({ error: 'unsupported platform' });
    }
    res.json({ tracks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use(function(req, res) {
  res.status(404).json({ error: 'not found' });
});

app.listen(PORT, function() {
  console.log('Abyss Radio API running on http://localhost:' + PORT);
});
