/* 第 7 项回归: 意图边界 — 无点歌动词时模型 PLAY: 降级为聊天 */
import { extractSongQuery } from '../../../ai-radio-v1/src/utils/songMatch.ts';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

// 与 deepseek.mjs 意图护栏相同的判定
function guardDropsPlay(userMessage, playMatch) {
  const intentVerbs = /(?:放|播放|play|听|点歌|来点|来一首|换|下一首|切歌|随便)/i;
  return !!(playMatch && !intentVerbs.test(userMessage));
}

console.log('=== 护栏: 无点歌动词 → 降级聊天 ===');
check('「Drake 有哪些代表作」+ PLAY: → 拦截', guardDropsPlay('Drake 有哪些代表作', 'God\'s Plan'));
check('「介绍一下 The Weeknd」+ PLAY: → 拦截', guardDropsPlay('介绍一下 The Weeknd', 'artist:The Weeknd'));
check('「评价一下 Scorpion」+ PLAY: → 拦截', guardDropsPlay('评价一下 Scorpion', 'album:Scorpion Drake'));
check('「他唱过什么歌」+ PLAY: → 拦截', guardDropsPlay('Drake 他唱过什么歌', 'Nonstop'));
check('「推荐几首 bieber 的歌」+ PLAY: → 拦截', guardDropsPlay('推荐几首 bieber 的歌', 'artist:Justin Bieber'));

console.log('\n=== 护栏: 有点歌动词 → 放行 ===');
check('「放 God\'s Plan」+ PLAY: → 放行', !guardDropsPlay('放 God\'s Plan', 'God\'s Plan'));
check('「play luther」+ PLAY: → 放行', !guardDropsPlay('play luther', 'luther by kendrick lamar'));
check('「听一下 HABIBTI」+ PLAY: → 放行', !guardDropsPlay('听一下 HABIBTI', 'HABIBTI'));
check('「来点 The Weeknd」+ PLAY: → 放行', !guardDropsPlay('来点 The Weeknd', 'artist:The Weeknd'));
check('「换一首」+ PLAY: → 放行', !guardDropsPlay('换一首', ''));
check('「点歌 Scorpion」+ PLAY: → 放行', !guardDropsPlay('点歌 Scorpion', 'album:Scorpion Drake'));

console.log('\n=== 本地解析与护栏一致性 (前端安全兜底) ===');
check('「Drake 有哪些代表作」本地不解析为点歌', extractSongQuery('Drake 有哪些代表作') === null);
check('「放 God\'s Plan」本地解析命中', extractSongQuery('放 God\'s Plan') === 'God\'s Plan');
check('「推荐几首 bieber 的歌」本地不解析', extractSongQuery('推荐几首 bieber 的歌') === null);

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
