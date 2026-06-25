import { useState, useRef, useCallback, useEffect } from 'react';

export type PanelZone = 'left' | 'right' | 'bottom';

const HIDE_DELAY_MS = 1000;
const LEFT_EDGE = 40;
const RIGHT_EDGE = 40;
const BOTTOM_EDGE = 60;

export interface EdgePanelState {
  left: boolean;
  right: boolean;
  bottom: boolean;
}

export function useEdgePanels() {
  const [panels, setPanels] = useState<EdgePanelState>({ left: false, right: false, bottom: false });
  const timers = useRef<Partial<Record<PanelZone, ReturnType<typeof setTimeout>>>>({});
  const pinned = useRef<Record<PanelZone, boolean>>({ left: false, right: false, bottom: false });
  const visibleRef = useRef<EdgePanelState>({ left: false, right: false, bottom: false });

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

  // Start an independent countdown for this zone. If one is already running,
  // leave it alone so mouse movement never resets another panel's timer.
  const scheduleHide = useCallback((zone: PanelZone) => {
    if (pinned.current[zone]) return;
    if (!visibleRef.current[zone]) return;
    if (timers.current[zone]) return;
    timers.current[zone] = setTimeout(() => {
      timers.current[zone] = undefined;
      setVisible(zone, false);
    }, HIDE_DELAY_MS);
  }, [setVisible]);

  const pin = useCallback((zone: PanelZone) => {
    pinned.current[zone] = true;
    show(zone);
  }, [show]);

  const unpin = useCallback((zone: PanelZone) => {
    pinned.current[zone] = false;
    scheduleHide(zone);
  }, [scheduleHide]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      if (e.clientX < LEFT_EDGE) show('left');
      else if (!pinned.current.left) scheduleHide('left');

      if (e.clientX > w - RIGHT_EDGE) show('right');
      else if (!pinned.current.right) scheduleHide('right');

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

  return { panels, pin, unpin };
}
