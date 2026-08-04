import { useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import './TiltedCard.css';

const springValues = {
  damping: 30,
  stiffness: 100,
  mass: 2,
};

export interface TiltedCardProps {
  /** 任意卡片内容；优先于 imageSrc */
  children?: ReactNode;
  imageSrc?: string;
  altText?: string;
  captionText?: string;
  containerHeight?: string;
  containerWidth?: string;
  imageHeight?: string;
  imageWidth?: string;
  scaleOnHover?: number;
  rotateAmplitude?: number;
  showMobileWarning?: boolean;
  showTooltip?: boolean;
  overlayContent?: ReactNode;
  displayOverlayContent?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * React Bits TiltedCard — 鼠标跟随微倾斜。
 * 支持 children 包裹现有歌单/歌曲卡片；默认关闭 tooltip / 移动端提示。
 */
export default function TiltedCard({
  children,
  imageSrc,
  altText = 'Tilted card image',
  captionText = '',
  containerHeight = '100%',
  containerWidth = '100%',
  imageHeight = '100%',
  imageWidth = '100%',
  scaleOnHover = 1.04,
  rotateAmplitude = 8,
  showMobileWarning = false,
  showTooltip = false,
  overlayContent = null,
  displayOverlayContent = false,
  className = '',
  style,
}: TiltedCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);
  const opacity = useSpring(0);
  const rotateFigcaption = useSpring(0, {
    stiffness: 350,
    damping: 30,
    mass: 1,
  });

  const [lastY, setLastY] = useState(0);

  function handleMouse(e: React.MouseEvent) {
    if (!ref.current) return;

    const rect = ref.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;

    const rotationX = (offsetY / (rect.height / 2 || 1)) * -rotateAmplitude;
    const rotationY = (offsetX / (rect.width / 2 || 1)) * rotateAmplitude;

    rotateX.set(rotationX);
    rotateY.set(rotationY);

    x.set(e.clientX - rect.left);
    y.set(e.clientY - rect.top);

    const velocityY = offsetY - lastY;
    rotateFigcaption.set(-velocityY * 0.6);
    setLastY(offsetY);
  }

  function handleMouseEnter() {
    scale.set(scaleOnHover);
    opacity.set(1);
  }

  function handleMouseLeave() {
    opacity.set(0);
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
    rotateFigcaption.set(0);
  }

  const useChildren = children != null;

  return (
    <div
      ref={ref}
      className={`tilted-card-figure${className ? ` ${className}` : ''}`}
      style={{
        height: containerHeight,
        width: containerWidth,
        ...style,
      }}
      onMouseMove={handleMouse}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {showMobileWarning && (
        <div className="tilted-card-mobile-alert">This effect is not optimized for mobile. Check on desktop.</div>
      )}

      <motion.div
        className={`tilted-card-inner${useChildren ? ' tilted-card-inner--content' : ''}`}
        style={{
          width: useChildren ? '100%' : imageWidth,
          height: useChildren ? '100%' : imageHeight,
          rotateX,
          rotateY,
          scale,
        }}
      >
        {useChildren ? (
          <div className="tilted-card-content">{children}</div>
        ) : (
          imageSrc && (
            <motion.img
              src={imageSrc}
              alt={altText}
              className="tilted-card-img"
              style={{
                width: imageWidth,
                height: imageHeight,
              }}
            />
          )
        )}

        {displayOverlayContent && overlayContent && (
          <motion.div className="tilted-card-overlay">{overlayContent}</motion.div>
        )}
      </motion.div>

      {showTooltip && (
        <motion.div
          className="tilted-card-caption"
          style={{
            x,
            y,
            opacity,
            rotate: rotateFigcaption,
          }}
        >
          {captionText}
        </motion.div>
      )}
    </div>
  );
}
