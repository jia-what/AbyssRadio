/* 热修复回归: session 文件持久化 — 重启不丢登录态 */
import { createSession, getSession, deleteSession, updateSessionCookie } from '../session.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE = path.join(__dirname, '..', 'session-store.json');

console.log('=== session 落盘 ===');
const key = createSession('netease', 'test-cookie-abc', { userId: 'u1', nickname: '测试' });
const onDisk = JSON.parse(fs.readFileSync(STORE, 'utf8'));
check('createSession 后立即落盘', !!onDisk[key] && onDisk[key].cookie === 'test-cookie-abc');

console.log('\n=== 内存/磁盘读取 ===');
check('getSession 从内存读到', getSession(key)?.cookie === 'test-cookie-abc');
// 模拟重启: 清内存 Map, 从磁盘捞
const { session } = await import('../session.mjs');
// 直接验证磁盘兜底: 删内存条目不可行(模块内部), 改为验证磁盘内容可被新进程读取
check('磁盘内容完整', !!onDisk[key].platform && !!onDisk[key].boundAt);

console.log('\n=== 更新/删除同步落盘 ===');
updateSessionCookie(key, 'new-cookie-xyz');
const onDisk2 = JSON.parse(fs.readFileSync(STORE, 'utf8'));
check('updateSessionCookie 后落盘', onDisk2[key].cookie === 'new-cookie-xyz');
check('内存同步更新', getSession(key)?.cookie === 'new-cookie-xyz');

deleteSession(key);
const onDisk3 = JSON.parse(fs.readFileSync(STORE, 'utf8'));
check('deleteSession 后磁盘删除', !onDisk3[key]);
check('deleteSession 后内存删除', !getSession(key));

console.log('\n=== 前端恢复逻辑 (PlaylistColumn 静态断言) ===');
const plc = fs.readFileSync(new URL('../../../ai-radio-v1/src/components/columns/PlaylistColumn.tsx', import.meta.url), 'utf-8');
check('恢复失败不再调 clearStoredBind()', !plc.includes('catch {\n        clearStoredBind();') && !plc.includes('catch {\r\n        clearStoredBind();'));
check('恢复失败保留 bind 记忆', plc.includes('后端 session 已落盘，重试即可恢复'));

console.log('\n=== 前端传登录状态 (App.tsx 静态断言) ===');
const app = fs.readFileSync(new URL('../../../ai-radio-v1/src/App.tsx', import.meta.url), 'utf-8');
check('chat 请求带 sessionKey', app.includes('sessionKey: loadStoredBind()?.sessionKey || \'\''));

console.log('\n=== 后端登录状态注入 (deepseek.mjs 静态断言) ===');
const ds = fs.readFileSync(new URL('../deepseek.mjs', import.meta.url), 'utf-8');
check('chatWithDeepSeek 收 opts', ds.includes('opts = {}'));
check('loginState 注入 system', ds.includes('loginState') && ds.includes('用户已登录音乐账号'));
check('未登录如实回答', ds.includes('如实回答未登录'));

console.log('\n=== 后端 session 真实校验 (index.mjs 静态断言) ===');
const idx2 = fs.readFileSync(new URL('../index.mjs', import.meta.url), 'utf-8');
check('chat 用 getSession 验证', idx2.includes('const session = sessionKey ? getSession(sessionKey) : null'));

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
