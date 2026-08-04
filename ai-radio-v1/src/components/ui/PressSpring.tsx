import { motion, type HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';

const PRESS_SPRING = { type: 'spring' as const, stiffness: 480, damping: 24, mass: 0.55 };

interface PressSpringProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: ReactNode;
  /** 按下时的缩放，默认 0.96 */
  pressScale?: number;
  as?: 'div' | 'button';
  type?: 'button' | 'submit' | 'reset';
}

/**
 * 点按微弹簧：按下略缩、松开回弹。
 */
export default function PressSpring({
  children,
  pressScale = 0.96,
  as = 'div',
  type = 'button',
  className,
  style,
  ...rest
}: PressSpringProps) {
  if (as === 'button') {
    return (
      <motion.button
        type={type}
        className={className}
        style={style}
        whileTap={{ scale: pressScale }}
        transition={PRESS_SPRING}
        {...(rest as HTMLMotionProps<'button'>)}
      >
        {children}
      </motion.button>
    );
  }

  return (
    <motion.div
      className={className}
      style={style}
      whileTap={{ scale: pressScale }}
      transition={PRESS_SPRING}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
