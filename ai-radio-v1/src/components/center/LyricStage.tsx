import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { computeLyricWorldTransform } from '../background/coverParticle/stageTransform';
import type { ParticleCameraState } from '../background/coverParticle/camera';
import { useBeatPulseRef } from '../../context/BeatPulseContext';
import { usePulseFocus } from '../../context/PulseContext';
import { coverUrl, isImageUrl } from '../../utils/img';
import {
  DEFAULT_COVER_PALETTE,
  loadCoverPalette,
  parseRgba,
} from '../../utils/coverPalette';
import { beatPulseToGlow } from '../../utils/beatVisual';

interface Props {
  cameraRef: RefObject<ParticleCameraState>;
  dimmed?: boolean;
  children: ReactNode;
}

/**
 * Lyrics on a separate Z plane from the cover particles — same world rotation,
 * no smooth camera tracking lag.
 */
export default function LyricStage({ cameraRef, dimmed, children }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const beatGlowRef = useRef(0);
  const pulseRef = useBeatPulseRef();
  const { focus } = usePulseFocus();
  const tintRef = useRef<[number, number, number]>([143, 233, 255]);
  const tokenRef = useRef(0);

  useEffect(() => {
    const raw = focus.cover && isImageUrl(focus.cover) ? coverUrl(focus.cover) : '';
    if (!raw) {
      const [r, g, b] = parseRgba(DEFAULT_COVER_PALETTE.accent);
      tintRef.current = [r, g, b];
      return;
    }
    const token = ++tokenRef.current;
    loadCoverPalette(raw).then((p) => {
      if (token !== tokenRef.current) return;
      const [r, g, b] = parseRgba(p.accent);
      tintRef.current = [r, g, b];
    });
  }, [focus.cover]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const cam = cameraRef.current;
      const root = rootRef.current;
      const scene = sceneRef.current;
      const plane = planeRef.current;
      const glow = glowRef.current;
      if (cam && root && scene && plane) {
        const t = computeLyricWorldTransform(cam, window.innerHeight, dimmed);
        root.style.perspective = `${t.perspective}px`;
        scene.style.transform = t.sceneMatrix;
        plane.style.transform = `translate(-50%, -50%) ${t.planeTransform}`;
        root.style.opacity = `${t.opacity}`;
        root.style.filter = dimmed ? 'blur(2px)' : 'none';

        if (glow) {
          const beatPulse = pulseRef.current.kick;
          const beatGlowRaw = beatPulseToGlow(beatPulse);
          const bg = beatGlowRef.current;
          beatGlowRef.current = bg + (beatGlowRaw - bg) * (beatGlowRaw > bg ? 0.32 : 0.1);

          const [r, g, b] = tintRef.current;
          const scale = pulseRef.current.scale;
          glow.style.transform = `translateZ(4px) scale(${scale})`;
          glow.style.filter = [
            `drop-shadow(0 0 ${10 + beatGlowRef.current * 18}px rgba(${r},${g},${b},${0.1 + beatGlowRef.current * 0.28}))`,
            `drop-shadow(0 3px 16px rgba(96,165,250,${0.07 + beatGlowRef.current * 0.08}))`,
          ].join(' ');
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cameraRef, dimmed, pulseRef]);

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 pointer-events-none z-[5] overflow-hidden"
      style={{ perspective: 1200, perspectiveOrigin: '50% 50%' }}
    >
      <div
        ref={sceneRef}
        className="absolute inset-0"
        style={{ transformStyle: 'preserve-3d', transformOrigin: '50% 50%' }}
      >
        <div
          ref={planeRef}
          className="absolute left-1/2 top-1/2 w-full max-w-4xl px-8 md:px-16"
          style={{ transformStyle: 'preserve-3d' }}
        >
          <div
            ref={glowRef}
            className="relative"
            style={{
              transformStyle: 'preserve-3d',
              transform: 'translateZ(4px)',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
