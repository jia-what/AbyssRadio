import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Play, Disc3, ListMusic } from 'lucide-react';
import {
  bindCookie, fetchPlaylists, fetchPlaylistTracks,
  loadStoredBind, saveStoredBind, clearStoredBind,
  type Platform, type Playlist, type PlaylistTrack, type BindResult,
} from '../../services/playlistApi';
import CoverThumb from '../ui/CoverThumb';
import { usePulseFocus } from '../../context/PulseContext';
import SpatialStack, { type StackCardState } from './SpatialStack';

interface Props {
  visible: boolean;
  focused?: boolean;
  onPlayPlaylist: (tracks: PlaylistTrack[], startIndex: number, sessionKey: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}

type View = 'bind' | 'playlists' | 'tracks';

const sourceLabel = (source?: string) => (source === 'kugou' ? 'KG' : 'NE');

export default function PlaylistColumn({ visible, focused = false, onPlayPlaylist, onFocus, onBlur }: Props) {
  const { setStackFocus } = usePulseFocus();
  const [bind, setBind] = useState<BindResult | null>(null);
  const [view, setView] = useState<View>('bind');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  const [plActive, setPlActive] = useState(0);
  const [trkActive, setTrkActive] = useState(0);
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
      setPlActive(0);
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

  const handlePlaylistFocus = useCallback((pl: Playlist) => {
    setStackFocus(pl.cover, pl.name);
  }, [setStackFocus]);

  const handleTrackFocus = useCallback((t: PlaylistTrack) => {
    setStackFocus(t.cover, `${t.title} · ${t.artist}`);
  }, [setStackFocus]);

  // Fetch the tracks of a playlist (shared by "详情" and "播放歌单").
  const loadTracks = useCallback(async (pl: Playlist): Promise<PlaylistTrack[]> => {
    if (!bind) return [];
    setLoading(true);
    setError('');
    try {
      const t = await fetchPlaylistTracks(bind.key, pl.id);
      setTracks(t);
      return t;
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取歌曲失败');
      return [];
    } finally {
      setLoading(false);
    }
  }, [bind]);

  // "详情" → switch to the 3D song list view.
  const openPlaylist = async (pl: Playlist) => {
    setActivePlaylist(pl);
    setTrkActive(0);
    setTracks([]);
    setView('tracks');
    await loadTracks(pl);
  };

  // "播放歌单" → load the whole playlist and start from the top, stay in view.
  const playWholePlaylist = async (pl: Playlist) => {
    if (!bind) return;
    const t = await loadTracks(pl);
    if (t.length > 0) onPlayPlaylist(t, 0, bind.key);
  };

  // ===== Playlist card (focused vs receded) =====
  const renderPlaylistCard = (pl: Playlist, s: StackCardState) => {
    if (!s.active) {
      return (
        <button
          onClick={() => setPlActive(s.index)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl liquid-glass text-left"
        >
          <CoverThumb cover={pl.cover} className="w-11 h-11 rounded-lg shrink-0 border border-white/[0.06]" />
          <div className="min-w-0 flex-1">
            <div className="text-white/55 text-xs truncate">{pl.name}</div>
            <div className="text-white/25 text-[10px]">{pl.trackCount} 首</div>
          </div>
        </button>
      );
    }
    return (
      <div className="w-full rounded-2xl liquid-glass p-3.5">
        <div className="flex gap-3.5">
          <div className="relative w-[88px] h-[88px] rounded-xl shrink-0 border border-white/[0.08] overflow-hidden">
            <CoverThumb cover={pl.cover} className="w-full h-full" />
            <div className="absolute inset-0 z-[2] flex items-center justify-center bg-black/25 pointer-events-none">
              <Play size={22} className="text-white/80" fill="currentColor" />
            </div>
          </div>
          <div className="min-w-0 flex-1 flex flex-col justify-center">
            <div className="text-white/35 text-[10px] tracking-[2px] uppercase mb-1">我的歌单</div>
            <div className="text-white/85 text-sm font-medium leading-snug line-clamp-2">{pl.name}</div>
            <div className="text-white/30 text-[10px] mt-1.5">
              {sourceLabel(pl.source)} · {pl.trackCount} 首{pl.playCount ? ` · 播放 ${pl.playCount}` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3.5">
          <button
            onClick={() => playWholePlaylist(pl)}
            className="flex items-center gap-1.5 text-[11px] tracking-wide text-emerald-950/90 bg-emerald-300/85 hover:bg-emerald-300 rounded-full px-4 py-1.5 transition-colors duration-300"
          >
            <Play size={11} fill="currentColor" />
            播放歌单
          </button>
          <button
            onClick={() => openPlaylist(pl)}
            className="text-[11px] tracking-wide text-white/55 hover:text-white/80 border border-white/[0.12] rounded-full px-4 py-1.5 transition-colors duration-300"
          >
            详情
          </button>
        </div>
      </div>
    );
  };

  // ===== Track row (focused expands action buttons) =====
  const renderTrackCard = (t: PlaylistTrack, s: StackCardState) => {
    if (!s.active) {
      return (
        <button
          onClick={() => setTrkActive(s.index)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left"
        >
          <span className="text-white/20 text-[10px] w-5 text-right tabular-nums shrink-0">{s.index + 1}</span>
          <CoverThumb cover={t.cover} className="w-9 h-9 rounded-md shrink-0 border border-white/[0.06]" />
          <div className="min-w-0 flex-1">
            <div className="text-white/55 text-xs truncate">{t.title}</div>
            <div className="text-white/25 text-[10px] truncate">{t.artist}</div>
          </div>
        </button>
      );
    }
    return (
      <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl liquid-glass">
        <span className="text-emerald-300/70 text-[10px] w-5 text-right tabular-nums shrink-0">{s.index + 1}</span>
        <CoverThumb cover={t.cover} className="w-10 h-10 rounded-md shrink-0 border border-white/[0.08]" />
        <div className="min-w-0 flex-1">
          <div className="text-white/90 text-xs truncate">{t.title}</div>
          <div className="text-white/35 text-[10px] truncate">{t.artist}</div>
        </div>
        <button
          onClick={() => bind && onPlayPlaylist(tracks, s.index, bind.key)}
          className="flex items-center gap-1 text-[11px] text-emerald-950/90 bg-emerald-300/85 hover:bg-emerald-300 rounded-full px-3 py-1.5 shrink-0 transition-colors duration-300"
        >
          <Play size={10} fill="currentColor" />
          播放
        </button>
      </div>
    );
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
          <div
            className="playlist-hud fixed right-0 top-0 bottom-0 z-40 flex justify-end items-center pointer-events-auto"
            style={{ width: 'min(420px, 38vw)' }}
            onMouseEnter={onFocus}
            onMouseLeave={onBlur}
          >
            {/* Soft left fade — blends into the universe instead of a hard black edge */}
            <div
              className="absolute inset-y-0 left-0 w-28 pointer-events-none z-0"
              style={{ background: 'linear-gradient(to right, transparent 0%, rgba(5,5,8,0.12) 55%, transparent 100%)' }}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                x: focused ? -36 : 0,
                scale: focused ? 1.08 : 1,
                rotateY: focused ? -24 : -8,
                z: focused ? 80 : 0,
              }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 170, damping: 26, mass: 0.85 }}
              className={`relative z-10 mr-5 w-[360px] flex flex-col ${focused ? 'h-[84vh]' : 'h-[76vh]'}`}
              style={{
                perspective: 1400,
                transformOrigin: 'right center',
                transformStyle: 'preserve-3d',
              }}
            >
            <div className="w-full h-full flex flex-col" style={{ transformStyle: 'preserve-3d' }}>
              {/* ===== Bind view ===== */}
              {view === 'bind' && (
                <div className="liquid-glass rounded-2xl p-5 flex flex-col h-full">
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
                </div>
              )}

              {/* ===== Playlists / Tracks: 3D SpatialStack ===== */}
              {view !== 'bind' && (
                <>
                  {/* Floating header */}
                  <div className="shrink-0 mb-2 px-1">
                    {view === 'playlists' ? (
                      <div className="flex items-center justify-between">
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
                    ) : (
                      <button
                        onClick={() => setView('playlists')}
                        className="flex items-center gap-1.5 text-white/35 hover:text-white/60 transition-colors duration-300"
                      >
                        <ChevronLeft size={14} />
                        <span className="text-[11px] tracking-wide truncate">{activePlaylist?.name}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex-1 min-h-0 relative" style={{ transformStyle: 'preserve-3d' }}>
                    <AnimatePresence mode="wait">
                      {view === 'playlists' && (
                        <motion.div
                          key="playlists"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.45 }}
                          className="absolute inset-0"
                          style={{ transformStyle: 'preserve-3d' }}
                        >
                          {loading && playlists.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center text-white/20 text-xs">载入中...</div>
                          ) : error ? (
                            <div className="absolute inset-0 flex items-center justify-center text-white/30 text-[11px] text-center px-6 leading-relaxed">{error}</div>
                          ) : playlists.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center text-white/20 text-xs">暂无歌单</div>
                          ) : (
                            <SpatialStack
                              items={playlists}
                              activeIndex={plActive}
                              onActiveChange={setPlActive}
                              renderCard={renderPlaylistCard}
                              gap={96}
                              onFocusItem={handlePlaylistFocus}
                            />
                          )}
                        </motion.div>
                      )}

                      {view === 'tracks' && (
                        <motion.div
                          key="tracks"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.45 }}
                          className="absolute inset-0"
                          style={{ transformStyle: 'preserve-3d' }}
                        >
                          {loading && tracks.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center text-white/20 text-xs">载入中...</div>
                          ) : error ? (
                            <div className="absolute inset-0 flex items-center justify-center text-white/30 text-[11px] text-center px-6 leading-relaxed">{error}</div>
                          ) : tracks.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center text-white/20 text-xs">暂无歌曲</div>
                          ) : (
                            <SpatialStack
                              items={tracks}
                              activeIndex={trkActive}
                              onActiveChange={setTrkActive}
                              renderCard={renderTrackCard}
                              gap={62}
                              onFocusItem={handleTrackFocus}
                            />
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}
            </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
