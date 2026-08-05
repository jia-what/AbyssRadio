/* 热修复回归: 「换一首其他他的歌」/「换一首盆栽其他的歌」— 修饰词识别 */
import { parseArtistQuery, looksLikeArtistRequest } from '../../../ai-radio-v1/src/utils/artistPlay.ts';
import { extractSongQuery } from '../../../ai-radio-v1/src/utils/songMatch.ts';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('=== 「换一首盆栽其他的歌」===');
const q1 = extractSongQuery('换一首盆栽其他的歌');
check('extractSongQuery 抽词', q1 === '盆栽其他的', JSON.stringify(q1));
check('looksLikeArtistRequest 识别为歌手级', looksLikeArtistRequest('换一首盆栽其他的歌', q1) === true);
check('parseArtistQuery 剥「其他的」→ 盆栽', parseArtistQuery(q1).artist === '盆栽');

console.log('\n=== 「换一首其他他的歌」===');
const q2 = extractSongQuery('换一首其他他的歌');
check('extractSongQuery 抽词', q2 === '其他他的', JSON.stringify(q2));
check('looksLikeArtistRequest 识别为歌手级', looksLikeArtistRequest('换一首其他他的歌', q2) === true);
check('parseArtistQuery 剥净 → 空 (取当前歌手)', parseArtistQuery(q2).artist === '');

console.log('\n=== 未误伤 ===');
check('「换一首」纯切歌仍正常', extractSongQuery('换一首') === '');
check('「放 Drake 的歌」仍是歌手级', looksLikeArtistRequest('放 Drake 的歌', 'Drake 的歌') === true);
check('「放 Passionfruit」不是歌手级', looksLikeArtistRequest('放 Passionfruit', 'Passionfruit') === false);
check('「盆栽」原名不误剥', parseArtistQuery('盆栽').artist === '盆栽');
check('「The Weeknd」不误剥', parseArtistQuery('The Weeknd').artist === 'The Weeknd');

console.log('\n=== 后端对齐 (albumPlay.mjs 静态断言) ===');
const ap = (await import('fs')).readFileSync(new URL('../albumPlay.mjs', import.meta.url), 'utf-8');
check('后端剥「其他的」', ap.includes('其他的|别的|另外的'));
check('后端换一首前缀', ap.includes('换一首|换'));

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
