/**
 * The density probe — issue #381 stage 2.
 *
 * Builds one part at a ladder of mesh densities, turns it with one `yaw`
 * transform key read off a depth map, and records what the toolchain costs and
 * what it still refuses at each rung.
 *
 * Everything it measures comes out of `src/`: the compiler builds the mesh, the
 * validator gates it, and `surveyDeformKeys` — the one implementation A39 and
 * the DEFORM report share — reports the winding. Nothing here reimplements a
 * number it prints.
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Plate } from '../../../../tools/plate.ts';
import { compile } from '../../../../src/compile.ts';
import { validate } from '../../../../src/validate.ts';
import { skeletonDataFromText, surveyDeformKeys } from '../../../../src/deformmeasure.ts';
import { CompileError } from '../../../../src/errors.ts';

/** The part window. 400 x 400 is a plate at a size real art is drawn at. */
const W = 400;
const H = 400;
/** World units the depth sheet's full range spans. */
const Z_SCALE = 60;

/** An ellipse filling most of the window — the silhouette the contour traces. */
function art(x: number, y: number): boolean {
  const u = (x - W / 2) / (W * 0.46);
  const v = (y - H / 2) / (H * 0.46);
  return u * u + v * v <= 1;
}

/**
 * A dome: z rises to the centre and falls to the rim, which is what a face's
 * depth map looks like and what a single column radius cannot express.
 *
 * ⚠️ It is also VERTICAL at its rim — `dz/du` is unbounded there — and that one
 * property is what the fold ladder below turns out to be measuring.
 */
function domeLevel(x: number, y: number): number {
  const u = (x - W / 2) / (W / 2);
  const v = (y - H / 2) / (H / 2);
  const r2 = Math.min(1, u * u + v * v);
  return Math.round(255 * Math.sqrt(1 - r2));
}

/**
 * The same bump with a BOUNDED gradient: a raised cosine, flat at the centre
 * and flat again at the rim, steepest at half radius where `|dz/du|` is
 * `Z pi / 2R` and no finer sampling can find anything steeper.
 */
function cosineLevel(x: number, y: number): number {
  const u = (x - W / 2) / (W / 2);
  const v = (y - H / 2) / (H / 2);
  const r = Math.min(1, Math.hypot(u, v));
  return Math.round((255 * (1 + Math.cos(Math.PI * r))) / 2);
}

function writeArt(path: string): void {
  const plate = new Plate(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const on = art(x, y);
      // A checkerboard so a flipped triangle is visible in a render, and so the
      // plate is structurally real rather than a flat fill.
      const c = ((x >> 4) + (y >> 4)) % 2 === 0 ? 210 : 120;
      plate.set(x, y, [c, c, c, on ? 255 : 0]);
    }
  }
  plate.writePng(path);
}

/**
 * The two sheets, and why there are two.
 *
 * `dome` is the shape a face has. `flat` is the control that separates the two
 * candidate causes of a fold at density: a flat sheet gives every vertex the
 * same z, which makes the turn a pure cosine shrink with no crossing possible
 * short of 90 degrees. A mesh that still folds on it folds because of its own
 * TRIANGULATION, not because of the depth it was handed.
 */
export type Sheet = 'dome' | 'flat' | 'cosine';
/** The one level a flat sheet carries; mid-grey, so the shrink is a real one. */
const FLAT_LEVEL = 128;

function writeDepth(path: string, sheet: Sheet): void {
  const plate = new Plate(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const l = sheet === 'flat' ? FLAT_LEVEL : sheet === 'cosine' ? cosineLevel(x, y) : domeLevel(x, y);
      plate.set(x, y, [l, l, l, 255]);
    }
  }
  plate.writePng(path);
}

/**
 * Every vertex's z, read back out of the emitted artifact.
 *
 * `dx = u(cos t - 1) - z sin t` with the pivot unstated, so `z` falls out of the
 * bind-space u in the weighted run and the offset in the deform key. Reading the
 * ARTIFACT rather than the report is the point: it measures what the file says.
 */
/**
 * Every setup triangle's area, in part-local px², straight out of the emitted
 * artifact's own weighted run and triangle list.
 *
 * A pinned mesh's bind coordinates differ from its world ones by one bone
 * translation, which every triangle shares and no area sees, so this is the
 * posed area too. It is the absolute reference the contour rungs need: a
 * triangle reverses when the displacement crosses it, and a sliver's tolerance
 * for displacement is its own area over its longest edge.
 */
export function setupTriangleAreas(skeletonText: string): number[] {
  interface Emitted {
    skins: Array<{ attachments: { part: { part: { vertices: number[]; triangles: number[] } } } }>;
  }
  const mesh = (JSON.parse(skeletonText) as Emitted).skins[0].attachments.part.part;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < mesh.vertices.length; ) {
    const n = mesh.vertices[i++];
    if (n !== 1) throw new Error(`a density rung emitted a vertex with ${n} influences; these are pinned meshes`);
    xs.push(mesh.vertices[i + 1]);
    ys.push(mesh.vertices[i + 2]);
    i += 4;
  }
  const areas: number[] = [];
  for (let t = 0; t < mesh.triangles.length; t += 3) {
    const [a, b, c] = [mesh.triangles[t], mesh.triangles[t + 1], mesh.triangles[t + 2]];
    areas.push(Math.abs((xs[b] - xs[a]) * (ys[c] - ys[a]) - (xs[c] - xs[a]) * (ys[b] - ys[a])) / 2);
  }
  return areas;
}

export function recoverDepths(skeletonText: string, degrees: number): number[] {
  interface Emitted {
    skins: Array<{ attachments: { part: { part: { vertices: number[] } } } }>;
    animations: { turn: { attachments: { default: { part: { part: { deform: Array<{ vertices: number[] }> } } } } } };
  }
  const skel = JSON.parse(skeletonText) as Emitted;
  const run = skel.skins[0].attachments.part.part.vertices;
  const us: number[] = [];
  for (let i = 0; i < run.length; ) {
    const n = run[i++];
    if (n !== 1) throw new Error(`a density rung emitted a vertex with ${n} influences; these are pinned meshes`);
    us.push(run[i + 1]);
    i += 4;
  }
  const offsets = skel.animations.turn.attachments.default.part.part.deform[0].vertices;
  const rad = (degrees * Math.PI) / 180;
  const cosMinus1 = Math.cos(rad) - 1;
  const sin = Math.sin(rad);
  return us.map((u, v) => (u * cosMinus1 - offsets[2 * v]) / sin);
}

type Generator = Record<string, unknown>;

function rigSpec(generator: Generator, triangleBudget: number): Record<string, unknown> {
  return {
    spec: 'rigc-rig/1',
    name: 'density_probe',
    skeleton: { width: 512, height: 512 },
    invariants: { meshSlots: 1, meshTriangles: triangleBudget },
    bones: [{ name: 'root' }, { name: 'part', parent: 'root', x: 0, y: 0 }],
    slots: [{ name: 'part', bone: 'part', attachment: 'part' }],
    skins: {
      default: {
        part: {
          part: { type: 'mesh', image: 'part.png', generator },
        },
      },
    },
  };
}

function motionSpec(degrees: number, keyCount = 1): Record<string, unknown> {
  return {
    spec: 'rigc-motion/1',
    archetype: 'density_probe',
    cut: 'density_probe',
    easings: {},
    animations: {
      turn: {
        duration: 1,
        tracks: [],
        deform: [
          {
            slot: 'part',
            attachment: 'part',
            keys: Array.from({ length: keyCount }, (_, i) => ({
              t: (i + 1) / keyCount,
              // Each key a different angle: a repeated one would compress
              // differently and the question is what a key COSTS.
              transform: { kind: 'yaw', depth: true, degrees: degrees - i },
            })),
          },
        ],
      },
    },
  };
}

export interface Rung {
  label: string;
  generator: Generator;
}

export interface Reading {
  label: string;
  vertices: number;
  triangles: number;
  /** milliseconds */
  compileMs: number;
  validateMs: number;
  surveyMs: number;
  skeletonBytes: number;
  /** Assertions that failed at the measured angle, by name. */
  failures: string[];
  /** Least and greatest z the mesh's own vertices sampled, world units. */
  zMin: number;
  zMax: number;
  /** Setup triangle areas, px²: the smallest and the median. */
  areaMin: number;
  areaMedian: number;
  refusal?: string;
}

interface Built {
  vertices: number;
  triangles: number;
  compileMs: number;
  skeletonText: string;
  atlasText: string;
  outDir: string;
}

function build(
  dir: string,
  generator: Generator,
  degrees: number,
  budget: number,
  tag: string,
  keyCount = 1,
): Built {
  const rigPath = join(dir, `${tag}.rig.json`);
  const motionPath = join(dir, `${tag}.motion.json`);
  writeFileSync(rigPath, `${JSON.stringify(rigSpec(generator, budget), null, 2)}\n`);
  writeFileSync(motionPath, `${JSON.stringify(motionSpec(degrees, keyCount), null, 2)}\n`);
  const outDir = join(dir, `${tag}.spine`);
  const t0 = performance.now();
  const result = compile({ rigPath, motionPath, outDir, imagesDir: dir });
  const compileMs = performance.now() - t0;
  const mesh = result.meshes[0];
  return {
    vertices: mesh.vertices,
    triangles: mesh.triangles,
    compileMs,
    skeletonText: result.skeletonText,
    atlasText: result.atlasText,
    outDir,
  };
}

export function measure(dir: string, rung: Rung, degrees: number, budget: number): Reading {
  let built: Built;
  try {
    built = build(dir, rung.generator, degrees, budget, rung.label.replace(/[^\w.-]/g, '_'));
  } catch (err) {
    return {
      label: rung.label,
      vertices: 0,
      triangles: 0,
      compileMs: 0,
      validateMs: 0,
      surveyMs: 0,
      skeletonBytes: 0,
      failures: [],
      zMin: 0,
      zMax: 0,
      areaMin: 0,
      areaMedian: 0,
      refusal: err instanceof CompileError ? err.message : `NOT a CompileError: ${(err as Error).message}`,
    };
  }
  // The validator wants the rig's own structural facts; a bare directory SKIPs
  // the archetype rules, A39 among them, and A39 is the subject.
  const rigInfo = JSON.parse(
    JSON.stringify({ meshKinds: { part: (rung.generator as { kind: string }).kind }, deformMayFold: [] }),
  );
  const t1 = performance.now();
  const report = validate({
    skeletonText: built.skeletonText,
    atlasText: built.atlasText,
    atlasDir: built.outDir,
    profile: 'spine',
    rig: rigInfo,
  });
  const validateMs = performance.now() - t1;
  const t2 = performance.now();
  surveyDeformKeys(skeletonDataFromText(built.skeletonText, built.atlasText), new Set());
  const surveyMs = performance.now() - t2;
  const zs = recoverDepths(built.skeletonText, degrees);
  const areas = setupTriangleAreas(built.skeletonText).sort((a, b) => a - b);
  return {
    label: rung.label,
    vertices: built.vertices,
    triangles: built.triangles,
    compileMs: built.compileMs,
    validateMs,
    surveyMs,
    skeletonBytes: Buffer.byteLength(built.skeletonText),
    failures: report.failures.map((f) => f.assertion),
    zMin: Math.min(...zs),
    zMax: Math.max(...zs),
    areaMin: areas[0],
    areaMedian: areas[areas.length >> 1],
  };
}

/** The grid rungs: square lattices, each roughly quadrupling the triangle count. */
export const GRID_SIDES = [5, 9, 17, 33, 65, 97, 129, 181] as const;
/** The contour rungs: Douglas-Peucker tolerance, in part-local pixels. */
export const CONTOUR_TOLERANCES = [8, 4, 2, 1, 0.5, 0.25] as const;

/**
 * The largest whole-degree turn A39 admits, and the first degree it refuses.
 *
 * A linear walk upward rather than a bisection, because nothing here has
 * measured the reversal count to be monotone in the angle, and a bisection
 * would be quoting that property without having established it.
 */
export function foldSearch(
  dir: string,
  rung: Rung,
  budget: number,
  ceiling = 90,
): { last: number | null; first: number | null } {
  let last: number | null = null;
  for (let deg = 1; deg <= ceiling; deg++) {
    const built = build(dir, rung.generator, deg, budget, `fold_${rung.label.replace(/[^\w.-]/g, '_')}`);
    const survey = surveyDeformKeys(skeletonDataFromText(built.skeletonText, built.atlasText), new Set());
    if (survey.keys.reduce((n, k) => n + k.reversed.length, 0) > 0) return { last, first: deg };
    last = deg;
  }
  return { last, first: null };
}

/**
 * The fold angle this dome predicts for an even lattice of `side` columns,
 * in degrees — the absolute reference the measured ladder is read against.
 *
 * The outermost pair of columns is the one that crosses first: over a window of
 * `W` pixels the spacing is `h = W/(side-1)`, and the dome
 * `z(u) = Z sqrt(1 - (u/R)^2)` drops from `Z sqrt(2h/R)` to 0 across it. Two
 * vertices swap when `tan t >= du/dz`, so
 *
 *     tan t = h / (Z sqrt(2h/R)) = sqrt(h) sqrt(R/2) / Z
 *
 * ⭐ Which goes to ZERO as the lattice refines. The cliff is not the cylinder
 * model that #381 stage 1 measured it under: it is the depth map's own steepest
 * gradient, and a dome is VERTICAL at its rim, so a finer mesh simply gets
 * nearer to that vertical and folds sooner. Per-vertex depth does not lift it.
 */
export function predictedFoldDegrees(side: number): number {
  const R = W / 2;
  const h = W / (side - 1);
  return (Math.atan((Math.sqrt(h) * Math.sqrt(R / 2)) / Z_SCALE) * 180) / Math.PI;
}

/**
 * The raised cosine's fold angle — a FLOOR, with no `side` in it.
 *
 * Its steepest gradient is `Z pi / 2R`, attained at half radius and nowhere
 * exceeded, so `tan t = 2R / (Z pi)` whatever the lattice does. ⭐ This is the
 * design rule the dome ladder is the counter-example to: **the turn a part
 * supports is a property of its depth map's steepest slope, and a map whose
 * slope is bounded turns the same angle at every density.**
 */
export function predictedCosineFoldDegrees(): number {
  const R = W / 2;
  return (Math.atan((2 * R) / (Z_SCALE * Math.PI)) * 180) / Math.PI;
}

/**
 * What a SECOND key costs, against what the setup mesh costs once.
 *
 * ⚠️ Measured rather than derived. Estimating it from bytes-per-vertex was tried
 * and was wrong by a factor of four — the setup mesh carries a five-number
 * weighted run, a uv pair and a triangle list, and a key carries two offsets, so
 * the per-key share is a small fraction of the per-vertex one and any figure
 * quoted for "N keys" has to come off the emitter.
 */
export function keyLadder(dir: string, side: number, depth: Record<string, unknown>, counts: readonly number[]): Array<{ keys: number; bytes: number }> {
  return counts.map((keys) => {
    const built = build(dir, { kind: 'grid', cols: side, rows: side, depth }, 12, 1_000_000, `keys_${keys}`, keys);
    return { keys, bytes: Buffer.byteLength(built.skeletonText) };
  });
}

function fmt(n: number, places = 2): string {
  return n.toFixed(places);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--')) ?? join(process.cwd(), 'render', 'density');
  const degrees = Number(args.find((a) => a.startsWith('--degrees='))?.slice(10) ?? 12);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeArt(join(dir, 'part.png'));
  writeDepth(join(dir, 'dome_depth.png'), 'dome');
  writeDepth(join(dir, 'flat_depth.png'), 'flat');
  writeDepth(join(dir, 'cosine_depth.png'), 'cosine');

  const rungsFor = (sheet: Sheet): Rung[] => {
    const depth = { image: `${sheet}_depth.png`, near: 'white', zScale: Z_SCALE };
    return [
      ...GRID_SIDES.map((n) => ({ label: `grid-${n}`, generator: { kind: 'grid', cols: n, rows: n, depth } })),
      ...CONTOUR_TOLERANCES.map((t) => ({
        label: `contour-${t}`,
        generator: { kind: 'contour', tolerance: t, margin: Math.max(t, 1), maxVertices: 100000, depth },
      })),
    ];
  };

  console.log(`# density probe — part ${W}x${H}, zScale ${Z_SCALE}, yaw ${degrees} deg`);
  console.log('');
  console.log('## Cost, on the dome sheet');
  console.log('');
  console.log('| rung | vertices | triangles | compile ms | validate ms | survey ms | skeleton bytes | b/vertex | failures |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const dome = rungsFor('dome');
  const readings = new Map<string, Reading>();
  for (const rung of dome) {
    const r = measure(dir, rung, degrees, 1_000_000);
    readings.set(r.label, r);
    if (r.refusal) {
      console.log(`| ${r.label} | — | — | — | — | — | — | — | REFUSED: ${r.refusal.slice(0, 100)} |`);
      continue;
    }
    console.log(
      `| ${r.label} | ${r.vertices} | ${r.triangles} | ${fmt(r.compileMs)} | ${fmt(r.validateMs)} | ` +
        `${fmt(r.surveyMs)} | ${r.skeletonBytes} | ${fmt(r.skeletonBytes / r.vertices, 0)} | ` +
        `${r.failures.join(', ') || 'none'} |`,
    );
  }

  console.log('');
  console.log(`## What a second key costs, at grid-${GRID_SIDES[GRID_SIDES.length - 1]}`);
  console.log('');
  console.log('| deform keys | skeleton bytes | added by the last key |');
  console.log('| --- | --- | --- |');
  {
    const domeDepth = { image: 'dome_depth.png', near: 'white', zScale: Z_SCALE };
    const ladder = keyLadder(dir, GRID_SIDES[GRID_SIDES.length - 1], domeDepth, [1, 2, 4, 8]);
    ladder.forEach((row, i) => {
      const prev = i === 0 ? null : ladder[i - 1];
      const per = prev ? (row.bytes - prev.bytes) / (row.keys - prev.keys) : null;
      console.log(`| ${row.keys} | ${row.bytes} | ${per === null ? '—' : `${fmt(per, 0)} per key`} |`);
    });
  }

  console.log('');
  console.log('## The depth each generator actually samples, world units');
  console.log('');
  console.log('| rung | vertices | z min | z max | span of zScale | smallest triangle px² | median triangle px² |');
  console.log('| --- | --- | --- | --- | --- | --- | --- |');
  for (const rung of dome) {
    const r = readings.get(rung.label);
    if (!r || r.refusal) continue;
    console.log(
      `| ${r.label} | ${r.vertices} | ${fmt(r.zMin)} | ${fmt(r.zMax)} | ` +
        `${fmt((100 * (r.zMax - r.zMin)) / Z_SCALE, 1)} % | ${r.areaMin.toExponential(2)} | ` +
        `${fmt(r.areaMedian, 3)} |`,
    );
  }

  console.log('');
  console.log('## The fold angle: dome against the flat control, and against the closed form');
  console.log('');
  console.log(
    '| rung | vertices | dome: last | dome predicted | cosine: last | cosine predicted | flat: last |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- |');
  const flat = rungsFor('flat');
  const cosine = rungsFor('cosine');
  const cosPred = `${fmt(predictedCosineFoldDegrees(), 1)}°`;
  for (let i = 0; i < dome.length; i++) {
    const r = readings.get(dome[i].label);
    if (!r || r.refusal) continue;
    const d = foldSearch(dir, dome[i], 1_000_000);
    const c = foldSearch(dir, cosine[i], 1_000_000);
    const f = foldSearch(dir, flat[i], 1_000_000);
    const side = dome[i].label.startsWith('grid-') ? Number(dome[i].label.slice(5)) : null;
    const pred = side === null ? '—' : `${fmt(predictedFoldDegrees(side), 1)}°`;
    console.log(
      `| ${dome[i].label} | ${r.vertices} | ${d.last ?? '—'} | ${pred} | ${c.last ?? '—'} | ${cosPred} | ` +
        `${f.last ?? '—'} |`,
    );
  }
}
