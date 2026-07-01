const SIZE = 256;

export function buildEdgeAndDepth(srcCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const normalized = document.createElement('canvas');
  normalized.width = SIZE;
  normalized.height = SIZE;
  const sctx = normalized.getContext('2d');
  if (!sctx) return normalized;
  sctx.drawImage(srcCanvas, 0, 0, SIZE, SIZE);

  const src = sctx.getImageData(0, 0, SIZE, SIZE).data;
  const n = SIZE * SIZE;
  const lum = new Float32Array(n);
  const blur = new Float32Array(n);
  const tmp = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const di = i * 4;
    lum[i] = (src[di] * 0.299 + src[di + 1] * 0.587 + src[di + 2] * 0.114) / 255;
  }

  const blurH = (s: Float32Array, d: Float32Array, r: number) => {
    for (let y = 0; y < SIZE; y++) {
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += s[y * SIZE + Math.max(0, Math.min(SIZE - 1, x))];
      for (let x = 0; x < SIZE; x++) {
        d[y * SIZE + x] = sum / (2 * r + 1);
        const xR = Math.min(SIZE - 1, x + r + 1);
        const xL = Math.max(0, x - r);
        sum += s[y * SIZE + xR] - s[y * SIZE + xL];
      }
    }
  };

  const blurV = (s: Float32Array, d: Float32Array, r: number) => {
    for (let x = 0; x < SIZE; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += s[Math.max(0, Math.min(SIZE - 1, y)) * SIZE + x];
      for (let y = 0; y < SIZE; y++) {
        d[y * SIZE + x] = sum / (2 * r + 1);
        const yD = Math.min(SIZE - 1, y + r + 1);
        const yU = Math.max(0, y - r);
        sum += s[yD * SIZE + x] - s[yU * SIZE + x];
      }
    }
  };

  blurH(lum, tmp, 4);
  blurV(tmp, blur, 4);

  const edge = new Float32Array(n);
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const gx =
        -blur[(y - 1) * SIZE + (x - 1)] - 2 * blur[y * SIZE + (x - 1)] - blur[(y + 1) * SIZE + (x - 1)]
        + blur[(y - 1) * SIZE + (x + 1)] + 2 * blur[y * SIZE + (x + 1)] + blur[(y + 1) * SIZE + (x + 1)];
      const gy =
        -blur[(y - 1) * SIZE + (x - 1)] - 2 * blur[(y - 1) * SIZE + x] - blur[(y - 1) * SIZE + (x + 1)]
        + blur[(y + 1) * SIZE + (x - 1)] + 2 * blur[(y + 1) * SIZE + x] + blur[(y + 1) * SIZE + (x + 1)];
      edge[y * SIZE + x] = Math.min(1, Math.sqrt(gx * gx + gy * gy) * 1.4);
    }
  }

  const depth = new Float32Array(n);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const cx = (x / (SIZE - 1) - 0.5) * 2;
      const cy = (y / (SIZE - 1) - 0.5) * 2;
      const rr = Math.sqrt(cx * cx + cy * cy);
      const centerBias = 1 - Math.min(1, rr * 0.75);
      depth[i] = Math.min(1, blur[i] * 0.45 + centerBias * 0.55);
    }
  }

  const fg = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    fg[i] = Math.min(1, depth[i] * 0.6 + edge[i] * 0.5);
  }

  const out = document.createElement('canvas');
  out.width = SIZE;
  out.height = SIZE;
  const octx = out.getContext('2d');
  if (!octx) return out;
  const imgOut = octx.createImageData(SIZE, SIZE);
  for (let i = 0; i < n; i++) {
    const di = i * 4;
    imgOut.data[di] = Math.round(depth[i] * 255);
    imgOut.data[di + 1] = Math.round(edge[i] * 255);
    imgOut.data[di + 2] = Math.round(fg[i] * 255);
    imgOut.data[di + 3] = Math.round(lum[i] * 255);
  }
  octx.putImageData(imgOut, 0, 0);
  return out;
}

export async function createCoverCanvasFromImage(img: HTMLImageElement): Promise<HTMLCanvasElement> {
  const cv = document.createElement('canvas');
  cv.width = SIZE;
  cv.height = SIZE;
  const ctx = cv.getContext('2d');
  if (!ctx) return cv;

  try {
    const bitmap = await createImageBitmap(img, {
      imageOrientation: 'from-image',
      resizeWidth: SIZE,
      resizeHeight: SIZE,
      resizeQuality: 'high',
    });
    ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);
    bitmap.close();
  } catch {
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
  }
  return cv;
}

export function createPlaceholderCanvas(color = '#14141e'): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 4;
  const ctx = cv.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 4, 4);
  }
  return cv;
}
