/**
 * KuGou account binding.
 *
 * The user-playlist listing endpoint (/v7/get_all_list via
 * cloudlist.service.kugou.com) requires KuGou's full Android signing
 * pipeline (appid/clientver + signature). That port is scheduled for a
 * later phase. For now we:
 *   - parse the cookie to verify it carries userid/token,
 *   - expose the cookie for playback (VIP) via getKugouCookie,
 *   - throw a clear, friendly error for playlist listing so the UI can
 *     fall back to NetEase.
 */
import { parseCookie } from './session.mjs';

/**
 * Verify a raw KuGou cookie string and extract identity.
 * KuGou stores userid in `KugooID` and token in `t` (or inside `KuGoo`).
 */
export function verifyKugouCookie(cookie) {
  const c = parseCookie(cookie);
  const userid = c.KugooID || c.kugooid || '';
  const token = c.t || c.token || '';
  const mid = c.kg_mid || c.mid || '';

  if (!userid || !token) {
    throw new Error('酷狗 Cookie 无效：未找到 KugooID 或 token，请重新复制完整 Cookie');
  }

  let nickname = '酷狗用户';
  if (c.KuGoo) {
    const m = decodeURIComponent(c.KuGoo).match(/NickName=([^&]+)/);
    if (m) {
      try { nickname = decodeURIComponent(m[1].replace(/%u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))); } catch {}
    }
  }

  return { userId: String(userid), token, mid, nickname };
}

/**
 * Placeholder until the signed gateway port lands (later phase).
 */
export async function getKugouPlaylistsByCookie() {
  throw new Error('酷狗歌单接口开发中，暂请使用网易云 Cookie 加载歌单');
}

export async function getKugouTracksByCookie() {
  throw new Error('酷狗歌单接口开发中，暂请使用网易云 Cookie');
}
