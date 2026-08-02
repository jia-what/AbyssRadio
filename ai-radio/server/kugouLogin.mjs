/**
 * Refresh web KuGou cookie token → Android API session via login_by_token.
 */
import {
  buildKugouCookiePool,
  poolToCookieString,
  signatureAndroidParams,
} from './kugouSign.mjs';
import { buildLoginByTokenBody, parseLoginByTokenResponse } from './kugouCrypto.mjs';

const APPID = 1005;
const CLIENTVER = 20489;
const UA = 'Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi';
const LOGIN_HOSTS = ['http://login.user.kugou.com', 'https://login-user.kugou.com'];

/**
 * Exchange browser `t` token for API-compatible token. Returns updated cookie string.
 */
export async function refreshKugouToken(cookieStr) {
  const pool = buildKugouCookiePool(cookieStr);
  const { body, encryptKey } = buildLoginByTokenBody(pool);
  const bodyStr = JSON.stringify(body);
  const clienttime = Math.floor(Date.now() / 1000);

  const params = {
    dfid: pool.dfid,
    mid: pool.KUGOU_API_MID,
    uuid: '-',
    appid: APPID,
    clientver: CLIENTVER,
    clienttime,
    token: pool.token,
    userid: Number(pool.userid),
  };
  params.signature = signatureAndroidParams(params, bodyStr);

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const query = qs.toString();
  try {
    const json = await postLoginByToken(LOGIN_HOSTS, query, bodyStr, pool, clienttime);
    const refreshed = parseLoginByTokenResponse(json, encryptKey);
    pool.token = refreshed.token;
    pool.t = refreshed.token;
    if (refreshed.userid) {
      pool.userid = refreshed.userid;
      pool.KugooID = refreshed.userid;
    }
    if (refreshed.vip_type !== undefined) pool.vip_type = String(refreshed.vip_type);
    if (refreshed.vip_token) pool.vip_token = refreshed.vip_token;
    if (refreshed.t1) pool.t1 = String(refreshed.t1);
    return poolToCookieString(pool);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'fetch failed') {
      throw new Error('无法连接酷狗登录服务器，请检查网络');
    }
    throw e;
  }
}

async function postLoginByToken(hosts, query, bodyStr, pool, clienttime) {
  let lastErr;
  for (const host of hosts) {
    const url = `${host}/v5/login_by_token?${query}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': UA,
          Cookie: poolToCookieString(pool),
          dfid: pool.dfid,
          mid: pool.KUGOU_API_MID,
          clienttime: String(clienttime),
        },
        body: bodyStr,
      });
      let json;
      try {
        json = await res.json();
      } catch {
        throw new Error('酷狗 token 刷新：响应非 JSON');
      }
      return json;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Refresh token + VIP credentials (vip_token). Required for full-length VIP playback. */
export async function ensureKugouApiCookie(cookieStr) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await refreshKugouToken(cookieStr);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function isKugouAuthError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return /20017|20018|登录态|登录已过期|token 刷新/.test(msg);
}
