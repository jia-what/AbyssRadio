import { createContext, useContext, useCallback, useMemo, useState, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useSyncExternalStore } from 'react';
import { usePulseAnalysis, type PulseBands, IDLE_BANDS } from '../hooks/usePulse';

export type { PulseBands };

export interface PulseFocus {
  cover: string | null;
  label?: string;
  source: 'track' | 'stack';
}

interface PulseStore {
  subscribe: (cb: () => void) => () => void;
  getSnapshot: () => PulseBands;
}

interface PulseFocusContextValue {
  focus: PulseFocus;
  setStackFocus: (cover: string, label?: string) => void;
  clearStackFocus: () => void;
}

const PulseFocusContext = createContext<PulseFocusContextValue | null>(null);
const PulseStoreContext = createContext<PulseStore | null>(null);

function createPulseStore(): PulseStore {
  let snapshot = IDLE_BANDS;
  const listeners = new Set<() => void>();
  return {
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot() {
      return snapshot;
    },
    /** @internal */
    publish(next: PulseBands) {
      snapshot = next;
      listeners.forEach(l => l());
    },
  } as PulseStore & { publish: (next: PulseBands) => void };
}

interface Props {
  audioRef: RefObject<HTMLAudioElement | null>;
  analyserRef: RefObject<AnalyserNode | null>;
  isPlaying: boolean;
  isDemoPlayback: boolean;
  trackCover: string | null;
  trackLabel: string | null;
  children: ReactNode;
}

export function PulseProvider({
  audioRef,
  analyserRef,
  isPlaying,
  isDemoPlayback,
  trackCover,
  trackLabel,
  children,
}: Props) {
  const storeRef = useRef<(PulseStore & { publish: (b: PulseBands) => void }) | null>(null);
  if (!storeRef.current) storeRef.current = createPulseStore() as PulseStore & { publish: (b: PulseBands) => void };

  usePulseAnalysis(audioRef, analyserRef, isPlaying, isDemoPlayback, storeRef.current.publish);

  const [stackFocus, setStackFocusState] = useState<PulseFocus | null>(null);

  useEffect(() => {
    setStackFocusState(null);
  }, [trackCover]);

  const setStackFocus = useCallback((cover: string, label?: string) => {
    setStackFocusState(prev => {
      if (prev?.cover === cover && prev?.label === label) return prev;
      return { cover, label, source: 'stack' };
    });
  }, []);

  const clearStackFocus = useCallback(() => {
    setStackFocusState(null);
  }, []);

  const focus: PulseFocus = useMemo(() => {
    if (stackFocus) return stackFocus;
    return {
      cover: trackCover,
      label: trackLabel ?? undefined,
      source: 'track',
    };
  }, [stackFocus, trackCover, trackLabel]);

  const focusValue = useMemo(
    () => ({ focus, setStackFocus, clearStackFocus }),
    [focus, setStackFocus, clearStackFocus],
  );

  return (
    <PulseStoreContext.Provider value={storeRef.current}>
      <PulseFocusContext.Provider value={focusValue}>
        {children}
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
