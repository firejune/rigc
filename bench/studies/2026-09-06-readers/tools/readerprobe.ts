/**
 * The reader probe — what each of spine-core's six `FromProperty` subclasses can
 * actually PRODUCE.
 *
 * A slider with a bone maps `time = offset + (value − property.offset) · scale`,
 * where `value` is one call to `data.property.value(skeleton, bone.appliedPose,
 * data.local, Slider.offsets)`. If an author states a range that includes
 * readings the runtime cannot return, that part of the dial is dead: it never
 * selects the frames it was meant to, and nothing at runtime reports it. That is
 * the defect [#405](https://github.com/firejune/rigc/issues/405) and
 * [#417](https://github.com/firejune/rigc/issues/417) each closed for ONE reader
 * — `FromRotate` under `local: false`. This measures the other eleven cells.
 *
 * ## Measured, not derived
 *
 * The bound is never computed from the source here. The source is read to know
 * WHERE to look — which pose axis moves which term, which branch a signed zero
 * lands in — and then a skeleton is posed through spine-core and
 * `property.value` is called, exactly as `Slider.update` calls it. That is the
 * standing rule this repository put in writing in #403: a prediction chooses
 * where to look, a measurement decides. The two places a closed form appears
 * below are `--experiment=controls`, where they are printed BESIDE the measured
 * extreme so the reader can see the agreement rather than take it.
 *
 * ## What is this file's own, and what is spine-core's
 *
 * - The **skeleton** is built by `compile()` from a rig spec, so the six reader
 *   classes under test are the ones the parser built out of rigc's own
 *   `property` strings — not classes this file picked. `--experiment=controls`
 *   prints the `instanceof` for all twelve.
 * - The **reading** is always `slider.property.value(...)`. Nothing here
 *   reimplements a reader.
 * - The **offsets array** is always the one `Slider` hands its reader:
 *   `Slider.offsets` is a private static all-zero array, so a slider cannot pass
 *   anything else. `--experiment=controls` reads it off a live `Slider` rather
 *   than restating it, and `--experiment=offsets` measures what a NON-zero array
 *   would do, because the same six readers serve `TransformConstraint`, which
 *   does pass its own.
 *
 * ## The one thing that surprises every figure below
 *
 * `MathUtils.PI` is `3.1415927` — the float32 π of the reference runtime, not
 * `Math.PI`. Every degree in spine-core therefore passes through a `radDeg` that
 * is `180 / 3.1415927`, which is 2.7e-8 relative off. That is why a full turn
 * converts to **359.99999468178214°** and not 360°, why a bone at 360° reads
 * 5.3e-6° rather than 0°, and why `FromShearY`'s world bound is
 * `±2π · radDeg − 90` rather than a round number. It is measured in
 * `--experiment=controls` and it is not this file's arithmetic: it is the
 * runtime's.
 *
 *   bun bench/studies/2026-09-06-readers/tools/readerprobe.ts --experiment=<name>
 *
 * There is no work directory. Nothing here needs a store: the whole fixture is
 * one 12x8 plate and one build, made fresh in the OS temp directory on every run
 * and left there for the OS to reap. `--seed` seeds the pose sweep only.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FromRotate,
  FromScaleX,
  FromScaleY,
  FromShearY,
  FromX,
  FromY,
  MathUtils,
  Physics,
  Skeleton,
  Slider,
  SliderData,
  type BonePose,
  type SkeletonData,
} from '@esotericsoftware/spine-core';
import { compile } from '../../../../src/compile.ts';
import { skeletonDataFromText } from '../../../../src/deformmeasure.ts';
import { Plate } from '../../../../tools/plate.ts';

// ---------------------------------------------------------------------------
// The fixture
// ---------------------------------------------------------------------------

/** The rig spec's own six property names, in the order `src/rig.ts` states them. */
const PROPS = ['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearY'] as const;
type Prop = (typeof PROPS)[number];

/** The twelve cells: one per property per `local` flag. */
function cellNames(): string[] {
  const out: string[] = [];
  for (const p of PROPS) for (const w of ['world', 'local']) out.push(`${p}-${w}`);
  return out;
}

/**
 * The reader class the parser is expected to build for each `property`, taken
 * from `SkeletonJson`'s own mapping rather than from a guess. `controls` asserts
 * this against what the parse actually produced, so a rename in spine-core is a
 * red line rather than a silent relabelling.
 */
function expectedReader(prop: Prop): string {
  const table: Record<Prop, string> = {
    rotate: 'FromRotate',
    x: 'FromX',
    y: 'FromY',
    scaleX: 'FromScaleX',
    scaleY: 'FromScaleY',
    shearY: 'FromShearY',
  };
  return table[prop];
}

/** The local pose fields a probe sets, spelled once. */
interface BoneFields {
  rotation?: number;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  shearX?: number;
  shearY?: number;
}

/** A whole probe pose: the skeleton's own scale plus three bones' local fields. */
interface ProbePose {
  skeletonScaleX?: number;
  skeletonScaleY?: number;
  gp?: BoneFields;
  parent?: BoneFields;
  src?: BoneFields;
  driver?: BoneFields;
}

/**
 * The rig every experiment reads: a three-deep chain `root → gp → parent → src`
 * and twelve sliders on `src`, one per cell.
 *
 * ⚠️ `scale: 0.005` on a 1 s animation is not decorative. `from: 0` with a
 * smaller scale puts the `rotate` world dial's range past 360°, which
 * `src/compile.ts` refuses by name — so the fixture would not build at all. The
 * refusal firing on the harness's first draft is the shortest possible statement
 * that the guard under discussion is live.
 *
 * `pinned` adds a transform constraint over `src` AHEAD of the sliders, which is
 * what `--experiment=local` needs: a bone whose world transform a constraint
 * moved reaches `FromProperty.value` through `validateLocalTransform`.
 */
function buildFixture(pinned: boolean): SkeletonData {
  const dir = mkdtempSync(join(tmpdir(), 'rigc-readers-'));
  const plate = new Plate(12, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) plate.set(x, y, [40, 60, 90, 255]);
  plate.writePng(join(dir, 'block.png'));
  const constraints: Array<Record<string, unknown>> = [];
  if (pinned) {
    constraints.push({
      name: 'pin',
      type: 'transform',
      bones: ['src'],
      source: 'driver',
      properties: {
        rotate: { to: { rotate: {} } },
        x: { to: { x: {} } },
        y: { to: { y: {} } },
        scaleX: { to: { scaleX: {} } },
        scaleY: { to: { scaleY: {} } },
        shearY: { to: { shearY: {} } },
      },
      mixRotate: 1,
      mixX: 1,
      mixY: 1,
      mixScaleX: 1,
      mixScaleY: 1,
      mixShearY: 1,
    });
  }
  for (const prop of PROPS) {
    for (const local of [false, true]) {
      constraints.push({
        name: `${prop}-${local ? 'local' : 'world'}`,
        type: 'slider',
        animation: 'wave',
        bone: 'src',
        property: prop,
        from: 0,
        to: 0,
        scale: 0.005,
        local,
      });
    }
  }
  const rig = {
    spec: 'rigc-rig/1',
    name: 'reader_probe',
    skeleton: { width: 64, height: 64 },
    bones: [
      { name: 'root' },
      { name: 'gp', parent: 'root', x: 0, y: 0 },
      { name: 'parent', parent: 'gp', x: 0, y: 0 },
      { name: 'src', parent: 'parent', x: 0, y: 0, length: 10 },
      { name: 'driver', parent: 'root', x: 0, y: 0, length: 10 },
      { name: 'flag', parent: 'root', x: 20, y: 0, length: 10 },
      { name: 'block', parent: 'root', x: 0, y: 0, length: 12 },
    ],
    slots: [{ name: 'block', bone: 'block', attachment: 'block' }],
    skins: { default: { block: { block: { image: 'block.png' } } } },
    constraints,
  };
  const motion = {
    spec: 'rigc-motion/1',
    archetype: 'reader_probe',
    cut: 'reader_probe',
    easings: {},
    animations: {
      wave: {
        duration: 1,
        loop: false,
        tracks: [{ bone: 'flag', property: 'rotate', keys: [{ t: 0, v: [0] }, { t: 1, v: [30] }] }],
      },
    },
  };
  const rigPath = join(dir, 'reader.rig.json');
  const motionPath = join(dir, 'reader.motion.json');
  writeFileSync(rigPath, `${JSON.stringify(rig, null, 2)}\n`);
  writeFileSync(motionPath, `${JSON.stringify(motion, null, 2)}\n`);
  const out = compile({ rigPath, motionPath, outDir: join(dir, 'out'), imagesDir: dir });
  return skeletonDataFromText(out.skeletonText, out.atlasText);
}

/** The twelve `SliderData` by name. */
function slidersOf(data: SkeletonData): Map<string, SliderData> {
  const map = new Map<string, SliderData>();
  for (const constraint of data.constraints) {
    if (constraint instanceof SliderData) map.set(constraint.name, constraint);
  }
  return map;
}

/**
 * A slider by name, or a throw. There are exactly twelve and they are named by
 * construction, so a miss is a broken fixture and not a case to fall back from.
 */
function sliderNamed(sliders: Map<string, SliderData>, name: string): SliderData {
  const found = sliders.get(name);
  if (found === undefined) throw new Error(`readerprobe: the fixture has no slider "${name}"`);
  return found;
}

/** Write a bone's local pose fields, one named field at a time. */
function poseBone(skeleton: Skeleton, name: string, fields: BoneFields | undefined): void {
  if (fields === undefined) return;
  const bone = skeleton.findBone(name);
  if (bone === null) throw new Error(`readerprobe: the fixture has no bone "${name}"`);
  const pose = bone.pose;
  if (fields.rotation !== undefined) pose.rotation = fields.rotation;
  if (fields.x !== undefined) pose.x = fields.x;
  if (fields.y !== undefined) pose.y = fields.y;
  if (fields.scaleX !== undefined) pose.scaleX = fields.scaleX;
  if (fields.scaleY !== undefined) pose.scaleY = fields.scaleY;
  if (fields.shearX !== undefined) pose.shearX = fields.shearX;
  if (fields.shearY !== undefined) pose.shearY = fields.shearY;
}

/**
 * One reading, taken the way `Slider.update` takes it.
 *
 * The four steps are the runtime's own and the order is load-bearing: set up,
 * write the local pose, run the world transform, and — only under `local` —
 * `validateLocalTransform`, which is the call that decides whether the local
 * branch reads the number the author wrote or a decomposition of what the
 * constraints left behind (`--experiment=local`).
 */
function readAt(data: SkeletonData, slider: SliderData, pose: ProbePose, offsets: number[] = ZERO_OFFSETS): number {
  const skeleton = new Skeleton(data);
  skeleton.setupPose();
  if (pose.skeletonScaleX !== undefined) skeleton.scaleX = pose.skeletonScaleX;
  if (pose.skeletonScaleY !== undefined) skeleton.scaleY = pose.skeletonScaleY;
  skeleton.update(0);
  poseBone(skeleton, 'gp', pose.gp);
  poseBone(skeleton, 'parent', pose.parent);
  poseBone(skeleton, 'src', pose.src);
  poseBone(skeleton, 'driver', pose.driver);
  skeleton.updateWorldTransform(Physics.reset);
  const bone = skeleton.findBone('src');
  if (bone === null) throw new Error('readerprobe: the fixture has no bone "src"');
  if (slider.local) bone.appliedPose.validateLocalTransform(skeleton);
  return slider.property.value(skeleton, bone.appliedPose, slider.local, offsets);
}

/** The array `Slider` hands every reader. Read off a live `Slider` in `controls`. */
const ZERO_OFFSETS = [0, 0, 0, 0, 0, 0];

/** A deterministic LCG in `[0, 1)` — the sweep's only source of variation. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// The reported table
// ---------------------------------------------------------------------------

/**
 * ⭐ The two numbers `FromShearY`'s world bound is made of, and the ONLY closed
 * forms in this file.
 *
 * They are here because a reader has to be able to check the measured extreme
 * against something, and `±2π · radDeg − 90` is checkable by eye once
 * `MathUtils.PI` is on the page. Nothing branches on them: every table cell
 * below is a measured extreme, and `controls` prints the difference.
 */
function shearWorldClosedForm(): { low: number; high: number } {
  return {
    low: (-Math.PI - Math.PI) * MathUtils.radDeg - 90,
    high: (Math.PI - -Math.PI) * MathUtils.radDeg - 90,
  };
}

/** What one cell's sweep accumulated. */
interface Cell {
  n: number;
  finite: number;
  nan: number;
  infinite: number;
  min: number;
  max: number;
  minAt: string;
  maxAt: string;
}

function emptyCell(): Cell {
  return { n: 0, finite: 0, nan: 0, infinite: 0, min: Infinity, max: -Infinity, minAt: '', maxAt: '' };
}

/** A cell by name, or a throw — the twelve are created up front by `cellNames`. */
function cellNamed(cells: Map<string, Cell>, name: string): Cell {
  const found = cells.get(name);
  if (found === undefined) throw new Error(`readerprobe: no accumulator for cell "${name}"`);
  return found;
}

function feed(cell: Cell, value: number, at: string): void {
  cell.n++;
  if (Number.isNaN(value)) {
    cell.nan++;
    return;
  }
  if (!Number.isFinite(value)) {
    cell.infinite++;
    return;
  }
  cell.finite++;
  if (value < cell.min) {
    cell.min = value;
    cell.minAt = at;
  }
  if (value > cell.max) {
    cell.max = value;
    cell.maxAt = at;
  }
}

/** `n` with thousands separators, so a 40,000-sample column reads at a glance. */
function grouped(n: number): string {
  return n.toLocaleString('en-US');
}

// ---------------------------------------------------------------------------
// The pose sweep
// ---------------------------------------------------------------------------

/**
 * The pose axes the sweep draws from.
 *
 * ⭐ Chosen to straddle every branch the six readers have: the `atan2` seams at
 * 0° and ±180°, the sign of every scale (so the determinant takes both signs),
 * a zero scale (the degenerate bone), an underflowing and an overflowing scale,
 * and a skeleton scale of either sign. A uniform random sweep over "reasonable"
 * angles would never land on a seam, and a seam is where all four bounded cells
 * live.
 */
function poseAxes(): { angles: number[]; scales: number[]; translations: number[]; skeletonScales: number[] } {
  return {
    angles: [
      -540, -370, -270, -180.0001, -180, -179.9999, -90, -45, -0.0001, 0, 0.0001, 45, 89.9999, 90, 90.0001, 135,
      179.9999, 180, 180.0001, 270, 359.9999, 360, 361, 540, 1000,
    ],
    scales: [-3, -1, -0.5, -1e-9, 0, 1e-9, 0.5, 1, 3, 1e6],
    translations: [-1e6, -1000, -1, 0, 1, 1000, 1e6],
    skeletonScales: [1, -1, 2, -0.5, 0.25],
  };
}

function sweep(data: SkeletonData, sliders: Map<string, SliderData>, seed: number, samples: number): Map<string, Cell> {
  const axes = poseAxes();
  const random = lcg(seed);
  const pick = <T>(xs: T[]): T => xs[Math.floor(random() * xs.length)];
  const bone = (): BoneFields => ({
    rotation: pick(axes.angles),
    x: pick(axes.translations),
    y: pick(axes.translations),
    scaleX: pick(axes.scales),
    scaleY: pick(axes.scales),
    shearX: pick(axes.angles),
    shearY: pick(axes.angles),
  });
  const cells = new Map<string, Cell>();
  for (const name of cellNames()) cells.set(name, emptyCell());
  for (let i = 0; i < samples; i++) {
    const pose: ProbePose = {
      skeletonScaleX: pick(axes.skeletonScales),
      skeletonScaleY: pick(axes.skeletonScales),
      gp: bone(),
      parent: bone(),
      src: bone(),
    };
    const at = `sample ${i}`;
    for (const [name, slider] of sliders) feed(cellNamed(cells, name), readAt(data, slider, pose), at);
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

interface Options {
  seed: number;
  samples: number;
}

function header(title: string, options: Options, args: string): void {
  console.log(`# reader probe — ${title}`);
  console.log('');
  console.log(`invocation: bun bench/studies/2026-09-06-readers/tools/readerprobe.ts ${args}`);
  console.log(`seed ${options.seed}, ${grouped(options.samples)} sweep samples, spine-core 4.3.13`);
  console.log('');
}

/**
 * Everything the rest of the file is allowed to assume, measured before any of
 * it runs.
 */
function experimentControls(options: Options): void {
  header('controls', options, '--experiment=controls');
  const data = buildFixture(false);
  const sliders = slidersOf(data);

  console.log('## The twelve readers are the ones rigc\'s own `property` produced');
  console.log('');
  console.log('| slider | rig `property` | `"local"` | reader class the parser built | expected | `property.offset` |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  let readerFaults = 0;
  for (const prop of PROPS) {
    for (const where of ['world', 'local']) {
      const name = `${prop}-${where}`;
      const slider = sliderNamed(sliders, name);
      if (slider === undefined) throw new Error(`readerprobe: the fixture lost slider "${name}"`);
      const built = slider.property.constructor.name;
      const want = expectedReader(prop);
      if (built !== want || slider.local !== (where === 'local')) readerFaults++;
      console.log(
        `| \`${name}\` | \`${prop}\` | \`${where === 'local'}\` | \`${built}\` | \`${want}\` | ${slider.property.offset} |`,
      );
    }
  }
  console.log('');
  console.log(`reader/flag disagreements: ${readerFaults}`);
  console.log('');

  console.log('## `instanceof`, against the six classes by name');
  console.log('');
  const byClass: Array<[string, (p: unknown) => boolean]> = [
    ['FromRotate', (p) => p instanceof FromRotate],
    ['FromX', (p) => p instanceof FromX],
    ['FromY', (p) => p instanceof FromY],
    ['FromScaleX', (p) => p instanceof FromScaleX],
    ['FromScaleY', (p) => p instanceof FromScaleY],
    ['FromShearY', (p) => p instanceof FromShearY],
  ];
  for (const prop of PROPS) {
    const slider = sliderNamed(sliders, `${prop}-world`);
    const hits = byClass.filter(([, test]) => test(slider.property)).map(([n]) => n);
    console.log(`  \`${prop}\` -> ${hits.length === 1 ? hits[0] : `${hits.length} matches: ${hits.join(', ')}`}`);
  }
  console.log('');

  console.log('## The offsets array a slider hands its reader, read off a live `Slider`');
  console.log('');
  const skeleton = new Skeleton(data);
  skeleton.setupPose();
  skeleton.update(0);
  skeleton.updateWorldTransform(Physics.reset);
  const live = skeleton.constraints.filter((c) => c instanceof Slider);
  const offsetsField = (Slider as unknown as { offsets: number[] }).offsets;
  console.log(`  live \`Slider\` instances: ${live.length}`);
  console.log(`  \`Slider.offsets\` = [${offsetsField.join(', ')}]  — all zero: ${offsetsField.every((v) => v === 0)}`);
  console.log('  it is a `private static readonly` on the class, so a slider cannot hand a reader anything else.');
  console.log('  `--experiment=offsets` measures what a non-zero array does, because `TransformConstraint` passes its own.');
  console.log('');

  console.log('## The reading IS the slider\'s time — the mapping, through the runtime');
  console.log('');
  console.log('| slider | `property.value` | `offset + (value − property.offset)·scale` | `SliderPose.time` stored | Δ |');
  console.log('| --- | --- | --- | --- | --- |');
  let worstTime = 0;
  for (const prop of PROPS) {
    const name = `${prop}-local`;
    const slider = sliderNamed(sliders, name);
    const pose: ProbePose = { src: { rotation: 20, x: 30, y: 40, scaleX: 1.5, scaleY: 1.25, shearY: 12 } };
    const value = readAt(data, slider, pose);
    const wanted = Math.max(0, slider.offset + (value - slider.property.offset) * slider.scale);
    const posed = new Skeleton(data);
    posed.setupPose();
    posed.update(0);
    poseBone(posed, 'src', pose.src);
    posed.updateWorldTransform(Physics.reset);
    const instance = posed.constraints.find((c) => c instanceof Slider && c.data === slider) as Slider;
    const stored = instance.appliedPose.time;
    const delta = Math.abs(stored - wanted);
    if (delta > worstTime) worstTime = delta;
    console.log(`| \`${name}\` | ${value} | ${wanted} | ${stored} | ${delta.toExponential(2)} |`);
  }
  console.log('');
  console.log(`worst |stored − mapped|: ${worstTime.toExponential(2)} s`);
  console.log('');

  console.log('## The constant every degree below passes through');
  console.log('');
  console.log(`  \`MathUtils.PI\`     = ${MathUtils.PI}          (\`Math.PI\` = ${Math.PI})`);
  console.log(`  \`MathUtils.radDeg\` = ${MathUtils.radDeg}  (true 180/π = ${180 / Math.PI})`);
  console.log(`  a full turn converts as 2π·radDeg = ${2 * Math.PI * MathUtils.radDeg}`);
  const closed = shearWorldClosedForm();
  console.log(`  (π − −π)·radDeg − 90 = ${closed.high}`);
  console.log(`  (−π − π)·radDeg − 90 = ${closed.low}`);
  console.log('');
  console.log('⇒ every "5.3e-6°" in this study is that constant and not a tolerance anybody chose.');
}

/** The wide sweep: what turns up when the pose is thrown around. */
function experimentSweep(options: Options): void {
  header('sweep', options, `--experiment=sweep --seed=${options.seed}`);
  const data = buildFixture(false);
  const sliders = slidersOf(data);
  const cells = sweep(data, sliders, options.seed, options.samples);
  console.log('Every cell over the same poses: three bones and the skeleton scale drawn from the axes in `poseAxes`.');
  console.log('');
  console.log('| cell | samples | finite | NaN | ±∞ | min | max |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const name of cellNames()) {
    const cell = cellNamed(cells, name);
    console.log(
      `| \`${name}\` | ${grouped(cell.n)} | ${grouped(cell.finite)} | ${cell.nan} | ${cell.infinite} | ${cell.min} | ${cell.max} |`,
    );
  }
  console.log('');
  console.log('⚠️ A sweep gives an EXTREME, never a bound: it says what was seen, not what is possible.');
  console.log('   `--experiment=bounds` is what aims at the seams; this is what says nothing else turned up.');
}

/**
 * Where `value += 360` starts rounding a negative reading up to exactly 360 —
 * **found by bisection, not by arithmetic.**
 *
 * 🚨 The reason it is bisected is the defect it replaced. This printed
 * `(360 * Number.EPSILON) / 2` and called the answer "half an ulp of 360", which
 * it is not: `Number.EPSILON` is the ulp of **1.0**, the spacing of the binade
 * `[1, 2)`. 360 lives in `[256, 512)`, where the spacing is `256 · EPSILON`. The
 * expression overstated the threshold by a factor of 360/256 and the interval it
 * supported — `(−4.0e-14°, 0°)` — **claimed readings the reader does not
 * produce**, which is the exact failure this whole study is about.
 *
 * ⭐ The bisection is on `v + 360 === 360` — the runtime's own expression, with
 * nothing modelled. It brackets between a `lo` that is known to miss and a `hi`
 * that is known to reach, and walks until the two are adjacent doubles, so the
 * pair it returns is the boundary itself rather than a sample near it.
 * `halfUlp` is reported BESIDE the measurement, never used to compute it.
 */
function wrapThreshold(): { misses: number; reaches: number; halfUlp: number; steps: number; from: number; to: number } {
  const reaches360 = (v: number): boolean => v + 360 === 360;
  const from = -1e-13;
  const to = -0;
  if (reaches360(from)) throw new Error('readerprobe: the bracket is wrong — the low end already reaches 360');
  if (!reaches360(to)) throw new Error('readerprobe: the bracket is wrong — the high end does not reach 360');
  let lo = from;
  let hi = to;
  let steps = 0;
  // Bisect on the doubles between them; `(lo + hi) / 2` collapses onto one of the
  // ends once they are adjacent, which is the stopping condition.
  for (;;) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    steps++;
    if (reaches360(mid)) hi = mid;
    else lo = mid;
    if (steps > 4096) throw new Error('readerprobe: the bisection did not converge');
  }
  // ulp(360) read off the REPRESENTATION — the distance from 360 to the next
  // double above it — rather than off any binade constant. Writing
  // `256 * Number.EPSILON` here would be the same mistake one keystroke over:
  // right for 360, wrong for the next magnitude somebody reuses it at.
  const halfUlp = (nextDoubleAbove(360) - 360) / 2;
  return { misses: lo, reaches: hi, halfUlp, steps, from, to };
}

/** The next representable double above `x`, by incrementing its bit pattern. */
function nextDoubleAbove(x: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  view.setBigUint64(0, view.getBigUint64(0) + 1n);
  return view.getFloat64(0);
}

/** The seams, aimed at one at a time. */
function experimentBounds(options: Options): void {
  header('bounds', options, '--experiment=bounds');
  const data = buildFixture(false);
  const sliders = slidersOf(data);
  const rotate = sliderNamed(sliders, 'rotate-world');
  const scaleX = sliderNamed(sliders, 'scaleX-world');
  const scaleY = sliderNamed(sliders, 'scaleY-world');
  const shear = sliderNamed(sliders, 'shearY-world');

  console.log('## `FromRotate` world — the wrap, and the value #417 called unreachable');
  console.log('');
  console.log('`if (value < 0) value += 360` on an `atan2` that is a hair below zero ROUNDS: 360 is producible.');
  console.log('');
  console.log('| `src.rotation` | reading | `=== 0` | `=== 360` |');
  console.log('| --- | --- | --- | --- |');
  for (const rotation of [-0.001, -1e-6, -1e-9, -1e-12, -1e-13, -1e-14, -1e-15, 0, 1e-14, 0.001]) {
    const value = readAt(data, rotate, { src: { rotation } });
    console.log(`| ${rotation} | ${value} | ${value === 0} | ${value === 360} |`);
  }
  console.log('');
  const wrap = wrapThreshold();
  console.log(`  the largest reading that does NOT reach 360:  ${wrap.misses}  ->  ${wrap.misses + 360}`);
  console.log(`  the smallest reading that DOES reach 360:     ${wrap.reaches}  ->  ${wrap.reaches + 360}`);
  console.log(`  so the readings that arrive AS 360 are exactly [${wrap.reaches}°, 0°) — closed at the threshold.`);
  console.log(`  bisection: ${wrap.steps} step(s) from ${wrap.from}° to ${wrap.to}°, on \`v + 360 === 360\`.`);
  console.log(`  for the record: half an ulp of 360 is ${wrap.halfUlp}°, and the threshold IS that number: ` +
    `${wrap.reaches === -wrap.halfUlp}.`);
  console.log('  ⚠️ This line used to read `(360 * Number.EPSILON) / 2` and print 3.997e-14, which is 360/256 too');
  console.log('     large: `Number.EPSILON` is the ulp of 1.0, and 360 is in the binade [256, 512) where the');
  console.log('     spacing is 256·EPSILON. The stated interval then CLAIMED READINGS THE READER DOES NOT PRODUCE');
  console.log('     — inside a study whose subject is which values a reader can produce. It is the study\'s own');
  console.log('     subject in miniature: a formula right in the regime it was written for and silently wrong one');
  console.log('     binade over, which is #417, #431 and #434 in a row. It is bisected now, not derived.');
  console.log('');

  console.log('### …and the 5.3e-6° hole at 180°, which is the other half of the same `atan2`');
  console.log('');
  let below = -Infinity;
  let above = Infinity;
  let belowAt = '';
  let aboveAt = '';
  const noteHole = (value: number, at: string): void => {
    if (value <= 180 && value > below) {
      below = value;
      belowAt = at;
    }
    if (value > 180 && value < above) {
      above = value;
      aboveAt = at;
    }
  };
  // 200,001 bone rotations across the seam, at 1e-8° — finer than anything an
  // author writes and four orders finer than the hole itself.
  for (let i = 0; i <= 200000; i++) {
    const rotation = 179.999 + i * 1e-8;
    noteHole(readAt(data, rotate, { src: { rotation } }), `rotation=${rotation}`);
  }
  // The two exact ends, which are the two branches of `atan2` at ±π. A bone
  // pointing along −x reaches one or the other depending on the SIGN OF THE ZERO
  // in `c` — the only thing in this study that needs a signed zero to reproduce.
  noteHole(readAt(data, rotate, { src: { rotation: -0, shearX: -0, scaleX: -1 } }), 'rotation=−0 shearX=−0 scaleX=−1');
  noteHole(readAt(data, rotate, { src: { rotation: 0, shearX: 0, scaleX: -1 } }), 'rotation=+0 shearX=+0 scaleX=−1');
  console.log(`  largest reading at or below 180: ${below}   at ${belowAt}`);
  console.log(`  smallest reading above 180:      ${above}   at ${aboveAt}`);
  console.log(`  hole width: ${above - below}°  (π·radDeg = ${Math.PI * MathUtils.radDeg})`);
  console.log('  the image of `atan2` is (−π, π]; ×radDeg that is (−179.99999734…, 179.99999734…], and +360 puts');
  console.log('  the negative half at [180.00000265…, 360). Nothing lands between the two.');
  console.log('  ⚠️ A hole 5.3e-6° wide is not a hazard an author can fall into: no dial is that narrow. It is');
  console.log('     reported because the cell in the table has to be the truth, not a rounding of it.');
  console.log('');

  console.log('## `FromScaleX` / `FromScaleY` world — is the floor 0, and is 0 ATTAINED?');
  console.log('');
  console.log('| pose | `scaleX` world | `=== 0` | `scaleY` world | `=== 0` |');
  console.log('| --- | --- | --- | --- | --- |');
  const scaleCases: Array<[string, ProbePose]> = [
    ['`src.scale` 1', { src: { scaleX: 1, scaleY: 1 } }],
    ['`src.scale` 1e-9', { src: { scaleX: 1e-9, scaleY: 1e-9 } }],
    ['`src.scale` 1e-160 (a² is denormal)', { src: { scaleX: 1e-160, scaleY: 1e-160 } }],
    ['`src.scale` 1e-200 (a² underflows to 0)', { src: { scaleX: 1e-200, scaleY: 1e-200 } }],
    ['**`src.scale` 0 — the degenerate bone**', { src: { scaleX: 0, scaleY: 0 } }],
    ['`src.scaleX` 0 only', { src: { scaleX: 0 } }],
    ['`parent.scale` 0', { parent: { scaleX: 0, scaleY: 0 } }],
    ['`src.scaleX` −1 (a mirror)', { src: { scaleX: -1 } }],
    ['`src.scaleX` −3', { src: { scaleX: -3 } }],
    ['`src.scale` 1e150', { src: { scaleX: 1e150, scaleY: 1e150 } }],
    ['`src.scale` 1e200 (a² overflows)', { src: { scaleX: 1e200, scaleY: 1e200 } }],
  ];
  for (const [label, pose] of scaleCases) {
    const vx = readAt(data, scaleX, pose);
    const vy = readAt(data, scaleY, pose);
    console.log(`| ${label} | ${vx} | ${vx === 0} | ${vy} | ${vy === 0} |`);
  }
  console.log('');
  console.log('  the reader is `Math.sqrt(a² + c²)`, so a negative local scale comes back POSITIVE and the sign');
  console.log('  the author drove with is gone. 0 is not approached: a zero-scale bone reads exactly 0.');
  console.log('');

  console.log('## `FromShearY` world — a difference of two `atan2` calls, minus 90');
  console.log('');
  console.log('### the window one bone orientation gives, driving `shearY`');
  console.log('');
  console.log('| `src.rotation` | window low | window high | width | seams found |');
  console.log('| --- | --- | --- | ---: | --- |');
  for (const rotation of [0, 30, 90, 180, -90]) {
    let low = Infinity;
    let high = -Infinity;
    let previous: number | null = null;
    const seams: string[] = [];
    for (let s = -540; s <= 540; s += 0.25) {
      const value = readAt(data, shear, { src: { rotation, shearY: s } });
      if (value < low) low = value;
      if (value > high) high = value;
      if (previous !== null && Math.abs(value - previous) > 1) seams.push(`shearY≈${s.toFixed(2)}`);
      previous = value;
    }
    console.log(`| ${rotation} | ${low.toFixed(6)} | ${high.toFixed(6)} | ${(high - low).toFixed(6)} | ${seams.join(', ')} |`);
  }
  console.log('');
  console.log('  the width is 360 every time and the window SLIDES with the bone\'s world x-axis angle θx:');
  console.log('  it is `(−270 − θx, 90 − θx]`. So a `shearY` world dial wraps exactly as a `rotate` one does,');
  console.log('  and the seam is not at a fixed value of the driven field — it is wherever the bone is pointing.');
  console.log('');

  console.log('### the two extremes, and the determinant\'s sign');
  console.log('');
  const closed = shearWorldClosedForm();
  let shearLow = Infinity;
  let shearHigh = -Infinity;
  let shearLowAt = '';
  let shearHighAt = '';
  let detNegLow = Infinity;
  let detNegHigh = -Infinity;
  let detPosLow = Infinity;
  let detPosHigh = -Infinity;
  for (const eps of [0, 1e-3, 1e-6, 1e-9, 1e-12, 1e-14]) {
    for (const rotation of [-180 + eps, -180 - eps, 180 + eps, 180 - eps, eps, -eps]) {
      for (const shearY of [-180 + eps, -180 - eps, 180 + eps, 180 - eps, -90 + eps, -90 - eps, 90 + eps, 90 - eps, -270 + eps, -270 - eps]) {
        for (const shearX of [0, 180 - eps, -180 + eps]) {
          for (const sx of [1, -1]) {
            for (const sy of [1, -1]) {
              const pose: ProbePose = { src: { rotation, shearX, shearY, scaleX: sx, scaleY: sy } };
              const value = readAt(data, shear, pose);
              const tag = `rotation=${rotation} shearX=${shearX} shearY=${shearY} scaleX=${sx} scaleY=${sy}`;
              if (value < shearLow) {
                shearLow = value;
                shearLowAt = tag;
              }
              if (value > shearHigh) {
                shearHigh = value;
                shearHighAt = tag;
              }
              // `det` of the LOCAL pose: one negative scale mirrors, two do not.
              if (sx * sy < 0) {
                if (value < detNegLow) detNegLow = value;
                if (value > detNegHigh) detNegHigh = value;
              } else {
                if (value < detPosLow) detPosLow = value;
                if (value > detPosHigh) detPosHigh = value;
              }
            }
          }
        }
      }
    }
  }
  console.log(`  measured minimum: ${shearLow}`);
  console.log(`             at:    ${shearLowAt}`);
  console.log(`  measured maximum: ${shearHigh}`);
  console.log(`             at:    ${shearHighAt}`);
  console.log(`  (−π − π)·radDeg − 90 = ${closed.low}   |Δ| = ${Math.abs(shearLow - closed.low).toExponential(2)}`);
  console.log(`  (π − −π)·radDeg − 90 = ${closed.high}   |Δ| = ${Math.abs(shearHigh - closed.high).toExponential(2)}`);
  console.log('');
  console.log('| determinant of the local pose | min | max | reaches the closed form? |');
  console.log('| --- | --- | --- | --- |');
  console.log(
    `| positive (unmirrored) | ${detPosLow} | ${detPosHigh} | ${detPosLow === closed.low && detPosHigh === closed.high} |`,
  );
  console.log(
    `| negative (mirrored)   | ${detNegLow} | ${detNegHigh} | ${detNegLow === closed.low && detNegHigh === closed.high} |`,
  );
  console.log('');
  console.log('  ⇒ the determinant\'s sign DOES change the answer, and not the way round it looks: over this grid the');
  console.log('    unmirrored half hits both ends exactly and the mirrored half stops 6.6e-7° short of each. Both');
  console.log('    extremes above come from a bone with BOTH scales negative — a 180° turn, determinant positive,');
  console.log('    not a mirror. Neither end is approached in the limit: each is hit exactly, by an ordinary pose');
  console.log('    with no signed zero in it. What the mirrored row states is what this grid found, not a bound.');
}

/** The local branch: a passthrough, until a constraint has moved the bone. */
function experimentLocal(options: Options): void {
  header('local', options, '--experiment=local');
  console.log('⛔ `local: true` takes a different branch entirely — the bone\'s own signed field. This is the');
  console.log('   negative control for any refusal built on the world bounds: if it were bounded too, a compiler');
  console.log('   that refused every non-`rotate` slider would look correct.');
  console.log('');
  const cases: Array<[string, ProbePose]> = [
    ['`rotation` 720', { src: { rotation: 720 }, driver: { rotation: 720 } }],
    ['`rotation` −500', { src: { rotation: -500 }, driver: { rotation: -500 } }],
    ['`scaleX` −2', { src: { scaleX: -2 }, driver: { scaleX: -2 } }],
    ['`scaleY` −2', { src: { scaleY: -2 }, driver: { scaleY: -2 } }],
    ['`shearY` 250', { src: { shearY: 250 }, driver: { shearY: 250 } }],
    ['`x` 1e6', { src: { x: 1e6 }, driver: { x: 1e6 } }],
    ['`y` −1e6', { src: { y: -1e6 }, driver: { y: -1e6 } }],
  ];
  for (const pinned of [false, true]) {
    const data = buildFixture(pinned);
    const sliders = slidersOf(data);
    console.log(`## \`src\` ${pinned ? 'IS' : 'is NOT'} in a transform constraint's \`bones\``);
    console.log('');
    console.log(`  constraint order: ${data.constraints.map((c) => c.name).join(', ')}`);
    console.log('');
    console.log('| pose | `rotate` | `x` | `y` | `scaleX` | `scaleY` | `shearY` |');
    console.log('| --- | --- | --- | --- | --- | --- | --- |');
    for (const [label, pose] of cases) {
      const row = PROPS.map((p) => readAt(data, sliderNamed(sliders, `${p}-local`), pose));
      console.log(`| ${label} | ${row.join(' | ')} |`);
    }
    console.log('');
  }
  console.log('🚨 The second table is not the first one with noise on it.');
  console.log('   `Slider.update` calls `bone.appliedPose.validateLocalTransform(skeleton)` before reading, and that');
  console.log('   recomputes the local pose from the world matrix WHEN A CONSTRAINT MOVED IT. The decomposition is');
  console.log('   `BonePose.set5`: `atan2Deg` for the angles — so `rotation` and `shearY` come back inside');
  console.log('   (−180, 180] — and `Math.sqrt` for `scaleX`, so a `scaleX` of −2 is read as +2.');
  console.log('');
  console.log('⇒ the PRODUCIBLE SET of each local cell is still unbounded (the passthrough case is in it), but');
  console.log('   "`local: true` reads the number you authored" is true only of a bone nothing else drives.');
}

/** What the `offsets` argument does to each cell. */
function experimentOffsets(options: Options): void {
  header('offsets', options, '--experiment=offsets');
  const data = buildFixture(false);
  const sliders = slidersOf(data);
  console.log('A slider always passes `Slider.offsets`, which is all zeros. A `TransformConstraint` passes its own,');
  console.log('and the same six readers serve both — so every figure in this study is stated FOR ZERO OFFSETS, and');
  console.log('this is what the other case costs.');
  console.log('');
  console.log('The array is indexed `[ROTATION, X, Y, SCALEX, SCALEY, SHEARY]`.');
  console.log('');
  console.log('| cell | zero offsets | offsets = 100 in this cell\'s slot | Δ |');
  console.log('| --- | --- | --- | --- |');
  const slot: Record<Prop, number> = { rotate: 0, x: 1, y: 2, scaleX: 3, scaleY: 4, shearY: 5 };
  const pose: ProbePose = { src: { rotation: 20, x: 30, y: 40, scaleX: 1.5, scaleY: 1.25, shearY: 12 } };
  for (const prop of PROPS) {
    for (const where of ['world', 'local']) {
      const name = `${prop}-${where}`;
      const offsets = [0, 0, 0, 0, 0, 0];
      offsets[slot[prop]] = 100;
      const zero = readAt(data, sliderNamed(sliders, name), pose);
      const off = readAt(data, sliderNamed(sliders, name), pose, offsets);
      console.log(`| \`${name}\` | ${zero} | ${off} | ${off - zero} |`);
    }
  }
  console.log('');
  console.log('  ⚠️ `x` and `y` world are the two whose Δ is not the offset: their term is `offX·a + offY·b +');
  console.log('     worldX`, so the offset is applied in the BONE\'s frame and comes out scaled and rotated.');
  console.log('');
  console.log('## …and what it does to the BOUNDS, not just the reading');
  console.log('');
  console.log('| offsets[ROTATION] / [SCALEX] | `rotate` world span | `scaleX` world floor |');
  console.log('| --- | --- | --- |');
  const rotate = sliderNamed(sliders, 'rotate-world');
  const scale = sliderNamed(sliders, 'scaleX-world');
  for (const offset of [0, 100, -100, 400, -400]) {
    const offsets = [offset, 0, 0, offset, 0, 0];
    let rotateLow = Infinity;
    let rotateHigh = -Infinity;
    let scaleLow = Infinity;
    for (let i = 0; i <= 14400; i++) {
      const deg = -360 + i * 0.05;
      const value = readAt(data, rotate, { src: { rotation: deg } }, offsets);
      if (value < rotateLow) rotateLow = value;
      if (value > rotateHigh) rotateHigh = value;
      const s = readAt(data, scale, { src: { rotation: deg, scaleX: 0 } }, offsets);
      if (s < scaleLow) scaleLow = s;
    }
    console.log(`| ${offset} | [${rotateLow.toFixed(6)}, ${rotateHigh.toFixed(6)}] | ${scaleLow} |`);
  }
  console.log('');
  console.log('⇒ **the two scale floors and the `shearY` window depend on the offsets being zero**: the floor IS the');
  console.log('   offset, and the `shearY` window slides by it.');
  console.log('');
  console.log('⇒ **`rotate` world is the one that does not — until the offset leaves the circle.** The wrap runs');
  console.log('   AFTER the offset is added, so any offset in [−360, 360] is renormalised and the set is `[0, 360)`');
  console.log('   again, moved only in WHICH bone angle reads what. At ±400 there is nothing left to wrap and the');
  console.log('   span moves bodily — measured above. A slider can never get there (`Slider.offsets` is zero), so');
  console.log('   this row is for the reader who reaches these classes through a `TransformConstraint`.');
}

/** Does the skeleton's own scale — which rigc does not emit — change any of it? */
function experimentSkeleton(options: Options): void {
  header('skeleton', options, '--experiment=skeleton');
  const data = buildFixture(false);
  const sliders = slidersOf(data);
  console.log('Every world reader divides by `skeleton.scaleX` / `skeleton.scaleY`. That is a RUNTIME field: it is');
  console.log('not in skeleton data, rigc never writes it, and a consumer that mirrors a character sets it to −1.');
  console.log('');
  console.log('| skeleton scale | `rotate` | `x` | `y` | `scaleX` | `scaleY` | `shearY` |');
  console.log('| --- | --- | --- | --- | --- | --- | --- |');
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0.5], [-0.5, 3]]) {
    const pose: ProbePose = {
      skeletonScaleX: sx,
      skeletonScaleY: sy,
      src: { rotation: 37, x: 7, y: 11, scaleX: 1.5, scaleY: 0.5, shearY: 12 },
    };
    const row = PROPS.map((p) => readAt(data, sliderNamed(sliders, `${p}-world`), pose).toFixed(9));
    console.log(`| (${sx}, ${sy}) | ${row.join(' | ')} |`);
  }
  console.log('');
  console.log('⇒ **it changes nothing.** The world matrix already carries the skeleton scale and the reader divides');
  console.log('   the same factor back out — every reading above is identical to the digit. A candidate rule that a');
  console.log('   negative skeleton scale moves the producible set is REJECTED by measurement.');
  console.log('');
  console.log('The one case that is not identical is a skeleton scale of ZERO, where the division has no inverse:');
  console.log('');
  console.log('| skeleton scale | `rotate` | `x` | `scaleX` | `shearY` |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const [sx, sy] of [[0, 1], [1, 0], [0, 0]]) {
    const pose: ProbePose = { skeletonScaleX: sx, skeletonScaleY: sy, src: { x: 7, y: 11 } };
    const row = (['rotate', 'x', 'scaleX', 'shearY'] as Prop[]).map((p) => `${readAt(data, sliderNamed(sliders, `${p}-world`), pose)}`);
    console.log(`| (${sx}, ${sy}) | ${row.join(' | ')} |`);
  }
  console.log('');
  console.log('  `NaN`, not `±Infinity`: `0/0` in the translation term and `atan2(±Infinity, ±Infinity)` in the angles.');
  console.log('  A `NaN` reading makes `time` NaN, and `Math.max(0, NaN)` is NaN — the animation is applied at NaN.');
  console.log('  Out of rigc\'s reach: nothing in skeleton data sets this field.');
}

/**
 * Past this, in either direction, a cell is reported as having no bound on that
 * side. The sweep drives every field to ±1e9, so a reader that passes on its
 * field is three orders past this line and a reader that clamps is nowhere near
 * it — the largest bounded magnitude anywhere in the table is 450.
 */
const TABLE_WIDE = 1e6;

/**
 * The poses the sweep cannot be relied on to draw, added to every cell so the
 * table's ends come off a measurement and not off luck.
 *
 * The first five are the seams `--experiment=bounds` isolates. The last two are
 * the unboundedness probes: every local field at ±1e9, which is what puts the
 * six `none` rows past `TABLE_WIDE`.
 */
function tablePoses(): Array<[string, ProbePose]> {
  const huge = (v: number): ProbePose => ({
    src: { rotation: v, x: v, y: v, scaleX: v, scaleY: v, shearX: 0, shearY: v },
  });
  return [
    ['rotate 360', { src: { rotation: -1e-14 } }],
    ['rotate 0', { src: { rotation: 0 } }],
    ['scale floor', { src: { scaleX: 0, scaleY: 0 } }],
    ['shear low', { src: { rotation: -1e-14, shearX: 0, shearY: -89.99999999999999, scaleX: -1, scaleY: -1 } }],
    ['shear high', { src: { rotation: -179.999999999, shearX: 179.999999999, shearY: 89.999999999, scaleX: -1, scaleY: -1 } }],
    ['every field +1e9', huge(1e9)],
    ['every field −1e9', huge(-1e9)],
  ];
}

/** The table, re-derived from the sweep and the seam probes in one place. */
function experimentTable(options: Options): void {
  header('table', options, `--experiment=table --seed=${options.seed}`);
  const data = buildFixture(false);
  const sliders = slidersOf(data);
  const cells = sweep(data, sliders, options.seed, options.samples);
  for (const [label, pose] of tablePoses()) {
    for (const name of cellNames()) feed(cellNamed(cells, name), readAt(data, sliderNamed(sliders, name), pose), label);
  }
  console.log('| cell | producible floor | producible ceiling |');
  console.log('| --- | --- | --- |');
  for (const name of cellNames()) {
    const cell = cellNamed(cells, name);
    console.log(`| \`${name}\` | ${cell.min < -TABLE_WIDE ? 'none' : cell.min} | ${cell.max > TABLE_WIDE ? 'none' : cell.max} |`);
  }
  console.log('');
  console.log(`⚠️ \`none\` means the extreme passed ±${TABLE_WIDE} while the driven field was held at ±1e9. That is a`);
  console.log('   statement about this sweep, not a proof of unboundedness — those readers are `source.<field> +');
  console.log('   offset` and the field is whatever was written, so there is nothing there to bound. The six cells');
  console.log('   the measurement EARNS are the four bounded ends and the two floors.');
}

const EXPERIMENTS: Record<string, (options: Options) => void> = {
  controls: experimentControls,
  sweep: experimentSweep,
  bounds: experimentBounds,
  local: experimentLocal,
  offsets: experimentOffsets,
  skeleton: experimentSkeleton,
  table: experimentTable,
};

if (import.meta.main) {
  const args = process.argv.slice(2);
  const name = args.find((a) => a.startsWith('--experiment='))?.slice(13);
  if (name === undefined || EXPERIMENTS[name] === undefined) {
    console.error('usage: bun bench/studies/2026-09-06-readers/tools/readerprobe.ts --experiment=<name> [--seed=N] [--samples=N]');
    console.error(`       <name> is one of: ${Object.keys(EXPERIMENTS).join(', ')}`);
    process.exit(2);
  }
  const seed = Number(args.find((a) => a.startsWith('--seed='))?.slice(7) ?? 20260906);
  const samples = Number(args.find((a) => a.startsWith('--samples='))?.slice(10) ?? 40000);
  EXPERIMENTS[name]({ seed, samples });
}
