/**
 * Emit the rig spec from the measured table, plus whatever `placements.json`
 * has refined since. Run it, then `bun cli.ts build`.
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { p2w } from './geom.ts';
import { BONES, PARTS } from './rigdata.ts';

const here = dirname(fileURLToPath(import.meta.url));
const run = join(here, '..');

type Placement = { px: number; py: number; rot: number };
const refined: Record<string, Placement> = existsSync(join(here, 'placements.json'))
  ? JSON.parse(readFileSync(join(here, 'placements.json'), 'utf8'))
  : {};

const boneWorld = new Map<string, [number, number]>();
for (const b of BONES) boneWorld.set(b.name, p2w(b.px, b.py));

const bones = BONES.map((b) => {
  const [wx, wy] = boneWorld.get(b.name)!;
  const out: Record<string, unknown> = { name: b.name };
  if (b.parent) {
    out.parent = b.parent;
    const [px, py] = boneWorld.get(b.parent)!;
    out.x = round(wx - px);
    out.y = round(wy - py);
  }
  if (b.length) out.length = b.length;
  return out;
});

const slots = PARTS.map((p) => ({ name: p.slot, bone: p.bone, attachment: p.setup }));

const skin: Record<string, Record<string, unknown>> = {};
for (const p of PARTS) {
  const [bx, by] = boneWorld.get(p.bone)!;
  const entry: Record<string, unknown> = {};
  for (const a of p.attachments) {
    // a per-attachment placement wins over the slot's, for the flare frames
    const pl = refined[`${p.slot}/${a}`] ?? refined[p.slot] ?? { px: p.px, py: p.py, rot: p.rot };
    const [wx, wy] = p2w(pl.px, pl.py);
    entry[a] = { image: `${a}.png`, x: round(wx - bx), y: round(wy - by), rotation: round(pl.rot) };
  }
  skin[p.slot] = entry;
}

const rig = {
  spec: 'rigc-rig/1',
  name: 'spineboy-ess',
  images: '../../../../examples/spineboy/images',
  skeleton: { x: -400, y: -100, width: 800, height: 1000 },
  bones,
  slots,
  skins: { default: skin },
  events: { footstep: {}, shoot: {} },
};

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

writeFileSync(join(run, 'ess', 'spineboy-ess.rig.json'), JSON.stringify(rig, null, 2) + '\n');
console.log(`rig: ${bones.length} bones, ${slots.length} slots, ${Object.values(skin).reduce((n, e) => n + Object.keys(e).length, 0)} attachments`);
