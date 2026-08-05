/* 第 6 项回归: 前端本地解析点歌意图 — extractSongQuery 判定 */
import { extractSongQuery } from '../../../ai-radio-v1/src/utils/songMatch.ts';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('=== 点歌意图应命中 ===');
check('play let go → let go', extractSongQuery('play let go') === 'let go');
check('放 Scorpion → Scorpion', extractSongQuery('放 Scorpion') === 'Scorpion');
check('播放 HABIBTI → HABIBTI', extractSongQuery('播放 HABIBTI') === 'HABIBTI');
check('放一首 luther → luther', extractSongQuery('放一首 luther') === 'luther');
check('放 bieber 的歌 → bieber 的歌', extractSongQuery('放 bieber 的歌') === 'bieber 的歌');
check('听一下 God\'s Plan → God\'s Plan', extractSongQuery('听一下 God\'s Plan') === 'God\'s Plan');
check('帮我放一首 X → X', extractSongQuery('帮我放一首 X') === 'X');
check('点歌 luther → luther', extractSongQuery('点歌 luther') === 'luther');

console.log('\n=== 切歌意图 → 空串 ===');
check('换一首 → 空', extractSongQuery('换一首') === '');
check('下一首 → 空', extractSongQuery('下一首') === '');
check('随便来一首 → 空', extractSongQuery('随便来一首') === '');
check('换一下 → 空', extractSongQuery('换一下') === '');

console.log('\n=== 纯聊天不应命中 ===');
check('「Drake 的歌好听吗」→ null', extractSongQuery('Drake 的歌好听吗') === null);
check('「最近怎么样」→ null', extractSongQuery('最近怎么样') === null);
check('「谢谢」→ null', extractSongQuery('谢谢') === null);
check('「听起来不错」→ null (不听+点歌)', extractSongQuery('听起来不错') === null);
check('「放 是什么」→ 不误判为切歌', extractSongQuery('放 是什么') !== null && extractSongQuery('放 是什么') === '是什么');
check('空串 → null', extractSongQuery('') === null);

console.log('\n=== 收尾语气词剥离 ===');
check('放 luther 吧 → luther', extractSongQuery('放 luther 吧') === 'luther');
check('放 God\'s Plan 听一下 → God\'s Plan', extractSongQuery('放 God\'s Plan 听一下') === 'God\'s Plan');

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
