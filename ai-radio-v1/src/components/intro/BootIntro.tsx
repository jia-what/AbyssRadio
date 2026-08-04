import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

/**
 * BootIntro — 开机动画「深渊电台」
 * 时间线（总长 ~2.6s）:
 *   0.0–1.1s   粒子从四周向中心汇聚, 中心光点渐亮
 *   0.3–1.6s   声波圆环依次脉冲扩散 (3 环)
 *   1.15–2.0s  ABYSS RADIO 字标逐字母浮现
 *   2.0–2.6s   副标浮现, 整体淡出 → onComplete
 *
 * 覆盖层方案: 主界面始终在底层渲染 (播放器/WebGL 提前就绪),
 * 本组件 fixed 全屏盖住, 结束后卸载, 无缝进主界面。
 */

const DURATION_MS = 2600;

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  seed: number;
}

export default function BootIntro({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<'rings' | 'title' | 'out'>('rings');
  const doneRef = useRef(false);

  // 主时间线
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('title'), 1150);
    const t2 = setTimeout(() => setPhase('out'), 2000);
    const t3 = setTimeout(() => {
      if (!doneRef.current) { doneRef.current = true; onComplete(); }
    }, DURATION_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  // 粒子 + 声波环 canvas 动画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let W = 0, H = 0, DPR = 1;
    const dpr = () => window.devicePixelRatio || 1;

    const resize = () => {
      W = canvas.clientWidth; H = canvas.clientHeight; DPR = dpr();
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const cx = () => W / 2, cy = () => H * 0.44;
    const ringColors = ['rgba(125,211,252,', 'rgba(165,180,252,', 'rgba(255,255,255,'];

    // 粒子: 从视口四周随机位置向中心汇聚 (含拖尾历史)
    const N = 130;
    const particles: (Particle & { px: number; py: number })[] = Array.from({ length: N }, () => {
      const side = Math.floor(Math.random() * 4);
      let x = 0, y = 0;
      const m = 0.08;
      if (side === 0) { x = Math.random(); y = -m; }
      else if (side === 1) { x = 1 + m; y = Math.random(); }
      else if (side === 2) { x = Math.random(); y = 1 + m; }
      else { x = -m; y = Math.random(); }
      const sx = x * W, sy = y * H;
      return { x: sx, y: sy, px: sx, py: sy, vx: 0, vy: 0, r: 1.1 + Math.random() * 1.7, seed: Math.random() };
    });
    // 迟到的微粒: 汇聚完成后仍螺旋落向核心 (叙事收尾)
    const lateDust: { x: number; y: number; px: number; py: number; r: number; a: number; delay: number; sp: number; ang: number }[] = Array.from({ length: 14 }, () => {
      const ang = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 130;
      return {
        x: cx() + Math.cos(ang) * dist, y: cy() + Math.sin(ang) * dist,
        px: 0, py: 0, r: 0.7 + Math.random() * 1.1, a: 0.55 + Math.random() * 0.4,
        delay: 1280 + Math.random() * 260, sp: 0.035 + Math.random() * 0.03, ang,
      };
    });

    // 声波环: {start, color}
    const rings: { start: number; color: string }[] = [
      { start: 350, color: ringColors[0] },
      { start: 650, color: ringColors[1] },
      { start: 950, color: ringColors[2] },
    ];

    const t0 = performance.now();
    const easeIn = (u: number) => 1 - Math.pow(1 - u, 3);

    const draw = (now: number) => {
      const t = now - t0;
      ctx.clearRect(0, 0, W, H);

      // —— 声波环 (0.3s–1.7s)
      for (const ring of rings) {
        const rt = (t - ring.start) / 1300; // 单环寿命 1.3s
        if (rt < 0 || rt > 1) continue;
        const radius = 24 + easeIn(rt) * Math.max(W, H) * 0.42;
        const alpha = (1 - rt) * 0.5;
        ctx.beginPath();
        ctx.arc(cx(), cy(), radius, 0, Math.PI * 2);
        ctx.strokeStyle = ring.color + alpha + ')';
        ctx.lineWidth = 1.2 * (1 - rt * 0.6);
        ctx.stroke();
      }

      // —— 粒子汇聚: additive 混合 + 向心拖尾 + 聚拢时收缩但保留星尘
      const pDone = Math.min(1, t / 1350);
      const pEase = 1 - Math.pow(1 - pDone, 1.6); // 接近线性, 中段粒子持续在飞
      const pFade = pDone > 0.82 ? Math.max(0, 1 - (pDone - 0.82) / 0.18) : 1;
      ctx.globalCompositeOperation = 'lighter';
      for (const p of particles) {
        const tx = cx() + (p.seed - 0.5) * 30;
        const ty = cy() + (p.seed - 0.5) * 30;
        const nx = p.x + (tx - p.x) * pEase;
        const ny = p.y + (ty - p.y) * pEase;
        const appear = Math.min(1, pDone * 2.2); // 前段渐显
        const alpha = appear * 0.8 * pFade;
        if (alpha <= 0.01) continue;
        // 粒子到达中心时缩到 ~40% (保留可见星尘, 不糊成实心)
        const shrink = 1 - pEase * 0.6;
        const r = Math.max(0.5, p.r * shrink);
        // 拖尾: 从上一帧位置到当前位置
        ctx.strokeStyle = `rgba(150,205,255,${(alpha * 0.4).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.6, r * 0.7);
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        // 粒子头
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(205,235,255,${alpha.toFixed(3)})`;
        ctx.fill();
        // 记忆上一帧位置 (拖尾)
        p.px = nx; p.py = ny;
      }
      ctx.globalCompositeOperation = 'source-over';

      // —— 迟到的微粒: 螺旋落向核心 (1.28s 起, 汇聚叙事收尾)
      ctx.globalCompositeOperation = 'lighter';
      for (const d of lateDust) {
        const dt = t - d.delay;
        if (dt < 0) continue;
        const prog = Math.min(1, dt * d.sp);
        if (prog >= 1) continue;
        const fall = easeIn(prog);
        // 螺旋: 角度随下落旋转
        const ang = d.ang + fall * 3.2;
        const dist = (1 - fall) * 130;
        const nx = cx() + Math.cos(ang) * dist;
        const ny = cy() + Math.sin(ang) * dist * 0.9;
        const da = d.a * (1 - fall) * Math.min(1, dt / 60);
        ctx.beginPath();
        ctx.arc(nx, ny, d.r * (1 - fall * 0.6), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(210,238,255,${da.toFixed(3)})`;
        ctx.fill();
        // 短拖尾
        ctx.strokeStyle = `rgba(170,215,255,${(da * 0.5).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.4, d.r * 0.5);
        ctx.beginPath();
        ctx.moveTo(d.px || nx, d.py || ny);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        d.px = nx; d.py = ny;
      }
      ctx.globalCompositeOperation = 'source-over';

      // —— 汇聚完成脉冲: 1.3s 时核心向外荡一圈涟漪
      const pulseT = (t - 1320) / 500;
      if (pulseT > 0 && pulseT < 1) {
        const pr = 20 + easeIn(pulseT) * 95;
        const pa = (1 - pulseT) * 0.3;
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath();
        ctx.arc(cx(), cy(), pr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(150,215,255,${pa.toFixed(3)})`;
        ctx.lineWidth = 1.4 * (1 - pulseT);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }

      // —— 中心光点: 三层光晕 (亮核 + 内辉 + 外 halo), 1.1s 渐亮, 2.0s 收敛
      const glowT = (t - 1100) / 600;
      const glowFade = t > 2000 ? Math.max(0, 1 - (t - 2000) / 600) : 1;
      if (glowT > 0) {
        const ga = Math.min(1, glowT) * glowFade;
        ctx.globalCompositeOperation = 'lighter';
        // 外 halo (青蓝, 大)
        let gr = ctx.createRadialGradient(cx(), cy(), 0, cx(), cy(), 130);
        gr.addColorStop(0, `rgba(90,170,255,${(ga * 0.25).toFixed(3)})`);
        gr.addColorStop(1, 'rgba(90,170,255,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(cx(), cy(), 130, 0, Math.PI * 2); ctx.fill();
        // 内辉 (亮青, 中)
        gr = ctx.createRadialGradient(cx(), cy(), 0, cx(), cy(), 52);
        gr.addColorStop(0, `rgba(150,215,255,${(ga * 0.6).toFixed(3)})`);
        gr.addColorStop(1, 'rgba(150,215,255,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(cx(), cy(), 52, 0, Math.PI * 2); ctx.fill();
        // 亮核 (白青, 小)
        gr = ctx.createRadialGradient(cx(), cy(), 0, cx(), cy(), 14);
        gr.addColorStop(0, `rgba(235,248,255,${(ga * 0.95).toFixed(3)})`);
        gr.addColorStop(1, 'rgba(235,248,255,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(cx(), cy(), 14, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const title = 'ABYSS RADIO';

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-[#050508] flex items-center justify-center overflow-hidden select-none"
      initial={{ opacity: 1 }}
      animate={{ opacity: phase === 'out' ? 0 : 1 }}
      transition={{ duration: 0.55, ease: 'easeInOut' }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* 字标 — 逐字母浮现 (空格单独占宽, 避免词距被字距吞掉) */}
      <div className="relative flex flex-col items-center gap-5" style={{ marginTop: '10vh' }}>
        <div className="flex overflow-hidden items-baseline">
          {title.split('').map((ch, i) => (
            ch === ' ' ? (
              <span key={i} style={{ width: '0.5em' }} aria-hidden="true" />
            ) : (
            <motion.span
              key={i}
              className="text-white/95 font-semibold"
              style={{
                fontSize: 'clamp(28px, 4.6vw, 52px)',
                letterSpacing: '0.22em',
                textShadow: '0 0 42px rgba(125,211,252,0.28)',
                marginRight: i === title.length - 1 ? '-0.22em' : 0,
              }}
              initial={{ opacity: 0, y: 26, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ delay: 1.15 + i * 0.055, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            >
              {ch}
            </motion.span>
            )
          ))}
        </div>

        {/* 副标 */}
        <motion.div
          className="text-white/45 text-[clamp(10px,1.2vw,13px)] tracking-[0.55em] pl-[0.55em]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.85, duration: 0.5 }}
        >
          DEEP SIGNAL
        </motion.div>
      </div>

      {/* 底部状态点 */}
      <div className="absolute bottom-14 flex gap-2">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-[6px] h-[6px] rounded-full bg-white/80"
            animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
            transition={{ duration: 1.05, repeat: Infinity, delay: i * 0.14, ease: 'easeInOut' }}
          />
        ))}
      </div>
    </motion.div>
  );
}
