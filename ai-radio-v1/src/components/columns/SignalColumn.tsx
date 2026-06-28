import { motion, AnimatePresence } from 'motion/react';
import { Send, Radio } from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { usePulseBands, usePulseFocus } from '../../context/PulseContext';
import CoverThumb from '../ui/CoverThumb';
import type { AIMessage } from '../layout/SpatialLayout';

interface Props {
  visible: boolean;
  messages: AIMessage[];
  isPlaying: boolean;
  onSendMessage: (text: string) => void;
  onPin: () => void;
  onUnpin: () => void;
}

const BAR_COUNT = 12;

function SignalBars() {
  const bands = usePulseBands();
  const heights = useMemo(() => {
    const base = [bands.bass, bands.mid, bands.treble];
    return Array.from({ length: BAR_COUNT }, (_, i) => {
      const band = base[i % 3];
      const phase = Math.sin(i * 0.7) * 0.15;
      return Math.min(1, (band * 1.35 + bands.energy * 0.15) * (0.55 + (i / BAR_COUNT) * 0.45) + phase * band + bands.beat * 0.35);
    });
  }, [bands]);

  return (
    <div className="flex items-end gap-[3px] h-8 shrink-0">
      {heights.map((h, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-blue-400/40 origin-bottom"
          animate={{
            scaleY: 0.12 + h * 0.88,
            opacity: 0.25 + h * 0.55,
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
}: Props) {
  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { focus } = usePulseFocus();
  const bands = usePulseBands();

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
      {/* Collapsed edge hint */}
      <AnimatePresence>
        {!visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="fixed left-3 top-1/2 -translate-y-1/2 z-20 pointer-events-none"
          >
            <div className="w-px h-12 bg-gradient-to-b from-transparent via-white/10 to-transparent" />
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 -left-0.5 w-1.5 h-1.5 rounded-full bg-blue-400/30"
              animate={{ opacity: isPlaying ? [0.2, 0.5 + bands.beat * 0.4, 0.2] : [0.15, 0.35, 0.15] }}
              transition={{ duration: isPlaying ? 0.35 : 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-5 z-30 pointer-events-auto"
            style={{ perspective: '1000px', top: '12vh', height: '76vh' }}
            onMouseEnter={onPin}
            onMouseLeave={onUnpin}
          >
            <div
              className="w-[320px] h-full liquid-glass rounded-2xl p-5 flex flex-col"
              style={{ transform: 'rotateY(8deg)', transformOrigin: 'left center' }}
            >
              {/* Header — signal lock + spectrum */}
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
                <SignalBars />
              </div>

              {/* Focus lock — current cover / stack preview */}
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
                      {focus.source === 'stack' ? 'Preview' : 'Locked'}
                    </div>
                    {focus.label && (
                      <div className="text-white/45 text-[11px] truncate">{focus.label}</div>
                    )}
                  </div>
                  <Radio size={12} className="text-white/15 shrink-0" />
                </div>
              )}

              <div className="h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent mb-3 shrink-0" />

              {/* Signal stream */}
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
                      <span className="text-[9px] tracking-[1.5px] uppercase text-white/20">
                        {msg.role === 'ai' ? 'RX' : 'TX'}
                      </span>
                       <span className="text-[9px] text-white/10 tabular-nums">{formatSignalTime(msg.id)}</span>
                    </div>
                    <p
                      className={`text-sm leading-relaxed ${
                        msg.role === 'ai' ? 'text-blue-300/55' : 'text-white/38'
                      }`}
                    >
                      {msg.text}
                    </p>
                  </motion.div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Band readout */}
              <div className="flex items-center gap-3 mb-3 shrink-0 px-0.5">
                {(['bass', 'mid', 'treble'] as const).map(band => (
                  <div key={band} className="flex-1">
                    <div className="text-[8px] tracking-[1px] uppercase text-white/15 mb-1">{band}</div>
                    <div className="h-[2px] bg-white/[0.04] rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-blue-400/50 rounded-full origin-left"
                        animate={{ scaleX: bands[band] }}
                        transition={{ duration: 0.12, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent mb-3 shrink-0" />

              {/* Transmit input */}
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="transmit..."
                  className="flex-1 bg-transparent border-b border-white/[0.08] px-1 py-2 text-white/45 text-sm placeholder:text-white/12 focus:outline-none focus:border-white/20 transition-colors duration-500"
                />
                <button
                  onClick={handleSend}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white/30 hover:text-white/55 transition-colors duration-500"
                >
                  <Send size={13} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
