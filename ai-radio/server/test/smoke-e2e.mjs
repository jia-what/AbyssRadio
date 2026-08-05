#!/usr/bin/env node
/**
 * Abyss Radio — API 冒烟测试 (E2E 第 15 项, 零依赖, node 直跑)
 * 覆盖 AI 点歌链核心接口: health / chat(意图护栏+模板闲聊) / settings(ping) / library/search
 *
 * 用法: node test/smoke-e2e.mjs [--base http://localhost:4000]
 * 依赖: 后端 :4000 已启动 (start.bat 或 node index.mjs)
 */
const BASE = process.argv.find((a) => a.startsWith('--base='))?.split('=')[1] || 'http://localhost:4000';

let pass = 0, fail = 0, skip = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  OK   ${name}${extra ? ` — ${extra}` : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
}

async function get(path) {
  const res = await fetch(BASE + path);
  let body = null;
  try { body = await res.json(); } catch { body = await res.text(); }
  return { status: res.status, body };
}
async function post(path, payload) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let body = null;
  try { body = await res.json(); } catch { body = await res.text(); }
  return { status: res.status, body };
}

console.log(`\n=== Abyss Radio API 冒烟 (${BASE}) ===\n`);

// 1) 健康检查
try {
  const { status, body } = await get('/api/health');
  check('GET /api/health → 200', status === 200, String(status));
} catch (e) {
  check('GET /api/health 可达', false, e.message);
  console.log('\n后端未启动? 先跑 start.bat 或 node ai-radio/server/index.mjs\n');
  process.exit(1);
}

// 2) DeepSeek Key 状态
{
  const { status, body } = await get('/api/settings/deepseek');
  check('GET /api/settings/deepseek → 200 + configured 字段', status === 200 && typeof body?.configured === 'boolean');
}

// 3) 保存坏 Key → ping 拦截, 不落盘
{
  const { status, body } = await post('/api/settings/deepseek', { key: 'sk-invalid-test-key-0000' });
  check('POST 无效 Key → 400 拒绝 (第14项 ping)', status === 400 && body?.ping?.valid === false, `status=${status}`);
}

// 4) chat — 无 Key 模板闲聊 (若环境配了 Key 则跳过断言, 仅验证可响应)
{
  const { status, body } = await post('/api/chat', { message: '你好', history: [], track: null });
  check('POST /api/chat → 200', status === 200, `type=${body?.type}`);
  if (body?.type === 'nokey') {
    check('无 Key → nokey 模板闲聊', typeof body?.text === 'string' && body.text.length > 0);
  } else {
    skip++; console.log('  SKIP 无 Key 模板闲聊 (当前环境已配 Key, type=' + body?.type + ')');
  }
}

// 5) chat — 意图护栏 (无点歌动词时即使模型给 PLAY 也应降级, 由后端返回 chat 而非 play)
{
  const { status, body } = await post('/api/chat', { message: 'Drake 有哪些代表作', history: [], track: null });
  check('POST /api/chat 可响应', status === 200);
  if (status === 200 && body?.type) {
    // 后端护栏是兜底: 若模型确实没给 PLAY, type 为 chat 也 OK; 关键是「无点歌动词 → 不返回 play 类指令」
    check('「代表作有哪些」不触发点歌 (type≠play/album/artist)', !['play', 'album', 'artist'].includes(body.type), `type=${body.type}`);
  }
}

// 6) 歌单搜索链路 (无 sessionKey 时后端应返回明确错误而非崩溃)
{
  const { status, body } = await post('/api/library/search', { key: '', q: 'test', mode: 'song' });
  check('POST /api/library/search 可响应 (无会话)', [200, 400, 401, 403].includes(status), `status=${status}`);
}

console.log(`\n=== 结果: ${pass} 过, ${fail} 挂, ${skip} 跳过 ===`);
console.log(fail === 0 ? 'SMOKE PASS' : 'SMOKE FAIL');
process.exit(fail ? 1 : 0);
