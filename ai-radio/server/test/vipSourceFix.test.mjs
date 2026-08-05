/* 热修复回归: AI全网搜优先登录平台源 (VIP 歌 30s 修复) */
import { readFileSync } from 'fs';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const urs = readFileSync(new URL('../../../ai-radio-v1/src/hooks/useRadioState.ts', import.meta.url), 'utf-8');

console.log('=== 优先登录平台搜索 ===');
check('读取登录平台', urs.includes("const bindPlatform = loadStoredBind()?.platform;"));
check('优先搜登录平台', urs.includes("results = await searchMusic(searchTerm, bindPlatform, 12);"));
check('只认 kugou/netease', urs.includes("bindPlatform === 'kugou' || bindPlatform === 'netease'"));
check('无结果才 both 兜底', urs.includes("if (!results || results.length === 0) {") && urs.includes("searchMusic(searchTerm, 'both', 12)"));
check('import loadStoredBind', urs.includes("import { loadStoredBind } from '../services/playlistApi';"));
check('注释说明 VIP 30s 根因', urs.includes('VIP 歌 30s'));

console.log('\n=== 不影响既有打分/歧义链路 ===');
check('拆词仍在', urs.includes('const { titlePart, artistPart } = parseSongQuery(q)'));
check('艺人硬过滤仍在', urs.includes('const withArtist = sameTitle.filter'));
check('打分仍在', urs.includes('pickBestTrack(withArtist, q, MIN_SONG_SCORE)') || urs.includes('const hit = pickBestTrack(results, q, MIN_SONG_SCORE)'));

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
