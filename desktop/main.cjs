/**
 * Abyss Radio — Electron desktop shell.
 * P0: in-process backend boot + static frontend loading (mirrors Mineradio's approach).
 * P1: KuGou web login window with cookie polling (BrowserWindow + session partition).
 */
const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { pathToFileURL } = require('url');

const APP_ROOT = path.join(__dirname, '..');
const SERVER_DIR = path.join(APP_ROOT, 'ai-radio', 'server');
const FRONTEND_DIST = path.join(APP_ROOT, 'ai-radio-v1', 'dist');
const KUGOU_COOKIE_FILE = path.join(process.env.APPDATA || path.join(app.getPath('appData'), '..'), 'Mineradio', '.kugou-cookie');
const BACKEND_PORT = Number(process.env.PORT) || 4000;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

// KuGou login constants (browser window)
const KUGOU_LOGIN_URL = 'https://www.kugou.com/';
const KUGOU_LOGIN_WARMUP_URL = 'https://www.kugou.com/newuc/user/uc/type=edit';
const KUGOU_LOGIN_PARTITION = 'persist:kugou-login';
const KUGOU_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let mainWindow = null;
let backendStarted = false;
let backendWaiters = [];

/** Small helper: wait for backend HTTP to answer. */
function waitForBackend(timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      const req = http.get({ host: '127.0.0.1', port: BACKEND_PORT, path: '/api/health', timeout: 1500 }, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        schedule();
      });
      req.on('error', schedule);
      req.on('timeout', () => { req.destroy(); schedule(); });
    };
    const schedule = () => {
      if (Date.now() > deadline) return reject(new Error('backend did not become ready'));
      setTimeout(attempt, 400);
    };
    attempt();
  });
}

/** Start the AI_audio backend in-process (ESM) — same pattern Mineradio uses with require(). */
async function startBackend() {
  if (backendStarted) return;
  backendStarted = true;
  try {
    process.chdir(SERVER_DIR); // dotenv loads .env from cwd
    process.env.FRONTEND_DIST = FRONTEND_DIST;
    const mod = await import(pathToFileURL(path.join(SERVER_DIR, 'index.mjs')).href);
    console.log('[abyss] backend module loaded');
    await waitForBackend(15000);
    console.log(`[abyss] backend ready at ${BACKEND_URL}`);
    backendWaiters.forEach((w) => w());
    backendWaiters = [];
  } catch (e) {
    console.error('[abyss] backend start failed:', e.message || e);
    backendStarted = false;
    throw e;
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Abyss Radio',
    backgroundColor: '#0a0a0f',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  mainWindow.loadURL(BACKEND_URL);
  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

// ================= KuGou web login window (P1) =================

function cookieHeaderFromSession(cookieSession) {
  return new Promise((resolve) => {
    cookieSession.cookies.get({}).then((cookies) => {
      const pairs = cookies
        .filter((c) => c.domain && /kugou\.com$/i.test(c.domain))
        .map((c) => `${c.name}=${c.value}`)
        .sort();
      resolve(pairs.join('; '));
    }).catch(() => resolve(''));
  });
}

function kugouCookieHasLogin(cookieHeader) {
  return /KugooID=/.test(cookieHeader) || /token=/.test(cookieHeader) || /KuGoo=/.test(cookieHeader);
}

function kugouCookieHasPlayback(cookieHeader) {
  // Playback-ready means we have the identity token AND a_id=1014 (web rights) or KuGoo composite.
  return kugouCookieHasLogin(cookieHeader) && (/a_id=1014/.test(cookieHeader) || /KuGoo=/.test(cookieHeader));
}

function openKugouLoginWindow() {
  return new Promise((resolve) => {
    const cookieSession = session.fromPartition(KUGOU_LOGIN_PARTITION);
    let settled = false;
    let warmupStarted = false;

    const loginWindow = new BrowserWindow({
      width: 900,
      height: 720,
      minWidth: 760,
      minHeight: 560,
      parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
      show: false,
      autoHideMenuBar: true,
      title: '酷狗音乐登录',
      backgroundColor: '#111111',
      webPreferences: {
        partition: KUGOU_LOGIN_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
      resolve(result);
    };

    const checkCookies = async () => {
      try {
        const cookie = await cookieHeaderFromSession(cookieSession);
        if (kugouCookieHasPlayback(cookie)) {
          finish({ ok: true, cookie });
        } else if (kugouCookieHasLogin(cookie) && !warmupStarted) {
          // Logged in but playback token may be incomplete — warm up the profile page
          // which usually materializes a_id / KuGoo composite.
          warmupStarted = true;
          setTimeout(() => {
            if (!settled && loginWindow && !loginWindow.isDestroyed()) {
              loginWindow.loadURL(KUGOU_LOGIN_WARMUP_URL).catch(() => {});
            }
          }, 900);
        }
      } catch (e) {
        console.warn('[abyss] kugou cookie check failed:', e.message);
      }
    };

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        loginWindow.loadURL(url).catch(() => {});
      } else {
        shell.openExternal(url).catch(() => {});
      }
      return { action: 'deny' };
    });

    loginWindow.webContents.on('did-finish-load', () => {
      checkCookies();
      // Auto-click the login entry if the page is the homepage.
      loginWindow.webContents.executeJavaScript(`
        setTimeout(() => {
          const nodes = Array.from(document.querySelectorAll('a, button, span, div'));
          const loginNode = nodes.find((node) => {
            const text = (node.textContent || '').trim();
            if (!/登录|登陆/.test(text)) return false;
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          if (loginNode) loginNode.click();
        }, 700);
      `, true).catch(() => {});
    });

    loginWindow.on('ready-to-show', () => loginWindow.show());
    loginWindow.on('closed', async () => {
      if (settled) return;
      if (pollTimer) clearInterval(pollTimer);
      try {
        const cookie = await cookieHeaderFromSession(cookieSession);
        resolve(kugouCookieHasPlayback(cookie)
          ? { ok: true, cookie }
          : (kugouCookieHasLogin(cookie)
            ? { ok: true, cookie, partial: true, message: '酷狗账号已登录，但播放 token 不完整，请稍后重试' }
            : { ok: false, cancelled: true, message: '登录窗口已关闭' }));
      } catch (e) {
        resolve({ ok: false, error: e.message || '登录窗口已关闭' });
      }
    });

    let pollTimer = setInterval(checkCookies, 1200);
    loginWindow.loadURL(KUGOU_LOGIN_URL).catch((e) => finish({ ok: false, error: e.message }));
  });
}

async function clearKugouLoginSession() {
  const cookieSession = session.fromPartition(KUGOU_LOGIN_PARTITION);
  await cookieSession.clearStorageData({ storages: ['cookies'] });
}

/** Persist KuGou cookie to the same file the backend reads (Mineradio path). */
function persistKugouCookie(cookie) {
  try {
    fs.mkdirSync(path.dirname(KUGOU_COOKIE_FILE), { recursive: true });
    fs.writeFileSync(KUGOU_COOKIE_FILE, cookie, 'utf8');
    return true;
  } catch (e) {
    console.warn('[abyss] persist kugou cookie failed:', e.message);
    return false;
  }
}

// ================= IPC =================

ipcMain.handle('kugou:login', async () => {
  try {
    const result = await openKugouLoginWindow();
    if (result.ok && result.cookie) {
      const saved = persistKugouCookie(result.cookie);
      // Notify backend (it re-reads cookie on next request via process.env or file).
      try {
        const post = await fetch(`${BACKEND_URL}/api/session/bind`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: 'kugou', cookie: result.cookie }),
        });
        const data = await post.json();
        result.sessionKey = data.key;
      } catch (e) {
        console.warn('[abyss] backend bind after kugou login failed:', e.message);
      }
      result.saved = saved;
    }
    return result;
  } catch (e) {
    return { ok: false, error: e.message || '酷狗登录失败' };
  }
});

ipcMain.handle('kugou:clear-session', async () => {
  await clearKugouLoginSession();
  return { ok: true };
});

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  backendUrl: BACKEND_URL,
  cookieFile: KUGOU_COOKIE_FILE,
}));

// ================= Lifecycle =================

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await startBackend();
      createMainWindow();
    } catch (e) {
      console.error('[abyss] startup failed:', e.message || e);
      dialogError(e.message || '后端启动失败');
      app.quit();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}

function dialogError(message) {
  const { dialog } = require('electron');
  dialog.showErrorBox('Abyss Radio 启动失败', String(message));
}
