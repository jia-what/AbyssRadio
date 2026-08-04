import { useState } from 'react';
import { motion } from 'motion/react';
import MagicRings from './MagicRings';
import SpecularButton from '../ui/SpecularButton';
import ShinyText from '../ui/ShinyText';

/**
 * StandbyScreen — 动态待机画面 (默认入口)
 *
 * 进入流程:
 *   点击 → 立刻 onWarmMain（父级挂载主场景叠在底下）
 *        → 暂停声呐环 rAF（腾 GPU）
 *        → 淡出 620ms → onDismiss 卸待机
 */

export default function StandbyScreen({
  onWarmMain,
  onDismiss,
}: {
  onWarmMain: () => void;
  onDismiss: () => void;
}) {
  const [exiting, setExiting] = useState(false);

  const handleEnter = () => {
    if (exiting) return;
    setExiting(true);
    // 先停环，再隔两帧暖机主场景；按钮保持挂载随整页淡出（避免拆 WebGL 闪白）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        onWarmMain();
      });
    });
    setTimeout(onDismiss, 620);
  };

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-[#050508] overflow-hidden select-none"
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
    >
      {/* 循环声呐环背景 — 退出时暂停渲染，避免与主场景 WebGL 抢帧 */}
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
        paused={exiting}
      />

      {/* 中央字标组 + 按钮 (按钮在标题正下方) */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {/* 主标题 — 流光扫过；不用 filter:blur（合成层昂贵，开局易卡） */}
        <motion.div
          className="font-semibold"
          style={{
            fontSize: 'clamp(34px, 5.4vw, 64px)',
            letterSpacing: '0.3em',
            paddingLeft: '0.3em',
          }}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <ShinyText
            text="ABYSS RADIO"
            speed={3.2}
            delay={1}
            color="#8fa3b8"
            shineColor="#d7e8f5"
            spread={120}
            direction="left"
            yoyo={false}
            pauseOnHover={false}
            stops={[0.35, 0.5, 0.65]}
          />
        </motion.div>

        {/* 按钮 — 淡出期间保持挂载，避免 WebGL canvas 销毁闪白块 */}
        <motion.div
          className="mt-10 pointer-events-auto"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          style={{ pointerEvents: exiting ? 'none' : 'auto' }}
        >
          <SpecularButton
            className="standby-enter-btn"
            size="md"
            radius={999}
            tint="#ffffff"
            tintOpacity={0.05}
            blur={8}
            textColor="rgba(210, 230, 255, 0.88)"
            lineColor="#8fd0ff"
            baseColor="#2a4a6a"
            intensity={1.2}
            shineSize={12}
            shineFade={45}
            thickness={1.4}
            speed={0.4}
            followMouse
            proximity={300}
            paused={exiting}
            disabled={exiting}
            onClick={handleEnter}
          >
            点击进入
          </SpecularButton>
        </motion.div>
      </div>
    </motion.div>
  );
}
