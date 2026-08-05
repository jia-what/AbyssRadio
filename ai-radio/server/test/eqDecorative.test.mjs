/* 第 13 项回归: EQ 条装饰标注 — 实时频谱可视化标明不可调节 */
import { readFileSync } from 'fs';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const src = readFileSync(new URL('../../../ai-radio-v1/src/components/columns/SignalColumn.tsx', import.meta.url), 'utf-8');

console.log('=== EQ 条标注 (SignalColumn.tsx) ===');
check('挂 title 提示不可调节', src.includes('实时频段可视化，仅供视觉，不可调节'));
check('中文标签 低音', src.includes("'低音'"));
check('中文标签 中音', src.includes("'中音'"));
check('中文标签 高音', src.includes("'高音'"));
check('英文标签 bass/mid/treble 只用于数据, 不直接显示', !src.includes('>{band}</div>'));
check('旁注「实时频谱」', src.includes('实时频谱'));
check('仍是实时数据 (非假条)', src.includes('signalMeter(bands[band], gamma)'));

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
