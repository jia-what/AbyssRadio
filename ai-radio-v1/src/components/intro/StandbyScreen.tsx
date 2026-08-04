import { useState } from 'react';
import { motion } from 'motion/react';
import MagicRings from './MagicRings';
import SpecularButton from '../ui/SpecularButton';

/**
 * StandbyScreen — 动态待机画面 (默认入口)
 *
 * 结构:
 *   MagicRings 冷青声呐环循环动画 (全屏背景)
 *   + 中心字标 ABYSS RADIO (渐入)
 *   + 副标 DEEP SIGNAL
 *   + SpecularButton「点击进入」按钮 (WebGL 高光扫过) → 点击 → 整体淡出 → 主界面
 *
 * 入口唯一: 只有按钮可进入 (2026-08-04 老板拍板: 去掉整屏点击/任意处继续,
 * 避免"整屏可点 + 按钮"双入口冲突)。
 */

export default function StandbyScreen({ onEnter }: { onEnter: () => void }) {
  const [exiting, setExiting] = useState(false);

  const handleEnter = () => {
    if (exiting) return;
    setExiting(true);
    // 淡出动画完成后通知父组件切换主界面
    setTimeout(onEnter, 620);
  };

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-[#050508] overflow-hidden select-none"
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
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

      {/* 点击进入按钮 (唯一入口) */}
      <div className="absolute inset-x-0 bottom-[14vh] flex justify-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <SpecularButton
            size="lg"
            radius={999}
            tint="#ffffff"
            tintOpacity={0.05}
            blur={8}
            textColor="rgba(255,255,255,0.9)"
            lineColor="#8fd0ff"
            baseColor="#2a4a6a"
            intensity={1.2}
            shineSize={12}
            shineFade={45}
            thickness={1.4}
            speed={0.4}
            followMouse
            proximity={300}
            onClick={handleEnter}
          >
            点击进入
          </SpecularButton>
        </motion.div>
      </div>
    </motion.div>
  );
}
