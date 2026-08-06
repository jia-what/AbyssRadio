/* CDP: 查 /api/img 请求的真实网络状态(background-image 是否加载成功) */
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

// performance entries 里找 /api/img 请求
const perfs = await evalJs(`(() => {
  const entries = performance.getEntriesByType('resource').filter(e => e.name.includes('/api/img'));
  return JSON.stringify(entries.map(e => ({
    name: e.name.slice(0, 70),
    duration: Math.round(e.duration),
    size: e.transferSize,
    initiator: e.initiatorType,
  })));
})()`);
console.log('performance /api/img:', perfs);

// 当前页面所有 bg-cover 元素的实际背景是否加载(通过 style 计算)
const bgState = await evalJs(`(() => {
  const els = [...document.querySelectorAll('[class*="bg-cover"]')];
  return JSON.stringify(els.map(e => ({
    bg: (e.style.backgroundImage || '').slice(0, 60),
    rect: e.getBoundingClientRect().width + 'x' + e.getBoundingClientRect().height,
    visible: e.offsetParent !== null,
  })));
})()`);
console.log('bg-cover 元素:', bgState);

// 直接测试: 新建一个 img 用同 URL 加载(对照)
const test = await evalJs(`(async () => {
  const url = '/api/img?url=' + encodeURIComponent('https://imge.kugou.com/stdmusic/83c76b6fab3e21e82145fd97a505c743.jpg');
  return await new Promise((res) => {
    const img = new Image();
    img.onload = () => res('img OK ' + img.naturalWidth);
    img.onerror = () => res('img ERR');
    img.src = url;
    setTimeout(() => res('timeout'), 5000);
  });
})()`);
console.log('对照 img:', test);

// 新建一个 div 用同 URL 做 background-image, 等 1.5s 看请求是否出现
await evalJs(`(() => {
  const div = document.createElement('div');
  div.id = 'bgtest';
  div.style.backgroundImage = 'url("/api/img?url=' + encodeURIComponent('https://imge.kugou.com/stdmusic/83c76b6fab3e21e82145fd97a505c743.jpg') + '")';
  div.style.width = '100px'; div.style.height = '100px';
  document.body.appendChild(div);
  return 'added';
})()`);
await new Promise((r) => setTimeout(r, 2000));
const perfs2 = await evalJs(`(() => {
  const entries = performance.getEntriesByType('resource').filter(e => e.name.includes('/api/img'));
  return JSON.stringify(entries.map(e => ({ name: e.name.slice(0, 60), dur: Math.round(e.duration), size: e.transferSize, init: e.initiatorType })));
})()`);
console.log('添加 bg 后 performance:', perfs2);
ws.close();
