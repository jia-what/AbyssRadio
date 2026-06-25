import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight } from 'lucide-react';

interface Props { isOpen: boolean; onToggle: () => void; }

export default function LeftSidebar({ isOpen, onToggle }: Props) {
  return (
    <div className="relative h-full flex items-center">
      <button onClick={onToggle}
        className="absolute -right-4 z-20 w-8 h-8 flex items-center justify-center rounded-full liquid-glass text-white/30 hover:text-white/60 transition-all duration-200 hover:scale-105 active:scale-95">
        <ChevronRight size={14} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0, x: -20, width: 0 }}
            animate={{ opacity: 1, x: 0, width: 200 }}
            exit={{ opacity: 0, x: -20, width: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="h-[80%] overflow-hidden">
            <div className="w-[200px] h-full liquid-glass rounded-2xl p-5 flex flex-col gap-4">
              <div><div className="text-[10px] uppercase tracking-[2px] text-white/30 mb-2">Weather</div><div className="text-white/60 text-sm">22°C · Clear</div></div>
              <div><div className="text-[10px] uppercase tracking-[2px] text-white/30 mb-2">Listeners</div><div className="text-white/60 text-sm">— — —</div></div>
              <div><div className="text-[10px] uppercase tracking-[2px] text-white/30 mb-2">Now Playing</div><div className="text-white/60 text-sm text-[11px]">Awaiting signal</div></div>
              <div className="flex-1" />
              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!isOpen && <div className="absolute -right-6 z-10"><div className="w-px h-16 bg-gradient-to-b from-transparent via-white/10 to-transparent" /></div>}
    </div>
  );
}
