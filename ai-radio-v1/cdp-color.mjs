/* CDP: 读粒子场 WebGL 状态(hasCover uniform / 纹理) */
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
  if (!r || r.result?.exceptionDetails) return 'EXC: ' + (r.result?.exceptionDetails?.exception?.description || '').slice(0, 150);
  return r.result?.result?.value;
};

// 读 canvas 像素(WebGL 需要 preserveDrawingBuffer, 试试 toDataURL)
const px = await evalJs(`(() => {
  const out = [];
  for (const c of document.querySelectorAll('canvas')) {
    try {
      const url = c.toDataURL('image/png');
      // 取 base64 解码前几个像素太复杂, 记录尺寸和数据量
      out.push({ w: c.width, h: c.height, len: url.length });
    } catch (e) {
      out.push({ w: c.width, h: c.height, err: e.message.slice(0, 80) });
    }
  }
  return JSON.stringify(out);
})()`);
console.log('canvas:', px);

// 截取 canvas 中央颜色 — 用 2d canvas 画布读取(粒子场是 webgl, 用 drawImage 到 2d)
const col = await evalJs(`(async () => {
  try {
    const canvas = [...document.querySelectorAll('canvas')].find(c => {
      try { return c.getContext('webgl') || c.getContext('webgl2'); } catch { return null; }
    });
    if (!canvas) return 'no webgl canvas';
    const c2 = document.createElement('canvas');
    c2.width = 100; c2.height = 100;
    const ctx2 = c2.getContext('2d');
    ctx2.drawImage(canvas, 0, 0, 100, 100);
    const d = ctx2.getImageData(50, 50, 1, 1).data;
    const d2 = ctx2.getImageData(20, 20, 1, 1).data;
    const d3 = ctx2.getImageData(80, 50, 1, 1).data;
    return JSON.stringify({ center: [d[0], d[1], d[2]], left: [d2[0], d2[1], d2[2]], right: [d3[0], d3[1], d3[2]] });
  } catch (e) {
    return 'ERR: ' + e.message.slice(0, 100);
  }
})()`);
console.log('canvas 颜色采样:', col);
ws.close();
