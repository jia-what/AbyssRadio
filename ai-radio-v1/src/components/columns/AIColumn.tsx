import { motion, AnimatePresence } from 'motion/react';
import { Send } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { AIMessage } from '../layout/SpatialLayout';

interface Props {
  visible: boolean;
  messages: AIMessage[];
  onSendMessage: (text: string) => void;
  onPin: () => void;
  onUnpin: () => void;
}

export default function AIColumn({ visible, messages, onSendMessage, onPin, onUnpin }: Props) {
  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <>
      {/* Collapsed hint */}
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
            <div className="absolute top-1/2 -translate-y-1/2 -left-0.5 w-1.5 h-1.5 rounded-full bg-blue-400/30 animate-breathe" />
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
              <div className="flex items-center gap-2 mb-4 shrink-0">
                <div className="w-2 h-2 rounded-full bg-blue-400/60 animate-breathe" />
                <span className="text-white/40 text-[10px] tracking-[2px] uppercase">AI·DJ</span>
              </div>

              <div className="h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent mb-4 shrink-0" />

              <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-0">
                {messages.length === 0 && (
                  <div className="text-white/15 text-xs text-center pt-12 font-light tracking-wide">
                    · · · standing by · · ·
                  </div>
                )}
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`text-sm leading-relaxed ${msg.role === 'ai' ? 'text-blue-300/60' : 'text-white/40'}`}
                  >
                    {msg.text}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent mb-3 shrink-0" />

              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="说点什么..."
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
