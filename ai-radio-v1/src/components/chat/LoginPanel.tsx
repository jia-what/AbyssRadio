import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Disc3, History, Heart, LogIn, ChevronRight, Play } from 'lucide-react';

interface LoginPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayTrack: (track: any) => void;
  currentTrack: any;
}

type QrCode = 800 | 801 | 802 | 803 | 200;

export default function LoginPanel({ isOpen, onClose, onPlayTrack }: LoginPanelProps) {
  const [mode, setMode] = useState<'login' | 'playlists' | 'tracks' | 'history' | 'likes'>('login');
  const [loginTab, setLoginTab] = useState<'netease' | 'kugou'>('netease');
  const [qrKey, setQrKey] = useState('');
  const [qrImg, setQrImg] = useState('');
  const [qrCode, setQrCode] = useState<QrCode>(801);
  const [kugouCookie, setKugouCookie] = useState('');
  const [binding, setBinding] = useState(false);
  const [error, setError] = useState('');
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [tracks, setTracks] = useState<any[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [likedSongs, setLikedSongs] = useState<any[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionKeyRef = useRef('');

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Start QR login — 801 → 802/803 → 200; keep polling through confirm step
  const qrStartingRef = useRef(false);
  const startQrInner = useCallback(async () => {
    stopPoll();
    setError('');
    setQrImg('');
    setQrCode(801);
    try {
      const keyData = await fetch('/api/login/qr-key?platform=netease');
      const keyJson = await keyData.json();
      if (!keyData.ok || !keyJson.key) {
        throw new Error(keyJson.error || keyJson.message || '获取二维码失败');
      }
      const qrRes = await fetch(`/api/login/qr?platform=netease&key=${encodeURIComponent(keyJson.key)}`);
      const qrData = await qrRes.json();
      if (!qrRes.ok || !qrData.qrimg) {
        throw new Error(qrData.error || '生成二维码失败');
      }
      setQrKey(keyJson.key);
      setQrImg(qrData.qrimg);
      setQrCode(801);

      pollRef.current = setInterval(async () => {
        try {
          const checkRes = await fetch(
            `/api/login/qr-check?platform=netease&key=${encodeURIComponent(keyJson.key)}`,
          );
          const check = await checkRes.json();
          const code = check.code as QrCode;
          const rateLimited = code === 801 && /频繁|稍候/.test(check.message || '');

          setQrCode((prev) => {
            if (rateLimited && (prev === 802 || prev === 803)) return prev;
            if (code === 802 || code === 803 || code === 800 || code === 200 || code === 801) {
              return code;
            }
            return prev;
          });

          if (code === 200 && check.key) {
            stopPoll();
            sessionKeyRef.current = check.key;
            setQrKey(check.key);
            loadPlaylists(check.key);
          } else if (code === 800) {
            stopPoll();
            setError('二维码已过期，请点击重试');
          } else if (rateLimited) {
            setError('请求过于频繁，请稍候…');
          } else if (code === 802 || code === 803) {
            setError('');
          }
        } catch (e) {
          console.error('[LoginPanel QR poll]', e);
          setError(e instanceof Error ? e.message : '登录检查失败，仍在重试…');
        }
      }, 2500);
    } catch (e) {
      console.error('[LoginPanel QR start]', e);
      setError(e instanceof Error ? e.message : '获取二维码失败');
    }
  }, [stopPoll]);

  const startQr = useCallback(async () => {
    // Re-entrancy guard: rapid double-clicks (or two buttons visible at once)
    // must not fire two qr-key calls — the 2nd hits the 5s cooldown and the
    // panel shows "请求过于频繁" with NO QR code generated.
    if (qrStartingRef.current) return;
    qrStartingRef.current = true;
    try {
      await startQrInner();
    } finally {
      setTimeout(() => { qrStartingRef.current = false; }, 800);
    }
  }, [startQrInner]);

  const loadPlaylists = async (key: string) => {
    try {
      const res = await fetch(`/api/playlists?key=${key}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '获取歌单失败');
      setPlaylists(data.playlists || []);
      setMode('playlists');
    } catch (e) {
      console.error('[LoginPanel playlists]', e);
      setError(e instanceof Error ? e.message : '获取歌单失败');
    }
  };

  const loadTracks = async (listId: string, playlist: any) => {
    const key = sessionKeyRef.current || qrKey;
    if (!key) return;
    try {
      const res = await fetch(`/api/playlist/tracks?id=${listId}&key=${key}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '获取曲目失败');
      setTracks(data.tracks || []);
      setActivePlaylist(playlist);
      setMode('tracks');
    } catch (e) {
      console.error('[LoginPanel tracks]', e);
      setError(e instanceof Error ? e.message : '获取曲目失败');
    }
  };

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/history/plays');
      const data = await res.json();
      setHistory(data.history || []);
      setMode('history');
    } catch (e) {
      console.error('[LoginPanel history]', e);
    }
  };

  const loadLiked = async () => {
    try {
      const res = await fetch('/api/likes');
      const data = await res.json();
      setLikedSongs(data.songs || []);
      setMode('likes');
    } catch (e) {
      console.error('[LoginPanel likes]', e);
    }
  };

  // Bind KuGou web cookie (pasted or imported from Mineradio) -> session key -> playlists
  const bindKugou = async (cookie: string) => {
    if (!cookie.trim()) {
      setError('请先粘贴酷狗网页 cookie');
      return;
    }
    stopPoll();
    setError('');
    setBinding(true);
    try {
      const res = await fetch('/api/session/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'kugou', cookie: cookie.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '绑定失败');
      sessionKeyRef.current = data.key;
      setQrKey(data.key);
      loadPlaylists(data.key);
    } catch (e) {
      console.error('[LoginPanel kugou bind]', e);
      setError(e instanceof Error ? e.message : '绑定酷狗失败');
    } finally {
      setBinding(false);
    }
  };

  // One-click import from Mineradio desktop saved cookie
  const importMineradio = async () => {
    setError('');
    setBinding(true);
    try {
      const res = await fetch('/api/login/kugou/import-mineradio');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '导入失败');
      setKugouCookie('');
      sessionKeyRef.current = data.key;
      setQrKey(data.key);
      loadPlaylists(data.key);
    } catch (e) {
      console.error('[LoginPanel mineradio import]', e);
      setError(e instanceof Error ? e.message : '从 Mineradio 导入失败');
    } finally {
      setBinding(false);
    }
  };

  // Electron-only: open the native KuGou web login window (BrowserWindow + cookie polling)
  const electronLoginKugou = async () => {
    if (!window.abyss?.kugouLogin) {
      setError('扫码登录仅桌面版（Electron）可用');
      return;
    }
    setError('');
    setBinding(true);
    try {
      const result = await window.abyss.kugouLogin();
      if (result?.ok && result?.cookie) {
        const res = await fetch('/api/session/bind', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: 'kugou', cookie: result.cookie }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '绑定失败');
        setKugouCookie('');
        sessionKeyRef.current = data.key;
        setQrKey(data.key);
        loadPlaylists(data.key);
        setError(result.partial ? (result.message || '部分成功') : '酷狗登录成功！');
      } else if (result?.cancelled) {
        setError(result.message || '登录已取消');
      } else {
        setError(result?.error || result?.message || '酷狗登录失败');
      }
    } catch (e) {
      console.error('[LoginPanel electron kugou login]', e);
      setError(e instanceof Error ? e.message : '酷狗扫码登录失败');
    } finally {
      setBinding(false);
    }
  };

  useEffect(() => {
    return () => stopPoll();
  }, [stopPoll]);

  const statusText =
    qrCode === 803 ? '请在手机上确认登录' :
    qrCode === 802 ? '已扫码，请在手机上确认' :
    qrCode === 801 ? '请用网易云音乐扫码...' :
    qrCode === 200 ? '登录成功！' :
    qrCode === 800 ? '二维码已过期，点击重试' : '';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="absolute right-6 top-1/2 -translate-y-1/2 z-30"
        >
          <div className="w-[300px] max-h-[70vh] liquid-glass rounded-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Disc3 size={14} className="text-blue-400" />
                <span className="text-white/70 text-xs uppercase tracking-[2px]">Abyss</span>
              </div>
              <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
                <X size={14} />
              </button>
            </div>

            <div className="flex gap-1 px-3 pt-3 pb-1">
              <button onClick={() => { setMode('login'); startQr(); }}
                className={`text-[10px] uppercase tracking-[1px] px-2 py-1 rounded-md transition-all ${mode === 'login' ? 'text-blue-400 bg-blue-500/10' : 'text-white/30 hover:text-white/50'}`}>歌单</button>
              <button onClick={loadHistory}
                className={`text-[10px] uppercase tracking-[1px] px-2 py-1 rounded-md transition-all ${mode === 'history' ? 'text-blue-400 bg-blue-500/10' : 'text-white/30 hover:text-white/50'}`}>历史</button>
              <button onClick={loadLiked}
                className={`text-[10px] uppercase tracking-[1px] px-2 py-1 rounded-md transition-all ${mode === 'likes' ? 'text-blue-400 bg-blue-500/10' : 'text-white/30 hover:text-white/50'}`}>喜欢</button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
              {mode === 'login' && (
                <div className="space-y-2">
                  <div className="flex gap-1">
                    <button onClick={() => { setLoginTab('netease'); setError(''); }}
                      className={`flex-1 text-[10px] uppercase tracking-[1px] px-2 py-1 rounded-md transition-all ${loginTab === 'netease' ? 'text-red-400 bg-red-500/10' : 'text-white/30 hover:text-white/50'}`}>网易云</button>
                    <button onClick={() => { setLoginTab('kugou'); setError(''); }}
                      className={`flex-1 text-[10px] uppercase tracking-[1px] px-2 py-1 rounded-md transition-all ${loginTab === 'kugou' ? 'text-blue-400 bg-blue-500/10' : 'text-white/30 hover:text-white/50'}`}>酷狗</button>
                  </div>

                  {loginTab === 'netease' && !qrImg && (
                    <div className="text-center py-6">
                      <button onClick={startQr} className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30 transition-all">
                        <LogIn size={14} className="inline mr-1" /> 扫码登录网易云
                      </button>
                    </div>
                  )}

                  {loginTab === 'netease' && qrImg && (
                    <div className="text-center py-3">
                      <img src={qrImg} alt="QR Code" className="w-40 h-40 mx-auto rounded-lg" />
                      <div className="text-[10px] text-white/40 mt-2">{statusText}</div>
                      {(qrCode === 800 || error) && (
                        <button onClick={startQr} className="mt-3 text-[10px] text-red-400/80 hover:text-red-400">
                          刷新二维码
                        </button>
                      )}
                    </div>
                  )}

                  {loginTab === 'kugou' && (
                    <div className="space-y-2 py-1">
                      <div className="text-[10px] text-white/40 px-1 leading-relaxed">
                        需要酷狗网页版登录（VIP 歌可完整播放）。三种方式：
                      </div>
                      {window.abyss?.kugouLogin && (
                        <button onClick={electronLoginKugou} disabled={binding}
                          className="w-full px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs hover:bg-emerald-500/30 transition-all disabled:opacity-50">
                          {binding ? '等待扫码…' : '扫码登录酷狗（桌面版）'}
                        </button>
                      )}
                      <button onClick={importMineradio} disabled={binding}
                        className="w-full px-3 py-2 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30 transition-all disabled:opacity-50">
                        {binding ? '导入中…' : '一键导入 Mineradio 登录'}
                      </button>
                      <div className="flex items-center gap-2 px-1">
                        <div className="flex-1 h-px bg-white/[0.06]" />
                        <span className="text-[9px] text-white/20">或手动粘贴</span>
                        <div className="flex-1 h-px bg-white/[0.06]" />
                      </div>
                      <textarea
                        value={kugouCookie}
                        onChange={(e) => setKugouCookie(e.target.value)}
                        placeholder="浏览器打开 www.kugou.com 登录后，复制 Cookie 粘贴到这里…"
                        rows={4}
                        className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-[10px] text-white/60 placeholder-white/20 focus:outline-none focus:border-blue-400/40 resize-none"
                      />
                      <button onClick={() => bindKugou(kugouCookie)} disabled={binding}
                        className="w-full px-3 py-2 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30 transition-all disabled:opacity-50">
                        {binding ? '绑定中…' : '绑定酷狗登录'}
                      </button>
                    </div>
                  )}

                  {error && <div className="text-[10px] text-amber-400/70 mt-1 px-2">{error}</div>}
                </div>
              )}

              {mode === 'playlists' && playlists.length === 0 && (
                <div className="text-center py-8 text-white/30 text-xs">暂无歌单</div>
              )}

              {mode === 'playlists' && playlists.map((pl) => (
                <div key={pl.id} onClick={() => loadTracks(pl.id, pl)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] cursor-pointer transition-all group">
                  <div className="w-10 h-10 rounded-lg bg-cover bg-center flex-shrink-0" style={{ backgroundImage: pl.cover ? `url(${pl.cover})` : 'none', background: pl.cover ? undefined : 'rgba(255,255,255,0.05)' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-white/70 text-xs truncate">{pl.name}</div>
                    <div className="text-white/30 text-[10px]">{pl.trackCount} 首</div>
                  </div>
                  <ChevronRight size={12} className="text-white/20 group-hover:text-white/40 transition-colors" />
                </div>
              ))}

              {mode === 'tracks' && activePlaylist && (
                <>
                  <div className="text-white/50 text-[10px] px-1 py-1">{activePlaylist.name}</div>
                  {tracks.map((t, i) => (
                    <div key={t.id || i} onClick={() => onPlayTrack(t)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] cursor-pointer transition-all group">
                      <div className="w-8 h-8 rounded bg-cover bg-center flex-shrink-0" style={{ backgroundImage: t.cover ? `url(${t.cover})` : 'none', background: t.cover ? undefined : 'rgba(255,255,255,0.05)' }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-white/70 text-xs truncate">{t.title}</div>
                        <div className="text-white/30 text-[10px] truncate">{t.artist}</div>
                      </div>
                      <Play size={10} className="text-white/20 group-hover:text-white/60 transition-colors" />
                    </div>
                  ))}
                </>
              )}

              {mode === 'history' && history.map((h, i) => (
                <div key={h.id || i} onClick={() => onPlayTrack(h)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] cursor-pointer transition-all group">
                  <History size={12} className="text-white/30 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-white/60 text-xs truncate">{h.title}</div>
                    <div className="text-white/30 text-[10px] truncate">{h.artist}</div>
                  </div>
                </div>
              ))}

              {mode === 'likes' && likedSongs.map((s, i) => (
                <div key={s.id || i} onClick={() => onPlayTrack(s)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] cursor-pointer transition-all group">
                  <Heart size={12} className="text-blue-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-white/60 text-xs truncate">{s.title}</div>
                    <div className="text-white/30 text-[10px] truncate">{s.artist}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
