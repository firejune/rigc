/** Write the fitted setup geometry (fit/globals.json) into the rig spec. */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Globals } from './globals.ts';
const RUN = 'bench/runs/2026-08-26-rung4-1';
const g = JSON.parse(readFileSync(`${RUN}/fit/globals.json`, 'utf8')) as Globals;
const path = `${RUN}/4-wave-principle.rig.json`;
const rig = JSON.parse(readFileSync(path, 'utf8')) as {
  bones: { name: string; x?: number; y?: number; length?: number }[];
  slots: { name: string; color?: string }[];
  skins: { default: Record<string, Record<string, { x?: number; y?: number }>> };
};
const b = (n: string) => rig.bones.find((x) => x.name === n)!;
const r2 = (x: number) => Number(x.toFixed(2));
b('chain-1').y = r2(g.cy1);
b('chain-2').x = r2(g.L1); b('chain-1').length = r2(g.L1);
b('chain-3').x = r2(g.L2); b('chain-2').length = r2(g.L2);
b('chain-4').x = r2(g.L3); b('chain-3').length = r2(g.L3);
b('chain-end').x = r2(g.L4); b('chain-4').length = r2(g.L4);
const a = (slot: string) => rig.skins.default[slot][slot];
a('chain-1').x = r2(g.a1); a('chain-2').x = r2(g.a2); a('chain-3').x = r2(g.a3); a('chain-4').x = r2(g.a4);
a('chain-end').x = r2(g.ace);
a('platform').x = r2(g.pox); a('platform').y = r2(g.poy);
const hex = Math.round(Math.max(0, Math.min(1, g.lalpha)) * 255).toString(16).padStart(2, '0');
rig.slots.find((s) => s.name === 'basket-lambertian')!.color = `ffffff${hex}`;
writeFileSync(path, JSON.stringify(rig, null, 2));
console.log('baked', JSON.stringify(g));
