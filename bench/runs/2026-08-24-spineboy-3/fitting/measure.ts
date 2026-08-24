import { readPlate, type Plate } from '../tools/plate.ts';
import { buildTemplate, match, ESS_SCALE, type Template, type Match } from './match.ts';
import { PARTS, IMAGES } from './parts.ts';
import { writeFileSync, existsSync } from 'node:fs';

const REF = 'bench/reference/spineboy/ess';
const BG = [232, 232, 232];

export function subjectBox(p: Plate): [number, number, number, number] {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    const i = (y * p.width + x) * 4;
    if (Math.abs(p.data[i] - BG[0]) > 8 || Math.abs(p.data[i+1] - BG[1]) > 8 || Math.abs(p.data[i+2] - BG[2]) > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return [x0, y0, x1, y1];
}

const templates = new Map<string, Template>();
for (const name of Object.keys(PARTS)) templates.set(name, buildTemplate(`${IMAGES}/${name}.png`, name));

const jobs: [string, number][] = [];
const spec = process.argv[2] ?? 'idle:0,5,10,15|walk:0,1,2,3,4,5,6,7,8,9,10,11,12|run:0,1,2,3,4,5,6,7,8|aim:0|jump:0,2,4,6,8,10,12,14,16|hit:0,2,4|death:0,10,20,30,40,50';
for (const chunk of spec.split('|')) {
  const [anim, list] = chunk.split(':');
  for (const f of list.split(',')) jobs.push([anim, Number(f)]);
}

const out: Record<string, Record<string, Match & { box: number[] }>> = {};
for (const [anim, f] of jobs) {
  const path = `${REF}/${anim}/f${String(f).padStart(4, '0')}.png`;
  if (!existsSync(path)) { console.error('missing', path); continue; }
  const frame = readPlate(path);
  const [bx0, by0, bx1, by1] = subjectBox(frame);
  const key = `${anim}/${f}`;
  out[key] = {};
  for (const name of Object.keys(PARTS)) {
    const t = templates.get(name)!;
    const pad = 6;
    const m = match(t, frame, [bx0 - pad, by0 - pad, bx1 + pad, by1 + pad]);
    out[key][name] = { ...m, box: [bx0, by0, bx1, by1] };
  }
  console.error(key, 'done');
}
writeFileSync(process.argv[3] ?? 'work/matches.json', JSON.stringify(out, null, 1));
