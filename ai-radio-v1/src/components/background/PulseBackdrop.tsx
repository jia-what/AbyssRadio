import { motion } from 'motion/react';
import { usePulseBands } from '../../context/PulseContext';

/**
 * Phase 3 placeholder — subtle background breathing driven by PULSE bands.
 * Phase 4 replaces this with CoverParticleField.
 */
export default function PulseBackdrop() {
  const bands = usePulseBands();

  const glow = 0.04 + bands.energy * 0.06 + bands.beat * 0.08;
  const bassShift = bands.bass * 12;
  const trebleShift = bands.treble * 8;

  return (
    <motion.div
      className="absolute inset-0 pointer-events-none z-[1]"
      animate={{
        opacity: 0.85 + bands.energy * 0.15,
      }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <motion.div
        className="absolute inset-0"
        animate={{
          background: `
            radial-gradient(ellipse ${70 + bassShift}% ${40 + trebleShift}% at 50% ${20 - bassShift * 0.3}%,
              rgba(59,130,246,${glow}) 0%, transparent 60%),
            radial-gradient(ellipse 50% 50% at 50% 60%,
              rgba(96,165,250,${glow * 0.6}) 0%, transparent 50%),
            radial-gradient(ellipse 80% 30% at ${30 + trebleShift}% 80%,
              rgba(59,130,246,${glow * 0.4}) 0%, transparent 50%),
            radial-gradient(ellipse 80% 30% at ${70 - trebleShift}% 80%,
              rgba(96,165,250,${glow * 0.4}) 0%, transparent 50%)
          `,
        }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      />

      {bands.beatOnset && (
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.12, 0] }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{
            background: 'radial-gradient(circle at 50% 45%, rgba(96,165,250,0.15) 0%, transparent 55%)',
          }}
        />
      )}
    </motion.div>
  );
}
