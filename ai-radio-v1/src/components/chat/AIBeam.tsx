import { motion, AnimatePresence } from 'motion/react';
import { X, Send } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import BreathingLight from './BreathingLight';
import type { ChatMessage } from '../../types';

interface Props { isOpen: boolean; onToggle: () => void; messages: ChatMessage[]; onSendMessage: (text: string) => void; }

export default function AIBeam({ isOpen, onToggle, messages, onSendMessage }: Props) {
  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const handleSend = () => { if (!input.trim()) return; onSendMessage(input.trim()); setInput(''); };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="relative h-full flex items-center">
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0, x: 20, width: 0 }} animate={{ opacity: 1, x: 0, width: 300 }} exit={{ opacity: 0, x: 20, width: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="h-[85%] overflow-hidden">
            <div className="w-[300px] h-full liquid-glass rounded-2xl p-4 flex flex-col max-h-[600px]">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500 animate-breathe" /><span className="text-white/50 text-[11px] tracking-[1px] uppercase">AI·DJ</span></div>
                <button onClick={onToggle} className="text-white/20 hover:text-white/50 transition-colors duration-200 shrink-0"><X size={14} /></button>
              </div>
              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4 shrink-0" />
              <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-0">
                {messages.length === 0 && <div className="text-white/20 text-xs text-center pt-8">◉  standing by</div>}
                {messages.map(msg => (
                  <div key={msg.id} className={`text-sm ${msg.role === 'ai' ? 'text-blue-300/70' : 'text-white/50'}`}>
                    <span className="text-[10px] uppercase tracking-[1px] text-white/20 block mb-0.5">{msg.role === 'ai' ? 'AI·DJ' : 'You'}</span>
                    {msg.text}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="flex items-center gap-2">
                <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="Request a song..." className="flex-1 bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-white/50 text-sm placeholder:text-white/15 focus:outline-none focus:border-white/20 transition-all duration-200" />
                <button onClick={handleSend} className="w-8 h-8 rounded-xl bg-blue-700/30 flex items-center justify-center hover:bg-blue-700/50 transition-all duration-200 hover:scale-105 active:scale-95">
                  <Send size={12} className="text-white/50" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!isOpen && <div className="absolute -left-6 z-10" onClick={onToggle}><BreathingLight /></div>}
    </div>
  );
}
