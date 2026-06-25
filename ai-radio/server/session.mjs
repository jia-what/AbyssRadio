/**
 * Session store for user-provided platform cookies.
 * Sessions are kept in memory and keyed by a random UUID.
 */
import crypto from 'crypto';

const sessions = new Map(); // key -> { platform, cookie, user, boundAt }

export function createSession(platform, cookie, user) {
  const key = crypto.randomUUID();
  sessions.set(key, { platform, cookie, user, boundAt: Date.now() });
  return key;
}

export function getSession(key) {
  return sessions.get(key) || null;
}

export function deleteSession(key) {
  sessions.delete(key);
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
