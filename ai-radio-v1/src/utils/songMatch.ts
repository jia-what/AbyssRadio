/**
 * Shared song-query matching (queue / library / global pick).
 * Title must match; artist-only hits score 0.
 */

const STOP = new Set([
  'by', 'the', 'a', 'an', 'feat', 'ft', 'featuring', 'with', 'and',
  '的', '和', '与', '一首', '放', '听', 'play',
]);

export const MIN_SONG_SCORE = 50;

function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function tokensOf(s: string): string[] {
  return String(s || '')
    .toLowerCase()
    .replace(/[()[\]【】（）]/g, ' ')
    .split(/[\s,/,&+\-–—]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

export function parseSongQuery(query: string): {
  titlePart: string;
  artistPart: string;
  raw: string;
} {
  let raw = String(query || '').trim();
  raw = raw.replace(/^(?:play|放|听|点歌)\s+/i, '').trim();
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
    }
  }
  return { titlePart, artistPart, raw };
}

function scoreInterpretation(
  track: { title?: string; artist?: string },
  titlePart: string,
  artistPart: string,
): number {
  const title = norm(track.title || '');
  const artist = norm(track.artist || '');
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
      // 主C：用户明确给了艺人（by X / X - Y），艺人必须命中，否则直接否决
      // 不再"扣分了事"——宁可多问一句，绝不猜曲（修 HABIBTI by drake → Ard Adz 错源）
      if (!aHits.length) return 0;
      bonus += Math.round(28 * (aHits.length / atks.length));
    }
  }

  const blob = `${track.title || ''} ${track.artist || ''}`.toLowerCase();
  if (/翻唱|cover|piano|ringtone|karaoke|伴奏|remix|夜芯|软软/.test(blob)) {
    bonus -= 25;
  }

  return titleScore + bonus;
}

export function scoreTrack(
  track: { title?: string; artist?: string },
  query: string,
): number {
  const parsed = parseSongQuery(query);
  if (!parsed.raw) return 0;

  const interps: { titlePart: string; artistPart: string }[] = [parsed];

  if (!parsed.artistPart) {
    const toks = tokensOf(parsed.raw);
    if (toks.length >= 1) {
      interps.push({ titlePart: toks[0], artistPart: '' });
    }
    for (let i = 1; i <= Math.min(3, Math.max(0, toks.length - 1)); i++) {
      interps.push({
        titlePart: toks.slice(0, i).join(' '),
        artistPart: toks.slice(i).join(' '),
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

export function pickBestTrack<T extends { title?: string; artist?: string }>(
  tracks: T[],
  query: string,
  minScore = MIN_SONG_SCORE,
): { track: T; score: number } | null {
  let best: T | null = null;
  let bestS = 0;
  for (const t of tracks) {
    const s = scoreTrack(t, query);
    if (s > bestS) {
      bestS = s;
      best = t;
    }
  }
  if (!best || bestS < minScore) return null;
  return { track: best, score: bestS };
}
