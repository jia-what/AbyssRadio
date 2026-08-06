/* CDP: 对刚 APPLIED hasCover=1 的页面截图 */
const CDP = 'http://localhost:9333';
const list = await (await fetch(CDP + '/json/list')).json();
const pages = list.filter((t) => t.type === 'page' && t.url.includes('localhost:3000'));
if (pages.length === 0) { console.log('无页面'); process.exit(1); }
pages.sort((a, b) => (a.id < b.id ? 1 : -1));
const page = pages[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
  setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error('timeout ' + method)); } }, 15000);
});
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id).res(msg); pending.delete(msg.id); }
};
await new Promise((r) => (ws.onopen = r));
await send('Page.enable').catch(() => {});
await new Promise((r) => setTimeout(r, 2000));

const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true }).catch((e) => ({ error: e.message }));
if (shot.result?.data) {
  const fs = await import('fs');
  fs.writeFileSync('E:\\VM\\AI_audio\\ai-radio-v1\\cdp-shot12.png', Buffer.from(shot.result.data, 'base64'));
  console.log('截图 OK cdp-shot12.png');
} else {
  console.log('截图失败:', shot.error || '');
}
ws.close();
