import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Play, Disc3, ListMusic } from 'lucide-react';
import {
  bindCookie, fetchPlaylists, fetchPlaylistTracks,
  loadStoredBind, saveStoredBind, clearStoredBind,
  type Platform, type Playlist, type PlaylistTrack, type BindResult,
} from '../../services/playlistApi';
import { coverUrl, isImageUrl } from '../../utils/img';

interface Props {
  visible: boolean;
  onPlayPlaylist: (tracks: PlaylistTrack[], startIndex: number, sessionKey: string) => void;
  onPin: () => void;
  onUnpin: () => void;
}

type View = 'bind' | 'playlists' | 'tracks';

export default function PlaylistColumn({ visible, onPlayPlaylist, onPin, onUnpin }: Props) {
  const [bind, setBind] = useState<BindResult | null>(null);
  const [view, setView] = useState<View>('bind');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // bind form
  const [platform, setPlatform] = useState<Platform>('netease');
  const [cookieInput, setCookieInput] = useState('');

  const loadPlaylists = useCallback(async (key: string) => {
    setLoading(true);
    setError('');
    try {
      const lists = await fetchPlaylists(key);
      setPlaylists(lists);
      setView('playlists');
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取歌单失败');
      setView('playlists');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto re-bind on mount from stored cookie
  useEffect(() => {
    const stored = loadStoredBind();
    if (!stored) return;
    setPlatform(stored.platform);
    (async () => {
      try {
        const result = await bindCookie(stored.platform, stored.cookie);
        setBind(result);
        await loadPlaylists(result.key);
      } catch {
        clearStoredBind();
      }
    })();
  }, [loadPlaylists]);

  const handleBind = async () => {
    if (!cookieInput.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await bindCookie(platform, cookieInput.trim());
      setBind(result);
      saveStoredBind(platform, cookieInput.trim());
      setCookieInput('');
      await loadPlaylists(result.key);
    } catch (e) {
      setError(e instanceof Error ? e.message : '绑定失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUnbind = () => {
    clearStoredBind();
    setBind(null);
    setPlaylists([]);
    setTracks([]);
    setActivePlaylist(null);
    setView('bind');
  };

  const openPlaylist = async (pl: Playlist) => {
    if (!bind) return;
    setActivePlaylist(pl);
    setView('tracks');
    setLoading(true);
    setError('');
    try {
      const t = await fetchPlaylistTracks(bind.key, pl.id);
      setTracks(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取歌曲失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {!visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="fixed right-3 top-1/2 -translate-y-1/2 z-20 pointer-events-none"
          >
            <div className="w-px h-12 bg-gradient-to-b from-transparent via-white/10 to-transparent ml-auto" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="fixed right-5 z-30"
            style={{ perspective: '1000px', top: '12vh', height: '76vh' }}
            onMouseEnter={onPin}
            onMouseLeave={onUnpin}
          >
            <div
              className="w-[340px] h-full liquid-glass rounded-2xl p-5 flex flex-col"
              style={{ transform: 'rotateY(-8deg)', transformOrigin: 'right center' }}
            >
              <AnimatePresence mode="wait">
                {/* ===== Bind view ===== */}
                {view === 'bind' && (
                  <motion.div
                    key="bind"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex flex-col h-full"
                  >
                    <div className="flex items-center gap-2 mb-5">
                      <Disc3 size={16} className="text-white/30" />
                      <span className="text-white/40 text-[10px] tracking-[2px] uppercase">绑定账号</span>
                    </div>

                    <div className="flex gap-2 mb-4">
                      {(['netease', 'kugou'] as Platform[]).map(pf => (
                        <button
                          key={pf}
                          onClick={() => setPlatform(pf)}
                          className={`text-[11px] px-3 py-1.5 rounded-lg transition-colors duration-300 ${
                            platform === pf
                              ? 'text-blue-300/80 bg-blue-500/10'
                              : 'text-white/30 hover:text-white/50'
                          }`}
                        >
                          {pf === 'netease' ? '网易云' : '酷狗'}
                          {pf === 'kugou' && <span className="ml-1 text-white/20">备选</span>}
                        </button>
                      ))}
                    </div>

                    <textarea
                      value={cookieInput}
                      onChange={e => setCookieInput(e.target.value)}
                      placeholder={`粘贴${platform === 'netease' ? '网易云' : '酷狗'} Cookie...`}
                      className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-white/55 text-xs leading-relaxed placeholder:text-white/15 focus:outline-none focus:border-white/20 transition-colors duration-300 resize-none mb-3"
                    />

                    {error && <div className="text-red-300/60 text-[11px] mb-3 leading-relaxed">{error}</div>}

                    <button
                      onClick={handleBind}
                      disabled={loading || !cookieInput.trim()}
                      className="text-[11px] tracking-[2px] uppercase text-white/55 hover:text-white/80 border border-white/[0.1] rounded-full px-4 py-2.5 transition-colors duration-300 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {loading ? '绑定中...' : '绑定'}
                    </button>

                    <div className="text-white/15 text-[10px] leading-relaxed mt-4">
                      浏览器登录后 F12 → 网络请求 → 复制 Cookie。仅保存在本地。
                    </div>
                  </motion.div>
                )}

                {/* ===== Playlists view ===== */}
                {view === 'playlists' && (
                  <motion.div
                    key="playlists"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex flex-col h-full"
                  >
                    <div className="flex items-center justify-between mb-4 shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <ListMusic size={14} className="text-white/30 shrink-0" />
                        <span className="text-white/45 text-xs truncate">{bind?.user.nickname}</span>
                      </div>
                      <button
                        onClick={handleUnbind}
                        className="text-white/20 hover:text-white/45 text-[10px] tracking-wide transition-colors duration-300 shrink-0"
                      >
                        解绑
                      </button>
                    </div>

                    <div className="h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent mb-3 shrink-0" />

                    <div className="flex-1 overflow-y-auto -mr-2 pr-2 space-y-1 min-h-0">
                      {loading && <div className="text-white/20 text-xs text-center pt-10">载入中...</div>}
                      {!loading && error && (
                        <div className="text-white/30 text-[11px] text-center pt-10 leading-relaxed px-2">{error}</div>
                      )}
                      {!loading && !error && playlists.length === 0 && (
                        <div className="text-white/20 text-xs text-center pt-10">暂无歌单</div>
                      )}
                      {playlists.map(pl => (
                        <button
                          key={pl.id}
                          onClick={() => openPlaylist(pl)}
                          className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.04] transition-colors duration-300 text-left group"
                        >
                          <div
                            className="w-11 h-11 rounded-lg bg-cover bg-center shrink-0 border border-white/[0.06]"
                            style={{
                              backgroundImage: isImageUrl(pl.cover) ? `url(${coverUrl(pl.cover)})` : undefined,
                              background: isImageUrl(pl.cover) ? undefined : 'rgba(255,255,255,0.05)',
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-white/60 text-xs truncate group-hover:text-white/80 transition-colors">{pl.name}</div>
                            <div className="text-white/25 text-[10px]">{pl.trackCount} 首</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* ===== Tracks view ===== */}
                {view === 'tracks' && (
                  <motion.div
                    key="tracks"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex flex-col h-full"
                  >
                    <button
                      onClick={() => setView('playlists')}
                      className="flex items-center gap-1.5 mb-4 text-white/35 hover:text-white/60 transition-colors duration-300 shrink-0"
                    >
                      <ChevronLeft size={14} />
                      <span className="text-[11px] tracking-wide truncate">{activePlaylist?.name}</span>
                    </button>

                    <div className="h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent mb-3 shrink-0" />

                    <div className="flex-1 overflow-y-auto -mr-2 pr-2 space-y-0.5 min-h-0">
                      {loading && <div className="text-white/20 text-xs text-center pt-10">载入中...</div>}
                      {!loading && error && (
                        <div className="text-white/30 text-[11px] text-center pt-10 leading-relaxed px-2">{error}</div>
                      )}
                      {!loading && tracks.map((t, i) => (
                        <button
                          key={t.id || i}
                          onClick={() => bind && onPlayPlaylist(tracks, i, bind.key)}
                          className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.04] transition-colors duration-300 text-left group"
                        >
                          <div
                            className="w-9 h-9 rounded-md bg-cover bg-center shrink-0 border border-white/[0.06]"
                            style={{
                              backgroundImage: isImageUrl(t.cover) ? `url(${coverUrl(t.cover)})` : undefined,
                              background: isImageUrl(t.cover) ? undefined : 'rgba(255,255,255,0.05)',
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-white/55 text-xs truncate group-hover:text-white/80 transition-colors">{t.title}</div>
                            <div className="text-white/25 text-[10px] truncate">{t.artist}</div>
                          </div>
                          <Play size={11} className="text-white/0 group-hover:text-white/40 transition-colors shrink-0" />
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
