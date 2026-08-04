import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, useMotionValue, useAnimationFrame, useTransform } from 'motion/react';
import './ShinyText.css';

/**
 * ShinyText — 流光扫过文字 (React Bits 移植, 适配 TS)
 * 渐变背景裁剪到文字上, backgroundPosition 动画形成一道高光从左/右扫过。
 * 用于待机界面 (StandbyScreen) 的主标题。
 */

export interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
  color?: string;
  shineColor?: string;
  spread?: number;
  yoyo?: boolean;
  pauseOnHover?: boolean;
  direction?: 'left' | 'right';
  delay?: number;
  /** 渐变停靠点 [底, 高光峰值, 顶] (0~1) */
  stops?: [number, number, number];
  /**
   * 适配背景的多色流光。有值时覆盖 color/shineColor 双色模式。
   * base = 常态字色；highlights = 扫过带上的色阶（建议贴合场景主色）
   */
  gradient?: {
    base: string;
    highlights: string[];
  };
}

const ShinyText = ({
  text,
  disabled = false,
  speed = 2,
  className = '',
  color = '#b5b5b5',
  shineColor = '#ffffff',
  spread = 120,
  yoyo = false,
  pauseOnHover = false,
  direction = 'left',
  delay = 0,
  stops = [0.35, 0.5, 0.65],
  gradient,
}: ShinyTextProps) => {
  const [isPaused, setIsPaused] = useState(false);
  const progress = useMotionValue(0);
  const elapsedRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const directionRef = useRef(direction === 'left' ? 1 : -1);

  const animationDuration = speed * 1000;
  const delayDuration = delay * 1000;

  useAnimationFrame((time: number) => {
    if (disabled || isPaused) {
      lastTimeRef.current = null;
      return;
    }

    if (lastTimeRef.current === null) {
      lastTimeRef.current = time;
      return;
    }

    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;

    elapsedRef.current += deltaTime;

    if (yoyo) {
      const cycleDuration = animationDuration + delayDuration;
      const fullCycle = cycleDuration * 2;
      const cycleTime = elapsedRef.current % fullCycle;

      if (cycleTime < animationDuration) {
        const p = (cycleTime / animationDuration) * 100;
        progress.set(directionRef.current === 1 ? p : 100 - p);
      } else if (cycleTime < cycleDuration) {
        progress.set(directionRef.current === 1 ? 100 : 0);
      } else if (cycleTime < cycleDuration + animationDuration) {
        const reverseTime = cycleTime - cycleDuration;
        const p = 100 - (reverseTime / animationDuration) * 100;
        progress.set(directionRef.current === 1 ? p : 100 - p);
      } else {
        progress.set(directionRef.current === 1 ? 0 : 100);
      }
    } else {
      const cycleDuration = animationDuration + delayDuration;
      const cycleTime = elapsedRef.current % cycleDuration;

      if (cycleTime < animationDuration) {
        const p = (cycleTime / animationDuration) * 100;
        progress.set(directionRef.current === 1 ? p : 100 - p);
      } else {
        progress.set(directionRef.current === 1 ? 100 : 0);
      }
    }
  });

  useEffect(() => {
    directionRef.current = direction === 'left' ? 1 : -1;
    elapsedRef.current = 0;
    progress.set(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction]);

  const backgroundPosition = useTransform(progress, (p) => `${150 - p * 2}% center`);

  const handleMouseEnter = useCallback(() => {
    if (pauseOnHover) setIsPaused(true);
  }, [pauseOnHover]);

  const handleMouseLeave = useCallback(() => {
    if (pauseOnHover) setIsPaused(false);
  }, [pauseOnHover]);

  const [s0, s1, s2] = stops;

  const gradientStyle = useMemo(() => {
    let backgroundImage: string;
    if (gradient && gradient.highlights.length > 0) {
      const { base, highlights } = gradient;
      const n = highlights.length;
      const band = highlights
        .map((c, i) => {
          const t = n === 1 ? s1 : s0 + (s2 - s0) * (i / (n - 1));
          return `${c} ${t * 100}%`;
        })
        .join(', ');
      backgroundImage = `linear-gradient(${spread}deg, ${base} 0%, ${base} ${s0 * 100}%, ${band}, ${base} ${s2 * 100}%, ${base} 100%)`;
    } else {
      backgroundImage = `linear-gradient(${spread}deg, ${color} 0%, ${color} ${s0 * 100}%, ${shineColor} ${s1 * 100}%, ${color} ${s2 * 100}%, ${color} 100%)`;
    }
    return {
      backgroundImage,
      backgroundSize: '200% auto',
      WebkitBackgroundClip: 'text' as const,
      backgroundClip: 'text' as const,
      WebkitTextFillColor: 'transparent',
    };
  }, [gradient, color, shineColor, spread, s0, s1, s2]);

  return (
    <motion.span
      className={`shiny-text ${className}`}
      style={{ ...gradientStyle, backgroundPosition }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {text}
    </motion.span>
  );
};

export default ShinyText;
