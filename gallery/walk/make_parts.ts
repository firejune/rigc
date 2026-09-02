/**
 * Draws every part PNG this example needs.
 *
 *     bun gallery/walk/make_parts.ts
 *
 * The PNGs are committed, so nobody needs to run this to build or render the
 * example — it is here so the art is reproducible. It needs `rsvg-convert`
 * (librsvg) on PATH, which is the gallery's one art-time prerequisite.
 *
 * The character is the gallery's shared mascot ([`../rigby.ts`](../rigby.ts)).
 * What is particular to this example is the **leg**: a walk needs a knee, and a
 * knee needs the leg in two plates, so `legSegments` replaces the mascot's
 * one-piece `leg_l`/`leg_r` — the near pair in fur, the far pair a tone darker.
 * Both are in the mascot's own module rather than here, because a segmented leg
 * is reusable and the palette must not fork.
 *
 * ## Scale
 *
 * `ART_SCALE` is **1**: every part is rasterised at the nominal size its outline
 * weight was drawn for. This example's stage is stated at that scale too, and
 * the attachment offsets in `rig.json` are the parts' own centres measured
 * against these sizes — so the one number that would have to move if the scale
 * moved is stated here rather than repeated fifteen times.
 *
 * ## The plate
 *
 * Its glow and its contact shadow are placed from bone positions read back out
 * of `rig.json` (see [`../stage.ts`](../stage.ts)), not from numbers repeated
 * here. Two copies of those coordinates is exactly how a contact shadow ends up
 * under nobody's feet, and it is invisible in both files.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { FUR, FUR_DK, legSegments, rasterise, rigbyParts, stagePlatePart } from '../rigby.ts';
import { readStage } from '../stage.ts';

/** Rasterisation scale for every part in this example — see the header. */
const ART_SCALE = 1;

const HERE = new URL('.', import.meta.url).pathname;
const OUT = join(HERE, 'parts');
mkdirSync(OUT, { recursive: true });

// The mascot, minus the parts this example does not name: the one-piece legs it
// replaces with a knee, and the shut eyes it never swaps to. A PNG in `parts/`
// that no skin names is an atlas page nobody loads and a reader's false lead
// about what the rig is made of.
const UNUSED = ['leg_l', 'leg_r', 'eyes_shut'];

console.log(`character parts (nominal x ${ART_SCALE}):`);
await rasterise(
  rigbyParts().filter((p) => !UNUSED.includes(p.name)),
  OUT,
  ART_SCALE,
);

console.log(`segmented legs (nominal x ${ART_SCALE}):`);
await rasterise([...legSegments('f', FUR), ...legSegments('b', FUR_DK)], OUT, ART_SCALE);

const stage = readStage(join(HERE, 'rig.json'));
const chest = stage.bone('chest');
const ground = stage.bone('ground');
console.log('stage plate (already at world scale):');
await rasterise(
  [
    stagePlatePart(
      stage.width,
      stage.height,
      { x: chest.x, y: stage.imageY(chest.y), r: 372 },
      { x: ground.x, y: stage.imageY(ground.y) + 6, rx: 152, ry: 30 },
    ),
  ],
  OUT,
  1,
);
