/** SILK-style cover particle shaders — handwritten for AI Radio (not ported from Mineradio). */

export const VERTEX_SHADER = `
precision highp float;

attribute vec3 aPosition;
attribute vec2 aUv;
attribute float aRand;

uniform mat4 uProjection;
uniform mat4 uView;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uBeat;
uniform float uKickPulse;
uniform float uEnergy;
uniform float uColorMixT;
uniform float uHasCover;
uniform float uHasDepth;
uniform float uIntensity;
uniform float uDepth;
uniform float uPixel;
uniform float uPointScale;
uniform float uMouseActive;
uniform vec2 uMouse;
uniform float uMouseRadius;
uniform float uMouseStrength;

uniform sampler2D uCoverTex;
uniform sampler2D uPrevCoverTex;
uniform sampler2D uEdgeTex;

varying vec3 vColor;
varying float vBright;
varying float vAlpha;
varying float vSourceLum;

#define PI 3.14159265

float hash11(float p) {
  return fract(sin(p * 127.1) * 43758.5453);
}

vec3 mod289v3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289v4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289v4(((x * 34.0) + 1.0) * x); }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289v3(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = inversesqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

vec2 safeUv(vec2 uv) {
  return clamp(uv, vec2(0.002), vec2(0.998));
}

void main() {
  float t = uTime * 0.55;
  vec3 pos = aPosition;
  vec2 sampleUv = safeUv(aUv);

  vec3 newCol = texture2D(uCoverTex, sampleUv).rgb;
  vec3 prevCol = texture2D(uPrevCoverTex, sampleUv).rgb;
  vec3 coverColor = mix(prevCol, newCol, clamp(uColorMixT, 0.0, 1.0));

  vec4 edge = texture2D(uEdgeTex, sampleUv);
  float depthVal = edge.r;
  float edgeVal = edge.g;
  float fgMask = edge.b;

  vec3 defaultColor = mix(
    vec3(0.22, 0.20, 0.38),
    mix(vec3(0.55, 0.42, 0.72), vec3(0.32, 0.52, 0.78), aUv.x),
    aUv.y
  );
  vColor = mix(defaultColor, coverColor, uHasCover);
  vAlpha = 1.0;

  float K = uIntensity * 1.35;

  float midN = snoise(vec3(pos.x * 1.3, pos.y * 1.3, t * 0.5)) * 0.6
             + snoise(vec3(pos.x * 2.6 + 4.0, pos.y * 2.6 - 2.0, t * 0.75)) * 0.4;
  float midMask = 0.55 + 0.45 * snoise(vec3(pos.x * 0.35, pos.y * 0.35, t * 0.15));
  float midDisp = midN * uMid * 0.42 * midMask * K;

  float trebleJ = snoise(vec3(pos.x * 5.5, pos.y * 5.5, t * 2.8 + aRand * 3.5)) * uTreble * 0.14 * K;
  float bassBreath = snoise(vec3(pos.x * 0.3, pos.y * 0.3, t * 0.35)) * uBass * 0.32 * K;
  float depthZ = (depthVal - 0.5) * uDepth * 1.1 * uHasDepth;

  float kick = clamp(uKickPulse, 0.0, 1.0);
  vec2 centered = aUv - 0.5;
  pos.xy += centered * kick * (0.022 + kick * 0.018);

  // ——— Mouse bulge (DotField-style): particles pushed away from cursor ———
  // Displacement lives on the cover plane (screen-space UV proxied via aUv),
  // radial falloff + squared strength so it reads as a soft "bulge", then
  // eases back naturally each frame (stateless shader, no physics needed).
  if (uMouseActive > 0.5) {
    vec2 toMouse = sampleUv - uMouse;
    float md = length(toMouse);
    float inf = 1.0 - smoothstep(uMouseRadius * 0.35, uMouseRadius, md);
    if (inf > 0.001) {
      vec2 dir = md > 0.001 ? toMouse / md : vec2(0.0, 1.0);
      float push = inf * inf * uMouseStrength;
      pos.xy += dir * push;
      pos.z += inf * uMouseStrength * 0.22;
    }
  }

  pos.z = midDisp + trebleJ + bassBreath + depthZ + kick * (0.014 + kick * 0.012) * K;

  float edgeBoost = edgeVal * (1.0 - smoothstep(0.02, 0.12, dot(max(vColor, vec3(0.0)), vec3(0.299, 0.587, 0.114))));
  vSourceLum = dot(max(vColor, vec3(0.0)), vec3(0.299, 0.587, 0.114));
  vBright = 0.72 + uBass * 0.08 + uEnergy * 0.05 + kick * (0.1 + kick * 0.14) + edgeBoost * 0.22;

  if (uHasDepth > 0.5) {
    vBright *= mix(1.0, 0.62, (1.0 - fgMask) * 0.35);
  }

  vec4 mvPos = uView * vec4(pos, 1.0);
  float depthSize = 34.0 / max(0.55, -mvPos.z);
  float audioBoost = 1.0 + edgeBoost * 0.35 + kick * (0.18 + kick * 0.22);
  float sz = clamp(depthSize * audioBoost, 1.0, 4.2);
  gl_PointSize = sz * uPixel * uPointScale;
  gl_Position = uProjection * mvPos;
}
`;

export const FRAGMENT_SHADER = `
precision highp float;

uniform float uAlpha;
uniform float uKickPulse;

varying vec3 vColor;
varying float vBright;
varying float vAlpha;
varying float vSourceLum;

void main() {
  vec2 pc = gl_PointCoord - vec2(0.5);
  float d = length(pc) * 2.0;
  float dotA = 1.0 - smoothstep(0.72, 1.0, d);
  if (dotA < 0.02) discard;

  float kick = clamp(uKickPulse, 0.0, 1.0);
  vec3 col = vColor * vBright * (1.0 + kick * (0.05 + kick * 0.08));
  col += vColor * kick * (0.03 + kick * 0.06);
  float keepBlack = 1.0 - smoothstep(0.03, 0.14, vSourceLum);
  float rim = smoothstep(0.42, 0.9, d) * (1.0 - smoothstep(0.9, 1.05, d)) * dotA;
  float outLum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(0.0), rim * smoothstep(0.48, 0.82, outLum) * (1.0 - keepBlack) * 0.32);
  col = clamp(col, vec3(0.0), vec3(1.4));

  gl_FragColor = vec4(col, dotA * uAlpha * vAlpha * 0.82);
}
`;
