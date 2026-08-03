/**
 * Lyrics as a WebGL textured quad on the cover plane.
 *
 * Mineradio default path (ported):
 * - font locked at 128px (no shrink-to-fit for normal lines)
 * - canvas width grows with text (2048…6144)
 * - plane world width = 6.10 × clamp(canvasW/2048, 1, 3)
 * → glyph world height stays ~0.381 for every line (short and long look the same size)
 */

export interface LyricRowData {
  text: string;
  /** 0..1 karaoke fill progress for the active row */
  progress: number;
  isActive: boolean;
  /** translation line shown under the active row */
  translation?: string;
  hasTranslationData?: boolean;
}

/** @deprecated Billboard lock distance — lyrics now attach to cover plane. */
export const LYRICS_LOCK_DISTANCE = 4.85;

/** Mineradio `stableStageLyricRowMaskLayout` / `lyricRowLogicalWorldWidth` */
export const LYRIC_BASE_CANVAS_W = 2048;
export const LYRIC_MAX_CANVAS_W = 6144;
export const LYRIC_FONT_PX = 128;
export const LYRIC_TRANS_FONT_PX = 64;
export const LYRIC_PLANE_BASE_W = 6.10;
/** Single-line / dual-line canvas heights (Mineradio-ish). */
export const LYRIC_CANVAS_H_SINGLE = 384;
export const LYRIC_CANVAS_H_DUAL = 560;
/** Mineradio lyric group.scale */
export const LYRIC_GROUP_SCALE = 0.96;
/** Slightly in front of cover particles (z=0); Mineradio group ≈ 1.46. */
export const LYRIC_COVER_ANCHOR = { x: 0, y: 0, z: 1.2 };

/**
 * Mineradio default `lyricMotionStyle: 'float'` micro-motion
 * (14-stage-lyrics-rendering.js tickMesh + 08-lyrics-display-modes.js).
 */
export const LYRIC_MOTION = {
  floatAmp: 1.45,
  breatheA: { freq: 0.92, amp: 0.050 },
  breatheB: { freq: 0.41, amp: 0.028 },
  rollFreq: 0.34,
  rollAmp: 0.026,
  bassScale: 0.038,
  beatScale: 0.014,
  floatY: { freqA: 0.55, ampA: 0.046, freqB: 1.35, ampB: 0.012 },
  floatZ: { freq: 0.48, amp: 0.070 },
  /** Stable phase seed for single-line mesh (multi-row would vary per line). */
  seed: 1.7,
} as const;

export interface LyricMotionSample {
  scaleMul: number;
  rollZ: number;
  offsetY: number;
  offsetZ: number;
}

/** Per-frame idle breathe + Z-roll + light Y/Z float (works while paused too). */
export function sampleLyricMotion(
  tSec: number,
  bass = 0,
  beatPulse = 0,
  seed = LYRIC_MOTION.seed,
): LyricMotionSample {
  const m = LYRIC_MOTION;
  const breathe =
    (Math.sin(tSec * m.breatheA.freq + seed) * m.breatheA.amp
      + Math.sin(tSec * m.breatheB.freq + seed * 0.7) * m.breatheB.amp)
    * m.floatAmp;
  const scaleMul = 1 + breathe + bass * m.bassScale + beatPulse * m.beatScale;
  const rollZ = Math.sin(tSec * m.rollFreq + seed) * m.rollAmp;
  const offsetY =
    Math.sin(tSec * m.floatY.freqA + seed) * m.floatY.ampA
    + Math.sin(tSec * m.floatY.freqB + seed) * m.floatY.ampB;
  const offsetZ = Math.cos(tSec * m.floatZ.freq + seed) * m.floatZ.amp;
  return { scaleMul, rollZ, offsetY, offsetZ };
}

/** @deprecated Prefer planeWorldW/H from layout — kept for import compatibility. */
export const LYRICS_QUAD_SCALE = LYRIC_PLANE_BASE_W * LYRIC_GROUP_SCALE;

export interface LyricMeshResources {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: WebGLTexture;
  width: number;
  height: number;
  /** World size of the lyric plane after last draw (Mineradio grow-with-text). */
  planeWorldW: number;
  planeWorldH: number;
  lastDrawnProgress: number;
  lastDrawnKey: string;
  dirty: boolean;
}

const FONT_STACK = '"Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif';

export function createLyricCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = LYRIC_BASE_CANVAS_W;
  canvas.height = LYRIC_CANVAS_H_SINGLE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('lyric canvas 2d context failed');
  return { canvas, ctx };
}

export function uploadLyricTexture(gl: WebGLRenderingContext, canvas: HTMLCanvasElement): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('lyric texture create failed');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Mineradio: widen plane with canvas — glyph world size stays constant. */
export function lyricPlaneWorldSize(canvasW: number, canvasH: number): { w: number; h: number } {
  const w = LYRIC_PLANE_BASE_W * clamp(canvasW / LYRIC_BASE_CANVAS_W, 1, 3) * LYRIC_GROUP_SCALE;
  const h = w * (canvasH / canvasW);
  return { w, h };
}

function drawTextLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  alpha: number,
  shadow: string,
  blur: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.shadowColor = shadow;
  ctx.shadowBlur = blur;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Draw active lyric (+ optional translation / artist). No prev/next rows.
 * Fixed 128px font; canvas/plane widen for long lines (Mineradio).
 */
export function drawLyricCanvas(
  res: LyricMeshResources,
  rows: (LyricRowData | null)[],
  textColor: string,
  highlightColor: string,
  palette?: { highlight: [number, number, number]; glow: [number, number, number] },
  variant: 'title' | 'lyrics' = 'lyrics',
) {
  const { ctx, canvas } = res;
  const active = rows[1] ?? rows[0];
  const text = active?.text ?? '';

  let translation = '';
  if (active) {
    if (variant === 'title') {
      translation = active.translation || '';
    } else if (active.translation) {
      translation = active.translation;
    } else if (active.hasTranslationData === false) {
      translation = '暂无翻译';
    }
  }

  const fontPx = LYRIC_FONT_PX;
  const transPx = variant === 'title' ? Math.round(LYRIC_TRANS_FONT_PX * 0.95) : LYRIC_TRANS_FONT_PX;
  const hasTrans = !!translation;

  ctx.font = `700 ${fontPx}px ${FONT_STACK}`;
  const widestMain = text ? ctx.measureText(text).width : 0;
  ctx.font = `500 ${transPx}px ${FONT_STACK}`;
  const widestTrans = translation ? ctx.measureText(translation).width : 0;
  const widest = Math.max(widestMain, widestTrans, 1);

  const pad = Math.max(220, fontPx * 2.2);
  const canvasW = Math.min(
    LYRIC_MAX_CANVAS_W,
    Math.max(LYRIC_BASE_CANVAS_W, Math.ceil(widest + pad)),
  );
  const canvasH = hasTrans ? LYRIC_CANVAS_H_DUAL : LYRIC_CANVAS_H_SINGLE;
  const drawMaxWidth = canvasW - 48;
  const fitScaleX = widestMain > drawMaxWidth ? Math.max(0.01, drawMaxWidth / widestMain) : 1;

  if (canvas.width !== canvasW || canvas.height !== canvasH) {
    canvas.width = canvasW;
    canvas.height = canvasH;
  }

  const { w: planeW, h: planeH } = lyricPlaneWorldSize(canvasW, canvasH);
  res.width = canvasW;
  res.height = canvasH;
  res.planeWorldW = planeW;
  res.planeWorldH = planeH;

  const hi = palette
    ? `rgb(${Math.round(palette.highlight[0])},${Math.round(palette.highlight[1])},${Math.round(palette.highlight[2])})`
    : highlightColor;
  const glow = palette
    ? `rgba(${Math.round(palette.glow[0])},${Math.round(palette.glow[1])},${Math.round(palette.glow[2])},0.85)`
    : 'rgba(150,200,255,0.85)';

  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const yActive = hasTrans ? canvasH * 0.40 : canvasH * 0.50;
  const yTrans = canvasH * 0.72;

  if (text) {
    const p = Math.min(1, Math.max(0, active?.progress ?? 0));

    ctx.save();
    ctx.translate(canvasW / 2, yActive);
    if (fitScaleX < 1) ctx.scale(fitScaleX, 1);
    ctx.font = `700 ${fontPx}px ${FONT_STACK}`;

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = textColor;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 16;
    ctx.fillText(text, 0, 0);

    if (p > 0.001) {
      const textW = ctx.measureText(text).width;
      const textLeft = -textW / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(textLeft, -fontPx, Math.max(0, textW * p), fontPx * 2);
      ctx.clip();
      ctx.globalAlpha = 1;
      ctx.fillStyle = hi;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 26;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  if (translation) {
    // Match main lyric warmth (was cool cyan — clashed with cream karaoke).
    // Slightly dimmer + lighter weight so it reads as secondary, same family.
    const tFill = variant === 'title'
      ? 'rgba(255,246,220,0.52)'
      : active?.translation
        ? (palette
          ? `rgba(${Math.round(palette.highlight[0] * 0.92 + 255 * 0.08)},${Math.round(palette.highlight[1] * 0.88 + 240 * 0.12)},${Math.round(palette.highlight[2] * 0.75 + 200 * 0.25)},0.78)`
          : 'rgba(255,236,196,0.78)')
        : 'rgba(255,255,255,0.28)';
    const tShadow = palette
      ? `rgba(${Math.round(palette.glow[0])},${Math.round(palette.glow[1])},${Math.round(palette.glow[2])},0.45)`
      : 'rgba(255,200,120,0.35)';
    ctx.font = `500 ${transPx}px ${FONT_STACK}`;
    const tFit = widestTrans > drawMaxWidth ? Math.max(0.01, drawMaxWidth / widestTrans) : 1;
    ctx.save();
    ctx.translate(canvasW / 2, yTrans);
    if (tFit < 1) ctx.scale(tFit, 1);
    drawTextLine(ctx, translation, 0, 0, tFill, 1, tShadow, 14);
    ctx.restore();
  }

  res.lastDrawnKey = `${text}|${(active?.progress ?? 0).toFixed(3)}|${translation}|${variant}|${canvasW}`;
  res.dirty = true;
}

/** Unit quad (−0.5…0.5). World size comes from model sx/sy = planeWorldW/H. */
export function createLyricQuadGeometry(): {
  positions: Float32Array;
  uvs: Float32Array;
  count: number;
} {
  const positions = new Float32Array([
    -0.5, -0.5, 0,
     0.5, -0.5, 0,
    -0.5,  0.5, 0,
     0.5, -0.5, 0,
     0.5,  0.5, 0,
    -0.5,  0.5, 0,
  ]);
  const uvs = new Float32Array([
    0, 1,
    1, 1,
    0, 0,
    1, 1,
    1, 0,
    0, 0,
  ]);
  return { positions, uvs, count: 6 };
}

export const LYRIC_VERTEX_SHADER = `
precision highp float;
attribute vec3 aPosition;
attribute vec2 aUv;
uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;
varying vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
}
`;

export const LYRIC_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D uTex;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uTex, vUv);
  gl_FragColor = vec4(c.rgb, c.a * uAlpha);
}
`;

/**
 * Cover-attached model: unit quad × (planeWorldW, planeWorldH),
 * with optional face-plane roll (Z) and breathe scaleMul (Mineradio tickMesh).
 * Behind-camera orbit flips X so text stays readable.
 */
export function buildLyricCoverModelMatrix(
  out: Float32Array,
  anchor: { x: number; y: number; z: number },
  planeWorldW: number,
  planeWorldH: number,
  flipX: boolean,
  layoutZ = 0,
  rollZ = 0,
  scaleMul = 1,
): Float32Array {
  const sx = (flipX ? -planeWorldW : planeWorldW) * scaleMul;
  const sy = planeWorldH * scaleMul;
  const c = Math.cos(rollZ);
  const s = Math.sin(rollZ);
  // column-major: R_z * scale (non-uniform)
  out[0] = sx * c;  out[1] = sx * s;  out[2] = 0; out[3] = 0;
  out[4] = -sy * s; out[5] = sy * c;  out[6] = 0; out[7] = 0;
  out[8] = 0;       out[9] = 0;       out[10] = 1; out[11] = 0;
  out[12] = anchor.x;
  out[13] = anchor.y;
  out[14] = anchor.z + layoutZ;
  out[15] = 1;
  return out;
}

/**
 * @deprecated Prefer buildLyricCoverModelMatrix — billboard path kept for reference.
 */
export function buildLyricModelMatrix(
  out: Float32Array,
  eye: [number, number, number],
  lookDir: [number, number, number],
  up: [number, number, number],
  layoutZ: number,
  scale: number,
): Float32Array {
  const fx = lookDir[0], fy = lookDir[1], fz = lookDir[2];
  let rx = fy * up[2] - fz * up[1];
  let ry = fz * up[0] - fx * up[2];
  let rz = fx * up[1] - fy * up[0];
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;

  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  const px = eye[0] + fx * LYRICS_LOCK_DISTANCE;
  const py = eye[1] + fy * LYRICS_LOCK_DISTANCE;
  const pz = eye[2] + fz * LYRICS_LOCK_DISTANCE;

  out[0] = rx * scale;   out[1] = ry * scale;   out[2] = rz * scale;   out[3] = 0;
  out[4] = ux * scale;   out[5] = uy * scale;   out[6] = uz * scale;   out[7] = 0;
  out[8] = -fx * scale;  out[9] = -fy * scale;  out[10] = -fz * scale; out[11] = 0;
  out[12] = px;          out[13] = py;          out[14] = pz + layoutZ; out[15] = 1;
  return out;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
