import { motion, AnimatePresence } from 'motion/react';
import { Send, Radio, KeyRound } from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { usePulseBands, usePulseFocus } from '../../context/PulseContext';
import type { OrbitRotation } from '../../hooks/useSpatialOrbit';
import CoverThumb from '../ui/CoverThumb';
import ApiKeyModal from '../chat/ApiKeyModal';
import { fetchDeepseekStatus } from '../../services/aiSettingsApi';
import type { AIMessage } from '../layout/SpatialLayout';

interface Props {
  visible: boolean;
  messages: AIMessage[];
  isPlaying: boolean;
  onSendMessage: (text: string) => void;
  onPin: () => void;
  onUnpin: () => void;
  onToggle?: () => void;
  parallax?: OrbitRotation;
}

const BAR_COUNT = 12;

/** Sidebar meters — gamma expands quiet/loud contrast so bars rarely peg at 100%. */
function signalMeter(v: number, gamma = 1.42) {
  const x = Math.max(0, Math.min(1, v));
  return 0.06 + Math.pow(x, gamma) * 0.88;
}

function SignalBars() {
  const bands = usePulseBands();
  const heights = useMemo(() => {
    const b = signalMeter(bands.bass, 1.35);
    const m = signalMeter(bands.mid, 1.48);
    const t = signalMeter(bands.treble, 1.62);
    const e = signalMeter(bands.energy, 1.25);
    const beat = signalMeter(bands.beat, 1.1);
    return Array.from({ length: BAR_COUNT }, (_, i) => {
      const band = i < 4 ? b : i < 8 ? m : t;
      const sway = 0.78 + (i % 4) * 0.06;
      const ripple = Math.sin(i * 0.9 + beat * 8) * 0.07 * band;
      const kick = beat * (i % 4 === 0 ? 0.22 : 0.06);
      return Math.min(0.94, band * sway + ripple + e * 0.1 + kick);
    });
  }, [bands]);

  return (
    <div className="flex items-end gap-[3px] h-8 shrink-0">
      {heights.map((h, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-blue-400/40 origin-bottom"
          animate={{
            scaleY: 0.1 + h * 0.82,
            opacity: 0.22 + h * 0.48,
          }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          style={{ height: 28 }}
        />
      ))}
    </div>
  );
}

function formatSignalTime(id: string) {
  const n = parseInt(id, 10);
  if (!Number.isFinite(n)) return '--:--';
  const d = new Date(n);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function SignalColumn({
  visible,
  messages,
  isPlaying,
  onSendMessage,
  onPin,
  onUnpin,
  onToggle,
  parallax = { x: 0, y: 0 },
}: Props) {
  const [input, setInput] = useState('');
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { focus } = usePulseFocus();
  const bands = usePulseBands();

  useEffect(() => {
    void fetchDeepseekStatus()
      .then((s) => {
        setKeyConfigured(s.configured);
        // 第 16 项：首启无 Key → 自动弹引导（只弹一次，用户关掉或导入后不再打扰）
        if (!s.configured && !localStorage.getItem('abyss.key.asked')) {
          localStorage.setItem('abyss.key.asked', '1');
          setKeyOpen(true);
        }
      })
      .catch(() => setKeyConfigured(false));
  }, [visible]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const coreGlow = 0.35 + bands.beat * 0.45 + bands.energy * 0.2;

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
            className="fixed left-3 top-1/2 -translate-y-1/2 z-20 pointer-events-auto w-6 h-16 bg-transparent border-0 cursor-pointer"
            aria-label="打开 AI"
          >
            <div className="w-px h-12 bg-gradient-to-b from-transparent via-white/10 to-transparent mx-auto" />
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 left-1/2 -ml-0.5 w-1.5 h-1.5 rounded-full bg-blue-400/30"
              animate={{ opacity: isPlaying ? [0.2, 0.5 + bands.beat * 0.4, 0.2] : [0.15, 0.35, 0.15] }}
              transition={{ duration: isPlaying ? 0.35 : 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-6 z-30 pointer-events-auto overflow-visible"
            style={{ top: '10vh', height: '80vh', maxHeight: '720px' }}
            onMouseEnter={onPin}
            onMouseLeave={onUnpin}
          >
            <motion.div
              className="w-[min(320px,calc(100vw-2rem))] h-full liquid-glass rounded-2xl p-5 flex flex-col overflow-hidden"
              style={{ transformOrigin: 'left center' }}
              animate={{
                rotateY: 6,
                x: parallax.y * 0.08,
                y: parallax.x * 0.06,
              }}
              transition={{ type: 'spring', stiffness: 170, damping: 26, mass: 0.85 }}
            >
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center gap-2.5">
                  <motion.div
                    className="relative w-2 h-2 rounded-full bg-blue-400/60"
                    animate={{
                      opacity: coreGlow,
                      boxShadow: `0 0 ${8 + bands.beat * 14}px rgba(96,165,250,${0.2 + bands.beat * 0.35})`,
                    }}
                    transition={{ duration: 0.15 }}
                  />
                  <span className="text-white/40 text-[10px] tracking-[2px] uppercase">Signal</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setKeyOpen(true)}
                    title={keyConfigured ? 'API Key 已配置' : '导入 API Key'}
                    aria-label="导入 API Key"
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] tracking-wide transition-colors ${
                      keyConfigured
                        ? 'text-emerald-300/70 hover:text-emerald-200/90'
                        : 'text-amber-200/70 hover:text-amber-100 bg-amber-400/10'
                    }`}
                  >
                    <KeyRound size={12} />
                    {keyConfigured ? 'Key' : '导入 Key'}
                  </button>
                  <SignalBars />
                </div>
              </div>

              {keyConfigured === false && (
                <button
                  type="button"
                  onClick={() => setKeyOpen(true)}
                  className="mb-3 shrink-0 w-full text-left rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-100/70 hover:bg-amber-400/10 transition-colors"
                >
                  未配置 DeepSeek Key — 点此导入。不配也可点歌：先登录，仅限歌单内。
                </button>
              )}

              {focus.cover && (
                <div className="flex items-center gap-2.5 mb-3 shrink-0 px-0.5">
                  <div className="relative w-9 h-9 rounded-lg overflow-hidden border border-white/[0.08] shrink-0">
                    <CoverThumb cover={focus.cover} className="w-full h-full" />
                    {isPlaying && (
                      <motion.div
                        className="absolute inset-0 border border-blue-400/30 rounded-lg"
                        animate={{ opacity: [0.3, 0.7, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-white/25 text-[9px] tracking-[1.5px] uppercase">
                      Locked
                    </div>
                    {focus.label && (
                      <div className="text-white/45 text-[11px] truncate">{focus.label}</div>
                    )}
                  </div>
                  <Radio size={12} className="text-white/15 shrink-0" />
                </div>
              )}

              <div className="h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent mb-3 shrink-0" />

              <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-0">
                {messages.length === 0 && (
                  <div className="text-white/15 text-xs text-center pt-12 font-light tracking-wide">
                    · · · receiving · · ·
                  </div>
                )}
                {messages.map(msg => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, x: msg.role === 'user' ? 8 : -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className={`relative pl-3 border-l ${
                      msg.role === 'ai'
                        ? 'border-blue-400/25'
                        : 'border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-[9px] tracking-[1.5px] uppercase ${
                          msg.role === 'ai' ? 'text-white/25' : 'text-white/40'
                        }`}
                      >
                        {msg.role === 'ai' ? 'RX' : 'TX'}
                      </span>
                       <span className="text-[9px] text-white/20 tabular-nums">{formatSignalTime(msg.id)}</span>
                    </div>
                    <p
                      className={`text-sm leading-relaxed ${
                        msg.role === 'ai' ? 'text-blue-200/70' : 'text-white/80'
                      }`}
                    >
                      {msg.text}
                    </p>
                  </motion.div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className="flex items-center gap-3 mb-3 shrink-0 px-0.5" title="实时频段可视化，仅供视觉，不可调节">
                {(['bass', 'mid', 'treble'] as const).map(band => {
                  const gamma = band === 'treble' ? 1.55 : band === 'mid' ? 1.45 : 1.38;
                  const level = signalMeter(bands[band], gamma);
                  const label = band === 'bass' ? '低音' : band === 'mid' ? '中音' : '高音';
                  return (
                  <div key={band} className="flex-1">
                    <div className="text-[8px] tracking-[1px] uppercase text-white/15 mb-1">{label}</div>
                    <div className="h-[2px] bg-white/[0.04] rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-blue-400/50 rounded-full origin-left"
                        animate={{ scaleX: level }}
                        transition={{ duration: 0.14, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                  );
                })}
                <div className="text-[8px] text-white/10 tracking-wider shrink-0">实时频谱</div>
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent mb-3 shrink-0" />

              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="transmit..."
                  className="flex-1 bg-transparent border-b border-white/[0.08] px-1 py-2 text-white/80 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors duration-500"
                />
                <button
                  onClick={handleSend}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white/30 hover:text-white/55 transition-colors duration-500"
                >
                  <Send size={13} />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ApiKeyModal
        open={keyOpen}
        onClose={() => setKeyOpen(false)}
        onSaved={(s) => setKeyConfigured(s.configured)}
      />
    </>
  );
}
