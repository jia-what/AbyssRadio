import { useState, useRef, useCallback, useEffect } from 'react';

export type PanelZone = 'left' | 'right' | 'bottom';

const HIDE_DELAY_MS: Record<PanelZone, number> = {
  left: 1000,
  right: 1000,
  bottom: 1000,
};
const BOTTOM_EDGE = 60;
const LEFT_ZONE_WIDTH = 40;
/** Height above the bottom bar where right/left edge hover is suppressed —
 *  the bottom bar's own controls (quality button etc.) must not be covered
 *  by an edge panel popping open under the cursor. */
const EDGE_ZONE_SKIP_BOTTOM_PX = 150;
/** Once open, keep the playlist zone alive across the full panel width (not just the screen edge). */
export const RIGHT_ZONE_WIDTH = 420;

export interface EdgePanelState {
  left: boolean;
  right: boolean;
  bottom: boolean;
}

/**
 * Edge panels: AI / playlist open on edge hover.
 * Bottom player stays off until setBottomEnabled(true) after a real track starts.
 */
export function useEdgePanels() {
  const [panels, setPanels] = useState<EdgePanelState>({ left: false, right: false, bottom: false });
  const timers = useRef<Partial<Record<PanelZone, ReturnType<typeof setTimeout>>>>({});
  const pinned = useRef<Record<PanelZone, boolean>>({ left: false, right: false, bottom: false });
  const visibleRef = useRef<EdgePanelState>({ left: false, right: false, bottom: false });
  const bottomEnabledRef = useRef(false);

  const setVisible = useCallback((zone: PanelZone, value: boolean) => {
    visibleRef.current[zone] = value;
    setPanels(prev => (prev[zone] === value ? prev : { ...prev, [zone]: value }));
  }, []);

  const show = useCallback((zone: PanelZone) => {
    if (zone === 'bottom' && !bottomEnabledRef.current) return;
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
    if (zone === 'bottom' && !bottomEnabledRef.current) return;
    pinned.current[zone] = true;
    show(zone);
  }, [show]);

  const unpin = useCallback((zone: PanelZone) => {
    pinned.current[zone] = false;
    scheduleHide(zone);
  }, [scheduleHide]);

  const setBottomEnabled = useCallback((enabled: boolean) => {
    bottomEnabledRef.current = enabled;
    if (!enabled) {
      pinned.current.bottom = false;
      const t = timers.current.bottom;
      if (t) {
        clearTimeout(t);
        timers.current.bottom = undefined;
      }
      setVisible('bottom', false);
      return;
    }
    pinned.current.bottom = true;
    show('bottom');
  }, [setVisible, show]);

  const toggle = useCallback((zone: PanelZone) => {
    if (zone === 'bottom' && !bottomEnabledRef.current) return;
    if (visibleRef.current[zone] && pinned.current[zone]) {
      unpin(zone);
      if (zone === 'left' || zone === 'bottom') setVisible(zone, false);
      return;
    }
    pin(zone);
  }, [pin, unpin, setVisible]);

  // Edge hover: bottom bar on bottom edge; AI on left edge; playlist on right edge.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Bottom: only when playback UI is enabled
      if (bottomEnabledRef.current) {
        if (e.clientY > h - BOTTOM_EDGE) {
          show('bottom');
        } else if (!pinned.current.bottom) {
          scheduleHide('bottom');
        }
      }
      // Left: AI panel on left edge hover (not when pinned; skip near bottom bar)
      if (!pinned.current.left) {
        if (e.clientX <= LEFT_ZONE_WIDTH && e.clientY < h - EDGE_ZONE_SKIP_BOTTOM_PX) show('left');
        else scheduleHide('left');
      }
      // Right: playlist on right edge hover (wider zone; skip near bottom bar so
      // the bottom bar controls stay clickable — the panel must not pop under the cursor)
      if (!pinned.current.right) {
        if (e.clientX >= w - RIGHT_ZONE_WIDTH && e.clientY < h - EDGE_ZONE_SKIP_BOTTOM_PX) show('right');
        else scheduleHide('right');
      }
    };

    window.addEventListener('mousemove', onMove);
    const t = timers.current;
    return () => {
      window.removeEventListener('mousemove', onMove);
      Object.values(t).forEach(timer => timer && clearTimeout(timer));
    };
  }, [show, scheduleHide]);

  return { panels, pin, unpin, toggle, setBottomEnabled };
}
