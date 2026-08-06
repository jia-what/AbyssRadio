/* CDP: 全流程点歌 + 读粒子场 canvas 像素(确认渲染颜色) */
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
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id).res(msg); pending.delete(msg.id); }
};
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable').catch(() => {});
await send('Page.enable').catch(() => {});

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }).catch(() => null);
  if (!r || r.result?.exceptionDetails) return 'EXC: ' + (r.result?.exceptionDetails?.exception?.description || '').slice(0, 120);
  return r.result?.result?.value;
};

await send('Page.navigate', { url: 'http://localhost:3000' }).catch(() => {});
await new Promise((r) => setTimeout(r, 8000));
await evalJs(`localStorage.setItem('ai-radio-bind', ${JSON.stringify(bind)}); 'ok'`);
await send('Page.reload', { ignoreCache: true }).catch(() => {});
await new Promise((r) => setTimeout(r, 10000));

// 点击进入
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

// 左边缘唤出
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
  console.log('点歌 ✓ 等 55s');
  await new Promise((r) => setTimeout(r, 55000));
}

// 读 canvas 像素
const px = await evalJs(`(() => {
  const out = [];
  for (const c of document.querySelectorAll('canvas')) {
    try {
      // WebGL canvas 不能用 2d getImageData, 试 preserveDrawingBuffer 或 toDataURL
      const dataUrl = c.toDataURL ? c.toDataURL('image/png') : '';
      out.push({ w: c.width, h: c.height, dataUrlLen: dataUrl.length, dataUrlHead: dataUrl.slice(0, 30) });
    } catch (e) {
      out.push({ w: c.width, h: c.height, err: e.message.slice(0, 60) });
    }
  }
  return JSON.stringify(out);
})()`);
console.log('canvas:', px);

// 页面状态
const st = await evalJs(`(() => {
  const audio = document.querySelector('audio');
  const imgs = [...document.querySelectorAll('img')];
  return JSON.stringify({
    hasAudio: !!audio,
    playing: audio ? !audio.paused : false,
    imgs: imgs.map(i => ({ src: (i.src || '').slice(0, 50), w: i.naturalWidth })).slice(0, 4),
    texts: [...new Set([...document.querySelectorAll('div,span,p')].filter(e => /全网|Bound|诊断|正在翻/.test(e.textContent)).map(e => e.textContent.trim().slice(0, 45)))].slice(0, 6)
  });
})()`);
console.log('状态:', st);

// 截图
const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true }).catch((e) => ({ error: e.message }));
if (shot.result?.data) {
  fs.writeFileSync('E:\\VM\\AI_audio\\ai-radio-v1\\cdp-shot8.png', Buffer.from(shot.result.data, 'base64'));
  console.log('截图 OK cdp-shot8.png');
} else {
  console.log('截图失败:', shot.error || '');
}
ws.close();
