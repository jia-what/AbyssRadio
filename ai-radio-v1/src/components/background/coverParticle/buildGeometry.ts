export const PLANE_SIZE = 5.2;
export const GRID = 118;

export interface ParticleGeometry {
  count: number;
  positions: Float32Array;
  uvs: Float32Array;
  rand: Float32Array;
}

export function buildCoverParticleGeometry(grid = GRID): ParticleGeometry {
  const count = grid * grid;
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const rand = new Float32Array(count);
  const step = 1 / grid;

  for (let i = 0; i < count; i++) {
    const gx = i % grid;
    const gy = Math.floor(i / grid);
    const u = (gx + 0.5) * step;
    const v = (gy + 0.5) * step;
    const px = gx / (grid - 1);
    const py = gy / (grid - 1);

    positions[i * 3] = (px - 0.5) * PLANE_SIZE;
    positions[i * 3 + 1] = (py - 0.5) * PLANE_SIZE;
    positions[i * 3 + 2] = 0;
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
    rand[i] = Math.random();
  }

  return { count, positions, uvs, rand };
}
