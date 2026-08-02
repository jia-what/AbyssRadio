const base = 'http://localhost:4000';

function okHttp(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u);
}

async function main() {
  const url =
    `${base}/api/music/url-smart?id=7a66af1c054857487735347aec053546` +
    `&sources=netease,kugou&q=${encodeURIComponent('Die For You')}`;
  const r = await fetch(url);
  const j = await r.json();
  console.log('A status', r.status);
  console.log('A url', typeof j.url === 'string' ? j.url.slice(0, 140) : j);
  console.log('A isHttp', okHttp(j.url));
  console.log('A isGarbage', /参数错误|"code":\s*400/.test(j.url || ''));

  const bad = await fetch(
    `${base}/api/music/url-smart?id=7a66af1c054857487735347aec053546` +
      `&sources=netease,kugou,kuwo&q=${encodeURIComponent('Die For You')}`,
  );
  const bj = await bad.json();
  console.log('A+kuwo status', bad.status, 'isHttp', okHttp(bj.url), 'garbage', /参数错误/.test(bj.url || ''));

  const key = await fetch(`${base}/api/login/qr-key?platform=netease`).then((x) => x.json());
  console.log('B netease key', !!key.key);
  if (key.key) {
    const img = await fetch(
      `${base}/api/login/qr?platform=netease&key=${encodeURIComponent(key.key)}`,
    ).then((x) => x.json());
    const chk = await fetch(
      `${base}/api/login/qr-check?platform=netease&key=${encodeURIComponent(key.key)}`,
    ).then((x) => x.json());
    console.log('B qrimg', !!img.qrimg, 'check.code', chk.code);
  }

  const kk = await fetch(`${base}/api/login/qr-key?platform=kugou`).then((x) => x.json());
  console.log('B kugou key', !!kk.key);
  if (kk.key) {
    const img = await fetch(
      `${base}/api/login/qr?platform=kugou&key=${encodeURIComponent(kk.key)}`,
    ).then((x) => x.json());
    const chk = await fetch(
      `${base}/api/login/qr-check?platform=kugou&key=${encodeURIComponent(kk.key)}`,
    ).then((x) => x.json());
    console.log('B kugou qrimg', !!img.qrimg, 'check.code', chk.code);
  }

  if (!okHttp(j.url) || /参数错误/.test(j.url || '')) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
