/**
 * KuGou Android client signature + gateway requests.
 * Algorithm mirrors the public KuGou Android API signing (sorted key=value + MD5 salt).
 */
import crypto from 'crypto';
import { parseCookie } from './session.mjs';

const ANDROID_SALT = 'OIlwieks28dk2k092lksi2UIkp';
const WEB_SALT = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt';
const APPID = 1005;
const CLIENTVER = 20489;
export const KUGOU_SRCAPPID = 2919;
const GATEWAY = 'https://gateway.kugou.com';
const UA = 'Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi';

function wrapFetchError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err?.cause?.code || '';
  if (msg === 'fetch failed' || code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') {
    return new Error('无法连接酷狗服务器，请检查网络或稍后重试');
  }
  return err instanceof Error ? err : new Error(msg);
}

function buildRequestUrls(path, router) {
  const urls = [];
  if (router) urls.push(`http://${router}${path}`);
  urls.push(`${GATEWAY}${path}`);
  return urls;
}

const KUGOU_AUTH_ERRORS = {
  20017: '登录态无效。请从 F12 → Network 复制整段 Cookie 请求头（不要只挑几个字段），或在 kugou.com 播放一首歌后再试',
  20018: '登录已过期，请重新复制 Cookie 绑定',
  20028: '账号需安全验证，请在酷狗网页/App 完成验证后重试',
};

export function md5(str) {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex');
}

/** Web client signature (QR login, search, etc.). */
export function signatureWebParams(params) {
  const paramsString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('');
  return md5(`${WEB_SALT}${paramsString}${WEB_SALT}`);
}

/** Strip "Cookie:" prefix / newlines from pasted request headers. */
export function normalizeCookieInput(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.trim();
  if (/^cookie\s*:/i.test(s)) s = s.replace(/^cookie\s*:/i, '').trim();
  s = s.replace(/[\r\n\t]+/g, '');
  return s.trim();
}

/** decodeURIComponent that never throws (KuGoo nicknames use %uXXXX). */
export function safeDecodeURIComponent(str) {
  if (!str) return '';
  try {
    return decodeURIComponent(String(str).replace(/\+/g, ' '));
  } catch {
    return String(str);
  }
}

export function decodeKugouNickName(raw) {
  if (!raw) return '';
  const u = raw.replace(/%u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return safeDecodeURIComponent(u);
}

/** Android API mid: MD5(guid) interpreted as hex → decimal string */
export function calculateMid(seed) {
  const digest = md5(seed);
  let n = 0n;
  for (let i = 0; i < digest.length; i++) {
    n = n * 16n + BigInt(parseInt(digest[i], 16));
  }
  return n.toString();
}

function randomDev() {
  const chars = '1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/** 24-char device fingerprint id (trackercdn requires a real dfid, not "-"). */
export function randomDfid() {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 24; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function resolveApiMid(c, guid) {
  // Tracker / gateway signatures use decimal KUGOU_API_MID — not the 32-char hex kg_mid.
  if (c.KUGOU_API_MID && /^\d{15,}$/.test(String(c.KUGOU_API_MID))) return String(c.KUGOU_API_MID);
  if (c.mid && /^\d{15,}$/.test(String(c.mid))) return String(c.mid);
  return calculateMid(guid);
}

/**
 * Normalize browser cookie → Android API cookie pool (userid/token + device ids).
 */
export function buildKugouCookiePool(cookieStr) {
  const c = parseCookie(normalizeCookieInput(cookieStr));
  const userid = String(c.KugooID || c.kugooid || c.userid || '');
  let token = c.t || c.token || '';

  if (!token && c.KuGoo) {
    const m = String(c.KuGoo).match(/(?:^|&|[?&])t=([^&]+)/);
    if (m) token = safeDecodeURIComponent(m[1]);
  }

  if (!userid || !token) {
    throw new Error('酷狗 Cookie 无效：未找到 KugooID 或 token，请重新复制完整 Cookie');
  }

  const dfid = c.dfid || c.kg_dfid || c.kg_dfid_collect || c.DFID || '-';
  const guid = c.KUGOU_API_GUID || md5(`abyss-kugou:${userid}:${c.kg_mid || ''}`);
  const apiMid = resolveApiMid(c, guid);

  return {
    ...c,
    userid,
    token,
    KugooID: userid,
    t: token,
    dfid,
    KUGOU_API_GUID: guid,
    KUGOU_API_MID: apiMid,
    KUGOU_API_DEV: (c.KUGOU_API_DEV || randomDev()).toUpperCase(),
    KUGOU_API_MAC: (c.KUGOU_API_MAC || '02:00:00:00:00:00').toUpperCase(),
  };
}

function poolToCookieString(pool) {
  const order = [
    'token', 'userid', 'KugooID', 't', 'dfid', 'kg_dfid',
    'KUGOU_API_MID', 'KUGOU_API_GUID', 'KUGOU_API_DEV', 'KUGOU_API_MAC',
    'kg_mid', 'KuGoo', 'UserName', 'CheckCode', 'vip_type', 'vip_token', 't1',
  ];
  const seen = new Set();
  const parts = [];
  for (const k of order) {
    const v = pool[k];
    if (v && !seen.has(k)) {
      parts.push(`${k}=${v}`);
      seen.add(k);
    }
  }
  for (const [k, v] of Object.entries(pool)) {
    if (!v || seen.has(k)) continue;
    if (k.startsWith('KUGOU_API_')) continue;
    parts.push(`${k}=${v}`);
    seen.add(k);
  }
  return parts.join('; ');
}

export { poolToCookieString };

/** Tracker play URL key (v5/url) — no signature param, only `key`. */
export function signKey(hash, mid, userid, appid = APPID) {
  const salt = '57ae12eb6890223e355ccfcb74edf70d';
  return md5(`${hash}${salt}${appid}${mid}${userid || 0}`);
}

/** H5/Web signature: MD5(salt + sorted(key=value...) + JSON.stringify(body) + salt). Body MUST participate. */
export function signatureH5Params(params, bodyObj = null) {
  const parts = Object.keys(params).sort().map((key) => `${key}=${params[key]}`);
  if (bodyObj && typeof bodyObj === 'object') parts.push(JSON.stringify(bodyObj));
  return md5(`${WEB_SALT}${parts.join('')}${WEB_SALT}`);
}

/**
 * H5 gateway request — browser-identity path (appid=1014).
 * Works for VIP tracks AND cloudlist APIs with the full web cookie (no login_by_token refresh needed).
 */
export async function kugouH5Request(opts) {
  const { pool, ...identity } = kugouIdentity(opts.cookie);
  const method = (opts.method || 'GET').toUpperCase();
  const bodyObj = opts.body || null;
  const bodyText = bodyObj ? JSON.stringify(bodyObj) : '';
  const now = Date.now();
  const params = {
    srcappid: KUGOU_SRCAPPID,
    clientver: '20000',
    clienttime: now,
    mid: identity.mid || pool.kg_mid || '-',
    uuid: now,
    dfid: pool.dfid || '-',
    appid: 1014,
    token: identity.token || '',
    userid: Number(identity.userid) || 0,
    ...(opts.query || {}),
  };
  params.signature = signatureH5Params(params, bodyObj);

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  const urls = opts.router
    ? [`${GATEWAY}${opts.path}?${qs.toString()}`, `http://${opts.router}${opts.path}?${qs.toString()}`]
    : [`${GATEWAY}${opts.path}?${qs.toString()}`];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'https://www.kugou.com/',
    Cookie: poolToCookieString(pool),
  };
  if (opts.router) headers['x-router'] = opts.router;
  if (bodyText) headers['Content-Type'] = 'application/json';

  let lastErr;
  for (const url of urls) {
    try {
      const res = await fetch(url, { method, headers, body: bodyText || undefined });
      const json = await res.json();
      if (json.status === 0 || (json.error_code && json.error_code !== 0)) {
        throw new Error(formatKugouError(json));
      }
      return json;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr;
}

/** Android signature: MD5(salt + sorted(key=value...) + body + salt) */
export function signatureAndroidParams(params, body = '') {
  const bodyStr = typeof body === 'string' ? body : (body ? JSON.stringify(body) : '');
  const paramsString = Object.keys(params)
    .sort()
    .map((key) => {
      const val = params[key];
      const serialized = typeof val === 'object' ? JSON.stringify(val) : val;
      return `${key}=${serialized}`;
    })
    .join('');
  return md5(`${ANDROID_SALT}${paramsString}${bodyStr}${ANDROID_SALT}`);
}

export function kugouIdentity(cookieStr) {
  const pool = buildKugouCookiePool(cookieStr);
  return {
    userid: pool.userid,
    token: pool.token,
    mid: pool.KUGOU_API_MID,
    dfid: pool.dfid,
    pool,
  };
}

function buildSignedParams(query, bodyStr, identity) {
  const clienttime = Math.floor(Date.now() / 1000);
  const params = {
    dfid: identity.dfid,
    mid: identity.mid,
    uuid: '-',
    appid: APPID,
    clientver: CLIENTVER,
    clienttime,
    token: identity.token,
    userid: Number(identity.userid),
    ...query,
  };
  params.signature = signatureAndroidParams(params, bodyStr);
  return params;
}

function formatKugouError(json) {
  const code = json.error_code;
  const hint = KUGOU_AUTH_ERRORS[code];
  const detail = json.error_msg || json.msg || json.message || '';
  if (hint) return `酷狗接口错误：${hint}${detail ? `（${detail}）` : ''}`;
  return `酷狗接口错误：${detail || `error_code=${code}`}`;
}

/**
 * Signed request via gateway.kugou.com with optional x-router host.
 */
export async function kugouAndroidRequest(opts) {
  const { pool, ...identity } = kugouIdentity(opts.cookie);
  const method = (opts.method || 'GET').toUpperCase();
  const bodyObj = opts.body || null;
  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
  const params = buildSignedParams(opts.query || {}, bodyStr, identity);

  const headers = {
    'User-Agent': UA,
    Cookie: poolToCookieString(pool),
    dfid: identity.dfid,
    mid: identity.mid,
    clienttime: String(params.clienttime),
    'kg-rc': '1',
    'kg-thash': '5d816a0',
    'kg-rec': '1',
    'kg-rf': 'B9EDA08A64250DEFFBCADDEE00F8F25F',
  };
  if (opts.router) headers['x-router'] = opts.router;

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  const query = qs.toString();
  const urls = buildRequestUrls(opts.url, opts.router);

  let lastErr;
  for (let i = 0; i < urls.length; i++) {
    const useRouterHeader = urls[i].startsWith(GATEWAY) && opts.router;
    const reqHeaders = { ...headers };
    if (!useRouterHeader) delete reqHeaders['x-router'];

    try {
      const res = await fetch(`${urls[i]}?${query}`, {
        method,
        headers: {
          ...reqHeaders,
          ...(bodyStr ? { 'Content-Type': 'application/json' } : {}),
        },
        body: bodyStr || undefined,
      });

      let json;
      try {
        json = await res.json();
      } catch {
        throw new Error('酷狗接口返回非 JSON 响应');
      }

      if (json.status === 0 || (json.error_code && json.error_code !== 0)) {
        throw new Error(formatKugouError(json));
      }
      return json;
    } catch (e) {
      lastErr = e;
      // Auth/business errors should not fall through to alternate host
      if (e instanceof Error && /酷狗/.test(e.message)) throw e;
    }
  }
  throw wrapFetchError(lastErr);
}
