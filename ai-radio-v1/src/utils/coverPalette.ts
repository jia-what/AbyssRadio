/** Cover color sampling — simplified from Mineradio updateLyricPaletteFromCover. */

export interface CoverPalette {
  primary: string;
  secondary: string;
  accent: string;
}

export interface WaveColors {
  core: [number, number, number];
  glow: [number, number, number];
  hi: [number, number, number];
}

export function parseRgba(css: string): [number, number, number, number] {
  const m = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (!m) return [120, 160, 200, 0.5];
  return [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 1];
}

export function paletteToWaveColors(p: CoverPalette): WaveColors {
  const [pr, pg, pb] = parseRgba(p.primary);
  const [sr, sg, sb] = parseRgba(p.secondary);
  const [ar, ag, ab] = parseRgba(p.accent);
  return {
    core: [pr, pg, pb],
    glow: [sr, sg, sb],
    hi: [ar, ag, ab],
  };
}

const DEFAULT: CoverPalette = {
  primary: 'rgba(100, 140, 180, 0.55)',
  secondary: 'rgba(80, 120, 160, 0.35)',
  accent: 'rgba(120, 180, 220, 0.25)',
};

function rgbCss(r: number, g: number, b: number, a = 1) {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 1) + 1) % 1;
  if (s <= 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [hue2rgb(hue + 1 / 3) * 255, hue2rgb(hue) * 255, hue2rgb(hue - 1 / 3) * 255];
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h, s, l };
}

/** B&W / near-monochrome covers — cool silver-gray, no hue from JPEG noise. */
function monochromePalette(avgL: number): CoverPalette {
  if (avgL < 0.22) {
    return {
      primary: 'rgba(52, 56, 66, 0.52)',
      secondary: 'rgba(38, 42, 52, 0.34)',
      accent: 'rgba(68, 72, 84, 0.22)',
    };
  }
  if (avgL > 0.72) {
    return {
      primary: 'rgba(195, 200, 210, 0.38)',
      secondary: 'rgba(155, 162, 175, 0.25)',
      accent: 'rgba(215, 220, 230, 0.16)',
    };
  }
  const base = Math.round(70 + avgL * 130);
  const cool = base + 10;
  return {
    primary: rgbCss(base, base + 2, cool, 0.46),
    secondary: rgbCss(base - 28, base - 24, cool - 18, 0.28),
    accent: rgbCss(base + 12, base + 10, cool + 8, 0.18),
  };
}

function paletteFromRgb(r: number, g: number, b: number, avgL: number): CoverPalette {
  const hsl = rgbToHsl(r, g, b);
  const s = Math.min(0.82, Math.max(0.28, hsl.s));
  const [r1, g1, b1] = hslToRgb(hsl.h, s, Math.min(0.62, Math.max(0.38, avgL + 0.08)));
  const [r2, g2, b2] = hslToRgb((hsl.h + 0.1) % 1, Math.max(0.28, s - 0.12), Math.min(0.55, avgL));
  const [r3, g3, b3] = hslToRgb((hsl.h + 0.22) % 1, s * 0.85, Math.min(0.72, avgL + 0.18));
  return {
    primary: rgbCss(r1, g1, b1, 0.52),
    secondary: rgbCss(r2, g2, b2, 0.34),
    accent: rgbCss(r3, g3, b3, 0.22),
  };
}

export function extractCoverPalette(imageData: ImageData): CoverPalette {
  const { data, width, height } = imageData;
  let sumR = 0, sumG = 0, sumB = 0, sumChroma = 0, count = 0;
  let best = { score: -1, r: 120, g: 160, b: 200 };

  for (let y = 0; y < height; y += 6) {
    for (let x = 0; x < width; x += 6) {
      const di = (y * width + x) * 4;
      const r = data[di], g = data[di + 1], b = data[di + 2];
      const a = data[di + 3] / 255;
      if (a < 0.5) continue;
      const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
      const chroma = (maxC - minC) / 255;
      const edgePenalty = Math.abs(lum - 0.5);
      const score = chroma * 1.6 + (0.5 - edgePenalty) * 0.45;
      sumR += r; sumG += g; sumB += b; sumChroma += chroma; count++;
      if (lum > 0.08 && lum < 0.92 && score > best.score) {
        best = { score, r, g, b };
      }
    }
  }

  if (!count) return DEFAULT;

  const avgR = sumR / count;
  const avgG = sumG / count;
  const avgB = sumB / count;
  const avgL = (avgR * 0.299 + avgG * 0.587 + avgB * 0.114) / 255;
  const avgChroma = sumChroma / count;
  const avgSpread = Math.max(Math.abs(avgR - avgG), Math.abs(avgG - avgB), Math.abs(avgR - avgB));

  // Grayscale / B&W — use luminance-based neutrals, not a noisy accent pixel
  if (avgChroma < 0.075 || avgSpread < 14) {
    return monochromePalette(avgL);
  }

  return paletteFromRgb(best.r, best.g, best.b, avgL);
}

export async function loadCoverPalette(coverSrc: string): Promise<CoverPalette> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('cover load failed'));
      img.src = coverSrc;
    });

    const size = 64;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    if (!ctx) return DEFAULT;

    try {
      const bitmap = await createImageBitmap(img, {
        imageOrientation: 'from-image',
        resizeWidth: size,
        resizeHeight: size,
        resizeQuality: 'high',
      });
      ctx.drawImage(bitmap, 0, 0, size, size);
      bitmap.close();
    } catch {
      ctx.drawImage(img, 0, 0, size, size);
    }

    return extractCoverPalette(ctx.getImageData(0, 0, size, size));
  } catch {
    return DEFAULT;
  }
}

export { DEFAULT as DEFAULT_COVER_PALETTE };
