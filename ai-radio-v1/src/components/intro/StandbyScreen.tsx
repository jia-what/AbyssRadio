import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import MagicRings from './MagicRings';

/**
 * StandbyScreen — 动态待机画面 (开机动画结束后衔接)
 *
 * 结构 (借鉴 Mineradio splash 交互模式, 视觉自研):
 *   MagicRings 冷青声呐环循环动画 (全屏背景)
 *   + 中心字标 ABYSS RADIO (渐入)
 *   + 副标 DEEP SIGNAL
 *   + 「点击进入」按钮 → 点击 → 整体淡出 → 主界面
 *
 * 点击区域: 整屏可点 + 按钮视觉引导 (Mineradio 也是"点击空白处继续")。
 * 待机期间鼠标跟随/悬停由 MagicRings 内部处理, 增加"活物感"。
 */

export default function StandbyScreen({ onEnter }: { onEnter: () => void }) {
  const [exiting, setExiting] = useState(false);

  const handleEnter = () => {
    if (exiting) return;
    setExiting(true);
    // 淡出动画完成后通知父组件切换主界面
    setTimeout(onEnter, 620);
  };

  // 键盘回车也能进 (桌面应用惯例)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEnter(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exiting]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-[#050508] overflow-hidden select-none cursor-pointer"
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
      onClick={handleEnter}
    >
      {/* 循环声呐环背景 */}
      <MagicRings
        color="#3ec8ff"
        colorTwo="#5a7bff"
        ringCount={5}
        speed={0.7}
        attenuation={18}
        lineThickness={2}
        baseRadius={0.32}
        radiusStep={0.09}
        scaleRate={0.08}
        opacity={0.55}
        noiseAmount={0.06}
        ringGap={1.5}
        fadeIn={0.75}
        fadeOut={0.55}
        followMouse
        mouseInfluence={0.12}
        parallax={0.04}
      />

      {/* 中央字标组 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <motion.div
          className="text-white/95 font-semibold"
          style={{
            fontSize: 'clamp(34px, 5.4vw, 64px)',
            letterSpacing: '0.3em',
            paddingLeft: '0.3em',
            textShadow: '0 0 52px rgba(80,190,255,0.3), 0 2px 18px rgba(0,0,0,0.6)',
          }}
          initial={{ opacity: 0, y: 18, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.15, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          ABYSS RADIO
        </motion.div>

        <motion.div
          className="mt-5 text-white/40 text-[clamp(11px,1.3vw,14px)] tracking-[0.6em] pl-[0.6em]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.7 }}
        >
          DEEP SIGNAL
        </motion.div>
      </div>

      {/* 点击进入按钮 */}
      <div className="absolute inset-x-0 bottom-[14vh] flex justify-center pointer-events-none">
        <motion.button
          className="pointer-events-auto px-9 py-3 rounded-full text-white/85 text-[clamp(12px,1.4vw,15px)] tracking-[0.35em] pl-[calc(2.25rem+0.35em)] border border-white/20 bg-white/[0.04] backdrop-blur-sm hover:bg-white/[0.1] hover:border-white/40 transition-colors duration-300"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={(e) => { e.stopPropagation(); handleEnter(); }}
        >
          点击进入
        </motion.button>
      </div>

      {/* 底部提示 */}
      <div className="absolute inset-x-0 bottom-[7vh] flex justify-center">
        <motion.div
          className="text-white/25 text-[10px] tracking-[0.4em]"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.4] }}
          transition={{ delay: 1.5, duration: 1.2 }}
        >
          点击任意处继续
        </motion.div>
      </div>
    </motion.div>
  );
}
