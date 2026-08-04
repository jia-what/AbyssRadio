import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import './ElasticSlider.css';

/**
 * ElasticSlider — 弹性滑杆 (React Bits 移植, 适配 AI_audio)
 *
 * 与 React Bits 原版的差异:
 *   - 图标依赖从 chakra-ui/react + react-icons 换成项目已有的 lucide-react (通过 props 传入)
 *   - 新增 onChange 回调, 对接受控值 (原版组件只自管理内部 state)
 *   - 配色适配项目暗色玻璃风格 (轨道/填充/数值指示器)
 *   - 新增 onPointerDown 立即生效 (原版依赖 buttons>0, 触摸/点击有时不触发)
 *   - handlePointerDown 里 stopPropagation, 避免与 useEdgePanels 右缘热区抢事件
 */

const MAX_OVERFLOW = 14;
// 轨道拉伸/图标位移的视觉上限: 弹性手感保留, 但不会穿出容器边界
const MAX_STRETCH = 6;

export interface ElasticSliderProps {
  defaultValue?: number;
  startingValue?: number;
  maxValue?: number;
  className?: string;
  isStepped?: boolean;
  stepSize?: number;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /** 受控回调: 拖动时上报当前值 */
  onChange?: (value: number) => void;
}

export default function ElasticSlider({
  defaultValue = 50,
  startingValue = 0,
  maxValue = 100,
  className = '',
  isStepped = false,
  stepSize = 1,
  leftIcon = <span className="el-slider-icon">−</span>,
  rightIcon = <span className="el-slider-icon">+</span>,
  onChange,
}: ElasticSliderProps) {
  return (
    <div className={`el-slider-container ${className}`}>
      <Slider
        defaultValue={defaultValue}
        startingValue={startingValue}
        maxValue={maxValue}
        isStepped={isStepped}
        stepSize={stepSize}
        leftIcon={leftIcon}
        rightIcon={rightIcon}
        onChange={onChange}
      />
    </div>
  );
}

function Slider({
  defaultValue, startingValue, maxValue, isStepped, stepSize, leftIcon, rightIcon, onChange,
}: {
  defaultValue: number; startingValue: number; maxValue: number;
  isStepped: boolean; stepSize: number;
  leftIcon: ReactNode; rightIcon: ReactNode;
  onChange?: (v: number) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [region, setRegion] = useState<'left' | 'middle' | 'right'>('middle');
  const clientX = useMotionValue(0);
  const overflow = useMotionValue(0);
  const scale = useMotionValue(1);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  useMotionValueEvent(clientX, 'change', (latest) => {
    if (sliderRef.current) {
      const { left, right } = sliderRef.current.getBoundingClientRect();
      let newValue: number;
      if (latest < left) {
        setRegion('left');
        newValue = left - latest;
      } else if (latest > right) {
        setRegion('right');
        newValue = latest - right;
      } else {
        setRegion('middle');
        newValue = 0;
      }
      overflow.jump(decay(newValue, MAX_OVERFLOW));
    }
  });

  const computeValue = (clientXPos: number) => {
    if (!sliderRef.current) return null;
    const { left, width } = sliderRef.current.getBoundingClientRect();
    let newValue = startingValue + ((clientXPos - left) / width) * (maxValue - startingValue);
    if (isStepped) {
      newValue = Math.round(newValue / stepSize) * stepSize;
    }
    return Math.min(Math.max(newValue, startingValue), maxValue);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.buttons > 0 && sliderRef.current) {
      const newValue = computeValue(e.clientX);
      if (newValue === null) return;
      setValue(newValue);
      onChange?.(newValue);
      clientX.jump(e.clientX);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newValue = computeValue(e.clientX);
    if (newValue !== null) {
      setValue(newValue);
      onChange?.(newValue);
    }
    clientX.jump(e.clientX);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = () => {
    animate(overflow, 0, { type: 'spring', bounce: 0.5 });
  };

  const getRangePercentage = () => {
    const totalRange = maxValue - startingValue;
    if (totalRange === 0) return 0;
    return ((value - startingValue) / totalRange) * 100;
  };

  return (
    <>
      <motion.div
        onHoverStart={() => animate(scale, 1.2)}
        onHoverEnd={() => animate(scale, 1)}
        onTouchStart={() => animate(scale, 1.2)}
        onTouchEnd={() => animate(scale, 1)}
        style={{ scale, opacity: useTransform(scale, [1, 1.2], [0.7, 1]) }}
        className="el-slider-wrapper"
      >
        <motion.div
          animate={{ scale: region === 'left' ? [1, 1.25, 1] : 1, transition: { duration: 0.25 } }}
          style={{ x: useTransform(() => (region === 'left' ? -Math.min(overflow.get(), MAX_STRETCH) / scale.get() : 0)) }}
        >
          {leftIcon}
        </motion.div>

        <div
          ref={sliderRef}
          className="el-slider-root"
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onLostPointerCapture={handlePointerUp}
        >
          <motion.div
            style={{
              scaleX: useTransform(() => {
                if (sliderRef.current) {
                  const { width } = sliderRef.current.getBoundingClientRect();
                  // 拉伸封顶: 最多 +MAX_STRETCH/width, 防止轨道穿出容器
                  return 1 + Math.min(overflow.get(), MAX_STRETCH) / width;
                }
                return 1;
              }),
              scaleY: useTransform(overflow, [0, MAX_OVERFLOW], [1, 0.8]),
              transformOrigin: useTransform(() => {
                if (sliderRef.current) {
                  const { left, width } = sliderRef.current.getBoundingClientRect();
                  return clientX.get() < left + width / 2 ? 'right' : 'left';
                }
                return 'center';
              }),
              height: useTransform(scale, [1, 1.2], [6, 12]),
              marginTop: useTransform(scale, [1, 1.2], [0, -3]),
              marginBottom: useTransform(scale, [1, 1.2], [0, -3]),
            }}
            className="el-slider-track-wrapper"
          >
            <div className="el-slider-track">
              <div className="el-slider-range" style={{ width: `${getRangePercentage()}%` }} />
            </div>
          </motion.div>
        </div>

        <motion.div
          animate={{ scale: region === 'right' ? [1, 1.25, 1] : 1, transition: { duration: 0.25 } }}
          style={{ x: useTransform(() => (region === 'right' ? Math.min(overflow.get(), MAX_STRETCH) / scale.get() : 0)) }}
        >
          {rightIcon}
        </motion.div>
      </motion.div>
      <p className="el-slider-value">{Math.round(value)}</p>
    </>
  );
}

function decay(value: number, max: number) {
  if (max === 0) return 0;
  const entry = value / max;
  const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);
  return sigmoid * max;
}
