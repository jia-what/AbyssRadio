import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { coverUrl, isImageUrl } from '../../utils/img';
import {
  DEFAULT_COVER_PALETTE,
  loadCoverPalette,
  type CoverPalette,
} from '../../utils/coverPalette';

interface Props {
  cover: string | null | undefined;
}

/**
 * Soft ambient glow from the current track cover — Mineradio / streaming-player style.
 */
export default function CoverAmbientLight({ cover }: Props) {
  const [layer, setLayer] = useState<{ key: number; palette: CoverPalette }>({
    key: 0,
    palette: DEFAULT_COVER_PALETTE,
  });
  const tokenRef = useRef(0);

  useEffect(() => {
    const raw = cover && isImageUrl(cover) ? coverUrl(cover) : '';
    if (!raw) {
      setLayer({ key: Date.now(), palette: DEFAULT_COVER_PALETTE });
      return;
    }

    const token = ++tokenRef.current;
    loadCoverPalette(raw).then((palette) => {
      if (token !== tokenRef.current) return;
      setLayer({ key: Date.now(), palette });
    });
  }, [cover]);

  const { primary, secondary, accent } = layer.palette;

  return (
    <div className="absolute inset-0 z-[0] pointer-events-none overflow-hidden">
      <AnimatePresence mode="sync">
        <motion.div
          key={layer.key}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background: [
              `radial-gradient(ellipse 90% 70% at 50% 42%, ${primary} 0%, transparent 68%)`,
              `radial-gradient(ellipse 55% 50% at 12% 78%, ${secondary} 0%, transparent 62%)`,
              `radial-gradient(ellipse 50% 45% at 88% 22%, ${accent} 0%, transparent 58%)`,
              `radial-gradient(ellipse 40% 35% at 72% 85%, ${secondary} 0%, transparent 55%)`,
              'linear-gradient(180deg, #050508 0%, #070912 45%, #050508 100%)',
            ].join(', '),
          }}
        />
      </AnimatePresence>
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 100% 80% at 50% 50%, transparent 35%, rgba(5,5,8,0.72) 100%)',
        }}
      />
    </div>
  );
}
