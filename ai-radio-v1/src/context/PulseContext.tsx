import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { useSyncExternalStore } from 'react';
import { usePulseAnalysis, type PulseBands, IDLE_BANDS } from '../hooks/usePulse';
import { BeatPulseRefProvider } from './BeatPulseContext';
import { IDLE_PULSE, type BeatPulseSnapshot, beatPulseToGlow, beatPulseToScale } from '../utils/beatPulse';

export type { PulseBands };

export interface PulseFocus {
  trackId: string | null;
  cover: string | null;
  label?: string;
  source: 'track';
}

interface PulseStore {
  subscribe: (cb: () => void) => () => void;
  getSnapshot: () => PulseBands;
  getFrameSnapshot: () => PulseBands;
}

interface PulseFocusContextValue {
  focus: PulseFocus;
}

const PulseFocusContext = createContext<PulseFocusContextValue | null>(null);
const PulseStoreContext = createContext<PulseStore | null>(null);

function createPulseStore(): PulseStore {
  let snapshot = IDLE_BANDS;
  let frameSnapshot = IDLE_BANDS;
  const listeners = new Set<() => void>();
  return {
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot() {
      return snapshot;
    },
    getFrameSnapshot() {
      return frameSnapshot;
    },
    /** @internal */
    publish(next: PulseBands) {
      snapshot = next;
      listeners.forEach(l => l());
    },
    /** @internal — 60fps beat/onset path */
    publishFrame(next: PulseBands) {
      frameSnapshot = next;
    },
  } as PulseStore & { publish: (next: PulseBands) => void; publishFrame: (next: PulseBands) => void };
}

interface Props {
  audioRef: RefObject<HTMLAudioElement | null>;
  analyserRef: RefObject<AnalyserNode | null>;
  beatAnalyserRef: RefObject<AnalyserNode | null>;
  isPlaying: boolean;
  isDemoPlayback: boolean;
  trackCover: string | null;
  trackId: string | null;
  trackLabel: string | null;
  children: ReactNode;
}

function BeatPulseDriver({ children }: { children: ReactNode }) {
  const store = useContext(PulseStoreContext);
  const pulseRef = useRef<BeatPulseSnapshot>(IDLE_PULSE);

  useEffect(() => {
    if (!store) return;
    let raf = 0;
    const tick = () => {
      const beat = store.getFrameSnapshot().beat;
      const weight = store.getFrameSnapshot().beatWeight;
      pulseRef.current = {
        kick: beat,
        flash: beatPulseToGlow(beat) * (0.55 + weight * 0.45),
        scale: beatPulseToScale(beat),
      };
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [store]);

  return <BeatPulseRefProvider value={pulseRef}>{children}</BeatPulseRefProvider>;
}

/** Cover focus follows the playing track only — not playlist scroll preview. */
export function PulseProvider({
  audioRef,
  analyserRef,
  beatAnalyserRef,
  isPlaying,
  isDemoPlayback,
  trackCover,
  trackId,
  trackLabel,
  children,
}: Props) {
  const storeRef = useRef<(PulseStore & { publish: (b: PulseBands) => void; publishFrame: (b: PulseBands) => void }) | null>(null);
  if (!storeRef.current) storeRef.current = createPulseStore() as PulseStore & { publish: (b: PulseBands) => void; publishFrame: (b: PulseBands) => void };

  usePulseAnalysis(
    audioRef,
    analyserRef,
    beatAnalyserRef,
    isPlaying,
    isDemoPlayback,
    storeRef.current.publish,
    storeRef.current.publishFrame,
  );

  const focus: PulseFocus = useMemo(() => ({
    trackId,
    cover: trackCover,
    label: trackLabel ?? undefined,
    source: 'track',
  }), [trackId, trackCover, trackLabel]);

  const focusValue = useMemo(() => ({ focus }), [focus]);

  return (
    <PulseStoreContext.Provider value={storeRef.current}>
      <PulseFocusContext.Provider value={focusValue}>
        <BeatPulseDriver>
          {children}
        </BeatPulseDriver>
      </PulseFocusContext.Provider>
    </PulseStoreContext.Provider>
  );
}

/** High-frequency bands — only re-renders subscribers (~12fps), not the whole tree. */
export function usePulseBands(): PulseBands {
  const store = useContext(PulseStoreContext);
  if (!store) return IDLE_BANDS;
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function usePulseFocus() {
  const ctx = useContext(PulseFocusContext);
  if (!ctx) throw new Error('usePulseFocus must be used within PulseProvider');
  return ctx;
}

/** @deprecated use usePulseFocus + usePulseBands */
export function usePulseContext() {
  const focus = usePulseFocus();
  const bands = usePulseBands();
  return { ...focus, bands };
}

const noopSubscribe = (_cb: () => void) => () => {};
const idleSnapshot = () => IDLE_BANDS;

export function usePulseOptional() {
  const focus = useContext(PulseFocusContext);
  const store = useContext(PulseStoreContext);
  const bands = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getSnapshot ?? idleSnapshot,
  );
  if (!focus) return null;
  return { ...focus, bands };
}
