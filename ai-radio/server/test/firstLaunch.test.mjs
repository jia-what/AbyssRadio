/* 第 16 项回归(热修): 首启引导 — 不再自动弹窗(挡扫码), 改用户主动点按钮 */
import { readFileSync } from 'fs';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const src = readFileSync(new URL('../../../ai-radio-v1/src/components/columns/SignalColumn.tsx', import.meta.url), 'utf-8');

console.log('=== 首启引导 (SignalColumn.tsx) ===');
check('不再自动弹窗', !src.includes('if (!s.configured && !localStorage.getItem'));
check('不再写 localStorage 标记', !src.includes("localStorage.setItem('abyss.key.asked'"));
check('有热修注释', src.includes('不再自动弹 Key 引导——全屏遮罩会挡住右侧扫码栏'));
check('弹窗组件仍在(手动触发用)', src.includes('<ApiKeyModal'));
check('onSaved 更新状态仍在', src.includes('onSaved={(s) => setKeyConfigured(s.configured)}'));
check('keyOpen 状态仍在', src.includes('const [keyOpen, setKeyOpen]'));

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
