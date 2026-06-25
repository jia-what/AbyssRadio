import { useEffect, useRef, useCallback } from 'react';

interface Props {
  onComplete: () => void;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; life: number; maxLife: number;
  alpha: number; hue: number; active: boolean;
}

export default function PortalAnimation({ onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startTimeRef = useRef(0);
  const rafRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const completedRef = useRef(false);

  const cx = 0, cy = 0; // normalized center, actual center computed per frame

  const spawnParticle = useCallback((pool: Particle[], x: number, y: number, vx: number, vy: number, size: number, life: number, hue: number) => {
    for (const p of pool) {
      if (!p.active) {
        p.x = x; p.y = y; p.vx = vx; p.vy = vy;
        p.size = size; p.life = life; p.maxLife = life;
        p.alpha = 1; p.hue = hue; p.active = true;
        return p;
      }
    }
    const p = { x, y, vx, vy, size, life, maxLife: life, alpha: 1, hue, active: true } as Particle;
    pool.push(p);
    return p;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W: number, H: number;
    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const pool: Particle[] = [];
    particlesRef.current = pool;

    startTimeRef.current = performance.now();

    // --- Logo geometry (normalized to 400x600 canvas) ---
    // Portal ellipse
    const portalCX = () => 200;
    const portalRX = 55, portalRY = 16;

    // V strokes
    const leftStroke = (cy: number) => ({ x1: 145, y1: 420, x2: 200, y2: 120 });
    const rightStroke = (cy: number) => ({ x1: 255, y1: 420, x2: 200, y2: 120 });

    // Crossbar
    const crossbarL = { x1: 145, y1: 320, x2: 190, y2: 320 };
    const crossbarR = { x1: 210, y1: 320, x2: 255, y2: 320 };

    interface CharState {
      x: number; y: number; ox: number; oy: number;
      char: string; scale: number; alpha: number; active: boolean;
    }

    const chars: CharState[] = 'ABYSS'.split('').map((c, i) => ({
      x: 0, y: 0, ox: 0, oy: 0,
      char: c, scale: 1, alpha: 1, active: true,
    }));

    const screenCX = () => W / 2;
    const screenCY = () => H / 2;
    const S = () => Math.min(W, H) / 600; // scale factor

    const toScreen = (x: number, y: number) => ({
      sx: screenCX() + (x - 200) * S(),
      sy: screenCY() + (y - 300) * S(),
    });

    let shakeX = 0, shakeY = 0;

    const draw = (now: number) => {
      if (!ctx) return;
      const elapsed = (now - startTimeRef.current) / 1000;
      const t = elapsed; // seconds

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      // Screen shake decays
      shakeX *= 0.85;
      shakeY *= 0.85;
      if (Math.abs(shakeX) < 0.01) shakeX = 0;
      if (Math.abs(shakeY) < 0.01) shakeY = 0;
      ctx.save();
      ctx.translate(shakeX, shakeY);

      const s = S();
      const scx = screenCX();
      const scy = screenCY();

      // ===== PHASE 0-2: Logo reveal (0-3.2s) =====
      if (t < 3.2) {
        // Portal ellipse rising
        const portalRiseT = Math.min(1, Math.max(0, (t - 0.0) / 1.0));
        const portalCy = 500 - portalRiseT * 80; // 500 → 420

        const riseT2 = Math.min(1, Math.max(0, (t - 1.0) / 0.8));
        const riseCy2Delay = 1.0;
        const riseT2full = Math.min(1, Math.max(0, (t - 1.8) / 0.4));
        const riseT3 = Math.min(1, Math.max(0, (t - 2.2) / 0.6));

        const currentPortalCY = 500 - Math.min(1, (t / 2.2)) * 200; // 500 → 300
        const portalOpacity = t < 2.2 ? 1 : Math.max(0, 1 - (t - 2.2) / 0.6);

        // Draw portal ellipse
        const px = scx, py = scy + (currentPortalCY - 300) * s;
        const prx = portalRX * s, pry = portalRY * s;

        if (portalOpacity > 0) {
          // Outer glow
          const glow = ctx.createRadialGradient(px, py, 0, px, py, prx * 2.5);
          glow.addColorStop(0, `rgba(59,130,246,${0.08 * portalOpacity})`);
          glow.addColorStop(1, 'rgba(59,130,246,0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.ellipse(px, py, prx * 2.5, pry * 2.5, 0, 0, Math.PI * 2);
          ctx.fill();

          // Edge
          const breathe = 0.7 + 0.3 * Math.sin(t * 3);
          ctx.strokeStyle = `rgba(59,130,246,${portalOpacity * breathe * 0.5})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(px, py, prx, pry, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        // V strokes drawing
        if (t > 1.0) {
          const drawT = Math.min(1, Math.max(0, (t - 1.0) / 0.8));

          // Left stroke: from bottom to top
          const leftLen = 300; // total line length
          const leftEnd = leftLen * drawT;

          const lx1 = scx + (145 - 200) * s;
          const ly1 = scy + (420 - 300) * s;
          const lx2 = scx + (200 - 200) * s;
          const ly2 = scy + (120 - 300) * s;

          const ldx = lx2 - lx1, ldy = ly2 - ly1;
          const ltotal = Math.sqrt(ldx*ldx + ldy*ldy);
          const lprog = leftEnd / ltotal;

          ctx.strokeStyle = `rgba(255,255,255,${0.85 * drawT})`;
          ctx.lineWidth = 10 * s;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(lx1, ly1);
          ctx.lineTo(lx1 + ldx * lprog, ly1 + ldy * lprog);
          ctx.stroke();

          // Right stroke
          const rx1 = scx + (255 - 200) * s;
          const ry1 = scy + (420 - 300) * s;
          const rx2 = scx + (200 - 200) * s;
          const ry2 = scy + (120 - 300) * s;

          const rdx = rx2 - rx1, rdy = ry2 - ry1;
          const rtotal = Math.sqrt(rdx*rdx + rdy*rdy);
          const rprog = leftEnd / rtotal;

          ctx.beginPath();
          ctx.moveTo(rx1, ry1);
          ctx.lineTo(rx1 + rdx * rprog, ry1 + rdy * rprog);
          ctx.stroke();

          // Crossbar drawing (from center outward)
          if (t > 1.8) {
            const barT = Math.min(1, Math.max(0, (t - 1.8) / 0.4));
            ctx.strokeStyle = `rgba(255,255,255,${0.7 * barT})`;
            ctx.lineWidth = 2 * s;
            ctx.lineCap = 'square';

            // Left half: from center (200) outward
            const barCX = scx;
            const barCY = scy + (320 - 300) * s;
            const barHalf = 22.5 * s; // half of 45px (145 to 190 or 210 to 255)

            ctx.beginPath();
            ctx.moveTo(barCX - 1 * s, barCY);
            ctx.lineTo(barCX - barHalf * barT, barCY);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(barCX + 1 * s, barCY);
            ctx.lineTo(barCX + barHalf * barT, barCY);
            ctx.stroke();
          }
        }
      }

      // ===== PHASE 3: Text reveal (2.8-3.2s) =====
      if (t > 2.8 && t < 3.5) {
        const textT = Math.min(1, Math.max(0, (t - 2.8) / 0.4));
        const textAlpha = textT;
        const textY = 20 * (1 - textT);

        ctx.save();
        ctx.globalAlpha = textAlpha;
        ctx.font = `${38 * s}px Helvetica, Arial, sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = `${0.3 * textT}em`;
        ctx.fillText('ABYSS', scx, scy + (180 - 300) * s + textY * s);
        ctx.restore();
      }

      // ===== PHASE 4: Stable glow (3.2-3.5s) =====
      if (t > 3.2 && t < 3.5) {
        const glowPulse = 0.8 + 0.2 * Math.sin(t * 4);
        ctx.save();
        ctx.globalAlpha = glowPulse;
        ctx.font = `${38 * s}px Helvetica, Arial, sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ABYSS', scx, scy + (180 - 300) * s);
        ctx.restore();
      }

      // ===== PHASE 5: Black hole + logo distortion (3.5-4.8s) =====
      if (t > 3.5 && t < 4.8) {
        const bhT = Math.min(1, Math.max(0, (t - 3.5) / 1.3));

        // Draw black hole
        const bhRadius = 10 + bhT * 60;

        // Outer accretion disk glow
        const diskGrad = ctx.createRadialGradient(scx, scy, 0, scx, scy, bhRadius * 3);
        diskGrad.addColorStop(0, `rgba(59,130,246,${0.15 * (1 - bhT)})`);
        diskGrad.addColorStop(0.3, `rgba(59,130,246,${0.08 * (1 - bhT)})`);
        diskGrad.addColorStop(0.6, `rgba(20,40,80,${0.1 * (1 - bhT)})`);
        diskGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = diskGrad;
        ctx.beginPath();
        ctx.arc(scx, scy, bhRadius * 3, 0, Math.PI * 2);
        ctx.fill();

        // Event horizon
        const horizon = ctx.createRadialGradient(scx, scy, 0, scx, scy, bhRadius);
        horizon.addColorStop(0, 'rgba(0,0,10,1)');
        horizon.addColorStop(0.6, 'rgba(10,10,30,1)');
        horizon.addColorStop(0.85, `rgba(30,50,80,${0.8 * (1 - bhT * 0.5)})`);
        horizon.addColorStop(1, 'rgba(59,130,246,0)');
        ctx.fillStyle = horizon;
        ctx.beginPath();
        ctx.arc(scx, scy, bhRadius, 0, Math.PI * 2);
        ctx.fill();

        // Suck-in effect: draw distorted logo fragments
        const suckAlpha = Math.max(0, 1 - bhT * 1.2);
        if (suckAlpha > 0 && bhT < 0.8) {
          ctx.save();
          ctx.globalAlpha = suckAlpha;

          // Distorted V strokes — bending toward center
          const bend = bhT * 60;
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 10 * s * (1 - bhT * 0.3);
          ctx.lineCap = 'round';

          // Left stroke bending
          ctx.beginPath();
          ctx.moveTo(scx + (145 - 200) * s, scy + (420 - 300) * s);
          ctx.quadraticCurveTo(
            scx + (160 - 200) * s - bend * 0.5,
            scy + (250 - 300) * s,
            scx - bhT * 30,
            scy - bhT * 20
          );
          ctx.stroke();

          // Right stroke bending
          ctx.beginPath();
          ctx.moveTo(scx + (255 - 200) * s, scy + (420 - 300) * s);
          ctx.quadraticCurveTo(
            scx + (240 - 200) * s + bend * 0.5,
            scy + (250 - 300) * s,
            scx + bhT * 30,
            scy - bhT * 20
          );
          ctx.stroke();

          // Crossbar fragments flying into black hole
          ctx.strokeStyle = `rgba(255,255,255,${0.5 * suckAlpha})`;
          ctx.lineWidth = 2 * s;

          if (bhT < 0.6) {
            const fragOut = bhT * 80;
            // Left fragment flies left and fades
            ctx.beginPath();
            ctx.moveTo(scx - 22.5 * s - fragOut * 0.3, scy + (320 - 300) * s - fragOut * 0.2);
            ctx.lineTo(scx - 5 * s - fragOut * 0.5, scy + (320 - 300) * s + fragOut * 0.1);
            ctx.stroke();

            // Right fragment flies right
            ctx.beginPath();
            ctx.moveTo(scx + 5 * s + fragOut * 0.5, scy + (320 - 300) * s + fragOut * 0.2);
            ctx.lineTo(scx + 22.5 * s + fragOut * 0.3, scy + (320 - 300) * s - fragOut * 0.1);
            ctx.stroke();
          }

          // Characters flying into hole
          ctx.font = `${32 * s}px Helvetica, Arial, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const textBaseY = scy + (180 - 300) * s;
          for (let i = 0; i < 5; i++) {
            const charX = scx + (i - 2) * 40 * s * (1 - bhT * 0.5);
            const charY = textBaseY + bhT * 60 * (2 - Math.abs(i - 2));
            const charAlpha = Math.max(0, 1 - bhT * 1.5 - i * 0.05);
            if (charAlpha > 0) {
              ctx.save();
              ctx.globalAlpha = charAlpha;
              ctx.fillStyle = '#fff';
              ctx.fillText('ABYSS'[i], charX, charY);
              ctx.restore();
            }
          }
          ctx.restore();
        }

        // Spawn particles being pulled in
        if (bhT > 0.3 && Math.random() < 0.3) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 30 + Math.random() * 100;
          const p = spawnParticle(pool,
            scx + Math.cos(angle) * dist,
            scy + Math.sin(angle) * dist,
            -Math.cos(angle) * (1 + Math.random()) * 50 * (0.5 + bhT),
            -Math.sin(angle) * (1 + Math.random()) * 50 * (0.5 + bhT),
            1 + Math.random() * 2,
            1 + Math.random() * 2,
            0.55 + Math.random() * 0.1
          );
          if (p) p.alpha = 0.3 + Math.random() * 0.4;
        }
      }

      // ===== PHASE 6: Collapse to point + explosion (4.5-5.0s) =====
      if (t > 4.5 && t < 5.0) {
        const colT = Math.min(1, Math.max(0, (t - 4.5) / 0.5));

        // Collapsing bright point
        const pointSize = Math.max(1, 30 * (1 - colT));
        const pointBrightness = 0.5 + colT * 0.5;

        // Outer flash
        const flashGrad = ctx.createRadialGradient(scx, scy, 0, scx, scy, pointSize * 5);
        flashGrad.addColorStop(0, `rgba(200,230,255,${pointBrightness})`);
        flashGrad.addColorStop(0.2, `rgba(150,200,255,${pointBrightness * 0.6})`);
        flashGrad.addColorStop(0.5, `rgba(59,130,246,${pointBrightness * 0.3})`);
        flashGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = flashGrad;
        ctx.beginPath();
        ctx.arc(scx, scy, pointSize * 5, 0, Math.PI * 2);
        ctx.fill();

        // Core white point
        ctx.fillStyle = `rgba(255,255,255,${pointBrightness})`;
        ctx.beginPath();
        ctx.arc(scx, scy, pointSize, 0, Math.PI * 2);
        ctx.fill();
      }

      // ===== PHASE 7: Explosion shockwave + particles burst (4.8-5.5s) =====
      if (t > 4.8 && t < 5.5) {
        const expT = Math.min(1, Math.max(0, (t - 4.8) / 0.7));

        // White shockwave ring
        const ringRadius = 20 + expT * Math.max(W, H) * 0.5;
        ctx.strokeStyle = `rgba(200,230,255,${0.4 * (1 - expT)})`;
        ctx.lineWidth = 3 * (1 - expT);
        ctx.beginPath();
        ctx.arc(scx, scy, ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Screen shake
        shakeX = (Math.random() - 0.5) * 3 * (1 - expT);
        shakeY = (Math.random() - 0.5) * 3 * (1 - expT);

        // Burst particles
        if (expT < 0.6 && Math.random() < 0.5) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 80 + Math.random() * 200;
          const p = spawnParticle(pool,
            scx, scy,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            1.5 + Math.random() * 3,
            1.5 + Math.random() * 3,
            0.55 + Math.random() * 0.15
          );
          if (p) p.alpha = 0.4 + Math.random() * 0.6;
        }
      }

      // ===== Update all particles =====
      const delta = 1 / 60;
      for (const p of pool) {
        if (!p.active) continue;
        p.life -= delta;
        if (p.life <= 0) { p.active = false; continue; }
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.alpha = Math.min(1, (p.life / p.maxLife) * p.alpha);
      }

      // Draw particles
      for (const p of pool) {
        if (!p.active) continue;
        const lifeRatio = p.life / p.maxLife;
        const alpha = p.alpha * lifeRatio;
        if (alpha < 0.01) continue;

        const r = 80 + 50 * p.hue;
        const g = 150 + 70 * (1 - p.hue + 0.3);
        const b = 220 + 35 * p.hue;

        // Glow
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5);
        grad.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.3})`);
        grad.addColorStop(0.5, `rgba(${r},${g},${b},${alpha * 0.08})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 5, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = `rgba(${r + 40},${g + 20},${b},${alpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore(); // undo shake

      // Completion check
      if (t >= 6.0 && !completedRef.current) {
        completedRef.current = true;
        setTimeout(() => onComplete(), 100);
      } else if (t < 6.0) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [onComplete, spawnParticle]);

  return (
    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-50" />
  );
}
