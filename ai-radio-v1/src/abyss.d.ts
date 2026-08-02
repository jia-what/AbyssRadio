/**
 * Electron preload bridge types — window.abyss is injected by desktop/preload.cjs.
 */
interface AbyssBridge {
  kugouLogin: () => Promise<{
    ok?: boolean;
    cookie?: string;
    sessionKey?: string;
    saved?: boolean;
    partial?: boolean;
    message?: string;
    cancelled?: boolean;
    error?: string;
  }>;
  kugouClearSession: () => Promise<{ ok: boolean }>;
  appInfo: () => Promise<{ version: string; backendUrl: string; cookieFile: string }>;
}

interface Window {
  abyss?: AbyssBridge;
}
