/**
 * Unified session store for platform cookies (netease / kugou).
 * 第 14.5 项(热修复): 文件持久化 — 后端重启不再丢登录态。
 * 数据存 <server>/session-store.json (ABYSS_DATA_DIR 优先), 每次变更即落盘。
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ABYSS_DATA_DIR || __dirname;
const STORE_FILE = path.join(DATA_DIR, 'session-store.json');

const sessions = new Map(); // key -> { platform, cookie, user, boundAt, refreshedAt }
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // re-refresh at most every 30 min

function loadStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    for (const [k, v] of Object.entries(raw)) {
      if (v && v.cookie && Date.now() - (v.boundAt || 0) < SESSION_TTL_MS) {
        sessions.set(k, v);
      }
    }
  } catch (e) {
    console.warn('[abyss] session store load failed:', e.message);
  }
}

function persistStore() {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    const out = {};
    for (const [k, v] of sessions.entries()) out[k] = v;
    fs.writeFileSync(STORE_FILE, JSON.stringify(out), 'utf8');
  } catch (e) {
    console.warn('[abyss] session store persist failed:', e.message);
  }
}

loadStore();

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
  persistStore();
  return key;
}

export function getSession(key) {
  if (!key) return null;
  let session = sessions.get(key);
  if (!session) {
    // 兜底：内存丢了从磁盘捞（多进程/热重启场景）
    try {
      if (fs.existsSync(STORE_FILE)) {
        const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
        if (raw[key] && Date.now() - (raw[key].boundAt || 0) < SESSION_TTL_MS) {
          sessions.set(key, raw[key]);
          session = raw[key];
        }
      }
    } catch { /* ignore */ }
  }
  if (!session) return null;
  if (Date.now() - session.boundAt > SESSION_TTL_MS) {
    sessions.delete(key);
    persistStore();
    return null;
  }
  return session;
}

export function updateSessionCookie(key, cookie) {
  const session = sessions.get(key);
  if (!session) return false;
  session.cookie = cookie;
  session.refreshedAt = Date.now();
  persistStore();
  return true;
}

export function deleteSession(key) {
  sessions.delete(key);
  persistStore();
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
