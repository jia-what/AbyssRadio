/* 第 14 项回归: Key 存储 — 保存前 ping 验证 */
import { pingDeepseekKey } from '../settings.mjs';
import { readFileSync } from 'fs';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const realFetch = globalThis.fetch;

console.log('=== pingDeepseekKey 判定 (mock fetch) ===');
async function withFetch(status, body) {
  globalThis.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body || {},
  });
  try {
    return await pingDeepseekKey('sk-test-1234567890');
  } finally {
    globalThis.fetch = realFetch;
  }
}

check('空 Key → invalid/empty', (await withFetch(0, {})).valid === false && (await withFetch(0, {})).status === 'empty' || (await pingDeepseekKey('')).status === 'empty');
check('200 → valid', (await withFetch(200, {})).valid === true);
check('401 → invalid + 原因', (await withFetch(401, {})).valid === false && (await withFetch(401, {})).reason === 'Key 无效或已失效');
check('403 → invalid', (await withFetch(403, {})).valid === false);
check('402 → valid (余额不足 Key 本身有效)', (await withFetch(402, {})).valid === true);
check('500 → invalid', (await withFetch(500, {})).valid === false);
check('网络异常 → invalid/error', (async () => {
  globalThis.fetch = async () => { throw new Error('ECONNREFUSED'); };
  try { const r = await pingDeepseekKey('sk-test'); return r.valid === false && r.status === 'error'; }
  finally { globalThis.fetch = realFetch; }
})());
check('请求带 Authorization Bearer', (async () => {
  let auth = '';
  globalThis.fetch = async (_url, opts) => { auth = opts.headers.Authorization; return { ok: true, status: 200, json: async () => ({}) }; };
  try { await pingDeepseekKey('sk-abc'); return auth === 'Bearer sk-abc'; }
  finally { globalThis.fetch = realFetch; }
})());

console.log('\n=== 保存路由接线 (静态断言 index.mjs) ===');
const idx = readFileSync(new URL('../index.mjs', import.meta.url), 'utf-8');
check('路由变 async', idx.includes("app.post('/api/settings/deepseek', express.json(), async function"));
check('保存前 ping', idx.includes('const ping = await pingDeepseekKey(key)'));
check('无效不落盘', idx.includes('if (!ping.valid)'));
check('无效返回 400 + error', idx.includes('res.status(400).json({') && idx.includes('ping.reason'));
check('清空 Key 直接过', idx.includes("if (String(key).trim())"));
check('成功响应带 ping ok', idx.includes("ping: 'ok'"));

console.log('\n=== 前端弹窗错误链路 (静态断言) ===');
const modal = readFileSync(new URL('../../../ai-radio-v1/src/components/chat/ApiKeyModal.tsx', import.meta.url), 'utf-8');
check('保存失败显示错误', modal.includes("e instanceof Error ? e.message : '保存失败'"));

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
