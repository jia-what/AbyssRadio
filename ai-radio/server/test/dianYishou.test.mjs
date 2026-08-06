/* 热修复回归: 「点一首」/「点首」动词识别 */
import { readFileSync } from 'fs';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const src = readFileSync(new URL('../../../ai-radio-v1/src/utils/songMatch.ts', import.meta.url), 'utf-8');

console.log('=== 「点一首」动词 (songMatch.ts) ===');
check('动词表含 点一首/点首', src.includes('点(?:歌|一首|一?首)') || src.includes('点一首'));
check('strip 前缀同步含 点一首', src.includes('点歌|点一首|点首'));
check('原有点歌动词仍在', src.includes('点歌'));

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
