import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, Play, Disc3, ListMusic, RefreshCw } from 'lucide-react';
import {
  fetchPlaylists, fetchPlaylistTracks,
  loadStoredBind, saveStoredBind, clearStoredBind,
  fetchQrKey, fetchQrImage, checkQrLogin,
  type Platform, type Playlist, type PlaylistTrack, type BindResult, type QrPollCode,
} from '../../services/playlistApi';
import CoverThumb from '../ui/CoverThumb';
import TiltedCard from '../ui/TiltedCard';
import PressSpring from '../ui/PressSpring';
import { searchLibrary } from '../../services/aiSettingsApi';
import type { StackCardState } from './SpatialStack';
import OptionWheelStack from './OptionWheelStack';

interface Props {
  visible: boolean;
  focused?: boolean;
  onPlayPlaylist: (tracks: PlaylistTrack[], startIndex: number, sessionKey: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onToggle?: () => void;
}

type View = 'bind' | 'playlists' | 'tracks';

const sourceLabel = (source?: string) => (source === 'kugou' ? 'KG' : 'NE');

export default function PlaylistColumn({ visible, focused = false, onPlayPlaylist, onFocus, onBlur, onToggle }: Props) {
  const [bind, setBind] = useState<BindResult | null>(null);
  const [view, setView] = useState<View>('bind');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  const [plActive, setPlActive] = useState(0);
  const [trkActive, setTrkActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // bind / QR login
  const [platform, setPlatform] = useState<Platform>('netease');
  const [qrImg, setQrImg] = useState('');
  const [qrCode, setQrCode] = useState<QrPollCode>(801);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollGenRef = useRef(0);
  const loggedInRef = useRef(false);
  /** Avoid duplicate QR sessions (StrictMode / effect re-runs). */
  const qrActivePlatformRef = useRef<Platform | null>(null);
  // Re-entrancy guard: the bind-view useEffect auto-starts a QR AND the user
  // may click 刷新/扫码 — without this, two fetchQrKey calls hit the backend
  // 5s cooldown, the 2nd fails with "请求过于频繁" and NO QR code is shown.
  const qrStartingRef = useRef(false);

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

  const stopQrPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startQrLoginInner = useCallback(async (pf: Platform) => {
    stopQrPoll();
    loggedInRef.current = false;
    const pollGen = ++pollGenRef.current;
    setQrImg('');
    setQrCode(801);
    setError('');
    onFocus(); // pin panel — user will look at phone to confirm login
    try {
      const keyData = await fetchQrKey(pf);
      if (pollGen !== pollGenRef.current) return;
      const qrData = await fetchQrImage(pf, keyData.key);
      if (pollGen !== pollGenRef.current) return;
      if (!qrData.qrimg) {
        setError('二维码生成失败，请点击刷新');
        return;
      }
      setQrImg(qrData.qrimg);
      // State machine: 801 waiting → 802/803 scanned/confirm → 200 success (keep polling through 802)
      pollRef.current = setInterval(async () => {
        if (loggedInRef.current || pollGen !== pollGenRef.current) return;
        try {
          const check = await checkQrLogin(pf, keyData.key);
          if (loggedInRef.current || pollGen !== pollGenRef.current) return;

          const code = check.code;
          const rateLimited = code === 801 && /频繁|稍候/.test(check.message || '');

          // Never regress UI from 802/803 back to 801 on rate-limit noise
          setQrCode((prev) => {
            if (rateLimited && (prev === 802 || prev === 803)) return prev;
            if (code === 802 || code === 803 || code === 800 || code === 200 || code === 801) {
              return code;
            }
            return prev;
          });

          if (code === 200 && check.key) {
            loggedInRef.current = true;
            stopQrPoll();
            // Keep qrActivePlatformRef set — prevents useEffect from spawning a new QR
            const result: BindResult = {
              key: check.key,
              platform: check.platform || pf,
              user: check.user || { userId: '', nickname: pf === 'kugou' ? '酷狗用户' : '网易云用户' },
            };
            setBind(result);
            saveStoredBind(result.platform, result.key, result.user);
            setView('playlists');
            await loadPlaylists(result.key);
            // 第 11 项：登录后后台预热扫库，首次点歌不用等
            void searchLibrary(result.key, '').then(() => {
              console.log('[abyss] library warm-up done');
            }).catch(() => { /* 预热失败不影响使用 */ });
          } else if (code === 800 && !loggedInRef.current) {
            stopQrPoll();
            setError('二维码已过期，请点击下方刷新');
          } else if (rateLimited) {
            setError('请求过于频繁，请稍候…');
          } else if (code === 802 || code === 803) {
            // Keep polling — user must confirm on phone
            setError('');
          }
        } catch (e) {
          // Transient network errors: keep polling; do not kill the QR session
          if (loggedInRef.current || pollGen !== pollGenRef.current) return;
          console.error('[QR poll]', e);
          setError(e instanceof Error ? e.message : '登录检查失败，仍在重试…');
        }
      }, 2500);
    } catch (e) {
      if (pollGen !== pollGenRef.current) return;
      console.error('[QR start]', e);
      setError(e instanceof Error ? e.message : '获取二维码失败');
    }
  }, [loadPlaylists, stopQrPoll, onFocus]);

  const startQrLogin = useCallback(async (pf: Platform) => {
    if (qrStartingRef.current) return;
    qrStartingRef.current = true;
    try {
      await startQrLoginInner(pf);
    } finally {
      // keep guard up briefly so effect+click double-invocation is absorbed
      setTimeout(() => { qrStartingRef.current = false; }, 1200);
    }
  }, [startQrLoginInner]);

  useEffect(() => () => stopQrPoll(), [stopQrPoll]);

  // Auto-restore session from localStorage (server restart requires re-scan)
  useEffect(() => {
    const stored = loadStoredBind();
    if (!stored) return;
    setPlatform(stored.platform);
    (async () => {
      try {
        const lists = await fetchPlaylists(stored.sessionKey);
        setBind({
          key: stored.sessionKey,
          platform: stored.platform,
          user: stored.user || { userId: '', nickname: '已登录' },
        });
        setPlaylists(lists);
        setPlActive(0);
        setView('playlists');
      } catch {
        // 热修复：恢复失败不再清 localStorage（后端 session 已落盘，重试即可恢复）。
        // 只保留 bind 记忆，让用户看到已登录但歌单加载失败可重试。
        setBind({
          key: stored.sessionKey,
          platform: stored.platform,
          user: stored.user || { userId: '', nickname: '已登录' },
        });
      }
    })();
  }, []);

  // Only start QR when user opens the playlist panel (avoid hammering NetEase on page load)
  useEffect(() => {
    if (view !== 'bind' || bind) {
      stopQrPoll();
      qrActivePlatformRef.current = null;
      return;
    }
    if (!visible) return;
    if (qrActivePlatformRef.current === platform) return;

    qrActivePlatformRef.current = platform;
    startQrLogin(platform);
  }, [view, platform, bind, visible, startQrLogin, stopQrPoll]);

  const handleUnbind = () => {
    stopQrPoll();
    qrActivePlatformRef.current = null;
    clearStoredBind();
    setBind(null);
    setPlaylists([]);
    setTracks([]);
    setActivePlaylist(null);
    setView('bind');
  };

  const qrStatusText = () => {
    if (qrCode === 803) return '请在手机上确认登录';
    if (qrCode === 802) return '已扫码，请在手机上确认';
    if (qrCode === 801) return '请用对应 App 扫描二维码';
    if (qrCode === 800) return '二维码已过期';
    if (qrCode === 200) return '登录成功，正在加载歌单…';
    return '请用对应 App 扫描二维码';
  };

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
        <TiltedCard rotateAmplitude={6} scaleOnHover={1.03} showTooltip={false} showMobileWarning={false}>
          <PressSpring
            as="button"
            type="button"
            pressScale={0.97}
            onClick={() => setPlActive(s.index)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl liquid-glass text-left"
          >
            <CoverThumb cover={pl.cover} className="w-11 h-11 rounded-lg shrink-0 border border-white/[0.06]" />
            <div className="min-w-0 flex-1">
              <div className="text-white/55 text-xs truncate">{pl.name}</div>
              <div className="text-white/25 text-[10px]">{pl.trackCount} 首</div>
            </div>
          </PressSpring>
        </TiltedCard>
      );
    }
    return (
      <TiltedCard rotateAmplitude={8} scaleOnHover={1.04} showTooltip={false} showMobileWarning={false}>
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
            <PressSpring
              as="button"
              type="button"
              pressScale={0.94}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                void playWholePlaylist(pl);
              }}
              className="flex items-center gap-1.5 text-[11px] tracking-wide text-emerald-950/90 bg-emerald-300/85 hover:bg-emerald-300 rounded-full px-4 py-1.5 transition-colors duration-300 pointer-events-auto"
            >
              <Play size={11} fill="currentColor" className="pointer-events-none" />
              播放歌单
            </PressSpring>
            <PressSpring
              as="button"
              type="button"
              pressScale={0.94}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                void openPlaylist(pl);
              }}
              className="text-[11px] tracking-wide text-white/55 hover:text-white/80 border border-white/[0.12] rounded-full px-4 py-1.5 transition-colors duration-300 pointer-events-auto"
            >
              详情
            </PressSpring>
          </div>
        </div>
      </TiltedCard>
    );
  };

  // ===== Track row: 整卡点击播放（无播放按钮）；歌单外层两按钮保留 =====
  const renderTrackCard = (t: PlaylistTrack, s: StackCardState) => {
    if (!s.active) {
      return (
        <TiltedCard rotateAmplitude={5} scaleOnHover={1.03} showTooltip={false} showMobileWarning={false}>
          <PressSpring pressScale={0.97} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left">
            <span className="text-white/20 text-[10px] w-5 text-right tabular-nums shrink-0">{s.index + 1}</span>
            <CoverThumb cover={t.cover} className="w-9 h-9 rounded-md shrink-0 border border-white/[0.06]" />
            <div className="min-w-0 flex-1">
              <div className="text-white/55 text-xs truncate">{t.title}</div>
              <div className="text-white/25 text-[10px] truncate">{t.artist}</div>
            </div>
          </PressSpring>
        </TiltedCard>
      );
    }
    return (
      <TiltedCard rotateAmplitude={7} scaleOnHover={1.04} showTooltip={false} showMobileWarning={false}>
        <PressSpring
          pressScale={0.97}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl liquid-glass text-left cursor-pointer"
        >
          <span className="text-emerald-300/70 text-[10px] w-5 text-right tabular-nums shrink-0">{s.index + 1}</span>
          <CoverThumb cover={t.cover} className="w-10 h-10 rounded-md shrink-0 border border-white/[0.08]" />
          <div className="min-w-0 flex-1">
            <div className="text-white/90 text-xs truncate">{t.title}</div>
            <div className="text-white/35 text-[10px] truncate">{t.artist}</div>
          </div>
          <span className="text-[10px] text-emerald-300/45 tracking-wide shrink-0">点击播放</span>
        </PressSpring>
      </TiltedCard>
    );
  };

  return (
    <>
      <AnimatePresence>
        {!visible && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            onClick={onToggle}
            className="fixed right-3 top-1/2 -translate-y-1/2 z-20 pointer-events-auto w-6 h-16 bg-transparent border-0 cursor-pointer"
            aria-label="打开歌单"
          >
            <div className="w-px h-12 bg-gradient-to-b from-transparent via-white/10 to-transparent ml-auto" />
          </motion.button>
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
                x: focused ? -16 : 0,
                scale: focused ? 1.03 : 1,
              }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 170, damping: 26, mass: 0.85 }}
              className={`relative z-10 mr-5 w-[360px] flex flex-col ${focused ? 'h-[84vh]' : 'h-[76vh]'}`}
              style={{
                transformOrigin: 'right center',
              }}
            >
            <div className="w-full h-full flex flex-col">
              {/* ===== Bind view ===== */}
              {view === 'bind' && (
                <div className="liquid-glass rounded-2xl p-5 flex flex-col h-full items-center">
                  <div className="flex items-center gap-2 mb-5 self-start w-full">
                    <Disc3 size={16} className="text-white/30" />
                    <span className="text-white/40 text-[10px] tracking-[2px] uppercase">扫码登录</span>
                  </div>

                  <div className="flex gap-2 mb-5 self-start w-full">
                    {(['netease', 'kugou'] as Platform[]).map(pf => (
                      <button
                        key={pf}
                        onClick={() => {
                          qrActivePlatformRef.current = null;
                          setPlatform(pf);
                        }}
                        className={`text-[11px] px-3 py-1.5 rounded-lg transition-colors duration-300 ${
                          platform === pf
                            ? 'text-blue-300/80 bg-blue-500/10'
                            : 'text-white/30 hover:text-white/50'
                        }`}
                      >
                        {pf === 'netease' ? '网易云' : '酷狗'}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 flex flex-col items-center justify-center min-h-0 w-full">
                    {qrImg ? (
                      <div className="relative mb-4">
                        <img
                          src={qrImg}
                          alt="登录二维码"
                          className="w-40 h-40 rounded-xl bg-white p-2"
                        />
                        {qrCode === 802 && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
                            <span className="text-white/80 text-xs">已扫码</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="w-40 h-40 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                        <span className="text-white/20 text-xs">加载中...</span>
                      </div>
                    )}

                    <p className="text-white/35 text-[11px] text-center leading-relaxed mb-3">
                      {qrStatusText()}
                    </p>

                    {error && (
                      <div className="text-red-300/60 text-[11px] mb-3 text-center leading-relaxed">{error}</div>
                    )}

                    <button
                      onClick={() => {
                        qrActivePlatformRef.current = null;
                        startQrLogin(platform);
                      }}
                      className="flex items-center gap-1.5 text-[10px] tracking-wide text-white/35 hover:text-white/60 transition-colors duration-300"
                    >
                      <RefreshCw size={12} />
                      刷新二维码
                    </button>
                  </div>

                  <div className="text-white/15 text-[10px] leading-relaxed mt-4 text-center">
                    {platform === 'kugou'
                      ? '打开酷狗音乐 App 扫码，登录后自动加载歌单'
                      : '打开网易云音乐 App 扫码，登录后自动加载歌单'}
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

                  <div className="flex-1 min-h-0 relative">
                    <AnimatePresence mode="wait">
                      {view === 'playlists' && (
                        <motion.div
                          key="playlists"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.45 }}
                          className="absolute inset-0"
                        >
                          {loading && playlists.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center text-white/20 text-xs">载入中...</div>
                          ) : error ? (
                            <div className="absolute inset-0 flex items-center justify-center text-white/30 text-[11px] text-center px-6 leading-relaxed">{error}</div>
                          ) : playlists.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center text-white/20 text-xs">暂无歌单</div>
                          ) : (
                            <OptionWheelStack
                              items={playlists}
                              activeIndex={plActive}
                              onActiveChange={setPlActive}
                              renderCard={renderPlaylistCard}
                              side="right"
                              gap={112}
                              tilt={7}
                              curve={1}
                              blur={2.2}
                              fade={0.28}
                              minOpacity={0.04}
                              smoothing={220}
                              loop
                              visible={6}
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
                        >
                          {loading && tracks.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center text-white/20 text-xs">载入中...</div>
                          ) : error ? (
                            <div className="absolute inset-0 flex items-center justify-center text-white/30 text-[11px] text-center px-6 leading-relaxed">{error}</div>
                          ) : tracks.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center text-white/20 text-xs">暂无歌曲</div>
                          ) : (
                            <OptionWheelStack
                              items={tracks}
                              activeIndex={trkActive}
                              onActiveChange={setTrkActive}
                              onActivateItem={(_t, index) => {
                                if (!bind) return;
                                onPlayPlaylist(tracks, index, bind.key);
                              }}
                              renderCard={renderTrackCard}
                              side="right"
                              gap={76}
                              tilt={7}
                              curve={1}
                              blur={2}
                              fade={0.26}
                              minOpacity={0.04}
                              smoothing={200}
                              loop
                              visible={6}
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
