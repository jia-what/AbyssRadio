/**
 * KuGou QR login — mirrors MakcRe/KuGouMusicApi login_qr_* modules.
 * Web-mode (appid=1014) returns a WEB token that carries VIP playback rights;
 * Android-mode (appid=1005) only yields an API token without VIP. Use web mode.
 */
import QRCode from 'qrcode';
import { md5, signatureWebParams, KUGOU_SRCAPPID, randomDfid, calculateMid } from './kugouSign.mjs';

const CONFIG_APPID = 1014;   // web appid — VIP-capable token
const QR_APPID = 1014;
const CLIENTVER = 20000;     // web clientver
const LOGIN_HOSTS = ['https://login-user.kugou.com', 'http://login.user.kugou.com'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function kugouWebGet(path, queryParams) {
  // web login JS uses millisecond clienttime (parseInt(new Date().getTime()))
  const clienttime = Date.now();
  const mid = '-';
  const params = {
    dfid: '-',
    mid,
    uuid: '-',
    appid: CONFIG_APPID,
    clientver: CLIENTVER,
    clienttime,
    ...queryParams,
  };
  params.signature = signatureWebParams(params);

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  const query = qs.toString();

  let lastErr;
  for (const base of LOGIN_HOSTS) {
    try {
      const res = await fetch(`${base}${path}?${query}`, {
        headers: {
          'User-Agent': UA,
          dfid: '-',
          mid,
          clienttime: String(clienttime),
        },
      });
      const json = await res.json();
      if (json.status === 0 || (json.error_code && json.error_code !== 0)) {
        throw new Error(json.error_msg || json.msg || `酷狗登录接口 error_code=${json.error_code}`);
      }
      return json;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function getKugouQrKey() {
  const json = await kugouWebGet('/v2/qrcode', {
    appid: QR_APPID,
    type: 1,
    plat: 4,
    qrcode_txt: `https://h5.kugou.com/apps/loginQRCode/html/index.html?appid=${CONFIG_APPID}&`,
    srcappid: KUGOU_SRCAPPID,
  });
  const key = json?.data?.qrcode;
  if (!key) throw new Error('获取酷狗二维码失败');
  return key;
}

export async function createKugouQr(key) {
  const url = `https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=${key}`;
  const qrimg = await QRCode.toDataURL(url);
  return { key, url, qrimg };
}

/** Map KuGou status → NetEase-style poll codes (800/801/802/200). */
export async function checkKugouQr(qrKey) {
  const json = await kugouWebGet('/v2/get_userinfo_qrcode', {
    plat: 4,
    appid: CONFIG_APPID,
    srcappid: KUGOU_SRCAPPID,
    qrcode: qrKey,
  });
  const status = json?.data?.status;
  const codeMap = { 0: 800, 1: 801, 2: 802, 4: 200 };
  const code = codeMap[status] ?? 801;

  if (code !== 200) return { code };

  const token = json.data?.token;
  const userid = json.data?.userid;
  if (!token || !userid) return { code: 800 };

  const kgMid = md5(`kugou-qr:${userid}:${token}`);
  const guid = md5(`kugou-qr-guid:${userid}:${token}`);
  const apiMid = calculateMid(guid);
  const dfid = randomDfid();
  // Web-mode cookie: a_id=1014 marks the WEB account — KuGou VIP rights are
  // tied to this. Android-mode cookies (no a_id) cannot play VIP tracks.
  const cookie = [
    `token=${token}`,
    `userid=${userid}`,
    `KugooID=${userid}`,
    `t=${token}`,
    `a_id=${CONFIG_APPID}`,
    `kg_mid=${kgMid}`,
    `KUGOU_API_MID=${apiMid}`,
    `KUGOU_API_GUID=${guid}`,
    `dfid=${dfid}`,
    `mid=${apiMid}`,
  ].join('; ');

  return { code: 200, cookie };
}
