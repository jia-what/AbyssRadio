import { lookAt, type Mat4 } from './mat4';

export interface ParticleCameraState {
  theta: number;
  phi: number;
  radius: number;
  baselineTheta: number;
  baselinePhi: number;
  baselineRadius: number;
  recentering: boolean;
}

export interface CameraKeys {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
}

export const CAMERA_LIMITS = {
  minPhi: -1.12,
  maxPhi: 1.12,
  minRadius: 2.4,
  maxRadius: 14,
};

/** Pointer drag inertia — aligned with Mineradio particleSpin feel. */
export const ORBIT_SPIN = {
  pointerYaw: 0.0034,
  pointerPitch: 0.0032,
  velocityGain: 0.46,
  damping: 0.90,
  maxRadPerSec: 3.2,
  stopThreshold: 0.008,
};

export interface OrbitSpin {
  theta: number;
  phi: number;
}

export function createOrbitSpin(): OrbitSpin {
  return { theta: 0, phi: 0 };
}

export function clampSpinVelocity(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-ORBIT_SPIN.maxRadPerSec, Math.min(ORBIT_SPIN.maxRadPerSec, v));
}

export function clearOrbitSpin(spin: OrbitSpin) {
  spin.theta = 0;
  spin.phi = 0;
}

export function createParticleCameraState(): ParticleCameraState {
  return {
    theta: 0,
    phi: 0.08,
    radius: 6.2,
    baselineTheta: 0,
    baselinePhi: 0.08,
    baselineRadius: 6.2,
    recentering: false,
  };
}

export function clampPhi(phi: number) {
  return Math.max(CAMERA_LIMITS.minPhi, Math.min(CAMERA_LIMITS.maxPhi, phi));
}

export function clampRadius(radius: number) {
  return Math.max(CAMERA_LIMITS.minRadius, Math.min(CAMERA_LIMITS.maxRadius, radius));
}

export function recenterCamera(state: ParticleCameraState, spin?: OrbitSpin) {
  state.recentering = true;
  if (spin) clearOrbitSpin(spin);
}

/** Apply pointer drag delta; records release velocity for inertia. */
export function applyOrbitDrag(
  state: ParticleCameraState,
  spin: OrbitSpin,
  dx: number,
  dy: number,
  dt: number,
) {
  const dTheta = dx * ORBIT_SPIN.pointerYaw;
  const dPhi = dy * ORBIT_SPIN.pointerPitch;
  state.theta += dTheta;
  state.phi = clampPhi(state.phi + dPhi);
  const safeDt = Math.max(1 / 240, dt);
  spin.theta = clampSpinVelocity((dTheta / safeDt) * ORBIT_SPIN.velocityGain);
  spin.phi = clampSpinVelocity((dPhi / safeDt) * ORBIT_SPIN.velocityGain);
  if (state.recentering) state.recentering = false;
}

/** Coast after pointer release — exponential damping per Mineradio tickGestureRotation. */
export function tickOrbitSpin(state: ParticleCameraState, spin: OrbitSpin, dt: number) {
  if (Math.abs(spin.theta) > 0.0001 || Math.abs(spin.phi) > 0.0001) {
    state.theta += spin.theta * dt;
    state.phi = clampPhi(state.phi + spin.phi * dt);
  }
  const damp = Math.pow(ORBIT_SPIN.damping, dt * 60);
  spin.theta *= damp;
  spin.phi *= damp;
  if (Math.abs(spin.theta) < ORBIT_SPIN.stopThreshold) spin.theta = 0;
  if (Math.abs(spin.phi) < ORBIT_SPIN.stopThreshold) spin.phi = 0;
}

export function tickParticleCamera(
  state: ParticleCameraState,
  dt: number,
  keys: CameraKeys,
  spin?: OrbitSpin,
  dragging = false,
) {
  if (state.recentering && !dragging) {
    const ease = 0.04;
    state.theta += (state.baselineTheta - state.theta) * ease;
    state.phi += (state.baselinePhi - state.phi) * ease;
    state.radius += (state.baselineRadius - state.radius) * ease;
    if (
      Math.abs(state.theta - state.baselineTheta) < 0.005
      && Math.abs(state.phi - state.baselinePhi) < 0.005
      && Math.abs(state.radius - state.baselineRadius) < 0.05
    ) {
      state.theta = state.baselineTheta;
      state.phi = state.baselinePhi;
      state.radius = state.baselineRadius;
      state.recentering = false;
      if (spin) clearOrbitSpin(spin);
    }
    return;
  }

  if (!dragging && spin) tickOrbitSpin(state, spin, dt);

  const yawSpeed = 1.15;
  const pitchSpeed = 1.0;
  if (keys.a) state.theta -= yawSpeed * dt;
  if (keys.d) state.theta += yawSpeed * dt;
  if (keys.w) state.phi += pitchSpeed * dt;
  if (keys.s) state.phi -= pitchSpeed * dt;
  state.phi = clampPhi(state.phi);
}

export function orbitEye(
  state: Pick<ParticleCameraState, 'theta' | 'phi' | 'radius'>,
  lookAtPt: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const cy = Math.cos(state.phi);
  const sy = Math.sin(state.phi);
  const ct = Math.cos(state.theta);
  const st = Math.sin(state.theta);
  return [
    lookAtPt[0] + state.radius * cy * st,
    lookAtPt[1] + state.radius * sy,
    lookAtPt[2] + state.radius * cy * ct,
  ];
}

export function updateViewFromOrbit(
  view: Mat4,
  state: ParticleCameraState,
  lookAtPt: [number, number, number] = [0, 0, 0],
) {
  lookAt(view, orbitEye(state, lookAtPt), lookAtPt, [0, 1, 0]);
}
