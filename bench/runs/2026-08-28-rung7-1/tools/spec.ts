/**
 * Rung 7 — the rig spec, generated.
 *
 * Structure, and why:
 *
 *  - Names come straight off the art (AUTHORING.md §10.1's largest lever): three
 *    PNGs called sack / cape-back / cape-front become three slots, three
 *    attachments and the bone that moves each.
 *  - Draw order (the slots array, R4): cape-back, sack, cape-front. The collar in
 *    front is proven by the beige-piece census in the brief; the panel behind is the
 *    weaker reading, and the brief says to build it behind.
 *  - The sack is a MESH on a four-bone chain, not a region. affine-verdict.ts settles
 *    that: the best affine image of sack.png's own silhouette misses 12.3 % of the
 *    sack's pixels on average and 27.5 % at worst, against an estimator floor of
 *    0.9 % and a positive control (a real bend of a fifth of the art's width) at
 *    7.2 %. A Spine bone's local transform IS a general affine, so one bone provably
 *    cannot draw this shot. warp-order.ts sizes what can: a second-order warp — the
 *    freedom a small lattice has — halves the residual.
 *  - The two cape parts are regions on one bone each. Cloth mechanism is in the
 *    brief's "cannot tell you" list, so the frames do not ask for a mesh there; a
 *    region that translates, turns and scales carries everything the frames show.
 */
import { artMask } from './art.ts';

// ---------------------------------------------------------------------------
// where the rest pose sits, measured off the frames (probe-rest.ts)
// ---------------------------------------------------------------------------

/** The sack's opaque-box bottom centre at rest, in the frames' own world units. */
export const SACK_X = -16.5;
export const SACK_Y = -64.5;

/**
 * The two cape bones, in the sack bone's OWN local space, and their setup scale.
 *
 * These are the output of setup-fit.ts: one pose fitted against the three frames the
 * brief identifies as the same standing pose, on the crimson channel alone, with the
 * sack frozen at the placement the art settles. §8.1 is why it is fitted against a
 * spread rather than one frame — a wrong offset would have to be absorbed by a
 * different rotation in each frame, and no one value of the offset does that.
 *
 * What it was worth: the collar's first-guess placement was 45 units low, which held
 * the crimson silhouette IoU at 0.45 where the corrected one reaches 0.93 — and,
 * because the collar occludes the sack, it was ALSO holding the beige IoU at 0.87
 * where the corrected one reaches 0.99. A floor measured with one part misplaced is
 * not a floor: the run spent two experiments treating 0.87 as the texture's own limit.
 */
export const BACK_LOCAL = { x: 11.16, y: 602.86, scaleX: 1.0, scaleY: 1.02 };
export const FRONT_LOCAL = { x: 17.44, y: 502.8, scaleX: 0.96, scaleY: 0.96 };

export const NX = 5;
export const NY = 9;
/** Chain joints, as a fraction of the sack's own opaque height. */
export const JOINTS = [0, 0.25, 0.5, 0.75];
export const CHAIN = ['sack', 'sack-b', 'sack-c', 'sack-d'];

const sack = artMask('sack.png');
const back = artMask('cape-back.png');
const front = artMask('cape-front.png');

/** A PNG's opaque box: size, and the png centre's offset from the box's own anchor. */
function boxOf(m: ReturnType<typeof artMask>) {
  const w = m.box.right + 1 - m.box.left;
  const h = m.box.bottom + 1 - m.box.top;
  const cx = (m.box.left + m.box.right + 1) / 2;
  const cy = (m.box.top + m.box.bottom + 1) / 2;
  return { w, h, cx, cy, pngW: m.w, pngH: m.h };
}
export const SACK_BOX = boxOf(sack);
export const BACK_BOX = boxOf(back);
export const FRONT_BOX = boxOf(front);

// ---------------------------------------------------------------------------
// the sack mesh
// ---------------------------------------------------------------------------

export interface MeshData {
  uvs: number[];
  triangles: number[];
  /** setup-pose position of each vertex, in the sack bone's local space */
  setup: [number, number][];
  /** height above the sack bone, per vertex, as a fraction of the opaque height */
  frac: number[];
}

export function sackMesh(): MeshData {
  const { pngW, pngH, cx } = SACK_BOX;
  const bottom = sack.box.bottom + 1; // art y of the opaque box's bottom edge
  const uvs: number[] = [];
  const setup: [number, number][] = [];
  const frac: number[] = [];
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      const ax = (i * pngW) / (NX - 1);
      const ay = (j * pngH) / (NY - 1);
      uvs.push(ax / pngW, ay / pngH);
      // the sack bone sits on the opaque box's bottom centre; world y is up
      const lx = ax - cx;
      const ly = bottom - ay;
      setup.push([lx, ly]);
      frac.push(ly / SACK_BOX.h);
    }
  const triangles: number[] = [];
  for (let j = 0; j < NY - 1; j++)
    for (let i = 0; i < NX - 1; i++) {
      const a = j * NX + i;
      const b = a + 1;
      const c = a + NX;
      const d = c + 1;
      // Spine reads triangles as vertex indices; winding is not checked by the
      // rasteriser (it draws both faces), so the pair below is chosen for a tidy
      // diagonal rather than for an orientation.
      triangles.push(a, c, b, b, c, d);
    }
  return { uvs, triangles, setup, frac };
}

/** Smoothstep, for a bend that dies smoothly into the next segment. */
const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Weights per vertex, blended along the chain by height only.
 *
 * Height-only weighting is what makes the chain a piecewise-affine warp of the art
 * rather than a free-form lattice: every vertex of one row shares its weights, so a
 * row can turn, taper and stretch but not tear. That is the same structural
 * guarantee rigc's own ribbon generator gets from identical row weights (src/mesh.ts,
 * and assertion A28 for the generated case), reached here by construction.
 */
export function sackWeights(frac: number[]): { bone: string; x: number; y: number; weight: number }[][] {
  const mesh = sackMesh();
  const out: { bone: string; x: number; y: number; weight: number }[][] = [];
  const jointY = JOINTS.map((f) => f * SACK_BOX.h);
  for (let v = 0; v < frac.length; v++) {
    const [lx, ly] = mesh.setup[v];
    let k = 0;
    while (k < JOINTS.length - 2 && ly >= jointY[k + 1]) k++;
    const span = jointY[k + 1] - jointY[k];
    let f = (ly - jointY[k]) / span;
    f = f <= 0 ? 0 : f >= 1 ? 1 : smooth(f);
    // A binding at weight 0 is dead data — spine-html's A20 refuses one outright —
    // so a vertex that has landed on a joint binds to that joint alone.
    const EPS = 1e-6;
    const pairs: [number, number][] =
      f <= EPS ? [[k, 1]] : f >= 1 - EPS ? [[k + 1, 1]] : [[k, 1 - f], [k + 1, f]];
    out.push(
      pairs.map(([bi, w]) => ({
        bone: CHAIN[bi],
        // bind position in THAT bone's local space: the chain is a straight column
        // at setup, so it is the vertex minus that joint's own height.
        x: lx,
        y: ly - jointY[bi],
        weight: w,
      })),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// the rig spec
// ---------------------------------------------------------------------------

export function buildRig(mode: 'mesh' | 'region'): unknown {
  const jointY = JOINTS.map((f) => f * SACK_BOX.h);
  const bones: Record<string, unknown>[] = [
    { name: 'root' },
    { name: 'sack', parent: 'root', x: SACK_X, y: SACK_Y },
  ];
  if (mode === 'mesh')
    for (let k = 1; k < CHAIN.length; k++)
      bones.push({ name: CHAIN[k], parent: CHAIN[k - 1], x: 0, y: jointY[k] - jointY[k - 1] });
  bones.push(
    { name: 'cape-back', parent: 'sack', ...BACK_LOCAL },
    { name: 'cape-front', parent: 'sack', ...FRONT_LOCAL },
  );

  const mesh = sackMesh();
  const sackAttachment =
    mode === 'mesh'
      ? {
          type: 'mesh',
          image: 'sack.png',
          uvs: mesh.uvs,
          triangles: mesh.triangles,
          weights: sackWeights(mesh.frac),
        }
      : {
          image: 'sack.png',
          // the region's own centre, offset from the bone at the box's bottom centre
          x: SACK_BOX.pngW / 2 - SACK_BOX.cx,
          y: sack.box.bottom + 1 - SACK_BOX.pngH / 2,
        };

  return {
    spec: 'rigc-rig/1',
    name: 'sack',
    images: 'images',
    // The stage is not read by any measure (the brief says so); this is the union of
    // the four shots with room to spare, in the frames' own units.
    skeleton: { x: -900, y: -400, width: 5600, height: 4400 },
    bones,
    slots: [
      { name: 'cape-back', bone: 'cape-back', attachment: 'cape-back' },
      { name: 'sack', bone: 'sack', attachment: 'sack' },
      { name: 'cape-front', bone: 'cape-front', attachment: 'cape-front' },
    ],
    skins: {
      default: {
        'cape-back': {
          'cape-back': {
            image: 'cape-back.png',
            x: BACK_BOX.pngW / 2 - BACK_BOX.cx,
            y: back.box.top - BACK_BOX.pngH / 2,
          },
        },
        sack: { sack: sackAttachment },
        'cape-front': {
          'cape-front': {
            image: 'cape-front.png',
            x: FRONT_BOX.pngW / 2 - FRONT_BOX.cx,
            y: FRONT_BOX.pngH / 2 - FRONT_BOX.cy,
          },
        },
      },
    },
  };
}

export const DURATIONS: Record<string, number> = {
  'fall-in': 50 / 30,
  hello: 86 / 30,
  walk: 20 / 30,
  'cape-follow-example': 90 / 30,
};

if (import.meta.main) {
  const m = sackMesh();
  console.log(`sack mesh: ${NX}x${NY} = ${m.uvs.length / 2} vertices, ${m.triangles.length / 3} triangles`);
  console.log(`sack opaque box ${SACK_BOX.w}x${SACK_BOX.h} in a ${SACK_BOX.pngW}x${SACK_BOX.pngH} png, box centre (${SACK_BOX.cx}, ${SACK_BOX.cy})`);
  console.log(`chain joints above the base: ${JOINTS.map((f) => (f * SACK_BOX.h).toFixed(2)).join(', ')}`);
  const w = sackWeights(m.frac);
  for (let j = 0; j < NY; j++) {
    const v = j * NX;
    console.log(
      `  row ${j}  local y ${m.setup[v][1].toFixed(1).padStart(7)}  -> ${w[v].map((e) => `${e.bone}:${e.weight.toFixed(3)}`).join('  ')}`,
    );
  }
}
