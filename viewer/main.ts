/**
 * The run viewer, browser half. Plain TS and DOM — no framework, on purpose:
 * the page exists to show that rigc's output *runs*, and the fewer layers
 * between the emitted skeleton and the pixels, the more that means.
 *
 * The two panes are the whole idea. On the left, the candidate `skeleton.json`
 * from a bench run, played by spine-html (the owner's DOM renderer) in the same
 * world box `bench/render_reference.ts` used for the frames. On the right, those
 * frames, indexed by the scrubber's time at the set's own fps. Same box, same
 * clock — so a drift is something you can see rather than something you read out
 * of `check.txt`.
 *
 * Posing mirrors `src/render.ts`'s `sampleAnimation`: a non-looping track walked
 * forward from the setup pose, `Physics.reset` on the first sample and
 * `Physics.update` after. Seeking backwards therefore rewinds and re-walks —
 * physics has a history, and a skeleton that carries one cannot be teleported.
 */
import {
  AnimationState,
  AnimationStateData,
  type Animation,
  Physics,
  Skeleton,
  type SkeletonData,
  Vector2,
} from '@esotericsoftware/spine-core';
import { SpineHtmlRenderer, loadSkeletonAssets, type SkeletonAssets } from 'spine-html';
import type { CandidateInfo, FrameFile, FrameSet, Inventory, Viewport } from './inventory.ts';

interface BenchMeasure {
  id: string;
  what: string;
  matched: number;
  total: number;
  ratio: number;
}
interface BenchSection {
  name: string;
  ratio: number;
  measures?: BenchMeasure[];
}
interface BenchDiff {
  label: string;
  role: string;
  sections: BenchSection[];
}
interface BenchReport {
  rung?: string;
  example?: string;
  profile?: string;
  gates?: string;
  diffs?: BenchDiff[];
  validate?: { failures?: unknown[]; passed?: unknown[]; skipped?: unknown[] };
}

function need<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing #${id}`);
  return found as T;
}

const runSelect = need<HTMLSelectElement>('run');
const candidateSelect = need<HTMLSelectElement>('candidate');
const animationSelect = need<HTMLSelectElement>('animation');
const setSelect = need<HTMLSelectElement>('set');
const checkSelect = need<HTMLSelectElement>('check');
const speedSelect = need<HTMLSelectElement>('speed');
const zoomSelect = need<HTMLSelectElement>('zoom');
const playButton = need<HTMLButtonElement>('play');
const timeInput = need<HTMLInputElement>('time');
const clock = need<HTMLElement>('clock');
const status = need<HTMLElement>('status');
const stage = need<HTMLDivElement>('stage');
const referenceBox = need<HTMLDivElement>('reference');
const candidateNote = need<HTMLElement>('candidate-note');
const referenceNote = need<HTMLElement>('reference-note');
const report = need<HTMLElement>('report');
const links = need<HTMLElement>('links');

interface Live {
  candidate: CandidateInfo;
  assets: SkeletonAssets;
  data: SkeletonData;
  skeleton: Skeleton;
  state: AnimationState;
  renderer: SpineHtmlRenderer;
  root: HTMLDivElement;
  viewport: Viewport;
  /** Where `viewport` came from, for the pane's own label. */
  framingNote: string;
  animation: Animation | null;
  set: FrameSet | null;
  poseTime: number;
}

let inventory: Inventory = { runs: [] };
let live: Live | null = null;
let bench: BenchReport | null = null;
let checkText = '';
let time = 0;
let playing = true;
let shownFrame = '';
/** Guards against an out-of-order load when the pickers are driven quickly. */
let loadToken = 0;

function say(message: string, kind: '' | 'warn' | 'error' = ''): void {
  status.textContent = message;
  status.className = kind;
}

function zoom(): number {
  return Number(zoomSelect.value) || 1;
}

function duration(): number {
  return live?.animation ? live.animation.duration : 0;
}

// --- inventory pickers ------------------------------------------------------

function fillRuns(): void {
  runSelect.innerHTML = '';
  for (const run of inventory.runs) {
    const option = document.createElement('option');
    option.value = run.name;
    const loadable = run.candidates.filter((candidate) => !candidate.disabled).length;
    option.textContent = loadable > 0 ? run.name : `${run.name} — nothing loadable`;
    runSelect.appendChild(option);
  }
}

function currentRun() {
  return inventory.runs.find((run) => run.name === runSelect.value) ?? inventory.runs[0];
}

function fillCandidates(): void {
  candidateSelect.innerHTML = '';
  const run = currentRun();
  if (!run) return;
  for (const candidate of run.candidates) {
    const option = document.createElement('option');
    option.value = candidate.name;
    // A run that cannot be shown is listed with its reason rather than hidden:
    // the ladder's early rungs predate conventions the later ones rely on, and
    // that history is part of what the viewer is for.
    option.textContent = candidate.disabled
      ? `${candidate.name} — ${candidate.disabled}`
      : candidate.name;
    option.disabled = candidate.disabled !== null;
    candidateSelect.appendChild(option);
  }
  const first = run.candidates.find((candidate) => !candidate.disabled) ?? run.candidates[0];
  if (first) candidateSelect.value = first.name;
}

function currentCandidate(): CandidateInfo | null {
  const run = currentRun();
  if (!run) return null;
  return run.candidates.find((candidate) => candidate.name === candidateSelect.value) ?? null;
}

// --- framing ----------------------------------------------------------------

/**
 * The world box to draw the candidate in.
 *
 * When the run has reference frames it is *their* box, straight out of
 * `frames.json` — that is what makes the two panes comparable at all. Without
 * frames there is nothing to agree with, so the skeleton's own setup-pose
 * bounds get a 10% margin and become the box.
 */
function fitViewport(skeleton: Skeleton): Viewport {
  skeleton.setupPose();
  skeleton.update(0);
  skeleton.updateWorldTransform(Physics.reset);
  const offset = new Vector2();
  const size = new Vector2();
  skeleton.getBounds(offset, size, []);
  const width = Math.max(size.x, 1);
  const height = Math.max(size.y, 1);
  const padX = width * 0.1;
  const padY = height * 0.1;
  const boxWidth = width + padX * 2;
  const boxHeight = height + padY * 2;
  const scale = 512 / Math.max(boxWidth, boxHeight);
  return {
    x: offset.x - padX,
    y: offset.y - padY,
    width: boxWidth,
    height: boxHeight,
    scale,
    pixelWidth: Math.max(1, Math.round(boxWidth * scale)),
    pixelHeight: Math.max(1, Math.round(boxHeight * scale)),
  };
}

/**
 * The box to draw this candidate's frame set in, and where it came from.
 *
 * `rigc check` decided this once already, per run or per frame set, and wrote
 * it into `bench.json`: the frames' own box when the candidate's pixels land
 * there, a box fitted to the candidate's own pixels when they do not. Reusing
 * that decision is what makes the two panes agree exactly as far as the check's
 * numbers say they do — framing the candidate any other way would show a drift
 * the run explicitly measured as a difference of coordinates, not of animation.
 */
function framingFor(candidate: CandidateInfo, setDir: string | null): [Viewport | null, string] {
  const framing = candidate.framing;
  const perSet = setDir && framing ? framing.sets[setDir] : undefined;
  if (perSet) return [perSet, `${setDir}'s own box, as rigc check framed it`];
  if (framing?.viewport) {
    return [
      framing.viewport,
      framing.kind === 'frames-viewport'
        ? "frames.json's box (the check took it as measured)"
        : `the box rigc check fitted (${framing.kind ?? 'check'})`,
    ];
  }
  if (candidate.reference) return [candidate.reference.viewport, "frames.json's box"];
  return [null, 'its own setup pose (no reference, no check)'];
}

/**
 * Put the skeleton on the same pixel grid the frames were rendered on.
 *
 * `render_reference.ts` projects world (wx, wy) to pixel
 * ((wx - vx)·s, pixelHeight - (wy - vy)·s). spine-html's root element *is* the
 * skeleton origin and its children are placed in world units with y negated for
 * CSS, so parking the root at the origin's pixel and scaling by the viewport's
 * own px/unit reproduces that projection exactly — no per-slot arithmetic here.
 */
/** Re-derive the box for the set on screen, then lay both panes out in it. */
function reframe(): void {
  if (!live) return;
  const [viewport, note] = framingFor(live.candidate, live.set?.dir ?? null);
  live.viewport = viewport ?? fitViewport(live.skeleton);
  live.framingNote = note;
  applyFraming();
  candidateNote.textContent = `${live.viewport.pixelWidth}×${live.viewport.pixelHeight} · ${live.viewport.scale.toFixed(6)} px/unit · ${live.framingNote}`;
}

function applyFraming(): void {
  if (!live) return;
  const z = zoom();
  const { viewport } = live;
  stage.style.width = `${viewport.pixelWidth * z}px`;
  stage.style.height = `${viewport.pixelHeight * z}px`;
  live.root.style.left = `${-viewport.x * viewport.scale * z}px`;
  live.root.style.top = `${(viewport.pixelHeight + viewport.y * viewport.scale) * z}px`;
  live.root.style.transform = `scale(${viewport.scale * z})`;
  // Mesh canvases raster at their true on-screen resolution; a plain
  // devicePixelRatio would oversample by 1/(scale·zoom).
  live.renderer.pixelRatio = (window.devicePixelRatio || 1) * viewport.scale * z;
  referenceBox.style.width = `${viewport.pixelWidth * z}px`;
  referenceBox.style.height = `${viewport.pixelHeight * z}px`;
}

// --- posing -----------------------------------------------------------------

function resetPose(): void {
  if (!live) return;
  const { skeleton, state, animation } = live;
  skeleton.setupPose();
  state.clearTracks();
  if (animation) state.setAnimation(0, animation.name, false);
  state.apply(skeleton);
  skeleton.update(0);
  skeleton.updateWorldTransform(Physics.reset);
  live.poseTime = 0;
}

function advance(delta: number): void {
  if (!live) return;
  const { skeleton, state } = live;
  state.update(delta);
  state.apply(skeleton);
  skeleton.update(delta);
  skeleton.updateWorldTransform(Physics.update);
  live.poseTime += delta;
}

function seek(target: number): void {
  if (!live) return;
  const clamped = Math.max(0, Math.min(target, duration()));
  if (clamped < live.poseTime - 1e-6) resetPose();
  const step = 1 / 60;
  let guard = 0;
  while (live.poseTime < clamped - 1e-6 && guard++ < 6000) {
    advance(Math.min(step, clamped - live.poseTime));
  }
  time = clamped;
}

// --- reference frames -------------------------------------------------------

function nearestFrame(set: FrameSet, index: number): FrameFile | null {
  if (set.frames.length === 0) return null;
  let best = set.frames[0];
  for (const frame of set.frames) {
    if (Math.abs(frame.index - index) < Math.abs(best.index - index)) best = frame;
  }
  return best;
}

function updateReference(): void {
  const set = live?.set ?? null;
  if (!set || set.frames.length === 0) {
    if (shownFrame !== '') {
      referenceBox.innerHTML = '';
      referenceBox.classList.add('empty');
      referenceBox.style.width = '';
      referenceBox.style.height = '';
      referenceBox.textContent =
        live?.candidate.referenceNote ?? 'no reference frames for this candidate';
      shownFrame = '';
    }
    return;
  }
  const wanted = Math.round(time * set.fps);
  const frame = nearestFrame(set, wanted);
  if (!frame || frame.url === shownFrame) return;
  let img = referenceBox.querySelector('img');
  if (!img) {
    referenceBox.classList.remove('empty');
    referenceBox.textContent = '';
    img = document.createElement('img');
    referenceBox.appendChild(img);
  }
  img.src = frame.url;
  shownFrame = frame.url;
  referenceNote.textContent = `${set.dir} · ${set.fps} fps · f${String(frame.index).padStart(4, '0')} of ${set.frames.length} on disk`;
}

// --- the report pane --------------------------------------------------------

function benchLines(): string[] {
  if (!bench) return ['no bench.json for this candidate'];
  const lines: string[] = [];
  const head = [
    bench.rung ? `rung ${bench.rung}` : null,
    bench.example ?? null,
    bench.profile ? `profile ${bench.profile}` : null,
  ].filter((part): part is string => part !== null);
  lines.push(`bench.json — ${head.join(' · ')}`);
  const validate = bench.validate;
  if (validate) {
    lines.push(
      `  validate    ${validate.passed?.length ?? 0} passed, ${validate.failures?.length ?? 0} failed, ${validate.skipped?.length ?? 0} skipped`,
    );
  }
  for (const diff of bench.diffs ?? []) {
    lines.push(`  diff ${diff.label} (${diff.role}) — section means`);
    for (const section of diff.sections) {
      const worst = (section.measures ?? [])
        .slice()
        .sort((a, b) => a.ratio - b.ratio)
        .find((measure) => measure.ratio < 1);
      const tail = worst ? `   worst: ${worst.id} ${worst.matched}/${worst.total}` : '';
      lines.push(`    ${section.name.padEnd(14)}${section.ratio.toFixed(3)}${tail}`);
    }
  }
  return lines;
}

/**
 * `check.txt`'s head — the framing it measured in — plus the one animation
 * block for the frame set on screen. The rest is per-frame detail that belongs
 * in the file, not in a pane beside a moving skeleton.
 */
function checkLines(): string[] {
  if (!checkText) return ['no check report for this candidate'];
  const blocks = checkText.split(/\n(?=\s*── )/);
  const lines = [`${checkSelect.value.split('/').pop() ?? 'check'} — framing`, ...blocks[0].split('\n')];
  const dir = live?.set?.dir;
  // The block header is `── <set dir> — …`; match the name literally.
  const block = dir ? blocks.slice(1).find((text) => text.trimStart().startsWith(`── ${dir} `)) : undefined;
  if (block) lines.push('', ...block.split('\n'));
  else if (dir) lines.push('', `(no ${dir} section in this report)`);
  return lines;
}

function renderReport(): void {
  report.textContent = [...benchLines(), '', ...checkLines()].join('\n');
}

function renderLinks(candidate: CandidateInfo): void {
  links.innerHTML = '';
  const files = [
    ...(candidate.benchUrl ? [{ label: 'bench.json', url: candidate.benchUrl }] : []),
    ...candidate.checks,
    ...candidate.docs,
  ];
  for (const file of files) {
    const anchor = document.createElement('a');
    anchor.href = file.url;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer';
    anchor.textContent = file.label;
    anchor.style.marginRight = '12px';
    links.appendChild(anchor);
  }
}

// --- loading a candidate ----------------------------------------------------

function teardown(): void {
  if (!live) return;
  live.renderer.dispose();
  live.assets.dispose();
  live.root.remove();
  live = null;
  stage.textContent = '';
}

function fillAnimations(): void {
  if (!live) return;
  animationSelect.innerHTML = '';
  for (const animation of live.data.animations) {
    const option = document.createElement('option');
    option.value = animation.name;
    option.textContent = `${animation.name} — ${animation.duration.toFixed(2)}s`;
    animationSelect.appendChild(option);
  }
  if (live.data.animations.length === 0) {
    const option = document.createElement('option');
    option.textContent = 'setup pose (no animations)';
    animationSelect.appendChild(option);
  }
  animationSelect.disabled = live.data.animations.length === 0;
}

function fillSets(): void {
  if (!live) return;
  setSelect.innerHTML = '';
  const sets = (live.candidate.reference?.sets ?? []).filter(
    (set) => set.animation === animationSelect.value && set.frames.length > 0,
  );
  for (const set of sets) {
    const option = document.createElement('option');
    option.value = set.dir;
    option.textContent = `${set.dir} (${set.frames.length}f @ ${set.fps})`;
    setSelect.appendChild(option);
  }
  setSelect.disabled = sets.length === 0;
  // The densest set is the one worth watching: a strided set writes two frames
  // out of a hundred and would step the reference pane once per second.
  const densest = sets.slice().sort((a, b) => b.frames.length - a.frames.length)[0];
  if (densest) setSelect.value = densest.dir;
  live.set = densest ?? null;
  shownFrame = 'stale';
  if (!densest) {
    referenceBox.innerHTML = '';
    referenceBox.classList.add('empty');
    referenceBox.style.width = '';
    referenceBox.style.height = '';
    referenceBox.textContent =
      live.candidate.reference && live.candidate.reference.sets.length > 0
        ? `no frames for "${animationSelect.value}" — this reference has ${live.candidate.reference.sets.map((set) => set.animation).join(', ')}`
        : (live.candidate.referenceNote ?? 'no reference frames for this candidate');
    referenceNote.textContent = '';
    shownFrame = '';
  }
}

function applyAnimation(): void {
  if (!live) return;
  live.animation = live.data.findAnimation(animationSelect.value);
  fillSets();
  reframe();
  const total = duration();
  timeInput.max = String(total || 1);
  timeInput.disabled = total === 0;
  resetPose();
  seek(0);
  timeInput.value = '0';
  renderReport();
  updateReference();
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function selectCandidate(candidate: CandidateInfo): Promise<void> {
  const token = ++loadToken;
  teardown();
  bench = null;
  checkText = '';
  checkSelect.innerHTML = '';
  renderLinks(candidate);
  if (candidate.disabled) {
    say(`${candidate.id} — ${candidate.disabled}`, 'warn');
    candidateNote.textContent = '';
    report.textContent = candidate.disabled;
    return;
  }

  say(`loading ${candidate.id}…`);
  const pages = new Map(
    candidate.pages
      .filter((page): page is { name: string; url: string } => page.url !== null)
      .map((page) => [page.name, page.url]),
  );
  try {
    const assets = await loadSkeletonAssets({
      atlasUrl: candidate.atlasUrl,
      skeletonUrl: candidate.skeletonUrl,
      // The dev server already resolved every page against the atlas's own
      // directory (and the example's images/ and export/ for a bare name), so
      // the browser never has to guess where the art went.
      resolvePage: (name) => pages.get(name) ?? name,
    });
    if (token !== loadToken) {
      assets.dispose();
      return;
    }
    const root = document.createElement('div');
    root.className = 'skeleton-root';
    stage.appendChild(root);
    const skeleton = new Skeleton(assets.data);
    live = {
      candidate,
      assets,
      data: assets.data,
      skeleton,
      state: new AnimationState(new AnimationStateData(assets.data)),
      renderer: new SpineHtmlRenderer(root, assets.regionImages),
      root,
      viewport: candidate.reference?.viewport ?? fitViewport(skeleton),
      framingNote: '',
      animation: null,
      set: null,
      poseTime: 0,
    };
    const background = candidate.reference?.background ?? [232, 232, 232, 255];
    stage.style.background = `rgb(${background[0]}, ${background[1]}, ${background[2]})`;
    fillAnimations();
    applyAnimation();
    say(
      `${candidate.id} · ${candidate.example ?? 'unknown example'} · ${assets.data.bones.length} bones · ${assets.data.slots.length} slots · ${candidate.pages.length} atlas page(s)`,
    );
  } catch (error) {
    if (token !== loadToken) return;
    const message = error instanceof Error ? error.message : String(error);
    say(`${candidate.id} failed to load: ${message}`, 'error');
    report.textContent = message;
    return;
  }

  for (const file of candidate.checks) {
    const option = document.createElement('option');
    option.value = file.url;
    option.textContent = file.label;
    checkSelect.appendChild(option);
  }
  checkSelect.disabled = candidate.checks.length === 0;
  // `check.txt` is the run's own reading; a `check-pinned`/`check-unpinned`
  // sibling is a second framing of the same run and sorts ahead of it.
  const preferred = candidate.checks.find((file) => file.label === 'check.txt') ?? candidate.checks[0];
  if (preferred) checkSelect.value = preferred.url;
  if (candidate.benchUrl) {
    bench = await fetchText(candidate.benchUrl)
      .then((text) => JSON.parse(text) as BenchReport)
      .catch(() => null);
  }
  if (preferred) {
    checkText = await fetchText(preferred.url).catch(() => '');
  }
  if (token === loadToken) renderReport();
}

// --- transport --------------------------------------------------------------

function setPlaying(next: boolean): void {
  playing = next;
  playButton.textContent = playing ? '❚❚' : '▶';
}

let lastFrameAt = performance.now();

function frame(now: number): void {
  const delta = Math.min((now - lastFrameAt) / 1000, 1 / 15);
  lastFrameAt = now;
  if (live) {
    const total = duration();
    if (playing && total > 0) {
      const next = time + delta * (Number(speedSelect.value) || 1);
      seek(next > total ? 0 : next);
      timeInput.value = String(time);
    }
    live.renderer.render(live.skeleton);
    updateReference();
    const set = live.set;
    clock.textContent = total
      ? `${time.toFixed(2)}s / ${total.toFixed(2)}s${set ? ` · f${Math.round(time * set.fps)}` : ''}`
      : 'static pose';
  }
  requestAnimationFrame(frame);
}

runSelect.addEventListener('change', () => {
  fillCandidates();
  const candidate = currentCandidate();
  if (candidate) void selectCandidate(candidate);
});
candidateSelect.addEventListener('change', () => {
  const candidate = currentCandidate();
  if (candidate) void selectCandidate(candidate);
});
animationSelect.addEventListener('change', applyAnimation);
setSelect.addEventListener('change', () => {
  if (!live) return;
  live.set = live.candidate.reference?.sets.find((set) => set.dir === setSelect.value) ?? null;
  shownFrame = 'stale';
  reframe();
  renderReport();
  updateReference();
});
checkSelect.addEventListener('change', () => {
  void fetchText(checkSelect.value)
    .catch(() => '')
    .then((text) => {
      checkText = text;
      renderReport();
    });
});
zoomSelect.addEventListener('change', applyFraming);
playButton.addEventListener('click', () => setPlaying(!playing));
timeInput.addEventListener('input', () => {
  setPlaying(false);
  seek(Number(timeInput.value) || 0);
  updateReference();
});

async function main(): Promise<void> {
  inventory = (await fetch('/api/inventory').then((response) => response.json())) as Inventory;
  if (inventory.runs.length === 0) {
    say('no runs under bench/runs/', 'warn');
    return;
  }
  fillRuns();
  // Deep link: ?run=…&candidate=…&anim=… — a screenshot needs a URL.
  const params = new URLSearchParams(location.search);
  const run = params.get('run');
  if (run && inventory.runs.some((entry) => entry.name === run)) runSelect.value = run;
  else runSelect.value = inventory.runs[inventory.runs.length - 1].name;
  fillCandidates();
  const candidate = params.get('candidate');
  if (candidate) candidateSelect.value = candidate;
  const chosen = currentCandidate();
  if (chosen) await selectCandidate(chosen);
  const animation = params.get('anim');
  if (animation && live?.data.findAnimation(animation)) {
    animationSelect.value = animation;
    applyAnimation();
  }
  if (params.get('paused') !== null) setPlaying(false);
  const at = Number(params.get('time'));
  if (Number.isFinite(at) && at > 0) {
    seek(at);
    timeInput.value = String(time);
    updateReference();
  }
}

setPlaying(true);
requestAnimationFrame(frame);
void main().catch((error: unknown) => {
  say(error instanceof Error ? error.message : String(error), 'error');
});
