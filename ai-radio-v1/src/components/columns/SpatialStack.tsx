import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';

export interface StackCardState {
  active: boolean;
  offset: number; // signed distance from the focused card
  abs: number; // |offset|
  index: number;
}

interface StackItem {
  id: string;
}

interface SpatialStackProps<T extends StackItem> {
  items: T[];
  activeIndex: number;
  onActiveChange: (index: number) => void;
  renderCard: (item: T, state: StackCardState) => ReactNode;
  /** vertical distance (px) between adjacent card centers */
  gap?: number;
  /** wheel delta needed per step (lower = faster scroll) */
  wheelThreshold?: number;
  /** ms between wheel steps */
  wheelCooldown?: number;
  /** how many neighbours to render on each side of the focused card */
  visible?: number;
  className?: string;
  /**
   * Fired whenever the focused item changes. Phase 4 hook: the cover particle
   * field (PULSE) can subscribe here to resample the background from the
   * focused cover. No-op until then.
   */
  onFocusItem?: (item: T) => void;
}

const DEFAULT_WHEEL_THRESHOLD = 50;
const DEFAULT_WHEEL_COOLDOWN = 100;

export default function SpatialStack<T extends StackItem>({
  items,
  activeIndex,
  onActiveChange,
  renderCard,
  gap = 90,
  wheelThreshold = DEFAULT_WHEEL_THRESHOLD,
  wheelCooldown = DEFAULT_WHEEL_COOLDOWN,
  visible = 3,
  className = '',
  onFocusItem,
}: SpatialStackProps<T>) {
  const accum = useRef(0);
  const lastStep = useRef(0);
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;
  const onFocusItemRef = useRef(onFocusItem);
  onFocusItemRef.current = onFocusItem;
  const containerRef = useRef<HTMLDivElement>(null);

  const step = useCallback(
    (dir: number) => {
      const next = Math.max(0, Math.min(items.length - 1, activeRef.current + (dir > 0 ? 1 : -1)));
      if (next !== activeRef.current) onActiveChange(next);
    },
    [items.length, onActiveChange],
  );

  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = performance.now();
      accum.current += e.deltaY;
      if (now - lastStep.current < wheelCooldown) return;
      if (Math.abs(accum.current) >= wheelThreshold) {
        stepRef.current(accum.current > 0 ? 1 : -1);
        accum.current = 0;
        lastStep.current = now;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [wheelThreshold, wheelCooldown]);

  // Reset the accumulator and notify the PULSE hook when focus changes.
  useEffect(() => {
    accum.current = 0;
    const item = items[activeIndex];
    if (item && onFocusItemRef.current) onFocusItemRef.current(item);
  }, [activeIndex, items]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{ transformStyle: 'preserve-3d' }}
    >
      {items.map((item, i) => {
        const offset = i - activeIndex;
        const abs = Math.abs(offset);
        if (abs > visible) return null;

        const active = offset === 0;
        const scale = Math.max(1 - abs * 0.12, 0.6);
        const opacity = Math.max(1 - abs * 0.26, 0.1);
        const y = offset * gap;
        const z = -abs * 64; // recede into depth
        const rotateX = offset * 5; // subtle vertical coverflow tilt
        const blur = abs === 0 ? 0 : abs * 1.3;

        return (
          <motion.div
            key={item.id}
            className="absolute left-0 right-0 flex items-center justify-center"
            style={{
              top: '50%',
              height: gap,
              marginTop: -gap / 2,
              zIndex: 100 - abs,
              pointerEvents: abs <= 1 ? 'auto' : 'none',
              transformStyle: 'preserve-3d',
            }}
            initial={false}
            animate={{ y, z, scale, opacity, rotateX, filter: `blur(${blur}px)` }}
            transition={{ type: 'spring', stiffness: 250, damping: 30, mass: 0.7 }}
          >
            {renderCard(item, { active, offset, abs, index: i })}
          </motion.div>
        );
      })}
    </div>
  );
}
