export interface BeatPulseSnapshot {
  kick: number;
  flash: number;
  scale: number;
}

export const IDLE_PULSE: BeatPulseSnapshot = { kick: 0, flash: 0, scale: 1 };

export { beatPulseToGlow, beatPulseToScale } from './beatVisual';
