import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  applyOrbitDrag,
  clampRadius,
  clearOrbitSpin,
  createOrbitSpin,
  createParticleCameraState,
  recenterCamera,
  tickParticleCamera,
  type ParticleCameraState,
} from '../components/background/coverParticle/camera';
import type { OrbitRotation } from './useSpatialOrbit';

function isTypingTarget(target: EventTarget | null) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

export function useParticleCamera(enabled = true) {
  const cameraRef = useRef<ParticleCameraState>(createParticleCameraState());
  const spinRef = useRef(createOrbitSpin());
  const keysRef = useRef({ w: false, a: false, s: false, d: false });
  const dragRef = useRef({
    active: false,
    pendingDx: 0,
    pendingDy: 0,
    lastT: 0,
  });
  const lastTick = useRef(0);
  const layerRef = useRef<HTMLDivElement>(null);
  const [parallax, setParallax] = useState<OrbitRotation>({ x: 0, y: 0 });

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const dt = lastTick.current ? Math.min(0.05, (now - lastTick.current) / 1000) : 0.016;
      lastTick.current = now;

      if (enabled) {
        const cam = cameraRef.current;
        const drag = dragRef.current;

        if (drag.active && (drag.pendingDx !== 0 || drag.pendingDy !== 0)) {
          const dragDt = drag.lastT
            ? Math.max(1 / 240, Math.min(0.08, (now - drag.lastT) / 1000))
            : dt;
          applyOrbitDrag(cam, spinRef.current, drag.pendingDx, drag.pendingDy, dragDt);
          drag.pendingDx = 0;
          drag.pendingDy = 0;
          drag.lastT = now;
        }

        tickParticleCamera(cam, dt, keysRef.current, spinRef.current, drag.active);
      }

      const c = cameraRef.current;
      setParallax({
        x: (c.phi - c.baselinePhi) * 55,
        y: (c.theta - c.baselineTheta) * 55,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (!enabled || isTypingTarget(e.target)) return;
      const code = e.code;
      if (code === 'KeyW') keysRef.current.w = down;
      else if (code === 'KeyA') keysRef.current.a = down;
      else if (code === 'KeyS') keysRef.current.s = down;
      else if (code === 'KeyD') keysRef.current.d = down;
      else return;
      e.preventDefault();
      if (down) clearOrbitSpin(spinRef.current);
      if (cameraRef.current.recentering) cameraRef.current.recentering = false;
    };

    const onKeyDown = (e: KeyboardEvent) => onKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => onKey(e, false);
    const onBlur = () => {
      keysRef.current = { w: false, a: false, s: false, d: false };
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [enabled]);

  useEffect(() => {
    const el = layerRef.current;
    if (!el || !enabled) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = cameraRef.current;
      cam.radius = clampRadius(cam.radius + e.deltaY * 0.005);
      clearOrbitSpin(spinRef.current);
      if (cam.recentering) cam.recentering = false;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [enabled]);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!enabled || e.button !== 0) return;
    e.preventDefault();
    recenterCamera(cameraRef.current, spinRef.current);
  }, [enabled]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled || e.button !== 0) return;
    cameraRef.current.recentering = false;
    const drag = dragRef.current;
    drag.active = true;
    drag.pendingDx = 0;
    drag.pendingDy = 0;
    drag.lastT = performance.now();
    clearOrbitSpin(spinRef.current);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [enabled]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    dragRef.current.pendingDx += e.movementX;
    dragRef.current.pendingDy += e.movementY;
  }, []);

  const endDrag = useCallback((e: React.PointerEvent) => {
    dragRef.current.active = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  return {
    cameraRef: cameraRef as RefObject<ParticleCameraState>,
    layerRef,
    parallax,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onDoubleClick,
    },
  };
}
