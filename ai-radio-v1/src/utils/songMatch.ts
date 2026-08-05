/**
 * Shared song-query matching (queue / library / global pick).
 * Title must match; artist-only hits score 0.
 */

const STOP = new Set([
  'by', 'the', 'a', 'an', 'feat', 'ft', 'featuring', 'with', 'and',
  '的', '和', '与', '一首', '放', '听', 'play',
]);

export const MIN_SONG_SCORE = 50;

/** 常见别名/译名 → 标准写法（查询时展开成候选，取最高分；第 5 项） */
const ALIAS_MAP: Record<string, string> = {
  // 歌手中文昵称
  '公鸭': 'drake',
  '比伯': 'justin bieber',
  '盆栽': 'the weeknd',
  '姆爷': 'eminem',
  '侃爷': 'kanye west',
  '霉霉': 'taylor swift',
  '碧昂丝': 'beyonce',
  '阿黛尔': 'adele',
  '日日': 'rihanna',
  '喇嘛': 'kendrick lamar',
  '盆栽哥': 'the weeknd',
  '黄老板': 'ed sheeran',
  '萌德': 'shawn mendes',
  '断眉': 'charlie puth',
  // 歌名常见译名
  '我心永恒': 'my heart will go on',
  '加州旅馆': 'hotel california',
  '昨日重现': 'yesterday once more',
  '加州梦': 'california dreamin',
  '卡农': 'canon in d',
  '致爱丽丝': 'fur elise',
  '月光奏鸣曲': 'moonlight sonata',
  '雨中的旋律': 'rhythm of the rain',
  // 常见写法变体
  'gods plan': "god's plan",
};

function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, ' ')
    .replace(/\s*(?:feat|ft|featuring)\.?\s+/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

/** 别名展开：返回候选查询列表（原始 + 命中别名替换后的写法），供打分取最高 */
export function expandAliases(query: string): string[] {
  const raw = String(query || '').trim();
  const cands = [raw];
  const low = raw.toLowerCase();
  for (const [alias, std] of Object.entries(ALIAS_MAP)) {
    if (low.includes(alias)) {
      cands.push(raw.replace(new RegExp(alias, 'gi'), std));
    }
  }
  return [...new Set(cands)];
}

/**
 * 前端本地解析点歌意图（第 6 项）：命中返回搜索词（'' = 纯切歌），未命中返回 null。
 * 模型只聊纯聊天——点歌不再依赖模型输出 PLAY: 指令。
 */
export function extractSongQuery(text: string): string | null {
  const raw = String(text || '').trim();
  if (!raw) return null;

  // 纯切歌，无搜索词
  if (/^(?:换一首|换歌|下一首|换一下|随便来一首|来一首|随便放一首)$/i.test(raw)) {
    return '';
  }

  const stripTail = (q: string) =>
    q
      .replace(/(?:听一下|来听听?|听听|播放|放一下|吧|呗|啊|呀|哦)+$/u, '')
      .replace(/[。！？.!?]+$/g, '')
      .trim();

  // play xxx / 放一首xxx / 放xxx / 听一下xxx / 点歌 xxx
  // 注意：不能匹配「听起来…」这类闲聊（听 后面必须是 一首/一下/空白/再一个听）
  const head = raw.match(
    /^(?:play\s+|播放|放(?:一?首)?|听(?:听|一?首|一?下|\s+)|点歌\s*)(.+)$/i,
  );
  if (head) {
    const q = stripTail(head[1]);
    // 「放」单独不成点歌；「放一首」无歌名 → 空=切歌
    return q;
  }

  const cleanMatch = raw.match(/换(?:一首)?(.+?)(?:歌|听听)?$/);
  if (cleanMatch && cleanMatch[1].trim()) return stripTail(cleanMatch[1]);

  // 句中点歌：「帮我放一首 X」
  const mid = raw.match(/(?:帮我|给我|请)?放(?:一?首)(.+)$/i);
  if (mid) return stripTail(mid[1]);

  return null;
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
      // 中文口语: "HABIBTI Drake的" / "Nonstop 老王唱的" → title=前, artist=后
      const cn = raw.match(/^(.+?)\s+([^\s]+)的$/);
      if (cn) {
        titlePart = cn[1].trim();
        artistPart = cn[2].trim();
      }
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
  } else if (qTitle.length >= 3 && title.startsWith(qTitle)) {
    // 前缀命中: "let go" → "let go (explicit)"（仍是同一首）
    titleScore = 88;
  } else {
    // 主C：词级全命中才算（修 "let go" → violet 藏 let 子串的错配）
    const qTks = tokensOf(titlePart);
    const tTks = tokensOf(track.title || '').map((x) => norm(x));
    if (qTks.length && tTks.length && qTks.every((t) => tTks.includes(norm(t)))) {
      titleScore = 88;
    } else {
      return 0;
    }
  }

  let bonus = 0;
  if (artistPart) {
    const atks = tokensOf(artistPart);
    if (atks.length) {
      // 主C：艺人匹配也词级（修 "go on" 拆词 → "Celine DiON" 子串白送分）
      const aTks = tokensOf(track.artist || '').map((x) => norm(x));
      const aHits = atks.filter((t) => aTks.includes(norm(t)));
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
  // 第 5 项：别名/译名展开成候选，取最高分（如「公鸭」→ drake、「我心永恒」→ my heart will go on）
  let best = 0;
  for (const cand of expandAliases(query)) {
    const s = scoreTrackRaw(track, cand);
    if (s > best) best = s;
  }
  return best;
}

function scoreTrackRaw(
  track: { title?: string; artist?: string },
  query: string,
): number {
  const parsed = parseSongQuery(query);
  if (!parsed.raw) return 0;

  const interps: { titlePart: string; artistPart: string }[] = [parsed];

  if (!parsed.artistPart) {
    const toks = tokensOf(parsed.raw);
    // 主C: 不把首 token 单独当歌名解 (修 "let go" → 匹配 Let It Bloom / Violet)
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
