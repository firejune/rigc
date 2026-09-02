/**
 * Draws every part PNG this example needs.
 *
 *     bun gallery/squash/make_parts.ts
 *
 * The PNGs are committed, so nobody needs to run this to build or render the
 * example — it is here so the art is reproducible. It needs `rsvg-convert`
 * (librsvg) on PATH, which is the gallery's one art-time prerequisite.
 *
 * Two parts are not the mascot's body. **`ball`** is the one the `deform`
 * timeline bends, and it lives in [`../rigby.ts`](../rigby.ts) with the two
 * radii that keep a mesh rim outside its own silhouette. **`shadow`** is a cast
 * shadow as its own PNG: the stage plate bakes the shadow of everything that
 * stands still, and a prop that leaves the ground needs one a bone can scale
 * and fade.
 *
 * ## Scale
 *
 * `ART_SCALE` is **1**: every part is rasterised at the nominal size its outline
 * weight was drawn for, and the mesh in `rig.json` is stated in the same unit —
 * its rim radius of 110 is 110 of these pixels, and its uvs are that radius over
 * the ball part's own 240.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { ballPart, castShadowPart, rasterise, rigbyParts, stagePlatePart } from '../rigby.ts';
import { readStage } from '../stage.ts';

/** Rasterisation scale for every part in this example — see the header. */
const ART_SCALE = 1;

const HERE = new URL('.', import.meta.url).pathname;
const OUT = join(HERE, 'parts');
mkdirSync(OUT, { recursive: true });

console.log(`character parts (nominal x ${ART_SCALE}):`);
await rasterise(rigbyParts(), OUT, ART_SCALE);

console.log(`ball and its shadow (nominal x ${ART_SCALE}):`);
// 130 x 34: about a third wider than the ball, so the shadow still reads as
// ground contact at the widest scale the bounce keys.
await rasterise([ballPart(), castShadowPart('shadow', 130, 34)], OUT, ART_SCALE);

const stage = readStage(join(HERE, 'rig.json'));
const chest = stage.bone('chest');
const hip = stage.bone('hip');
const ball = stage.bone('ball');
console.log('stage plate (already at world scale):');
await rasterise(
  [
    stagePlatePart(
      stage.width,
      stage.height,
      // Between the two of them, so neither the character nor the ball sits in
      // the dark.
      { x: (chest.x + ball.x) / 2, y: stage.imageY(chest.y), r: 470 },
      // Rigby stands still, so HIS contact shadow is baked here; the ball's is
      // the part above. 118 is the one-piece leg's reach below the hip.
      { x: hip.x, y: stage.imageY(hip.y - 118) + 6, rx: 138, ry: 28 },
    ),
  ],
  OUT,
  1,
);
