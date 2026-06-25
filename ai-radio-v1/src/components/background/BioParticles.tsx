import { useRef, useEffect } from 'react';

export default function BioParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // 极少量深层粒子 — 几乎不可见，仅提供深度感
    const count = 20;
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        size: 2 + Math.random() * 6,
        speedX: (Math.random() - 0.5) * 0.08,
        speedY: (Math.random() - 0.5) * 0.08,
        opacity: 0.02 + Math.random() * 0.06,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const draw = (timestamp: number) => {
      time = timestamp;
      if (!ctx || !canvas) return;

      // 极其缓慢流动 — 营造体积感而非视觉元素
      for (const p of particles) {
        p.x += p.speedX + Math.sin(time * 0.0001 + p.phase) * 0.03;
        p.y += p.speedY + Math.cos(time * 0.00015 + p.phase * 0.7) * 0.03;

        if (p.x < -20) p.x = canvas.width + 20;
        if (p.x > canvas.width + 20) p.x = -20;
        if (p.y < -20) p.y = canvas.height + 20;
        if (p.y > canvas.height + 20) p.y = -20;

        const breathe = 0.5 + 0.5 * Math.sin(time * 0.0003 + p.phase);
        const alpha = p.opacity * (0.5 + 0.5 * breathe);

        const glowSize = p.size * 8;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowSize);
        grad.addColorStop(0, `rgba(100, 160, 240, ${alpha * 0.08})`);
        grad.addColorStop(1, `rgba(100, 160, 240, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowSize, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
    />
  );
}
