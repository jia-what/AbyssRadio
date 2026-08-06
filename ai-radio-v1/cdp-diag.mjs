/* CDP: 抓 cover-diag 日志 */
import fs from 'fs';
const store = JSON.parse(fs.readFileSync('E:\\VM\\AI_audio\\ai-radio\\server\\session-store.json', 'utf8'));
const kg = Object.entries(store).find(([, v]) => v.platform === 'kugou');
const [sessionKey, info] = kg;
const bind = JSON.stringify({ platform: 'kugou', sessionKey, user: info.user || { userId: '', nickname: '酷狗用户' } });

const CDP = 'http://localhost:9333';
let target;
for (let i = 0; i < 10; i++) {
  try { target = await (await fetch(CDP + '/json/new?about:blank', { method: 'PUT' })).json(); break; }
  catch { await new Promise(r => setTimeout(r, 1500)); }
}
if (!target) { console.log('CDP 不可用'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
  setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error('timeout ' + method)); } }, 20000);
});
const logs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push(msg.params.type + ': ' + msg.params.args.map(a => {
      if (typeof a.value === 'object' && a.value) return JSON.stringify(a.value).slice(0, 200);
      return String(a.value || a.description || '').slice(0, 200);
    }).join(' '));
  }
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id).res(msg); pending.delete(msg.id); }
};
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable').catch(() => {});
await send('Page.enable').catch(() => {});

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }).catch(() => null);
  if (!r || r.result?.exceptionDetails) return 'EXC: ' + (r.result?.exceptionDetails?.exception?.description || '').slice(0, 150);
  return r.result?.result?.value;
};

await send('Page.navigate', { url: 'http://localhost:3000' }).catch(() => {});
await new Promise((r) => setTimeout(r, 8000));
await evalJs(`localStorage.setItem('ai-radio-bind', ${JSON.stringify(bind)}); 'ok'`);
await send('Page.reload', { ignoreCache: true }).catch(() => {});
await new Promise((r) => setTimeout(r, 10000));

const btnRect = await evalJs(`(() => {
  const el = [...document.querySelectorAll('button')].find(b => /点击进入/.test(b.textContent));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
})()`);
if (btnRect) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: btnRect.x, y: btnRect.y }).catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: btnRect.x, y: btnRect.y, button: 'left', clickCount: 1 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 200));
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: btnRect.x, y: btnRect.y, button: 'left', clickCount: 1 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 7000));
}

for (let i = 0; i < 3; i++) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 300 + i * 80 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
}

const inp = await evalJs(`(() => {
  const el = document.querySelector('input, textarea');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
})()`);
console.log('输入框:', inp ? '有' : '无');
if (inp) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: inp.x, y: inp.y }).catch(() => {});
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: inp.x, y: inp.y, button: 'left', clickCount: 1 }).catch(() => {});
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: inp.x, y: inp.y, button: 'left', clickCount: 1 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 500));
  await send('Input.insertText', { text: '点一首侃爷的bound2' }).catch(() => {});
  await new Promise((r) => setTimeout(r, 500));
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }).catch(() => {});
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }).catch(() => {});
  console.log('点歌 ✓ 等 50s');
  await new Promise((r) => setTimeout(r, 50000));
}

console.log('\n=== cover-diag 日志 ===');
const diag = logs.filter((l) => l.includes('cover-diag'));
diag.forEach((l) => console.log(l));
if (diag.length === 0) console.log('(无 cover-diag 日志!)');
console.log('\n=== 全部 console ===');
logs.slice(0, 12).forEach((l) => console.log(l));
ws.close();
