import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Disc3, Music, History, Heart, LogIn, ChevronRight, Play } from 'lucide-react';

interface LoginPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayTrack: (track: any) => void;
  currentTrack: any;
}

export default function LoginPanel({ isOpen, onClose, onPlayTrack, currentTrack }: LoginPanelProps) {
  const [mode, setMode] = useState<'login' | 'playlists' | 'tracks' | 'history' | 'likes'>('login');
  const [qrKey, setQrKey] = useState('');
  const [qrImg, setQrImg] = useState('');
  const [qrCode, setQrCode] = useState<800 | 801 | 802 | 200>(801);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [tracks, setTracks] = useState<any[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [likedSongs, setLikedSongs] = useState<any[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start QR login
  const startQr = useCallback(async () => {
    try {
      const keyData = await fetch('/api/login/qr-key?platform=netease');
      const keyJson = await keyData.json();
      const qrRes = await fetch(`/api/login/qr?platform=netease&key=${encodeURIComponent(keyJson.key)}`);
      const qrData = await qrRes.json();
      setQrKey(keyJson.key);
      setQrImg(qrData.qrimg);
      setQrCode(801);

      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const checkRes = await fetch(`/api/login/qr-check?platform=netease&key=${encodeURIComponent(keyJson.key)}`);
        const check = await checkRes.json();
        setQrCode(check.code);
        if (check.code === 200 && check.key) {
          if (pollRef.current) clearInterval(pollRef.current);
          setQrKey(check.key);
          loadPlaylists(check.key);
        }
      }, 2000);
    } catch {}
  }, []);

  const loadPlaylists = async (key: string) => {
    try {
      const res = await fetch(`/api/playlists?key=${key}`);
      const data = await res.json();
      setPlaylists(data.playlists || []);
      setMode('playlists');
    } catch {}
  };

  const loadTracks = async (listId: string, playlist: any) => {
    if (!qrKey) return;
    try {
      const res = await fetch(`/api/playlist/tracks?id=${listId}&key=${qrKey}`);
      const data = await res.json();
      setTracks(data.tracks || []);
      setActivePlaylist(playlist);
      setMode('tracks');
    } catch {}
  };

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/history/plays');
      const data = await res.json();
      setHistory(data.history || []);
      setMode('history');
    } catch {}
  };

  const loadLiked = async () => {
    try {
      const res = await fetch('/api/likes');
      const data = await res.json();
      setLikedSongs(data.songs || []);
      setMode('likes');
    } catch {}
  };

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

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
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Disc3 size={14} className="text-blue-400" />
                <span className="text-white/70 text-xs uppercase tracking-[2px]">Abyss</span>
              </div>
              <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Mode tabs */}
            <div className="flex gap-1 px-3 pt-3 pb-1">
              <button onClick={() => { setMode('login'); startQr(); }}
                className={`text-[10px] uppercase tracking-[1px] px-2 py-1 rounded-md transition-all ${mode === 'login' ? 'text-blue-400 bg-blue-500/10' : 'text-white/30 hover:text-white/50'}`}>歌单</button>
              <button onClick={loadHistory}
                className={`text-[10px] uppercase tracking-[1px] px-2 py-1 rounded-md transition-all ${mode === 'history' ? 'text-blue-400 bg-blue-500/10' : 'text-white/30 hover:text-white/50'}`}>历史</button>
              <button onClick={loadLiked}
                className={`text-[10px] uppercase tracking-[1px] px-2 py-1 rounded-md transition-all ${mode === 'likes' ? 'text-blue-400 bg-blue-500/10' : 'text-white/30 hover:text-white/50'}`}>喜欢</button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
              {mode === 'login' && !qrImg && (
                <div className="text-center py-8">
                  <button onClick={startQr} className="px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30 transition-all">
                    <LogIn size={14} className="inline mr-1" /> 扫码登录网易云
                  </button>
                </div>
              )}

              {mode === 'login' && qrImg && (
                <div className="text-center py-4">
                  <img src={qrImg} alt="QR Code" className="w-40 h-40 mx-auto rounded-lg" />
                  <div className="text-[10px] text-white/40 mt-2">
                    {qrCode === 801 && '请用网易云音乐扫码...'}
                    {qrCode === 802 && '已扫码，确认登录...'}
                    {qrCode === 200 && '登录成功！'}
                    {qrCode === 800 && '二维码已过期，点歌重试'}
                  </div>
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
