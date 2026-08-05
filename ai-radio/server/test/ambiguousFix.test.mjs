/* 热修复回归: 带艺人歧义前置过滤 + 「放啊」不切歌 + 确认式回复 */
import { extractSongQuery } from '../../../ai-radio-v1/src/utils/songMatch.ts';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('=== 带艺人 → 不再歧义 (searchAndInsertPlay 前置过滤, 静态断言) ===');
const urs = (await import('fs')).readFileSync(new URL('../../../ai-radio-v1/src/hooks/useRadioState.ts', import.meta.url), 'utf-8');
check('歧义检测前有艺人硬过滤', urs.includes('if (artistPart) {') && urs.includes('const withArtist = sameTitle.filter'));
check('带艺人过滤后直接打分播', urs.includes('pickBestTrack(withArtist, q, MIN_SONG_SCORE)'));
check('过滤后无命中诚实 miss', urs.includes('艺人过滤后无命中 → 诚实 miss'));
check('无艺人时才走歧义', urs.includes('if (sameTitle.length > 1)'));

console.log('\n=== 「放啊」不再切歌 ===');
check('「放啊」→ null (不是切歌)', extractSongQuery('放啊') === null);
check('「放吧」→ null', extractSongQuery('放吧') === null);
check('「放嘛」→ null', extractSongQuery('放嘛') === null);
check('「换一首」仍是切歌', extractSongQuery('换一首') === '');
check('「放 Blinding Lights by The Weeknd」正常抽词', extractSongQuery('放 Blinding Lights by The Weeknd') === 'Blinding Lights by The Weeknd');

console.log('\n=== 确认式回复触发播放 ===');
check('「是的 BLINDING LIGHTS」→ BLINDING LIGHTS', extractSongQuery('是的 BLINDING LIGHTS') === 'BLINDING LIGHTS');
check('「对, 就是这首」→ 这首 (剥语气词)', extractSongQuery('对, 就是这首') !== null);
check('「就它」单独 → null', extractSongQuery('就它') === null);
check('「是的」单独 → null', extractSongQuery('是的') === null);

console.log('\n=== 歧义文案用 titlePart (App.tsx 静态断言) ===');
const app = (await import('fs')).readFileSync(new URL('../../../ai-radio-v1/src/App.tsx', import.meta.url), 'utf-8');
check('歧义文案拆 titlePart', app.includes('parseSongQuery(q).titlePart || q'));

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
