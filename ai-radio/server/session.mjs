/**
 * Unified session store for platform cookies (netease / kugou).
 * In-memory; process restart clears sessions.
 */
import crypto from 'crypto';

const sessions = new Map(); // key -> { platform, cookie, user, boundAt, refreshedAt }
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // re-refresh at most every 30 min

export function createSession(platform, cookie, user) {
  const key = crypto.randomUUID();
  const now = Date.now();
  sessions.set(key, {
    platform,
    cookie,
    user,
    boundAt: now,
    refreshedAt: now,
  });
  return key;
}

export function getSession(key) {
  if (!key) return null;
  const session = sessions.get(key);
  if (!session) return null;
  if (Date.now() - session.boundAt > SESSION_TTL_MS) {
    sessions.delete(key);
    return null;
  }
  return session;
}

export function updateSessionCookie(key, cookie) {
  const session = sessions.get(key);
  if (!session) return false;
  session.cookie = cookie;
  session.refreshedAt = Date.now();
  return true;
}

export function deleteSession(key) {
  sessions.delete(key);
}

/**
 * Ensure session cookie is fresh.
 * - kugou: refreshKugouToken
 * - netease: login_refresh when stale
 * Returns { session, cookie } or null if key invalid.
 */
export async function ensureFreshSession(key) {
  const session = getSession(key);
  if (!session) return null;

  const stale = Date.now() - (session.refreshedAt || session.boundAt) > REFRESH_INTERVAL_MS;
  if (!stale) return { session, cookie: session.cookie };

  try {
    if (session.platform === 'kugou') {
      const { refreshKugouToken } = await import('./kugouLogin.mjs');
      const next = await refreshKugouToken(session.cookie);
      if (next && next !== session.cookie) {
        updateSessionCookie(key, next);
        process.env.KUGOU_COOKIE = next;
      }
    } else if (session.platform === 'netease') {
      const { refreshNeteaseCookie } = await import('./login.mjs');
      const next = await refreshNeteaseCookie(session.cookie);
      if (next && next !== session.cookie) updateSessionCookie(key, next);
    } else {
      session.refreshedAt = Date.now();
    }
  } catch {
    // Keep existing cookie; callers may still succeed or surface auth errors
    session.refreshedAt = Date.now();
  }

  return { session: getSession(key), cookie: getSession(key)?.cookie || session.cookie };
}

/**
 * Parse a raw "k=v; k2=v2" cookie string into an object.
 */
export function parseCookie(str) {
  const out = {};
  if (!str) return out;
  for (const part of String(str).split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}
