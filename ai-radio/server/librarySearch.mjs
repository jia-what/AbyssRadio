/**
 * Search tracks inside the user's bound playlists (no DeepSeek / no global search).
 * Progressive scan: keep fetching playlists until a strong title hit, not only top N.
 */
import { getSession, ensureFreshSession } from './session.mjs';
import { getNeteasePlaylistsByCookie, getNeteaseTracksByCookie } from './login.mjs';
import { getKugouPlaylistsByCookie, getKugouTracksByCookie } from './kugou.mjs';
import {
  parseAlbumQuery,
  pickAlbumTrack,
  albumClarifySuggestions,
  trackMatchesAlbum,
  parseArtistQuery,
  pickArtistTrack,
} from './albumPlay.mjs';

const cache = new Map(); // key -> { at, tracks }
const CACHE_MS = 5 * 60 * 1000;
const MAX_PLAYLISTS = 40;
/** 歌手/专辑查询按需加深扫描的歌单上限（可能漏在第 40 个之后的歌单里） */
const MAX_PLAYLISTS_DEEP = 100;
const MAX_TRACKS = 3000;
/** Reject weak / artist-only noise. */
const MIN_SCORE = 50;
/** Strong enough to stop scanning more playlists. */
const EARLY_HIT = 88;

const STOP = new Set([
  'by', 'the', 'a', 'an', 'feat', 'ft', 'featuring', 'with', 'and',
  '的', '和', '与', '一首', '放', '听', 'play',
]);

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function tokensOf(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[()[\]【】（）]/g, ' ')
    .split(/[\s,/,&+\-–—]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

/**
 * Parse "luther by kendrick lamar" / "歌名 - 歌手" into title + artist.
 */
export function parseSongQuery(query) {
  let raw = String(query || '').trim();
  raw = raw.replace(/^(?:play|播放|放|听|点歌)\s+/i, '').trim();
  let titlePart = raw;
  let artistPart = '';
  const by = raw.match(/^(.+?)\s+by\s+(.+)$/i);
  if (by) {
    titlePart = by[1].trim();
    artistPart = by[2].trim();
  } else {
    const dash = raw.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (dash) {
      titlePart = dash[1].trim();
      artistPart = dash[2].trim();
    } else {
      // 中文口语: "HABIBTI Drake的" → title=前, artist=后 (与前端对齐)
      const cn = raw.match(/^(.+?)\s+([^\s]+)的$/);
      if (cn) {
        titlePart = cn[1].trim();
        artistPart = cn[2].trim();
      }
    }
  }
  return { titlePart, artistPart, raw };
}

function scoreInterpretation(track, titlePart, artistPart) {
  const title = norm(track.title);
  const artist = norm(track.artist);
  const qTitle = norm(titlePart);
  if (!qTitle || !title) return 0;

  let titleScore = 0;
  if (title === qTitle) {
    titleScore = 100;
  } else if (title.startsWith(qTitle) || (qTitle.length >= 3 && title.includes(qTitle))) {
    titleScore = 88;
  } else if (qTitle.length >= 3 && qTitle.includes(title) && title.length >= 3) {
    titleScore = 75;
  } else {
    const tks = tokensOf(titlePart);
    if (!tks.length) return 0;
    const hits = tks.filter((t) => title.includes(norm(t)));
    if (!hits.length) return 0;
    if (!title.includes(norm(tks[0]))) return 0;
    if (hits.length < tks.length) return 0;
    titleScore = 72;
  }

  let bonus = 0;
  if (artistPart) {
    const atks = tokensOf(artistPart);
    if (atks.length) {
      const aHits = atks.filter((t) => artist.includes(norm(t)));
      // 主C：带艺人（by X / X - Y / X的）必须命中，否则否决——与前端 songMatch 对齐
      if (!aHits.length) return 0;
      bonus += Math.round(28 * (aHits.length / atks.length));
    }
  }

  const blob = `${track.title} ${track.artist}`.toLowerCase();
  if (/翻唱|cover|piano|ringtone|karaoke|伴奏|remix|夜芯|软软/.test(blob)) {
    bonus -= 25;
  }

  return titleScore + bonus;
}

export function scoreTrack(track, query) {
  const parsed = parseSongQuery(query);
  if (!parsed.raw) return 0;

  const interps = [parsed];

  if (!parsed.artistPart) {
    const toks = tokensOf(parsed.raw);
    if (toks.length >= 1) {
      interps.push({ titlePart: toks[0], artistPart: '', raw: parsed.raw });
    }
    for (let i = 1; i <= Math.min(3, Math.max(0, toks.length - 1)); i++) {
      interps.push({
        titlePart: toks.slice(0, i).join(' '),
        artistPart: toks.slice(i).join(' '),
        raw: parsed.raw,
      });
    }
  }

  let best = 0;
  for (const it of interps) {
    const s = scoreInterpretation(track, it.titlePart, it.artistPart);
    if (s > best) best = s;
  }
  return best;
}

function playlistPriority(name) {
  const n = String(name || '').toLowerCase();
  if (/喜欢|我喜欢|红心|liked|favorite|favourite|love/.test(n)) return 0;
  if (/收藏|日推|私人|radar|每日/.test(n)) return 1;
  return 2;
}

function rankTracks(tracks, query) {
  return tracks
    .map((t) => ({ t, s: scoreTrack(t, query) }))
    .filter((x) => x.s >= MIN_SCORE)
    .sort((a, b) => b.s - a.s);
}

async function fetchPlaylistTracks(session, cookie, pl) {
  if (session.platform === 'netease') {
    return getNeteaseTracksByCookie(pl.id, cookie);
  }
  const result = await getKugouTracksByCookie(pl.id, cookie);
  return result.tracks || [];
}

/**
 * Load / refresh library. When `query` is set, stop early on a strong title hit
 * so songs deep in the list are still found without always pulling everything.
 */
async function loadLibraryTracks(sessionKey, query) {
  const fresh = await ensureFreshSession(sessionKey);
  const session = fresh?.session;
  if (!session) throw new Error('会话已失效，请重新扫码登录');
  const cookie = fresh.cookie;
  const cached = cache.get(sessionKey);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    if (!query) return cached.tracks;
    if (String(query).startsWith('album:')) {
      const { album, artist } = parseAlbumQuery(query);
      if (pickAlbumTrack(cached.tracks, album, artist)) return cached.tracks;
    } else {
      const hit = rankTracks(cached.tracks, query);
      if (hit.length && hit[0].s >= EARLY_HIT) return cached.tracks;
    }
    // weak / miss in cache → keep scanning more playlists below
  }

  let playlists = [];
  if (session.platform === 'netease') {
    playlists = await getNeteasePlaylistsByCookie(cookie);
  } else if (session.platform === 'kugou') {
    const result = await getKugouPlaylistsByCookie(cookie);
    playlists = result.playlists || [];
  } else {
    throw new Error('unsupported platform');
  }

  playlists = [...playlists].sort(
    (a, b) => playlistPriority(a.name) - playlistPriority(b.name),
  );

  const tracks = cached && Date.now() - cached.at < CACHE_MS
    ? [...cached.tracks]
    : [];
  const seen = new Set(tracks.map((t) => String(t.id)));
  let bestScore = query ? (rankTracks(tracks, query)[0]?.s || 0) : 0;

  // 歌手/专辑查询按需加深扫描（第 3 项）：普通歌名 40 个歌单封顶；
  // artist:/album: 加深到 MAX_PLAYLISTS_DEEP，减少漏检误走全网。
  const isDeep = /^(artist|album):/i.test(String(query || ''));
  const plLimit = isDeep
    ? Math.min(MAX_PLAYLISTS_DEEP, playlists.length)
    : Math.min(MAX_PLAYLISTS, playlists.length);
  let scannedPl = 0;

  for (const pl of playlists.slice(0, plLimit)) {
    if (tracks.length >= MAX_TRACKS) break;
    if (query && bestScore >= EARLY_HIT) break;
    scannedPl += 1;
    try {
      const list = await fetchPlaylistTracks(session, cookie, pl);
      for (const t of list) {
        const id = String(t.id);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const row = {
          id,
          title: t.title || '',
          artist: t.artist || '',
          cover: t.cover || '',
          duration: t.duration || 0,
          album: t.album || '',
          source: t.source || session.platform,
        };
        tracks.push(row);
        if (query) {
          const s = scoreTrack(row, query);
          if (s > bestScore) bestScore = s;
          // album-mode progressive: album field hit also counts as early stop signal
          if (query.startsWith('album:')) {
            const { album, artist } = parseAlbumQuery(query);
            const as = trackMatchesAlbum(row, album, artist).score;
            if (as > bestScore) bestScore = as;
          }
          // artist-mode progressive: artist field hit also counts
          if (query.startsWith('artist:')) {
            const { artist: aq } = parseArtistQuery(query);
            const as = trackMatchesArtist(row, aq).score;
            if (as > bestScore) bestScore = as;
          }
        }
        if (tracks.length >= MAX_TRACKS) break;
      }
    } catch (e) {
      console.warn('[abyss] library playlist fetch failed:', pl.id, e.message);
    }
  }

  cache.set(sessionKey, { at: Date.now(), tracks });
  return {
    tracks,
    // 本次扫描覆盖信息（供“可能未扫全”提示；有缓存命中时 scanned=0 表示直接用的缓存）
    scannedPlaylists: scannedPl,
    totalPlaylists: playlists.length,
  };
}

/** Invalidate cache after re-login / playlist change. */
export function clearLibraryCache(sessionKey) {
  if (sessionKey) cache.delete(sessionKey);
  else cache.clear();
}

/**
 * @returns {{ track: object|null, matches: object[], message: string }}
 */
export async function searchLibrary(sessionKey, query) {
  if (!sessionKey) {
    return { track: null, matches: [], message: '请先在右侧扫码登录，才能在歌单里点歌。' };
  }
  if (!getSession(sessionKey)) {
    return { track: null, matches: [], message: '会话已失效，请重新扫码登录。' };
  }
  const q = String(query || '').trim();
  const loaded = await loadLibraryTracks(sessionKey, q || null);
  const tracks = loaded.tracks;
  if (!tracks.length) {
    return { track: null, matches: [], message: '歌单是空的，先去平台加几首歌再来点。' };
  }

  if (!q) {
    const track = tracks[Math.floor(Math.random() * tracks.length)];
    return { track, matches: [track], message: `从你的歌单里抽了一首：${track.title}` };
  }

  const ranked = rankTracks(tracks, q).slice(0, 5).map((x) => x.t);

  if (!ranked.length) {
    return {
      track: null,
      matches: [],
      message: `歌单里没找到「${q}」。配 DeepSeek Key 可搜全库，或先把歌加进歌单。`,
    };
  }
  const track = ranked[0];
  return {
    track,
    matches: ranked,
    message: `在歌单里找到了：${track.title} — ${track.artist}`,
  };
}

/**
 * Album intent: pick a track from album in user library, or return clarify suggestions.
 * @returns {{ track, matches, suggestions, message, clarify: boolean }}
 */
export async function searchLibraryAlbum(sessionKey, query) {
  if (!sessionKey) {
    return {
      track: null, matches: [], suggestions: [], clarify: true,
      message: '请先在右侧扫码登录，才能在歌单里点歌。',
    };
  }
  if (!getSession(sessionKey)) {
    return {
      track: null, matches: [], suggestions: [], clarify: true,
      message: '会话已失效，请重新扫码登录。',
    };
  }

  const { album, artist, raw } = parseAlbumQuery(query);
  if (!album) {
    return {
      track: null, matches: [], suggestions: [], clarify: true,
      message: '没听清专辑名，再说一次？',
    };
  }

  const scanKey = `album:${raw}`;
  const loaded = await loadLibraryTracks(sessionKey, scanKey);
  const tracks = loaded.tracks;
  const picked = pickAlbumTrack(tracks, album, artist);
  if (picked) {
    const siblings = tracks
      .map((t) => ({ t, ...trackMatchesAlbum(t, album, artist) }))
      .filter((x) => x.score >= 80)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.t);
    return {
      track: picked,
      matches: siblings,
      suggestions: [],
      clarify: false,
      message: `从专辑「${album}」里抽了一首：${picked.title} — ${picked.artist}`,
    };
  }

  const suggestions = albumClarifySuggestions(album, artist);
  const label = artist ? `《${album}》(${artist})` : `《${album}》`;
  // 第 3 项：加深扫描后仍没命中且歌单没扫全 → 提示可能未扫全，别误判为"没有"
  const scanWarn = loaded.scannedPlaylists > 0 && loaded.scannedPlaylists < loaded.totalPlaylists
    ? `（已扫前 ${loaded.scannedPlaylists}/${loaded.totalPlaylists} 个歌单，可能未扫全）`
    : '';
  if (suggestions.length) {
    return {
      track: null,
      matches: [],
      suggestions,
      clarify: true,
      message: `歌单里没有确认属于${label}的曲目。这是专辑的话，想听哪首？比如 ${suggestions.slice(0, 3).join(' / ')}`,
    };
  }
  return {
    track: null,
    matches: [],
    suggestions: [],
    clarify: true,
    message: `歌单里没找到专辑${label}的曲目${scanWarn}。可以说具体歌名，或配 Key 后让我全网抽一首。`,
  };
}

/**
 * Artist intent: 歌单里按艺人随机抽一首 (主C：艺人必须命中)。
 * @returns {{ track, matches, message, clarify }}
 */
export async function searchLibraryArtist(sessionKey, query) {
  if (!sessionKey) {
    return {
      track: null, matches: [], clarify: true,
      message: '请先在右侧扫码登录，才能在歌单里点歌。',
    };
  }
  if (!getSession(sessionKey)) {
    return {
      track: null, matches: [], clarify: true,
      message: '会话已失效，请重新扫码登录。',
    };
  }

  const { artist, raw } = parseArtistQuery(query);
  if (!artist) {
    return {
      track: null, matches: [], clarify: true,
      message: '没听清要听谁的歌，再说一次？',
    };
  }

  const scanKey = `artist:${raw}`;
  const loaded = await loadLibraryTracks(sessionKey, scanKey);
  const tracks = loaded.tracks;
  const picked = pickArtistTrack(tracks, artist);
  if (picked) {
    return {
      track: picked,
      matches: [picked],
      clarify: false,
      message: `从你的歌单里抽了一首 ${picked.artist} 的歌：${picked.title}`,
    };
  }

  // 第 3 项：加深扫描后仍没命中且歌单没扫全 → 提示可能未扫全，别误判为"没有"
  const scanWarn = loaded.scannedPlaylists > 0 && loaded.scannedPlaylists < loaded.totalPlaylists
    ? `（已扫前 ${loaded.scannedPlaylists}/${loaded.totalPlaylists} 个歌单，可能未扫全）`
    : '';
  return {
    track: null,
    matches: [],
    clarify: true,
    message: `歌单里没有 ${artist} 的歌${scanWarn}。可以说具体歌名，或配 Key 后让我全网抽一首。`,
  };
}
