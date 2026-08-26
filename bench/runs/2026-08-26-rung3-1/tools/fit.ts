import { Plate, readPlate, type RGBA } from '../../../../tools/plate.ts';
import { rasteriseQuad, projector, fill, type Viewport, type Quad } from '../../../../src/render.ts';
import { readFileSync } from 'node:fs';

export const BG: RGBA = [232, 232, 232, 255];
const side = JSON.parse(readFileSync('../../../reference/3-timing-and-spacing/frames.json', 'utf8'));
export const VP: Viewport = {
  minX: side.viewport.x, minY: side.viewport.y,
  maxX: side.viewport.x + side.viewport.width, maxY: side.viewport.y + side.viewport.height,
  scale: side.viewport.scale, width: side.viewport.pixelWidth, height: side.viewport.pixelHeight,
};
export const pend = readPlate('../../../../examples/3-timing-and-spacing/images/pendulum.png');
export const sq = readPlate('../../../../examples/3-timing-and-spacing/images/square.png');
const UVS = [1, 1, 0, 1, 0, 0, 1, 0];

/** A region quad: bone at (bx,by) rotated deg, attachment centre offset (ax,ay), size w x h, scaled. */
export function quad(page: string, bx: number, by: number, deg: number, ax: number, ay: number, w: number, h: number): Quad {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const hw = w / 2, hh = h / 2;
  const pts: number[] = [];
  for (const [dx, dy] of [[hw, -hh], [-hw, -hh], [-hw, hh], [hw, hh]]) {
    const lx = ax + dx, ly = ay + dy;
    pts.push(bx + lx * c - ly * s, by + lx * s + ly * c);
  }
  return { kind: 'region', world: pts, uvs: UVS, tint: [1, 1, 1, 1], slot: page, page };
}

export function render(quads: Quad[]): Plate {
  const plate = new Plate(VP.width, VP.height);
  fill(plate, BG);
  const project = projector(VP);
  for (const q of quads) {
    const page = q.page === 'pendulum' ? pend : sq;
    rasteriseQuad(page, q, project, VP, (px, py, r, g, b, a) => plate.blend(px, py, [r, g, b, a]));
  }
  return plate;
}

export function err(a: Plate, b: Plate): number {
  let sum = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n * 4; i += 4)
    sum += Math.abs(a.data[i]-b.data[i]) + Math.abs(a.data[i+1]-b.data[i+1]) + Math.abs(a.data[i+2]-b.data[i+2]);
  return sum / 3 / n;
}

export function refFrame(set: string, i: number): Plate {
  return readPlate(`../../../reference/3-timing-and-spacing/${set}/f${String(i).padStart(4,'0')}.png`);
}
