/* CDP: 读 BottomBar 封面元素的实际 style + 诊断 track 状态 */
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
await send('Runtime.enable').catch(() => {});

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }).catch(() => null);
  if (!r) return 'NULL';
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result?.exceptionDetails?.exception?.description || '').slice(0, 150);
  return r.result?.result?.value;
};

// 1) 所有 bg-cover 元素的 backgroundImage
const bg = await evalJs(`(() => {
  const els = [...document.querySelectorAll('div[class*="bg-cover"],div[class*="bg-center"]')];
  return JSON.stringify(els.map(e => ({
    cls: (e.className || '').slice(0, 60),
    bg: e.style.backgroundImage || '(inline 无)',
    w: e.getBoundingClientRect().width,
    h: e.getBoundingClientRect().height,
  })).slice(0, 6));
})()`);
console.log('bg-cover 元素:', bg);

// 2) 所有 img 的 src
const imgs = await evalJs(`(() => {
  return JSON.stringify([...document.querySelectorAll('img')].map(i => ({ src: (i.src || '').slice(0, 60), w: i.naturalWidth })).slice(0, 6));
})()`);
console.log('imgs:', imgs);

// 3) 底部栏文案/曲名
const bb = await evalJs(`(() => {
  const txt = [...document.querySelectorAll('div,span,p')].filter(e => /Bound|Ye|侃爷/.test(e.textContent) && e.children.length === 0).map(e => e.textContent.trim().slice(0, 40));
  return JSON.stringify([...new Set(txt)].slice(0, 6));
})()`);
console.log('曲名文案:', bb);

// 4) 有没有 LOCKED 状态
const locked = await evalJs(`(() => {
  return JSON.stringify([...document.querySelectorAll('div,span,p')].filter(e => /LOCKED|Locked|locked/.test(e.textContent)).map(e => e.textContent.trim().slice(0, 50)).slice(0, 4));
})()`);
console.log('LOCKED:', locked);
ws.close();
