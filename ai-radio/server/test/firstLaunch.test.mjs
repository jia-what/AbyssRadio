/* 第 16 项回归: 发版默认无 Key — 首启引导弹窗 */
import { readFileSync } from 'fs';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const src = readFileSync(new URL('../../../ai-radio-v1/src/components/columns/SignalColumn.tsx', import.meta.url), 'utf-8');

console.log('=== 首启引导 (SignalColumn.tsx) ===');
check('无 Key 时自动弹窗', src.includes('if (!s.configured && !localStorage.getItem'));
check('只弹一次 (localStorage 标记)', src.includes("localStorage.setItem('abyss.key.asked', '1')"));
check('标记检查用 getItem', src.includes("localStorage.getItem('abyss.key.asked')"));
check('弹的是 ApiKeyModal', src.includes('setKeyOpen(true)') && src.includes('<ApiKeyModal'));
check('onSaved 更新状态', src.includes('onSaved={(s) => setKeyConfigured(s.configured)}'));
check('已配 Key 不弹', src.includes('!s.configured'));

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
