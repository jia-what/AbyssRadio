/**
 * Unified QR login for NetEase + KuGou.
 * On success creates a session in session.mjs (same as cookie bind).
 */
import { getQrKey, createQr, checkQr, verifyNeteaseCookie } from './login.mjs';
import { getKugouQrKey, createKugouQr, checkKugouQr } from './kugouQr.mjs';
import { verifyKugouCookie } from './kugou.mjs';
import { ensureKugouApiCookie } from './kugouLogin.mjs';
import { createSession } from './session.mjs';

function normalizePlatform(raw) {
  return raw === 'kugou' ? 'kugou' : 'netease';
}

export async function qrKeyForPlatform(platformRaw) {
  const platform = normalizePlatform(platformRaw);
  if (platform === 'kugou') {
    const key = await getKugouQrKey();
    return { key, platform };
  }
  const key = await getQrKey();
  return { key, platform: 'netease' };
}

export async function qrImageForPlatform(platformRaw, key) {
  const platform = normalizePlatform(platformRaw);
  if (platform === 'kugou') return createKugouQr(key);
  return createQr(key);
}

export async function qrCheckForPlatform(platformRaw, qrKey) {
  try {
    const platform = normalizePlatform(platformRaw);
    if (platform === 'kugou') {
      const raw = await checkKugouQr(qrKey);
      if (raw.code !== 200 || !raw.cookie) return { code: raw.code };

      const user = verifyKugouCookie(raw.cookie);
      let cookie = raw.cookie;
      try {
        cookie = await ensureKugouApiCookie(cookie);
      } catch {
        // login_by_token may fail on fresh QR — play still attempted with QR token
      }
      process.env.KUGOU_COOKIE = cookie;
      const sessionKey = createSession('kugou', cookie, user);
      return { code: 200, key: sessionKey, platform: 'kugou', user };
    }

    const raw = await checkQr(qrKey);
    if (raw.code !== 200 || !raw.cookie) {
      return { code: raw.code, message: raw.message };
    }

    let user = { userId: '', nickname: '网易云用户' };
    try {
      user = await verifyNeteaseCookie(raw.cookie);
    } catch {
      // QR cookie is valid — profile lookup can fail under rate limit
    }
    const sessionKey = createSession('netease', raw.cookie, user);
    return { code: 200, key: sessionKey, platform: 'netease', user };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { code: 801, message: msg || '登录检查失败，请重试' };
  }
}
