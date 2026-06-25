export interface LyricLine {
  time: number;
  text: string;
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
