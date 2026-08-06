import { useEffect, useRef, type RefObject } from 'react';
import { coverUrl, isImageUrl } from '../../utils/img';
import { useBeatPulseRef } from '../../context/BeatPulseContext';
import { usePulseBands, usePulseFocus } from '../../context/PulseContext';
import type { PulseBands } from '../../context/PulseContext';
import { buildCoverParticleGeometry } from './coverParticle/buildGeometry';
import {
  buildEdgeAndDepth,
  createCoverCanvasFromImage,
  createPlaceholderCanvas,
} from './coverParticle/buildEdgeAndDepth';
import { VERTEX_SHADER, FRAGMENT_SHADER } from './coverParticle/shaders';
import { createMat4, perspective } from './coverParticle/mat4';
import { orbitEye, updateViewFromOrbit, type ParticleCameraState } from './coverParticle/camera';
import {
  createLyricCanvas, uploadLyricTexture, drawLyricCanvas,
  createLyricQuadGeometry, LYRIC_VERTEX_SHADER, LYRIC_FRAGMENT_SHADER,
  buildLyricCoverModelMatrix, LYRIC_COVER_ANCHOR, LYRIC_PLANE_BASE_W, LYRIC_GROUP_SCALE,
  LYRIC_CANVAS_H_SINGLE, lyricPlaneWorldSize, sampleLyricMotion,
  type LyricRowData, type LyricMeshResources,
} from './coverParticle/lyricQuad';

export interface LyricMeshInput {
  active: string;
  prev: string;
  next: string;
  /** karaoke progress of the active line (0..1) */
  progress: number;
  translation?: string;
  hasTranslationData?: boolean;
  /** title card vs scrolling lyrics — same world scale either way */
  variant?: 'title' | 'lyrics';
  /** cover-derived palette: highlight + glow RGB (Mineradio same-source color) */
  palette?: { highlight: [number, number, number]; glow: [number, number, number] };
}

const MIX_DURATION_MS = 1400;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('createShader failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown';
    gl.deleteShader(shader);
    throw new Error(`Shader compile: ${log}`);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vs: string, fs: string) {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vs);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fs);
  const program = gl.createProgram();
  if (!program) throw new Error('createProgram failed');
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown';
    gl.deleteProgram(program);
    throw new Error(`Program link: ${log}`);
  }
  return program;
}

function uploadTexture(gl: WebGLRenderingContext, source: TexImageSource, linear = true) {
  const tex = gl.createTexture();
  if (!tex) throw new Error('createTexture failed');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  // Canvas/Image origin top-left; WebGL texture v=0 at bottom — same as Three.js texture.flipY
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

function copyTexture(gl: WebGLRenderingContext, from: WebGLTexture, w: number, h: number) {
  const fb = gl.createFramebuffer();
  if (!fb) return null;
  const tex = gl.createTexture();
  if (!tex) {
    gl.deleteFramebuffer(fb);
    return null;
  }
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, from, 0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, w, h, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.deleteFramebuffer(fb);
  return tex;
}

function visualEase(t: number) {
  return t * t * (3 - 2 * t);
}

function loadCoverImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`cover load failed: ${url}`));
    img.src = url;
  });
}

/**
 * Full-screen cover particle field — SILK preset, PULSE-driven, cross-fade on track change.
 */
export default function CoverParticleField({
  cameraRef,
  lyricMesh,
}: {
  cameraRef: RefObject<ParticleCameraState>;
  lyricMesh?: LyricMeshInput | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bands = usePulseBands();
  const pulseRef = useBeatPulseRef();
  const { focus } = usePulseFocus();
  const bandsRef = useRef<PulseBands>(bands);
  const pulseRefInternal = useRef(pulseRef);
  const focusRef = useRef(focus);
  const cameraRefInternal = useRef(cameraRef);
  const lyricMeshRef = useRef<LyricMeshInput | null>(lyricMesh ?? null);
  bandsRef.current = bands;
  pulseRefInternal.current = pulseRef;
  focusRef.current = focus;
  cameraRefInternal.current = cameraRef;
  lyricMeshRef.current = lyricMesh ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false });
    if (!gl) return;

    let raf = 0;
    let disposed = false;
    let loadToken = 0;

    const geo = buildCoverParticleGeometry();
    const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    gl.useProgram(program);

    // ——— Lyric quad on cover plane (Mineradio: share cover world pose) ———
    const lyricCanvas = createLyricCanvas();
    const basePlane = lyricPlaneWorldSize(lyricCanvas.canvas.width, LYRIC_CANVAS_H_SINGLE);
    const lyricRes: LyricMeshResources = {
      canvas: lyricCanvas.canvas,
      ctx: lyricCanvas.ctx,
      texture: uploadLyricTexture(gl, lyricCanvas.canvas),
      width: lyricCanvas.canvas.width,
      height: lyricCanvas.canvas.height,
      planeWorldW: basePlane.w,
      planeWorldH: basePlane.h,
      lastDrawnProgress: -1,
      lastDrawnKey: '',
      dirty: false,
    };
    const lyricProgram = createProgram(gl, LYRIC_VERTEX_SHADER, LYRIC_FRAGMENT_SHADER);
    const lyricGeo = createLyricQuadGeometry();
    const lyricPosBuf = gl.createBuffer();
    const lyricUvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lyricPosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, lyricGeo.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, lyricUvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, lyricGeo.uvs, gl.STATIC_DRAW);
    const lApos = gl.getAttribLocation(lyricProgram, 'aPosition');
    const lAuv = gl.getAttribLocation(lyricProgram, 'aUv');
    const lProj = gl.getUniformLocation(lyricProgram, 'uProjection');
    const lView = gl.getUniformLocation(lyricProgram, 'uView');
    const lModel = gl.getUniformLocation(lyricProgram, 'uModel');
    const lTex = gl.getUniformLocation(lyricProgram, 'uTex');
    const lAlpha = gl.getUniformLocation(lyricProgram, 'uAlpha');
    const lyricModel = createMat4();
    // glowFollow: kick sway on cover plane X/Y, then *0.92 recoil
    const glowFollow = { x: 0, y: 0 };

    const posBuf = gl.createBuffer();
    const uvBuf = gl.createBuffer();
    const randBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, geo.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, geo.uvs, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, randBuf);
    gl.bufferData(gl.ARRAY_BUFFER, geo.rand, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(program, 'aPosition');
    const aUv = gl.getAttribLocation(program, 'aUv');
    const aRand = gl.getAttribLocation(program, 'aRand');

    const uProjection = gl.getUniformLocation(program, 'uProjection');
    const uView = gl.getUniformLocation(program, 'uView');
    const uTime = gl.getUniformLocation(program, 'uTime');
    const uBass = gl.getUniformLocation(program, 'uBass');
    const uMid = gl.getUniformLocation(program, 'uMid');
    const uTreble = gl.getUniformLocation(program, 'uTreble');
    const uBeat = gl.getUniformLocation(program, 'uBeat');
    const uKickPulse = gl.getUniformLocation(program, 'uKickPulse');
    const uEnergy = gl.getUniformLocation(program, 'uEnergy');
    const uColorMixT = gl.getUniformLocation(program, 'uColorMixT');
    const uHasCover = gl.getUniformLocation(program, 'uHasCover');
    const uHasDepth = gl.getUniformLocation(program, 'uHasDepth');
    const uIntensity = gl.getUniformLocation(program, 'uIntensity');
    const uDepth = gl.getUniformLocation(program, 'uDepth');
    const uPixel = gl.getUniformLocation(program, 'uPixel');
    const uPointScale = gl.getUniformLocation(program, 'uPointScale');
    const uAlpha = gl.getUniformLocation(program, 'uAlpha');
    const uCoverTex = gl.getUniformLocation(program, 'uCoverTex');
    const uPrevCoverTex = gl.getUniformLocation(program, 'uPrevCoverTex');
    const uEdgeTex = gl.getUniformLocation(program, 'uEdgeTex');

    const placeholder = createPlaceholderCanvas();
    let coverTex = uploadTexture(gl, placeholder);
    let prevCoverTex = uploadTexture(gl, placeholder);
    let edgeTex = uploadTexture(gl, placeholder, false);
    let hasCover = 0;
    let hasDepth = 0;
    let coverAlpha = 0; // 无真封面时粒子场隐去；加载后淡入衔接点播
    let colorMixT = 1;
    let mixStart = 0;
    let mixFrom = 1;
    const proj = createMat4();
    const view = createMat4();
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      if (width < 1 || height < 1) return;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    // ——— Beat-driven FOV punch (Mineradio-style) ———
    // Kick contracts the camera lens (fov shrinks → cover visually "jumps" closer),
    // then eases back. Attack is fast (0.24), release slower (0.12) per Mineradio
    // cameraPunch damping: targetFov = base - kick * 1.75.
    const BASE_FOV = 42;
    const FOV_PUNCH = 1.75;
    let fovSmooth = BASE_FOV;

    let focusKey = '';
    let loadedFocusKey = '';

    const focusKeyOf = () => {
      const f = focusRef.current;
      return `${f.trackId ?? ''}|${f.cover ?? ''}`;
    };

    const applyCoverTextures = (
      coverCanvas: HTMLCanvasElement,
      edgeCanvas: HTMLCanvasElement,
      crossFade: boolean,
      forKey: string,
    ) => {
      if (forKey !== focusKeyOf()) return;

      const oldCover = coverTex;
      if (crossFade && hasCover > 0.5) {
        const copied = copyTexture(gl, oldCover, coverCanvas.width, coverCanvas.height);
        if (copied) {
          gl.deleteTexture(prevCoverTex);
          prevCoverTex = copied;
        }
        colorMixT = 0;
        mixFrom = 0;
        mixStart = performance.now();
      } else {
        colorMixT = 1;
        mixFrom = 1;
        mixStart = 0;
      }

      gl.deleteTexture(oldCover);
      gl.deleteTexture(edgeTex);
      coverTex = uploadTexture(gl, coverCanvas);
      edgeTex = uploadTexture(gl, edgeCanvas, false);
      hasCover = 1;
      hasDepth = 1;
      loadedFocusKey = forKey;
    };

    const loadCover = async (rawUrl: string | null, forKey: string) => {
      // 仅真图片 URL；渐变色字符串等假封面一律当无封面
      const proxied = rawUrl && isImageUrl(rawUrl) ? coverUrl(rawUrl) : '';
      if (!proxied) {
        if (forKey !== focusKeyOf()) return;
        hasCover = 0;
        hasDepth = 0;
        colorMixT = 1;
        loadedFocusKey = forKey;
        return;
      }
      const token = ++loadToken;

      try {
        const img = await loadCoverImage(proxied);
        if (disposed || token !== loadToken || forKey !== focusKeyOf()) return;
        const coverCanvas = await createCoverCanvasFromImage(img);
        const edgeCanvas = buildEdgeAndDepth(coverCanvas);
        if (disposed || token !== loadToken || forKey !== focusKeyOf()) return;
        applyCoverTextures(coverCanvas, edgeCanvas, loadedFocusKey !== '' && hasCover > 0.5, forKey);
      } catch {
        if (!disposed && token === loadToken && forKey === focusKeyOf()) {
          hasCover = 0;
          hasDepth = 0;
        }
      }
    };

    const syncFocus = () => {
      const next = focusKeyOf();
      if (next === focusKey) return;
      focusKey = next;
      void loadCover(focusRef.current.cover || null, next);
    };

    resize();
    window.addEventListener('resize', resize);
    syncFocus();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const start = performance.now();

    const draw = (now: number) => {
      if (disposed) return;
      syncFocus();

      if (mixStart > 0) {
        const t = Math.min(1, (now - mixStart) / MIX_DURATION_MS);
        colorMixT = mixFrom + (1 - mixFrom) * visualEase(t);
        if (t >= 1) mixStart = 0;
      }

      const b = bandsRef.current;
      const kick = pulseRefInternal.current.current.kick;
      resize();

      // FOV punch: fast attack on kick, slow release back to base.
      const targetFov = BASE_FOV - kick * FOV_PUNCH;
      fovSmooth += (targetFov - fovSmooth) * (targetFov < fovSmooth ? 0.24 : 0.12);
      perspective(proj, fovSmooth, width / height, 0.1, 100);

      const cam = cameraRefInternal.current.current;
      if (cam) updateViewFromOrbit(view, cam);

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);

      gl.uniformMatrix4fv(uProjection, false, proj);
      gl.uniformMatrix4fv(uView, false, view);
      gl.uniform1f(uTime, (now - start) * 0.001);
      gl.uniform1f(uBass, b.bass);
      gl.uniform1f(uMid, b.mid);
      gl.uniform1f(uTreble, b.treble);
      gl.uniform1f(uBeat, b.beat);
      gl.uniform1f(uKickPulse, kick);
      gl.uniform1f(uEnergy, b.energy);
      gl.uniform1f(uColorMixT, colorMixT);
      gl.uniform1f(uHasCover, hasCover);
      gl.uniform1f(uHasDepth, hasDepth);
      gl.uniform1f(uIntensity, 0.78);
      gl.uniform1f(uDepth, 0.55);
      gl.uniform1f(uPixel, dpr);
      gl.uniform1f(uPointScale, 1.45);
      // 空闲隐场 → 点播后封面就绪淡入（~0.9s，与 IdleHero 退出叠化）
      const alphaTarget = hasCover > 0.5 ? 0.94 : 0;
      coverAlpha += (alphaTarget - coverAlpha) * 0.038;
      if (Math.abs(alphaTarget - coverAlpha) < 0.002) coverAlpha = alphaTarget;
      gl.uniform1f(uAlpha, coverAlpha);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, coverTex);
      gl.uniform1i(uCoverTex, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, prevCoverTex);
      gl.uniform1i(uPrevCoverTex, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, edgeTex);
      gl.uniform1i(uEdgeTex, 2);

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
      gl.enableVertexAttribArray(aUv);
      gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, randBuf);
      gl.enableVertexAttribArray(aRand);
      gl.vertexAttribPointer(aRand, 1, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.POINTS, 0, geo.count);

      // ——— Lyric on cover plane (same world pose as particles; camera orbits) ———
      const lyr = lyricMeshRef.current;
      if (lyr && lyr.active) {
        const variant = lyr.variant ?? 'lyrics';
        const key = `${variant}|${lyr.active}|${Math.round(lyr.progress * 50)}|${lyr.translation ?? ''}`;
        if (lyricRes.lastDrawnKey !== key) {
          const rows: (LyricRowData | null)[] = [
            null,
            { text: lyr.active, progress: lyr.progress, isActive: true, translation: lyr.translation, hasTranslationData: lyr.hasTranslationData },
            null,
          ];
          drawLyricCanvas(lyricRes, rows, 'rgba(255,255,255,0.92)', 'rgba(190,225,255,1)', lyr.palette, variant);
          gl.bindTexture(gl.TEXTURE_2D, lyricRes.texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, lyricRes.canvas);
          lyricRes.lastDrawnKey = key;
        }

        const cam = cameraRefInternal.current.current;
        if (cam) {
          const eye = orbitEye(cam);
          const behind = eye[2] < 0;
          // Mineradio float-profile: dual-sine breathe + Z roll + light Y/Z drift
          const tSec = (now - start) * 0.001;
          const motion = sampleLyricMotion(tSec, b.bass, Math.max(kick, b.beat * 0.35));
          const rollZ = behind ? -motion.rollZ : motion.rollZ;
          const anchor = {
            x: LYRIC_COVER_ANCHOR.x,
            y: LYRIC_COVER_ANCHOR.y + motion.offsetY,
            z: LYRIC_COVER_ANCHOR.z + motion.offsetZ,
          };
          buildLyricCoverModelMatrix(
            lyricModel,
            anchor,
            lyricRes.planeWorldW || (LYRIC_PLANE_BASE_W * LYRIC_GROUP_SCALE),
            lyricRes.planeWorldH || (LYRIC_PLANE_BASE_W * LYRIC_GROUP_SCALE * 0.2),
            behind,
            0,
            rollZ,
            motion.scaleMul,
          );

          if (kick > 0.02) {
            glowFollow.x += (kick * 0.045 - glowFollow.x) * 0.5;
            glowFollow.y += (kick * 0.03 - glowFollow.y) * 0.5;
          } else {
            glowFollow.x *= 0.92;
            glowFollow.y *= 0.92;
          }
          // Beat kick sway (Mineradio glowFollow on cover-plane axes)
          lyricModel[12] += glowFollow.x * Math.sign(lyricModel[0] || 1);
          lyricModel[13] += glowFollow.y;

          gl.useProgram(lyricProgram);
          gl.uniformMatrix4fv(lProj, false, proj);
          gl.uniformMatrix4fv(lView, false, view);
          gl.uniformMatrix4fv(lModel, false, lyricModel);
          gl.uniform1i(lTex, 0);
          gl.uniform1f(lAlpha, 1);

          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, lyricRes.texture);

          gl.bindBuffer(gl.ARRAY_BUFFER, lyricPosBuf);
          gl.enableVertexAttribArray(lApos);
          gl.vertexAttribPointer(lApos, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, lyricUvBuf);
          gl.enableVertexAttribArray(lAuv);
          gl.vertexAttribPointer(lAuv, 2, gl.FLOAT, false, 0, 0);

          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          gl.drawArrays(gl.TRIANGLES, 0, lyricGeo.count);

          gl.useProgram(program);
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      gl.deleteProgram(program);
      gl.deleteBuffer(posBuf);
      gl.deleteBuffer(uvBuf);
      gl.deleteBuffer(randBuf);
      gl.deleteBuffer(lyricPosBuf);
      gl.deleteBuffer(lyricUvBuf);
      gl.deleteTexture(coverTex);
      gl.deleteTexture(prevCoverTex);
      gl.deleteTexture(edgeTex);
      gl.deleteTexture(lyricRes.texture);
      gl.deleteProgram(lyricProgram);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-[1]"
      aria-hidden
    />
  );
}
