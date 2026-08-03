import Meting from '@meting/core';

function makeMeting(source) {
  var m = new Meting(source);
  var cookie = process.env.NETEASE_COOKIE;
  var kugouCookie = process.env.KUGOU_COOKIE;
  if (cookie && source === 'netease') {
    m.cookie(cookie);
  }
  if (kugouCookie && source === 'kugou') {
    m.cookie(kugouCookie);
  }
  return m;
}

function parseResponse(data) {
  if (!data) return [];
  var parsed = typeof data === 'string' ? JSON.parse(data) : data;
  var songs = parsed && parsed.result && parsed.result.songs ? parsed.result.songs
           : parsed && parsed.songs ? parsed.songs
           : parsed && parsed.data && parsed.data.info ? parsed.data.info
           : Array.isArray(parsed) ? parsed
           : [];
  if (!Array.isArray(songs)) return [];
  return songs.map(function(s) {
    // Artist: try multiple field names for different music sources
    var artistName = '';
    if (s.artist) {
      artistName = s.artist;
    } else if (s.artists) {
      artistName = s.artists.map(function(a) { return a.name; }).join(', ');
    } else if (s.singer) {
      artistName = s.singer;
    } else if (s.ar) {
      artistName = s.ar.map(function(a) { return a.name; }).join(', ');
    }
    // Cover: try multiple field names
    var coverUrl = '';
    if (s.pic) {
      coverUrl = s.pic;
    } else if (s.picUrl) {
      coverUrl = s.picUrl;
    } else if (s.album && s.album.picUrl) {
      coverUrl = s.album.picUrl;
    } else if (s.al && s.al.picUrl) {
      coverUrl = s.al.picUrl;
    } else if (s.imgUrl) {
      coverUrl = s.imgUrl;
    }
    return {
      id: String(s.id || s.hash || s.songid || ''),
      title: s.name || s.title || s.songname || s.filename || '',
      artist: artistName || s.singername || '',
      cover: coverUrl || s.cover || s.pic_big || s.pic_small || '',
      duration: s.duration ? Math.round(typeof s.duration === 'string' ? parseInt(s.duration) : s.duration) : s.dt ? s.dt / 1000 : (s.duration || 0),
      source: '',
    };
  });
}

export async function searchNetease(keyword, limit) {
  if (!limit) limit = 10;
  var meting = makeMeting('netease');
  var data = await meting.search(keyword, { limit: limit });
  var items = parseResponse(data);
  items.forEach(function(s) { s.source = 'netease'; });
  return items;
}

export async function searchKuGou(keyword, limit) {
  if (!limit) limit = 10;
  var meting = makeMeting('kugou');
  var data = await meting.search(keyword, { limit: limit });
  var items = parseResponse(data);
  items.forEach(function(s) { s.source = 'kugou'; });
  return items;
}

export async function searchBoth(keyword, limit) {
  if (!limit) limit = 10;
  var n = await searchNetease(keyword, limit);
  var k = await searchKuGou(keyword, limit);
  var combined = [];
  var maxLen = n.length > k.length ? n.length : k.length;
  for (var i = 0; i < maxLen; i++) {
    if (i < n.length) combined.push(n[i]);
    if (i < k.length) combined.push(k[i]);
  }
  return combined.slice(0, limit);
}

export async function getUrl(songId, source) {
  if (!source) source = 'netease';
  var meting = makeMeting(source);
  var raw = await meting.url(songId);
  // KuGou with cookie returns decoded URL directly from Meting's internal flow
  if (source === 'kugou') {
    return extractKugouUrl(meting, raw);
  }
  return extractUrlFromRaw(raw);
}

/** Only accept real stream URLs — reject error JSON / garbage strings from Meting. */
export function isPlayableUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
}

async function extractKugouUrl(meting, raw) {
  // Try Meting's own decode first (it handles kugou_url_new and kugou_url_legacy)
  try {
    var decoded = await meting.provider.handleDecode('kugou_url_new', raw);
    var p = typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
    if (isPlayableUrl(p.url)) return p.url.trim();
  } catch {}
  try {
    var decoded2 = await meting.provider.handleDecode('kugou_url_legacy', raw);
    var p2 = typeof decoded2 === 'string' ? JSON.parse(decoded2) : decoded2;
    if (isPlayableUrl(p2.url)) return p2.url.trim();
  } catch {}
  return extractUrlFromRaw(raw);
}

/** Fetch KuGou play URL using a bound user cookie (Meting decode path). */
export async function getKugouUrlWithCookie(songId, cookie) {
  if (!cookie || !songId) return null;
  var hash = String(songId).split('|')[0];
  var meting = new Meting('kugou');
  meting.cookie(cookie);
  try {
    var raw = await meting.url(hash);
    return await extractKugouUrl(meting, raw);
  } catch {
    return null;
  }
}

async function extractUrlFromRaw(raw) {
  if (!raw) return null;
  // Concatenated error blobs like `{"msg":"..."}{"msg":"..."}` fail parse → must NOT return raw
  try {
    var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object' && (parsed.code === 400 || parsed.msg === '参数错误')) {
      return null;
    }
    var data = parsed.data || parsed;
    if (Array.isArray(data) && data.length > 0) {
      var item = data[0];
      if (isPlayableUrl(item.play_url)) return item.play_url.trim();
      if (isPlayableUrl(item.url)) return item.url.trim();
      // KuGou VIP: need to make a second request to trackercdn
      if (item.relate_goods && Array.isArray(item.relate_goods) && item.relate_goods.length > 0) {
        return await kugouVipUrl(item.relate_goods);
      }
    }
    if (data && isPlayableUrl(data.play_url)) return data.play_url.trim();
    if (data && isPlayableUrl(data.url)) return data.url.trim();
    return null;
  } catch {
    // Bare URL string (rare) — only accept http(s)
    if (typeof raw === 'string' && isPlayableUrl(raw)) return raw.trim();
    return null;
  }
}

async function kugouVipUrl(relateGoods) {
  var crypto = await import('crypto');
  // Try each relate_good starting from highest bitrate
  var sorted = relateGoods.slice().sort(function(a, b) {
    return (b.info && b.info.bitrate || 0) - (a.info && a.info.bitrate || 0);
  });
  for (var i = 0; i < sorted.length; i++) {
    var g = sorted[i];
    var hash = g.hash || '';
    if (!hash) continue;
    var key = crypto.createHash('md5').update(hash.toLowerCase() + 'kgcloudv2').digest('hex');
    var trackUrl = 'http://trackercdn.kugou.com/i/v2/?hash=' + hash.toLowerCase() + '&key=' + key + '&pid=3&behavior=play&cmd=25&version=8990';
    try {
      var res = await fetch(trackUrl);
      var text = await res.text();
      var json = JSON.parse(text);
      var u = Array.isArray(json.url) ? json.url[0] : json.url;
      if (isPlayableUrl(u)) return String(u).trim();
    } catch {}
  }
  return null;
}

function isFeeSong(raw) {
  try {
    var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    var data = parsed.data || parsed;
    if (Array.isArray(data) && data.length > 0) {
      // fee=1 = VIP, time<60s = trial
      var item = data[0];
      return item.fee === 1 && item.time && item.time < 60000;
    }
    return false;
  } catch {
    return false;
  }
}

async function tryMetingUrl(src, songKey, kugouCookie) {
  // Fresh Meting — do NOT use makeMeting() here (it sticky-applies env KUGOU_COOKIE)
  var meting = new Meting(src);
  if (src === 'kugou' && kugouCookie) meting.cookie(kugouCookie);
  else if (src === 'netease' && process.env.NETEASE_COOKIE) meting.cookie(process.env.NETEASE_COOKIE);
  var id = String(songKey).split('|')[0];
  var raw = await meting.url(id);
  var url = src === 'kugou'
    ? await extractKugouUrl(meting, raw)
    : await extractUrlFromRaw(raw);
  return { url: isPlayableUrl(url) ? url : null, raw, trial: isFeeSong(raw) };
}

/**
 * Single-pass Meting fallback: prefer non-trial URLs, else first playable.
 * Callers should already have tried the authenticated primary source.
 * kuwo is skipped — Meting returns error JSON strings that are not playable.
 */
export async function getUrlSmart(songId, sources, searchKeyword, kugouCookie) {
  var sourcesList = (sources || ['netease', 'kugou']).filter(function(s) {
    return s && s !== 'kuwo';
  });
  var trialFallback = null;
  for (var src of sourcesList) {
    try {
      var songKey = songId;
      if (src !== 'netease' && searchKeyword && !String(songKey).includes('|')) {
        var searchFn = src === 'kugou' ? searchKuGou : null;
        if (searchFn) {
          var results = await searchFn(searchKeyword, 5);
          if (results && results.length > 0) songKey = results[0].id;
        }
      }
      var hit = await tryMetingUrl(src, songKey, src === 'kugou' ? kugouCookie : undefined);
      // Stale/invalid KUGOU_COOKIE often yields garbage — retry anonymous once
      if (!hit.url && src === 'kugou' && kugouCookie) {
        hit = await tryMetingUrl(src, songKey, '');
      }
      if (!hit.url) continue;
      if (!hit.trial) return hit.url;
      if (!trialFallback) trialFallback = hit.url;
    } catch {}
  }
  return trialFallback;
}

async function getUrlRaw(songId, source, cookieOverride) {
  var meting = makeMeting(source);
  if (cookieOverride && source === 'kugou') meting.cookie(cookieOverride);
  var id = String(songId).split('|')[0];
  return await meting.url(id);
}

export async function getLyric(songId, source, kugouCookie, searchKeyword) {
  if (!source) source = 'netease';
  var id = String(songId);
  var kugou = null;
  if (source === 'kugou') {
    const { getKugouLyric } = await import('./kugou.mjs');
    kugou = await getKugouLyric(id, kugouCookie);
    // Keep hash part only for fallback; remember keyword for Netease translation lookup
    const parts = id.split('|');
    id = parts[0];
    searchKeyword = searchKeyword || decodeURIComponent(parts[1] || '');
    if (kugou.lrc) {
      const tlyric = await neteaseTranslationFallback(searchKeyword, kugou.tlyric);
      return { lrc: kugou.lrc, krc: kugou.krc || '', tlyric };
    }
  }
  var meting = makeMeting(source);
  if (kugouCookie && source === 'kugou') meting.cookie(kugouCookie);
  var raw = await meting.lyric(id);
  // raw is a JSON string from Meting — parse and extract the lyric text
  try {
    var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    var lrc = parsed.lrc || parsed;
    var tlyric = (parsed.tlyric && parsed.tlyric.lyric) || '';
    // Defect 8: Netease-source songs with no translation — try a same-name
    // borrow too (a different release/version may carry tlyric).
    if (source === 'netease' && !tlyric && searchKeyword) {
      tlyric = await neteaseTranslationFallback(searchKeyword, '');
    }
    return { lrc: lrc.lyric || '', krc: '', tlyric };
  } catch {
    return { lrc: '', krc: '', tlyric: '' };
  }
}

/** Netease translation fallback (Mineradio-style): when the source platform has
 *  no translation, search the same song on Netease and borrow its tlyric.
 *  keyword format: "artist<TAB>title" (frontend) or legacy "artist title".
 *  Bounded: only caches a miss AFTER trying every candidate (defect 8). */
const neteaseTransCache = new Map();   // keyword -> { tlyric, at }
const neteaseTransMiss = new Map();   // keyword -> at
async function neteaseTranslationFallback(keyword, existing) {
  if (existing && existing.trim()) return existing;
  const kw = String(keyword || '').trim();
  if (!kw) return '';
  const now = Date.now();
  if (neteaseTransCache.has(kw)) return neteaseTransCache.get(kw).tlyric;
  if (neteaseTransMiss.has(kw) && now - neteaseTransMiss.get(kw) < 10 * 60 * 1000) return '';
  try {
    // Split "artist\t title" (or legacy "artist title"): search with the full
    // string, match against the title part with whole-word semantics.
    const tabIdx = kw.indexOf('\t');
    let titleNeedle, artistNeedle;
    if (tabIdx >= 0) {
      artistNeedle = kw.slice(0, tabIdx).trim();
      titleNeedle = kw.slice(tabIdx + 1).trim();
    } else {
      const parts = kw.split(/\s+/);
      // Heuristic for legacy form: last 1..2 tokens are likely the title
      artistNeedle = parts.slice(0, -1).join(' ');
      titleNeedle = parts[parts.length - 1] || '';
    }
    const norm = (s) => String(s || '').toLowerCase().replace(/[\s（）()\[\]【】\-—_·.。,!！?？:：'"“”‘’]/g, '');
    const needleT = norm(titleNeedle);
    if (!needleT || needleT.length < 2) return '';
    const needleA = norm(artistNeedle);

    const items = await searchNetease(`${titleNeedle} ${artistNeedle}`.trim(), 8);
    for (const it of items) {
      const t = norm(it.title);
      const a = norm(it.artist);
      // Whole-title match: exact after normalization, or contiguous containment
      // of at least 4 chars (CJK) / 4 latin chars — never 2-char fuzzy includes.
      let titleHit = t === needleT;
      if (!titleHit && needleT.length >= 4) {
        titleHit = t.includes(needleT) || needleT.includes(t);
      }
      if (!titleHit) continue;
      // Artist bonus: prefer the original artist but don't hard-fail on it —
      // many Netease entries tag "artist - 歌手" strings.
      const artistScore = !needleA || a.includes(needleA) || needleA.includes(a) ? 1 : 0;
      const raw = await makeMeting('netease').lyric(it.id);
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const tl = (parsed?.tlyric?.lyric) || '';
      if (tl && tl.trim()) {
        neteaseTransCache.set(kw, { tlyric: tl, at: now });
        return tl;
      }
      // No translation on this candidate — try the next (defect 8: no early break)
    }
    neteaseTransMiss.set(kw, now);
    return '';
  } catch {
    neteaseTransMiss.set(kw, now);
    return '';
  }
}