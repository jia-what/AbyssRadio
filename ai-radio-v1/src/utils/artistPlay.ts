/**
 * Artist-level matching (第 2 项：歌手级点播) — 与 ai-radio/server/albumPlay.mjs 对齐
 * 主C：艺人必须命中，绝不拿无关艺人凑。
 */

function norm(s: unknown): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

/**
 * 解析艺人请求: "drake" / "drake 的歌" / "artist:drake" / "放 bieber 的歌" → { artist }
 */
export function parseArtistQuery(raw: unknown): { artist: string; raw: string } {
  let q = String(raw || '').trim();
  q = q.replace(/^(?:play|播放|放|听|点歌)\s+/i, '').trim();
  q = q.replace(/^artist:\s*/i, '').trim();
  // 去「的歌 / 的歌儿 / 唱的歌」等口语尾巴
  q = q.replace(/(?:的|之)歌(?:儿)?$/, '').trim();
  q = q.replace(/^(?:来一首|来点|来|放|听)\s*/i, '').trim();
  return { artist: q, raw: String(raw || '').trim() };
}

/** 像不像艺人级请求：artist: 前缀 / 「的歌」「的歌儿」「的歌」「听某人的歌」 */
export function looksLikeArtistRequest(text: string, query: string): boolean {
  if (/^artist:/i.test(query)) return true;
  const t = String(text || '');
  if (/的歌(?:儿)?$|的歌儿|来点|来一首.*的/.test(t)) return true;
  return false;
}

/**
 * 艺人匹配打分: 艺人必须命中 (norm 后包含/被包含), 否则 0 分直接否决。
 */
export function trackMatchesArtist(
  track: { title?: string; artist?: string },
  artist: unknown,
): { score: number } {
  const aN = norm(artist);
  if (!aN) return { score: 0 };
  const tArtist = norm(track.artist || '');
  if (!tArtist) return { score: 0 };
  const artistHit = tArtist.includes(aN) || aN.includes(tArtist);
  if (!artistHit) return { score: 0 };
  // 艺人命中即算数；翻唱/伴奏/remix/live 降权，避免抽到劣质版本
  let score = 100;
  const blob = `${track.title || ''} ${track.artist || ''}`.toLowerCase();
  if (/翻唱|cover|piano|ringtone|karaoke|伴奏|remix|live|现场/.test(blob)) score -= 40;
  return { score };
}

export interface ArtistCandidate {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  cover?: string;
  duration?: number;
  source?: string;
}

/** 候选里按艺人随机抽一首 (主C：只抽艺人命中的) */
export function pickArtistTrack(
  tracks: ArtistCandidate[] | null | undefined,
  artist: unknown,
): ArtistCandidate | null {
  const ranked = (tracks || [])
    .map((t) => ({ t, ...trackMatchesArtist(t, artist) }))
    .filter((x) => x.score >= 80);
  if (!ranked.length) return null;
  return ranked[Math.floor(Math.random() * ranked.length)].t;
}
