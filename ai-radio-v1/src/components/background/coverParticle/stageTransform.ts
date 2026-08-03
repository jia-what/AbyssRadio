import { orbitEye, updateViewFromOrbit, type ParticleCameraState } from './camera';
import { createMat4 } from './mat4';

export const STAGE_FOV = 42;

/** Cover particles sit on z=0; lyrics on a parallel plane shifted toward the camera. */
export const LYRIC_ANCHOR = { x: 0, y: 0.06, z: 1.05 };

/** World→CSS scale uses baseline orbit radius so zoom does not pull lyrics into the cover. */
const WORLD_PX_BASE_RADIUS = 6.6;

export interface LyricWorldTransform {
  perspective: number;
  sceneMatrix: string;
  planeTransform: string;
  opacity: number;
}

function perspectivePx(viewportH: number) {
  return Math.max(
    680,
    Math.min(2400, Math.round(viewportH / (2 * Math.tan((STAGE_FOV * Math.PI) / 360)))),
  );
}

/** Inverse view rotation as CSS matrix3d (transpose of view 3×3). */
function inverseViewMatrix3d(view: Float32Array): string {
  const m = [
    view[0], view[4], view[8], 0,
    view[1], view[5], view[9], 0,
    view[2], view[6], view[10], 0,
    0, 0, 0, 1,
  ];
  return `matrix3d(${m.map((v) => v.toFixed(6)).join(',')})`;
}

/**
 * Mineradio particle-follow path: lyrics live on the cover plane, rotate with the
 * album as the orbit camera moves (not screen-locked billboard).
 */
export function computeLyricWorldTransform(
  cam: ParticleCameraState,
  viewportH: number,
  dimmed = false,
): LyricWorldTransform {
  const view = createMat4();
  updateViewFromOrbit(view, cam);

  const persp = perspectivePx(viewportH);
  const worldPx = persp / WORLD_PX_BASE_RADIUS;

  const eye = orbitEye(cam);
  const behind = eye[2] < 0;
  const flip = behind ? 'scaleX(-1) ' : '';

  const planeTransform = [
    flip,
    `translate3d(${LYRIC_ANCHOR.x * worldPx}px, ${-LYRIC_ANCHOR.y * worldPx}px, ${LYRIC_ANCHOR.z * worldPx}px)`,
  ].join('');

  return {
    perspective: persp,
    sceneMatrix: inverseViewMatrix3d(view),
    planeTransform,
    opacity: dimmed ? 0.42 : 1,
  };
}

