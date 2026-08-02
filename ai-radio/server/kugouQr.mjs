/**
 * KuGou QR login — mirrors MakcRe/KuGouMusicApi login_qr_* modules.
 */
import QRCode from 'qrcode';
import { md5, signatureWebParams, KUGOU_SRCAPPID, randomDfid, calculateMid } from './kugouSign.mjs';

const CONFIG_APPID = 1005;
const QR_APPID = 1001;
const CLIENTVER = 20489;
const LOGIN_HOSTS = ['http://login.user.kugou.com', 'https://login-user.kugou.com'];
const UA = 'Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi';

async function kugouWebGet(path, queryParams) {
  const clienttime = Math.floor(Date.now() / 1000);
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
  const cookie = [
    `token=${token}`,
    `userid=${userid}`,
    `KugooID=${userid}`,
    `t=${token}`,
    `kg_mid=${kgMid}`,
    `KUGOU_API_MID=${apiMid}`,
    `KUGOU_API_GUID=${guid}`,
    `dfid=${dfid}`,
    `mid=${apiMid}`,
  ].join('; ');

  return { code: 200, cookie };
}
