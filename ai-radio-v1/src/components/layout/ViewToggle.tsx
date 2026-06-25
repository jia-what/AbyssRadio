export default function ViewToggle({ mode, onChange }: { mode: 'radio' | 'immersive'; onChange: (m: 'radio' | 'immersive') => void }) {
  return (
    <button onClick={() => onChange(mode === 'radio' ? 'immersive' : 'radio')}
      className="text-[9px] uppercase tracking-[3px] text-white/25 hover:text-white/50 transition-all duration-500">
      {mode === 'radio' ? '✦ Immersive' : '← Radio'}
    </button>
  );
}
