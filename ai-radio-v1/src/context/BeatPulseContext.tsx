import { createContext, useContext, type RefObject } from 'react';
import type { BeatPulseSnapshot } from '../utils/beatPulse';

const BeatPulseRefContext = createContext<RefObject<BeatPulseSnapshot> | null>(null);

export const BeatPulseRefProvider = BeatPulseRefContext.Provider;

export function useBeatPulseRef() {
  const ref = useContext(BeatPulseRefContext);
  if (!ref) throw new Error('useBeatPulseRef must be used within PulseProvider');
  return ref;
}
