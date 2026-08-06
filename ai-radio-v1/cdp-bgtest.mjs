/* CDP: 对比 img 标签 vs CSS background-image 加载同一个封面 */
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

const cover = 'https://imge.kugou.com/stdmusic/83c76b6fab3e21e82145fd97a505c743.jpg';
const proxied = `/api/img?url=${encodeURIComponent(cover)}`;

const cmp = await evalJs(`(async () => {
  const out = {};
  // 1) <img> 标签
  out.img = await new Promise((res) => {
    const img = new Image();
    img.onload = () => res('OK ' + img.naturalWidth + 'x' + img.naturalHeight);
    img.onerror = () => res('ERR');
    img.src = ${JSON.stringify(proxied)};
    setTimeout(() => res('timeout'), 5000);
  });
  // 2) CSS background-image(带引号)
  out.bgQuoted = await new Promise((res) => {
    const div = document.createElement('div');
    div.style.backgroundImage = 'url("' + ${JSON.stringify(proxied)} + '")';
    div.style.width = '64px'; div.style.height = '64px';
    document.body.appendChild(div);
    const check = () => {
      // 通过 canvas 读背景图是否加载: drawImage 背景 div 不能直接读, 用 img 元素间接
      const img = new Image();
      img.onload = () => { div.remove(); res('bg 引号 OK'); };
      img.onerror = () => { div.remove(); res('bg 引号 ERR'); };
      img.src = ${JSON.stringify(proxied)};
      setTimeout(() => { div.remove(); res('bg 引号 timeout'); }, 5000);
    };
    setTimeout(check, 800);
  });
  // 3) CSS background-image(无引号 — BottomBar 现状)
  out.bgRaw = await new Promise((res) => {
    const div = document.createElement('div');
    div.style.backgroundImage = 'url(' + ${JSON.stringify(proxied)} + ')';
    div.style.width = '64px'; div.style.height = '64px';
    document.body.appendChild(div);
    setTimeout(() => { div.remove(); res('bg 无引号已设置: ' + div.style.backgroundImage.slice(0, 80)); }, 800);
  });
  // 4) 直接测 BottomBar 当前元素的 backgroundImage
  out.bottombar = await (() => {
    const els = [...document.querySelectorAll('[class*="bg-cover"]')];
    return els.map(e => e.style.backgroundImage || '(无style)').slice(0, 3);
  })();
  return JSON.stringify(out);
})()`);
console.log('对比结果:', cmp);
ws.close();
