#!/usr/bin/env bun
/**
 * Measure a cut's contact depth from its plates.
 *
 *   bun tools/measure_contact_depth.ts <manifest.json> <massSlot> <againstSlot>
 *
 * The rule it makes mechanical: inward travel goes at most until the moving mass
 * touches the part that occludes it. That turns the deepest inward amplitude
 * from a number somebody picks into a measured fact.
 *
 * ⚠️ The two slot names are REQUIRED and the tool has no defaults for them. Which
 * plate is the mass and which is the occluder is a fact about one cut's anatomy,
 * and a default here would quietly measure the wrong pair on the next cut and
 * still print a plausible number.
 *
 * The result goes into the manifest as `stroke.contact_depth`. It is not computed
 * at build time on purpose — the compiler never re-measures art, the same
 * division that keeps `mesh.center` a measured manifest number.
 *
 * Output includes the two-sided proof the depth has to satisfy: ZERO overlapping
 * body pixels at the depth, and MORE THAN ZERO one pixel past it. A depth with no
 * overlap one pixel past is not "touching", it is just short.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readPlate } from './plate.ts';
import { BODY_ALPHA, measureContactDepth } from './contact.ts';

interface Part {
  slot: string;
  image?: string;
  offset: [number, number];
  size?: [number, number];
}
interface Manifest {
  crop: { w: number; h: number };
  insertion?: [number, number];
  axis?: { deg: number };
  stroke?: { contact_depth?: number };
  parts: Part[];
}

const [manifestArg, massSlot, againstSlot] = process.argv.slice(2);
if (!manifestArg || !massSlot || !againstSlot) {
  console.error('usage: bun tools/measure_contact_depth.ts <manifest.json> <massSlot> <againstSlot>');
  console.error('  massSlot    the part that advances');
  console.error('  againstSlot the part it must not pass through');
  process.exit(2);
}
const manifestPath = resolve(manifestArg);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
const dir = dirname(manifestPath);

if (!manifest.axis) {
  console.error('manifest has no `axis`; the contact depth is a distance ALONG the axis and cannot be measured without it');
  process.exit(1);
}
const partOf = (slot: string): Part => {
  const part = manifest.parts.find((p) => p.slot === slot);
  if (!part?.image) throw new Error(`manifest has no part with an image for slot "${slot}"`);
  return part;
};
const load = (slot: string) => {
  const part = partOf(slot);
  return { part, plate: readPlate(resolve(dir, part.image!)) };
};

const mass = load(massSlot);
const against = load(againstSlot);
const rad = (manifest.axis.deg * Math.PI) / 180;
const inward: [number, number] = [Math.cos(rad), Math.sin(rad)];

const result = measureContactDepth(
  { plate: mass.plate, offset: mass.part.offset },
  { plate: against.plate, offset: against.part.offset },
  inward,
);

console.log(`contact depth for ${manifestPath}`);
console.log(`  axis            ${manifest.axis.deg} deg (screen, y down) -> inward unit [${inward.map((v) => v.toFixed(4)).join(', ')}]`);
console.log(`  mass            ${massSlot.padEnd(12)} ${mass.plate.width}x${mass.plate.height} at ${JSON.stringify(mass.part.offset)}  ${result.massPixels} body px`);
console.log(`  against         ${againstSlot.padEnd(12)} ${against.plate.width}x${against.plate.height} at ${JSON.stringify(against.part.offset)}  ${result.againstPixels} body px`);
console.log(`  alpha threshold ${result.alphaThreshold} of 255`);
const expected = result.touches ? result.depth : null;
if (!result.touches) {
  console.log(`  DEPTH           none — scanned to ${result.depth}px without the footprints ever meeting`);
  console.log('                  along this axis the masses never touch, so the rule imposes no ceiling');
} else {
  console.log(`  DEPTH           ${result.depth} px inward`);
  console.log(`  overlap at depth      ${result.overlapAtDepth}  (must be 0)`);
  console.log(`  overlap one px past   ${result.overlapPastDepth}  (must be > 0, or the depth is short rather than touching)`);
  console.log(`  first contact   ${JSON.stringify(result.contactPoint)} (crop px)`);
}

const declared = manifest.stroke?.contact_depth ?? null;
if ('contact_depth' in (manifest.stroke ?? {})) {
  const agrees = declared === expected;
  console.log(`  manifest says   ${JSON.stringify(declared)} -> ${agrees ? 'agrees' : 'DISAGREES with the plates'}`);
  if (!agrees) process.exit(1);
}
if (result.touches && (result.overlapAtDepth !== 0 || result.overlapPastDepth === 0)) {
  console.error('  the two-sided proof failed: this is not a tangency');
  process.exit(1);
}
console.log(result.touches ? '  ok — tangent at the depth, overlapping one pixel past it' : '  ok — no ceiling to declare');
