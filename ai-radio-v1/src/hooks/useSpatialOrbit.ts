import { useCallback, useEffect, useRef, useState } from 'react';

export interface OrbitRotation {
  x: number;
  y: number;
}

const SENSITIVITY = 0.32;
const DAMPING = 0.9;
const MAX_X = 85;
const MAX_Y = 95;

export function useSpatialOrbit(enabled = true) {
  const [rotation, setRotation] = useState<OrbitRotation>({ x: 0, y: 0 });
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const raf = useRef(0);

  const clamp = useCallback((r: OrbitRotation): OrbitRotation => ({
    x: Math.max(-MAX_X, Math.min(MAX_X, r.x)),
    y: Math.max(-MAX_Y, Math.min(MAX_Y, r.y)),
  }), []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled || e.button !== 0) return;
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    velocity.current = { x: 0, y: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [enabled]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    velocity.current = { x: dy * SENSITIVITY, y: dx * SENSITIVITY };
    setRotation(prev => clamp({
      x: prev.x - dy * SENSITIVITY,
      y: prev.y + dx * SENSITIVITY,
    }));
  }, [clamp]);

  const endDrag = useCallback(() => {
    dragging.current = false;
  }, []);

  useEffect(() => {
    const tick = () => {
      if (!dragging.current) {
        const vx = velocity.current.x;
        const vy = velocity.current.y;
        if (Math.abs(vx) > 0.02 || Math.abs(vy) > 0.02) {
          velocity.current.x *= DAMPING;
          velocity.current.y *= DAMPING;
          setRotation(prev => clamp({
            x: prev.x - velocity.current.x,
            y: prev.y + velocity.current.y,
          }));
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [clamp]);

  const reset = useCallback(() => setRotation({ x: 0, y: 0 }), []);

  return {
    rotation,
    reset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
