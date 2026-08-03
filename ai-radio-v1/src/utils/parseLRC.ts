export interface LyricLine {
  time: number;
  text: string;
  /** word-level karaoke timings (KRC): start/duration in seconds */
  words?: { start: number; duration: number; text: string }[];
}

/**
 * Parse LRC format lyrics into structured time+text array.
 * Handles [mm:ss.xx] and [mm:ss.xxx] formats.
 */
export function parseLRC(lrc: string): LyricLine[] {
  if (!lrc) return [];
  const lines = lrc.split('\n');
  const result: LyricLine[] = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

  for (const line of lines) {
    const match = regex.exec(line);
    if (!match) continue;
    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);
    const millis = parseInt(match[3].padEnd(3, '0'));
    const time = minutes * 60 + seconds + millis / 1000;
    const text = line.replace(regex, '').trim();
    if (text) result.push({ time, text });
  }

  return result.sort((a, b) => a.time - b.time);
}

/**
 * Parse KuGou KRC (decoded) lyrics — line-level plus word-level karaoke timing.
 * Format: [lineStartMs,lineDurMs]<wordStartMs,wordDurMs,0>字<...>...
 */
export function parseKRC(krc: string): LyricLine[] {
  if (!krc) return [];
  const result: LyricLine[] = [];
  const lineRe = /\[(\d+),(\d+)\](.*)/;
  const wordRe = /<(\d+),(\d+),\d+>([^<]*)/g;

  for (const line of krc.split('\n')) {
    const m = lineRe.exec(line.trim());
    if (!m) continue;
    const lineStartMs = parseInt(m[1]);
    const lineDurMs = parseInt(m[2]);
    const body = m[3] || '';
    if (!body) continue;

    const words: LyricLine['words'] = [];
    let fullText = '';
    wordRe.lastIndex = 0;
    let wm: RegExpExecArray | null;
    while ((wm = wordRe.exec(body))) {
      const wStart = parseInt(wm[1]);
      const wDur = parseInt(wm[2]);
      // KRC encodes spaces as their own word tokens — keep them verbatim so
      // English words don't get glued together (defect 7).
      const wText = wm[3].replace(/\s+/g, ' ') === ' ' ? ' ' : wm[3];
      if (!wText) continue;
      fullText += wText;
      words.push({
        start: (lineStartMs + wStart) / 1000,
        duration: Math.max(0.05, wDur / 1000),
        text: wText,
      });
    }
    if (!words.length) continue;

    result.push({
      time: lineStartMs / 1000,
      text: fullText || body,
      words,
    });
  }

  return result.sort((a, b) => a.time - b.time);
}

/**
 * Given currentTime in seconds, find the active lyric line index.
 */
export function findLyricIndex(
  lyrics: LyricLine[],
  currentTime: number
): number {
  if (lyrics.length === 0) return -1;
  let idx = -1;
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (currentTime >= lyrics[i].time) {
      idx = i;
      break;
    }
  }
  return idx;
}
