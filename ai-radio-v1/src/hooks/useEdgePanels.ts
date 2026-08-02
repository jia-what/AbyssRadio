import { useState, useRef, useCallback, useEffect } from 'react';

export type PanelZone = 'left' | 'right' | 'bottom';

const HIDE_DELAY_MS: Record<PanelZone, number> = {
  left: 1000,
  right: 0,
  bottom: 1000,
};
const BOTTOM_EDGE = 60;
/** Once open, keep the playlist zone alive across the full panel width (not just the screen edge). */
export const RIGHT_ZONE_WIDTH = 420;

export interface EdgePanelState {
  left: boolean;
  right: boolean;
  bottom: boolean;
}

/**
 * Edge panels: bottom player defaults visible; AI / playlist open via pin/toggle
 * (not auto hover — product convergence: only the play bar is ambient).
 */
export function useEdgePanels() {
  const [panels, setPanels] = useState<EdgePanelState>({ left: false, right: false, bottom: true });
  const timers = useRef<Partial<Record<PanelZone, ReturnType<typeof setTimeout>>>>({});
  const pinned = useRef<Record<PanelZone, boolean>>({ left: false, right: false, bottom: true });
  const visibleRef = useRef<EdgePanelState>({ left: false, right: false, bottom: true });

  const setVisible = useCallback((zone: PanelZone, value: boolean) => {
    visibleRef.current[zone] = value;
    setPanels(prev => (prev[zone] === value ? prev : { ...prev, [zone]: value }));
  }, []);

  const show = useCallback((zone: PanelZone) => {
    const t = timers.current[zone];
    if (t) {
      clearTimeout(t);
      timers.current[zone] = undefined;
    }
    setVisible(zone, true);
  }, [setVisible]);

  const scheduleHide = useCallback((zone: PanelZone) => {
    if (pinned.current[zone]) return;
    if (!visibleRef.current[zone]) return;
    if (timers.current[zone]) return;
    const delay = HIDE_DELAY_MS[zone];
    if (delay <= 0) {
      setVisible(zone, false);
      return;
    }
    timers.current[zone] = setTimeout(() => {
      timers.current[zone] = undefined;
      setVisible(zone, false);
    }, delay);
  }, [setVisible]);

  const pin = useCallback((zone: PanelZone) => {
    pinned.current[zone] = true;
    show(zone);
  }, [show]);

  const unpin = useCallback((zone: PanelZone) => {
    pinned.current[zone] = false;
    if (zone === 'right') {
      setVisible('right', false);
      return;
    }
    scheduleHide(zone);
  }, [scheduleHide, setVisible]);

  const toggle = useCallback((zone: PanelZone) => {
    if (visibleRef.current[zone] && pinned.current[zone]) {
      unpin(zone);
      if (zone === 'left' || zone === 'bottom') setVisible(zone, false);
      return;
    }
    pin(zone);
  }, [pin, unpin, setVisible]);

  // Bottom bar: keep ambient via edge hover when unpinned; left/right are button-driven only.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const h = window.innerHeight;
      if (e.clientY > h - BOTTOM_EDGE) show('bottom');
      else if (!pinned.current.bottom) scheduleHide('bottom');
    };

    window.addEventListener('mousemove', onMove);
    const t = timers.current;
    return () => {
      window.removeEventListener('mousemove', onMove);
      Object.values(t).forEach(timer => timer && clearTimeout(timer));
    };
  }, [show, scheduleHide]);

  return { panels, pin, unpin, toggle };
}
