/**
 * pose_oracle — one skeleton posed into a document, and two such documents
 * compared (issue #909, step 0b of issue #380).
 *
 *   bun tools/pose_oracle.ts dump <build dir> --out <json>
 *                                 [--samples 9] [--phase grid|off|irr|dense]
 *                                 [--skin all|<name>] [--physics none|step] [--dt 1/60]
 *   bun tools/pose_oracle.ts dump <skeleton.json> <atlas> --out <json> [same flags]
 *   bun tools/pose_oracle.ts dump --core <skeleton.model.json> --out <json> [same flags]
 *   bun tools/pose_oracle.ts compare <a.json> <b.json> [--tol-xy 1e-6] [--tol-m 1e-6]
 *
 * ⭐ Why this is a document and not a function. The equivalence gate issue
 * #380 stands on (`P_ours(M) ≡ P_spine(B)`) compares the pose spine-core gives
 * a Spine file against the pose a SECOND implementation gives the same rig. The
 * second implementation does not link spine-core — that is the whole point of
 * it — so the contract between the two cannot be a TypeScript type or a call
 * into this file. It is the JSON below. Everything a second dumper needs to
 * write the same document is stated in this header: every field, in the order
 * it is written, and which spine-core 4.3.13 call produced it here, so that
 * the call's semantics can be reproduced rather than imported. If a sentence
 * below is not enough to reproduce a field, that is a defect in this header.
 *
 * The prototype this was promoted from graded rigc's builds against the
 * editor's exports on the 1.0 exam and read IDENTICAL on 14 of 14 production
 * rigs. What was added to it is what its own notes listed as not yet dumped:
 * world vertices (with deform and weights), the draw order, clipping, events,
 * stepped physics and posing under one skin.
 *
 * ## `dump` — the document, `"spec": "pose-oracle/3"`
 *
 * 🔢 **The number in `spec` changes whenever a field is added, removed or
 * moved.** `compare` reads a row by position and a reader refuses any `spec`
 * but its own, so a document with a cell the reader does not know is refused
 * by name rather than compared on the cells the reader does know — which
 * would read IDENTICAL over a difference it never looked at. `/1` became `/2`
 * when the slot row gained its blend mode (issue #933), and `/2` became `/3`
 * when a pose gained its `clipped` block (issue #964).
 *
 * One JSON object on one line, then a newline. Key order is fixed and is the
 * order written here. Two dumps of one input are byte-identical: no clock, no
 * randomness, no unordered iteration (every list is in the skeleton's own
 * order, stated per field).
 *
 * 🔢 **Every number is rounded** by `r(v) = floor(v * 1e6 + 0.5) / 1e6`
 * (JavaScript's `Math.round(v * 1e6) / 1e6` — round half UP, not half to even),
 * and written as the shortest decimal that reads back to that double. A value
 * that is not finite is written `null`. The one number not rounded is
 * `options.dt`, because it defines the stepping schedule and a rounded 1/60
 * would step a different one.
 *
 * Top level, in order:
 *
 * - `spec` — the string `"pose-oracle/3"`.
 * - `dumper` — who posed it, free text (`"spine-core 4.3.13"` here). Never
 *   compared.
 * - `source` — `{ "spine": <string|null>, "hash": <string|null> }`, the
 *   skeleton file's own `skeleton.spine` and `skeleton.hash`
 *   (`SkeletonData.version`/`.hash`). Never compared: a rebuild states the
 *   runtime it links and an export the editor that wrote it.
 * - `options` — `{ "phase", "samples", "skin", "physics", "dt" }`, the flags
 *   the dump was taken under; `dt` is `null` unless `physics` is `"step"`.
 *   Two dumps taken under different options are not comparable and `compare`
 *   refuses the pair (exit 2).
 * - `absent` — written only by a dumper that leaves a block out (the core,
 *   below): `[[block, why], …]` naming every block that is `null` in this
 *   document, in document order, with the construct not yet admitted. A block
 *   is one of `bones`, `slots`, `skins`, `constraints`, `physics`, `paths`,
 *   `pathAttachments`, `setup.bones`, `setup.slots`, `setup.drawOrder`,
 *   `setup.attachments`, `setup.clips`, `setup.clipped`, `animations`, and the
 *   seven a sample carries — `animations.bones`, `animations.slots`,
 *   `animations.drawOrder`, `animations.attachments`, `animations.clips`,
 *   `animations.clipped`, `animations.events`
 *   (`ORACLE_BLOCKS`). A sample block left out is `null` in EVERY sample and
 *   named once; one not named is a list in every sample; with `animations`
 *   itself `null` the sample blocks are nobody's and are not named. A `null`
 *   block the list does not name, a name that is not a `null` block, or a
 *   sample block `null` in some samples and not others makes the document
 *   unreadable (exit 2). The spine-core dump leaves nothing out and writes no
 *   `absent` key.
 * - `bones` — every bone name in skeleton order (`SkeletonData.bones`, which is
 *   parent-before-child).
 * - `slots` — `[name, bone]` per slot in setup order (`SkeletonData.slots`,
 *   `SlotData.boneData.name`). The bone is here so a comparison can carry the
 *   ill-conditioned rule from a bone to the geometry its slots draw.
 * - `skins` — every skin name in file order (`SkeletonData.skins`).
 * - `constraints` — `[[type, name], …]` in `SkeletonData.constraints` order,
 *   which is the order the runtime updates them in; `type` is one of `ik`,
 *   `transform`, `path`, `physics`, `slider`.
 * - `physics` — one object per physics constraint, constraint order:
 *   `name, bone, x, y, rotate, scaleX, shearX, limit, step, inertia, strength,
 *   damping, massInverse, wind, gravity, mix, inertiaGlobal, strengthGlobal,
 *   dampingGlobal, massGlobal, windGlobal, gravityGlobal, mixGlobal,
 *   skinRequired, scaleYMode` — the `PhysicsConstraintData` fields of those
 *   names, the seven pose values off its `setupPose`, `scaleYMode` as the
 *   enum's name (`None`, `Uniform`, `Volume`).
 * - `paths` — one object per path constraint, constraint order: `name, slot,
 *   bones, positionMode, spacingMode, rotateMode, offsetRotation, position,
 *   spacing, mixRotate, mixX, mixY` — `PathConstraintData` and its
 *   `setupPose`, each mode as its enum's name (`Fixed`/`Percent`,
 *   `Length`/`Fixed`/`Percent`/`Proportional`, `Tangent`/`Chain`/`ChainScale`).
 * - `pathAttachments` — one object per path attachment in any skin: `skin,
 *   slot, placeholder, closed, constantSpeed, lengths`, in skin order and, in a
 *   skin, in `Skin.getAttachments()` order. `compare` matches them by
 *   `skin/slot/placeholder`, never by position.
 * - `setup` — the setup pose (below).
 * - `animations` — one object per animation in `SkeletonData.animations`
 *   order: `{ "name", "duration", "samples": [ … ] }`, and each sample is
 *   `{ "t", "events", …pose }`.
 *
 * A **pose** is, in order:
 *
 * - `bones` — `[name, worldX, worldY, a, b, c, d, active, parent]` per bone in
 *   skeleton order, read off `Bone.appliedPose` (`BonePose.worldX` … `.d`, the
 *   world matrix `[a b][c d]` and origin); `active` is `1` or `0`
 *   (`Bone.active`, false for a `skinRequired` bone the skin does not name);
 *   `parent` is the parent bone's name or `null`.
 * - `slots` — `[name, attachment, r, g, b, a, dark, path, blend]` per slot in
 *   setup order, off `Slot.appliedPose`: the attachment's `name` or `null`, the
 *   light colour, `dark` as `[r, g, b]` or `null` when the slot has no dark
 *   colour, and the attachment's `path` (region and mesh attachments, which
 *   default `path` to their name) or `null` for any other attachment or none;
 *   then `blend`, off the slot's data (`SlotData.blendMode`) as its enum's
 *   name — `Normal`, `Additive`, `Multiply`, `Screen` — or `null` when the
 *   runtime holds no mode (it reads a stated `ADDITIVE` so). The blend mode is
 *   data, not pose: a `SlotPose` carries `color`, `darkColor`, `attachment`,
 *   `sequenceIndex` and `deform` and no mode, and an animation leaves it where
 *   setup put it; it is in the row because the renderer draws the posed slot
 *   with it. Of the pose's other two fields, `deform` is in `attachments`'
 *   world vertices and `sequenceIndex` is not dumped (issue #933's report).
 * - `drawOrder` — slot names in the posed draw order
 *   (`Skeleton.drawOrder.appliedPose`).
 * - `attachments` — `[slot, attachment, kind, vertices]` for every slot, in
 *   draw order, whose attachment is a region or a mesh; `kind` is `region` or
 *   `mesh`; `vertices` is the flat `[x0, y0, x1, y1, …]` in world units, y up:
 *   for a region the four corners from
 *   `RegionAttachment.computeWorldVertices(slot, getOffsets(slot.appliedPose),
 *   out, 0, 2)` — in the runtime's corner order, bottom-left, upper-left,
 *   upper-right, bottom-right of the region's own frame — and for a mesh every
 *   vertex from `MeshAttachment.computeWorldVertices(skeleton, slot, 0,
 *   worldVerticesLength, out, 0, 2)`, which applies the slot's deform offsets
 *   and the vertex weights. A slot is listed whether or not its bone is active
 *   and whatever its alpha: this is geometry, not a picture.
 * - `clips` — `[slot, attachment, end, polygon]` for every slot, in draw
 *   order, whose attachment is a clipping attachment: `end` is the name of the
 *   slot the clip ends at (`ClippingAttachment.endSlot`) or `null`, and
 *   `polygon` the world polygon from `computeWorldVertices(skeleton, slot, 0,
 *   worldVerticesLength, out, 0, 2)`.
 * - `clipped` (issue #964) — `[slot, attachment, clipped, vertices, uvs,
 *   triangles]` for every slot drawn while a clip is active, in draw order: a
 *   `SkeletonClipping` walked beside the draw order exactly as `src/render.ts`'s
 *   `piecesOf` walks it — at a clipping attachment `clipEnd(slot)`, then
 *   `clipStart(skeleton, slot, clip)` when the slot's bone is active; at every
 *   other slot, when `isClipping()` and it shows a region or a mesh,
 *   `clipTrianglesUnpacked(world, 0, triangles, triangles.length, uvs, 2)`,
 *   then `clipEnd(slot)`; `clipEnd()` after the walk. `world` is the
 *   attachment's world vertices as `attachments` computes them; `triangles` a
 *   mesh's own and a region's `0 1 2 2 3 0`; `uvs` the attachment's LOCAL ones
 *   — a mesh's `regionUVs` (a linked mesh's are its source's) and a region's
 *   `0 1, 0 0, 1 0, 1 1` in the corner order above — not the page UVs the
 *   renderer passes, because where a region sits on a page is not the
 *   model's (`ModelAtlasRect`'s 🔸 in `src/model.ts`); the clipper's UV rule
 *   is linear (`src/core/clipping.ts`), so the page UVs are the same map of
 *   the same weights. `clipped` is the call's return value, `1` or `0` — the
 *   renderer draws the attachment's own geometry on `0` — and the three
 *   arrays are `clippedVerticesTyped`, `clippedUVsTyped` and
 *   `clippedTrianglesTyped` as returned, whichever it is. Empty when nothing
 *   is drawn under a clip.
 *
 * A sample adds, before its pose:
 *
 * - `t` — the sample's time in seconds.
 * - `events` — `[name, time, int, float, string]` for every event an
 *   `EventTimeline` of the animation fires over `(previous sample's t, t]`,
 *   in firing order; the first sample's interval opens at `-1`, so an event
 *   keyed at 0 fires at the first sample. `string` is the key's, else the
 *   event definition's, else `""` — measured on issue #955, where this line
 *   said `null`: an event declared with no string fired `""`
 *   (`src/core/events.ts`). Events after the last sample are not listed.
 *
 * ## How a pose is posed
 *
 * A skeleton is `new Skeleton(data)` with one skin set before anything is
 * posed: under `--skin all` a new skin named `__all` to which every skin is
 * added in file order (`Skin.addSkin`, later skins overriding earlier ones at
 * the same slot and placeholder); under `--skin <name>` that skin, where the
 * default skin still fills what it does not name (`Skeleton.getAttachment`).
 *
 * Sample times, for an animation of duration `d` and `N` samples, sample `i`
 * from 0: `grid` — `d·i/(N-1)` (and `0` when `N` is 1); `off` —
 * `d·(i+0.5)/N`; `irr` and `dense` — `d·(i+0.381966011)/N`, an offset of
 * `1 − 1/φ` so no sample lands on a key authored on a frame grid. `dense` is
 * `irr`'s formula under its own name, for a dump taken with a large `N`.
 * The formula is held in the core (`sampleTime` in `src/core/animation.ts`)
 * and this tool calls it, as it rounds with `gridRound`, so the two dumpers
 * sample at one set of times. `d` is spine-core's `Animation.duration`: the
 * last key time of every timeline in the animation, as float32 — measured
 * against the model's declared duration on issue #936 (an animation whose
 * bones stop at 1 and whose event fires at 2.5 samples over 2.5).
 *
 * `--physics none` (the default), which is the prototype's posing exactly: one
 * skeleton for the whole dump; the setup pose is `setupPose()` then
 * `updateWorldTransform(Physics.none)`; each sample is `setupPose()`, then
 * `Animation.apply(skeleton, 0, t, false, null, 1, MixFrom.setup, false,
 * false, false)`, then `updateWorldTransform(Physics.none)`. Physics
 * constraints are not simulated: they hold the bones where the animation left
 * them — measured on issue #938, the dump of a rig with its physics
 * constraints and timelines is the dump of the rig without them
 * (`src/core/constraints_physics.ts`).
 *
 * `--physics step --dt <s>`: a fresh skeleton per animation (and one for the
 * setup pose), `setupPose()`, `update(0)` and `updateWorldTransform(Physics.
 * reset)` at time 0 — for an animation after applying it at 0 as below. Then
 * the skeleton is walked forward in one continuous trajectory through every
 * sample in order: from the previous sample's time `p` (0 at the start), for
 * `k = 1, 2, …` while `p + k·dt < t`, one step to `p + k·dt`, and then one step
 * to `t` itself unless the walk is already there. A step to time `s` is
 * `setupPose()`, `Animation.apply(skeleton, 0, s, false, null, 1,
 * MixFrom.setup, false, false, false)`, `update(s − previous s)` and
 * `updateWorldTransform(Physics.update)`; the pose is read after the step to
 * `t` without posing again. spine-core integrates physics on its own fixed
 * `step` inside that call, carrying the remainder, so `dt` decides how often
 * the animated bones are re-posed under the simulation, not the integrator.
 * Measured on issue #956 (`src/core/constraints_physics.ts`): the same rig
 * under dt 1/60, 1/30 and 0.025 reads three trajectories — a bone under an
 * `x` spring whose parent moves 60 units a second sat at 4.517945, 4.613321
 * and 4.611427 at t = 0.125 — each reproduced by the core at tolerance 0.
 *
 * ## `dump --core` — the second dumper
 *
 * The same document from rigc's own core (`src/core/index.ts`, issue #925)
 * posing a `rigc-compiled/1` document (`skeleton.model.json`, which `build`
 * writes beside the Spine pair) — no spine-core call is made for it. `dumper`
 * is `"rigc-core"`; `source` is `{ "spine": null, "hash": null }`, since the
 * model states neither; `options` as given. `--skin` is `all` or a skin the
 * model declares (issue #932, `underSkin` and `src/core/skins.ts`): under a
 * named skin a slot shows the named skin's record, else the default skin's,
 * else nothing, and only the named skin's `bones` and constraint lists are
 * applied — the default skin's are not — each measured against the dump
 * above; a skin the model does not declare is refused (exit 2) by name. Under `--physics step --dt <s>` the core walks the
 * schedule above itself (issue #956, `poseSteppedAnimations` and
 * `stepSchedule` in `src/core/constraints_physics.ts`): the setup pose is the
 * reset pose, every animation a fresh state reset at 0 and stepped through
 * the samples, each physics constraint integrated as that file's header
 * states with its measurements, `options.dt` the `dt` given. The rosters
 * `bones`, `slots`, `skins` and `constraints` are the document's own, in its
 * order, and `physics` is each physics constraint's row as above, written
 * from the model's record with the parser's value for a field it leaves out
 * (`physicsRows`).
 * `paths` and `pathAttachments` are the document's path constraints and path
 * attachments as the runtime reads them (issue #938, second cut,
 * `src/core/constraints_path.ts`). `setup.bones` is the core's setup pose
 * with the document's ik, transform, path, physics and slider constraints
 * applied in its order (issue #938, `src/core/constraints.ts`; under
 * `--physics none` a physics constraint applies nothing, stepped it is
 * reset, and a slider applies its animation), or absent when a path walks a slot whose
 * placeholder skins fill with different curves, or a slider's animation
 * keys a constraint timeline or deforms a walked curve; `setup.slots` is every slot's row as the pose
 * above words it (issue #928), each slider's slot timelines applied after
 * the bones, or absent when a slot's setup placeholder is filled
 * by skins that disagree, since which of them `--skin all` shows is the Spine
 * file's skin order and the model does not carry it (the core's header says
 * why, with the measurements) — a case that arises under `all` only, and
 * that the per-skin dumps judge; `setup.attachments` and `setup.clips` are the
 * world vertices of every region, mesh, linked mesh and clipping polygon shown
 * at setup, in the setup draw order (issue #931, `src/core/vertices.ts`),
 * each slider's deform and sequence keys applied (issue #955), absent when
 * either block above is, and `setup.attachments` also when a shown region's
 * atlas rectangle is `null` in the model or a slider's timeline moves a
 * record several skins fill. `animations` is every animation of
 * the model, in the model's order, sampled at the phase's times over its
 * runtime duration (issue #936, `src/core/animation.ts`): each sample's
 * `bones` and `slots` posed from the setup pose with the animation's bone and
 * slot timelines at alpha 1, then the constraints posed by their timelines
 * at the sample's time, a path walking the curve the sample's deform left —
 * `animations.bones` absent when `setup.bones` is, when an animation keys
 * the attachment of a walked path's slot or deforms a walked path whose
 * placeholder several skins fill, or when a path's offset reads a slot bone from the previous pose
 * whose reflection changes across the samples (under the step: whenever a
 * path's offset reads a slot bone from the previous pose, which is then the
 * previous step's); `animations.slots` absent
 * when a slider keys a slot on such a document or skins disagree over a
 * placeholder a slot shows — and, since issue #955, its `drawOrder` (the
 * sample's draw-order key over the setup order, then each slider's,
 * `src/core/draw_order.ts`), its `attachments` and `clips` (through the
 * sample's bones, in that draw order, with the deform and sequence
 * timelines' state, `src/core/deform.ts`; absent when the bones or the slots
 * are, and the attachments when a timeline moves a record several skins
 * fill) and its `events` (`src/core/events.ts`). `setup.drawOrder` is the slot
 * order with each slider's draw-order key applied. The physics parameters
 * are `null` and named in `absent`.
 *
 * ## `compare` — two documents
 *
 * Refused (exit 2) when either file is not a `pose-oracle/3` document, when
 * the two were taken under different `options`, or when a block is absent
 * from BOTH — there is then nothing to compare it with. A block absent from
 * exactly one side prints `SKIP <block>: not produced by <dumper>` (and the
 * absent side's reason) and is neither compared nor counted: IDENTICAL then
 * speaks for the blocks both documents carry, and its line says how many were
 * skipped and which. A sample block is judged the same way inside the
 * animations both documents carry, and not at all when either carries none.
 * Otherwise every roster (bones, slots, skins, animations, constraints, path
 * attachments, sample counts) and every name must agree exactly — skins and
 * animations as sets, matched by name, because the order they are listed in
 * is the Spine file's spelling (the emitter's editor order) and not a pose —
 * and every number within tolerance: world
 * positions and vertex coordinates within `--tol-xy`, everything else (the
 * matrix, colours, times, parameters) within `--tol-m`. Both default to 1e-6,
 * one step of the rounding grid; deltas are computed on the grid, in integer
 * millionths, so a rounding tie cannot read as over.
 *
 * 🔒 The ill-conditioned rule, from the prototype's calibration: at a sample,
 * a bone whose `|a·d − b·c| < 1e-6` in EITHER document is excluded from that
 * sample's comparison, and so is every descendant of it; so are the
 * attachments and clips on the slots of the excluded bones. Excluded
 * bone-samples are counted and printed, never compared. A collapsed matrix's
 * four numbers carry no rotation to agree about, and float noise in them is
 * not a difference between two rigs.
 *
 * Prints `IDENTICAL` and exits 0 when nothing differs; otherwise, per
 * animation, the worst Δxy and Δabcd with the bone and the sample, the count of
 * bone-samples over tolerance, the worst vertex delta, and every roster, name,
 * draw-order and event mismatch by name, then the first difference, and exits
 * 1.
 *
 * 🔒 Not a selftest control in full: grading the corpus is a table, and a
 * table is PR_BODY material. `selftest.ts` holds three rows of it the way it
 * holds `pose_floor` — two dumps of one build byte-identical, a planted 1°
 * named by `compare`, and one public example's rebuild against its export at
 * the reading measured.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Animation,
  AtlasAttachmentLoader,
  BlendMode,
  ClippingAttachment,
  EventTimeline,
  IkConstraintData,
  MeshAttachment,
  MixFrom,
  PathAttachment,
  PathConstraintData,
  Physics,
  PhysicsConstraintData,
  PositionMode,
  RegionAttachment,
  RotateMode,
  ScaleYMode,
  Skeleton,
  SkeletonClipping,
  type SkeletonData,
  SkeletonJson,
  Skin,
  type Slot,
  SliderData,
  SpacingMode,
  TextureAtlas,
  TransformConstraintData,
  type Event,
} from '@esotericsoftware/spine-core';
import { CORE_DUMPER, CoreInputError, gridRound, poseSetup, readModel, underSkin, type CompiledDocument } from '../src/core/index.ts';
import { REGION_TRIANGLES, REGION_UVS } from '../src/core/clipping.ts';
import { IRR_OFFSET as CORE_IRR_OFFSET, poseAnimations, sampleTime as coreSampleTime, type TimelinePlant } from '../src/core/animation.ts';
import { pathAttachmentRows, pathRows, type CorePathRecord } from '../src/core/constraints_path.ts';
import { PHYSICS_REFERENCE_SCALE, physicsRows, poseSteppedAnimations, type CorePhysicsRecord } from '../src/core/constraints_physics.ts';

export const ORACLE_SPEC = 'pose-oracle/3';
export const ORACLE_DUMPER = 'spine-core 4.3.13';
export const ORACLE_PHASES = ['grid', 'off', 'irr', 'dense'] as const;
export type OraclePhase = (typeof ORACLE_PHASES)[number];
export const ORACLE_PHYSICS = ['none', 'step'] as const;
export type OraclePhysics = (typeof ORACLE_PHYSICS)[number];
/** `1 − 1/φ`, the prototype's irrational offset, to the nine places it wrote — held by the core (`src/core/animation.ts`), so the two dumpers sample at one set of times. */
export const IRR_OFFSET = CORE_IRR_OFFSET;
/** The rounding grid: six decimals. */
export const ORACLE_GRID = 1e6;
/** The ill-conditioned bound on `|det|`, the prototype's `EPS_DET`. */
export const ORACLE_EPS_DET = 1e-6;
export const ORACLE_DEFAULT_SAMPLES = 9;
export const ORACLE_DEFAULT_DT = '1/60';
export const ORACLE_DEFAULT_TOL = 1e-6;

/** A refusal about an input — the command exits 2 on it. */
export class OracleInputError extends Error {}

export type Num = number | null;
export type BoneRow = [string, Num, Num, Num, Num, Num, Num, 0 | 1, string | null];
export type SlotRow = [string, string | null, Num, Num, Num, Num, [Num, Num, Num] | null, string | null, string | null];
export type AttachmentRow = [string, string, 'region' | 'mesh', Num[]];
export type ClipRow = [string, string, string | null, Num[]];
export type ClippedRow = [string, string, 0 | 1, Num[], Num[], number[]];
export type EventRow = [string, Num, number, Num, string | null];

export interface OraclePose {
  bones: BoneRow[];
  slots: SlotRow[];
  drawOrder: string[];
  attachments: AttachmentRow[];
  clips: ClipRow[];
  clipped: ClippedRow[];
}

export interface OracleSample extends OraclePose {
  t: Num;
  events: EventRow[];
}

export interface OracleAnimation {
  name: string;
  duration: Num;
  samples: OracleSample[];
}

/** A sample in which a block may be absent (`null` in every sample, and named in `absent`). */
export interface OracleDocumentSample {
  t: Num;
  events: EventRow[] | null;
  bones: BoneRow[] | null;
  slots: SlotRow[] | null;
  drawOrder: string[] | null;
  attachments: AttachmentRow[] | null;
  clips: ClipRow[] | null;
  clipped: ClippedRow[] | null;
}

export interface OracleDocumentAnimation {
  name: string;
  duration: Num;
  samples: OracleDocumentSample[];
}

export interface OracleOptions {
  phase: OraclePhase;
  samples: number;
  skin: string;
  physics: OraclePhysics;
  dt: number | null;
}

export interface OraclePhysicsRow {
  name: string;
  bone: string;
  x: Num;
  y: Num;
  rotate: Num;
  scaleX: Num;
  shearX: Num;
  limit: Num;
  step: Num;
  inertia: Num;
  strength: Num;
  damping: Num;
  massInverse: Num;
  wind: Num;
  gravity: Num;
  mix: Num;
  inertiaGlobal: boolean;
  strengthGlobal: boolean;
  dampingGlobal: boolean;
  massGlobal: boolean;
  windGlobal: boolean;
  gravityGlobal: boolean;
  mixGlobal: boolean;
  skinRequired: boolean;
  scaleYMode: string;
}

export interface OraclePathRow {
  name: string;
  slot: string;
  bones: string[];
  positionMode: string;
  spacingMode: string;
  rotateMode: string;
  offsetRotation: Num;
  position: Num;
  spacing: Num;
  mixRotate: Num;
  mixX: Num;
  mixY: Num;
}

export interface OraclePathAttachmentRow {
  skin: string;
  slot: string;
  placeholder: string;
  closed: boolean;
  constantSpeed: boolean;
  lengths: Num[];
}

export interface OracleDump {
  spec: string;
  dumper: string;
  source: { spine: string | null; hash: string | null };
  options: OracleOptions;
  bones: string[];
  slots: Array<[string, string]>;
  skins: string[];
  constraints: Array<[string, string]>;
  physics: OraclePhysicsRow[];
  paths: OraclePathRow[];
  pathAttachments: OraclePathAttachmentRow[];
  setup: OraclePose;
  animations: OracleAnimation[];
}

/**
 * Every block a document may leave absent (`null`), by the name `compare` and
 * a SKIP line use: the top-level lists, then the setup pose's own, then
 * `animations` — the document's key order.
 */
export const ORACLE_BLOCKS = [
  'bones', 'slots', 'skins', 'constraints', 'physics', 'paths', 'pathAttachments',
  'setup.bones', 'setup.slots', 'setup.drawOrder', 'setup.attachments', 'setup.clips', 'setup.clipped', 'animations',
  'animations.bones', 'animations.slots', 'animations.drawOrder', 'animations.attachments', 'animations.clips', 'animations.clipped', 'animations.events',
] as const;
export type OracleBlock = (typeof ORACLE_BLOCKS)[number];

/** The blocks a sample carries, by their block names: absent from a document means `null` in every one of its samples. */
export const SAMPLE_BLOCKS = ['animations.bones', 'animations.slots', 'animations.drawOrder', 'animations.attachments', 'animations.clips', 'animations.clipped', 'animations.events'] as const;
export type SampleBlock = (typeof SAMPLE_BLOCKS)[number];
const sampleField = (block: SampleBlock): 'bones' | 'slots' | 'drawOrder' | 'attachments' | 'clips' | 'clipped' | 'events' =>
  block.slice('animations.'.length) as 'bones' | 'slots' | 'drawOrder' | 'attachments' | 'clips' | 'clipped' | 'events';

/** A setup pose in which a block may be absent. */
export interface OracleDocumentPose {
  bones: BoneRow[] | null;
  slots: SlotRow[] | null;
  drawOrder: string[] | null;
  attachments: AttachmentRow[] | null;
  clips: ClipRow[] | null;
  clipped: ClippedRow[] | null;
}

/**
 * A `pose-oracle/3` document from either dumper: an `OracleDump` is one with
 * nothing absent. `absent` names every `null` block with the construct its
 * dumper has not admitted; a spine-core dump carries none and writes no
 * `absent` key.
 */
export interface OracleDocument {
  spec: string;
  dumper: string;
  source: { spine: string | null; hash: string | null };
  options: OracleOptions;
  absent?: Array<[string, string]>;
  bones: string[] | null;
  slots: Array<[string, string]> | null;
  skins: string[] | null;
  constraints: Array<[string, string]> | null;
  physics: OraclePhysicsRow[] | null;
  paths: OraclePathRow[] | null;
  pathAttachments: OraclePathAttachmentRow[] | null;
  setup: OracleDocumentPose;
  animations: OracleDocumentAnimation[] | null;
}

/**
 * Six decimals, round half up; `null` for a value that is not finite. The
 * function is the core's (`gridRound` in `src/core/index.ts`), so the two
 * dumpers round with one body rather than two that could drift.
 */
export function r(v: number): Num {
  return gridRound(v);
}

/** Sample `i` of `n` over duration `d` under `phase` — see the header. */
export function sampleTime(phase: OraclePhase, d: number, i: number, n: number): number {
  return coreSampleTime(phase, d, i, n);
}

/** `1/60`, `0.02` — a positive step in seconds, or a refusal naming the spelling. */
export function parseDt(text: string): number {
  const ratio = /^(\d+)\/(\d+)$/.exec(text);
  const value = ratio ? Number(ratio[1]) / Number(ratio[2]) : /^\d*\.?\d+(e-?\d+)?$/i.test(text) ? Number(text) : NaN;
  if (!Number.isFinite(value) || value <= 0) {
    throw new OracleInputError(`--dt ${JSON.stringify(text)} is not a positive step in seconds (write 1/60 or 0.016667)`);
  }
  return value;
}

/** Parse a skeleton through spine-core, or refuse naming the file and what the runtime said. */
export function loadOracleData(skeletonText: string, atlasText: string, where: string): SkeletonData {
  let json: unknown;
  try {
    json = JSON.parse(skeletonText);
  } catch (err) {
    throw new OracleInputError(`${where}: not JSON — ${(err as Error).message}`);
  }
  try {
    const atlas = new TextureAtlas(atlasText);
    return new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(json);
  } catch (err) {
    throw new OracleInputError(`${where}: spine-core did not load it — ${(err as Error).message}`);
  }
}

function constraintType(c: unknown, name: string): string {
  if (c instanceof IkConstraintData) return 'ik';
  if (c instanceof TransformConstraintData) return 'transform';
  if (c instanceof PathConstraintData) return 'path';
  if (c instanceof PhysicsConstraintData) return 'physics';
  if (c instanceof SliderData) return 'slider';
  throw new OracleInputError(`constraint "${name}" is none of ik, transform, path, physics, slider — this dumper has no row for it`);
}

function readPose(skeleton: Skeleton): OraclePose {
  const bones: BoneRow[] = skeleton.bones.map((b) => {
    const p = b.appliedPose;
    return [b.data.name, r(p.worldX), r(p.worldY), r(p.a), r(p.b), r(p.c), r(p.d), b.active ? 1 : 0, b.parent ? b.parent.data.name : null];
  });
  const slots: SlotRow[] = skeleton.slots.map((s) => {
    const p = s.appliedPose;
    const att = p.attachment;
    const dark = p.darkColor;
    const path = att instanceof RegionAttachment || att instanceof MeshAttachment ? att.path : null;
    return [
      s.data.name,
      att ? att.name : null,
      r(p.color.r),
      r(p.color.g),
      r(p.color.b),
      r(p.color.a),
      dark === null ? null : [r(dark.r), r(dark.g), r(dark.b)],
      path ?? null,
      BlendMode[s.data.blendMode] ?? null,
    ];
  });
  const drawOrder: string[] = [];
  const attachments: AttachmentRow[] = [];
  const clips: ClipRow[] = [];
  const clipped: ClippedRow[] = [];
  // The renderer's walk (`piecesOf` in src/render.ts), with the attachment's local UVs — see the header's `clipped`.
  const clipper = new SkeletonClipping();
  const drawClipped = (slot: Slot, name: string, world: number[], triangles: ArrayLike<number>, uvs: ArrayLike<number>): void => {
    if (!clipper.isClipping()) return;
    const tri = Array.from(triangles);
    const ret = clipper.clipTrianglesUnpacked(world, 0, tri, tri.length, Float32Array.from(uvs), 2);
    clipped.push([slot.data.name, name, ret ? 1 : 0, Array.from(clipper.clippedVerticesTyped).map(r), Array.from(clipper.clippedUVsTyped).map(r), Array.from(clipper.clippedTrianglesTyped)]);
  };
  for (const slot of skeleton.drawOrder.appliedPose) {
    drawOrder.push(slot.data.name);
    const att = slot.appliedPose.attachment;
    if (att instanceof MeshAttachment) {
      const out = new Array<number>(att.worldVerticesLength).fill(0);
      att.computeWorldVertices(skeleton, slot, 0, att.worldVerticesLength, out, 0, 2);
      attachments.push([slot.data.name, att.name, 'mesh', out.map(r)]);
      drawClipped(slot, att.name, out, att.triangles, att.regionUVs);
    } else if (att instanceof RegionAttachment) {
      const out = new Array<number>(8).fill(0);
      att.computeWorldVertices(slot, att.getOffsets(slot.appliedPose), out, 0, 2);
      attachments.push([slot.data.name, att.name, 'region', out.map(r)]);
      drawClipped(slot, att.name, out, REGION_TRIANGLES, REGION_UVS);
    } else if (att instanceof ClippingAttachment) {
      const out = new Array<number>(att.worldVerticesLength).fill(0);
      att.computeWorldVertices(skeleton, slot, 0, att.worldVerticesLength, out, 0, 2);
      clips.push([slot.data.name, att.name, att.endSlot ? att.endSlot.name : null, out.map(r)]);
      clipper.clipEnd(slot);
      if (slot.bone.active) clipper.clipStart(skeleton, slot, att);
      continue;
    }
    clipper.clipEnd(slot);
  }
  clipper.clipEnd();
  return { bones, slots, drawOrder, attachments, clips, clipped };
}

function firedBetween(skeleton: Skeleton, anim: Animation, last: number, t: number): EventRow[] {
  const fired: Event[] = [];
  for (const timeline of anim.timelines) {
    if (timeline instanceof EventTimeline) timeline.apply(skeleton, last, t, fired, 1, MixFrom.setup, false, false, false);
  }
  return fired.map((e) => [e.data.name, r(e.time), e.intValue, r(e.floatValue), e.stringValue ?? null]);
}

/** Pose one skeleton into a `pose-oracle/3` document — see the header for every field. */
export function dumpSkeleton(data: SkeletonData, options: OracleOptions): OracleDump {
  let skin: Skin;
  if (options.skin === 'all') {
    skin = new Skin('__all');
    for (const s of data.skins) skin.addSkin(s);
  } else {
    const found = data.findSkin(options.skin);
    if (!found) {
      throw new OracleInputError(
        `--skin ${JSON.stringify(options.skin)}: no such skin; this skeleton declares [${data.skins.map((s) => s.name).join(', ') || 'none'}] (or pass all)`,
      );
    }
    skin = found;
  }
  if (options.physics === 'step' && (options.dt === null || !(options.dt > 0))) {
    throw new OracleInputError('--physics step needs a positive --dt');
  }
  const fresh = (): Skeleton => {
    const s = new Skeleton(data);
    s.setSkin(skin);
    return s;
  };

  const constraints: Array<[string, string]> = data.constraints.map((c) => [constraintType(c, c.name), c.name]);
  const physics: OraclePhysicsRow[] = [];
  const paths: OraclePathRow[] = [];
  for (const c of data.constraints) {
    if (c instanceof PhysicsConstraintData) {
      const s = c.setupPose;
      physics.push({
        name: c.name,
        bone: c.bone.name,
        x: r(c.x),
        y: r(c.y),
        rotate: r(c.rotate),
        scaleX: r(c.scaleX),
        shearX: r(c.shearX),
        limit: r(c.limit),
        step: r(c.step),
        inertia: r(s.inertia),
        strength: r(s.strength),
        damping: r(s.damping),
        massInverse: r(s.massInverse),
        wind: r(s.wind),
        gravity: r(s.gravity),
        mix: r(s.mix),
        inertiaGlobal: c.inertiaGlobal,
        strengthGlobal: c.strengthGlobal,
        dampingGlobal: c.dampingGlobal,
        massGlobal: c.massGlobal,
        windGlobal: c.windGlobal,
        gravityGlobal: c.gravityGlobal,
        mixGlobal: c.mixGlobal,
        skinRequired: c.skinRequired,
        scaleYMode: ScaleYMode[c.scaleYMode] ?? String(c.scaleYMode),
      });
    } else if (c instanceof PathConstraintData) {
      const s = c.setupPose;
      paths.push({
        name: c.name,
        slot: c.slot.name,
        bones: c.bones.map((b) => b.name),
        positionMode: PositionMode[c.positionMode] ?? String(c.positionMode),
        spacingMode: SpacingMode[c.spacingMode] ?? String(c.spacingMode),
        rotateMode: RotateMode[c.rotateMode] ?? String(c.rotateMode),
        offsetRotation: r(c.offsetRotation),
        position: r(s.position),
        spacing: r(s.spacing),
        mixRotate: r(s.mixRotate),
        mixX: r(s.mixX),
        mixY: r(s.mixY),
      });
    }
  }
  const pathAttachments: OraclePathAttachmentRow[] = [];
  for (const sk of data.skins) {
    for (const e of sk.getAttachments()) {
      const a = e.attachment;
      if (!(a instanceof PathAttachment)) continue;
      pathAttachments.push({
        skin: sk.name,
        slot: data.slots[e.slotIndex].name,
        placeholder: e.placeholder,
        closed: a.closed,
        constantSpeed: a.constantSpeed,
        lengths: a.lengths.map(r),
      });
    }
  }

  const n = options.samples;
  const animations: OracleAnimation[] = [];
  let setup: OraclePose;
  if (options.physics === 'none') {
    const skeleton = fresh();
    skeleton.setupPose();
    skeleton.updateWorldTransform(Physics.none);
    setup = readPose(skeleton);
    for (const anim of data.animations) {
      const samples: OracleSample[] = [];
      let last = -1;
      for (let i = 0; i < n; i++) {
        const t = sampleTime(options.phase, anim.duration, i, n);
        skeleton.setupPose();
        anim.apply(skeleton, 0, t, false, null, 1, MixFrom.setup, false, false, false);
        skeleton.updateWorldTransform(Physics.none);
        const events = firedBetween(skeleton, anim, last, t);
        last = t;
        samples.push({ t: r(t), events, ...readPose(skeleton) });
      }
      animations.push({ name: anim.name, duration: r(anim.duration), samples });
    }
  } else {
    const dt = options.dt as number;
    const rest = fresh();
    rest.setupPose();
    rest.update(0);
    rest.updateWorldTransform(Physics.reset);
    setup = readPose(rest);
    for (const anim of data.animations) {
      const skeleton = fresh();
      const poseAt = (s: number): void => {
        skeleton.setupPose();
        anim.apply(skeleton, 0, s, false, null, 1, MixFrom.setup, false, false, false);
      };
      poseAt(0);
      skeleton.update(0);
      skeleton.updateWorldTransform(Physics.reset);
      let now = 0;
      const stepTo = (s: number): void => {
        poseAt(s);
        skeleton.update(s - now);
        skeleton.updateWorldTransform(Physics.update);
        now = s;
      };
      const samples: OracleSample[] = [];
      let last = -1;
      for (let i = 0; i < n; i++) {
        const t = sampleTime(options.phase, anim.duration, i, n);
        const from = now;
        for (let k = 1; from + k * dt < t; k++) stepTo(from + k * dt);
        if (t > now) stepTo(t);
        const events = firedBetween(skeleton, anim, last, t);
        last = t;
        samples.push({ t: r(t), events, ...readPose(skeleton) });
      }
      animations.push({ name: anim.name, duration: r(anim.duration), samples });
    }
  }

  return {
    spec: ORACLE_SPEC,
    dumper: ORACLE_DUMPER,
    source: { spine: data.version ?? null, hash: data.hash ?? null },
    options: { phase: options.phase, samples: options.samples, skin: options.skin, physics: options.physics, dt: options.physics === 'step' ? options.dt : null },
    bones: data.bones.map((b) => b.name),
    slots: data.slots.map((s): [string, string] => [s.name, s.boneData.name]),
    skins: data.skins.map((s) => s.name),
    constraints,
    physics,
    paths,
    pathAttachments,
    setup,
    animations,
  };
}

/** The document's bytes: one line and a newline, keys in the order the objects above were built in. */
export function dumpText(dump: OracleDocument): string {
  return `${JSON.stringify(dump)}\n`;
}

/**
 * The second dumper: a `rigc-compiled/1` document posed by rigc's own core
 * (`src/core/index.ts`) into the same shape — see the header's *`dump --core`*.
 * `options.skin` is `all` or a skin of the document (`underSkin`, issue
 * #932); a skin it does not declare is refused by name, as the spine-core
 * dump refuses it.
 */
export function coreDump(model: CompiledDocument, options: OracleOptions, plant: TimelinePlant = {}): OracleDocument {
  let doc: CompiledDocument;
  try {
    doc = underSkin(model, options.skin);
  } catch (err) {
    if (err instanceof CoreInputError) throw new OracleInputError(`dump --core: ${err.message}`);
    throw err;
  }
  const stepped = options.physics === 'step';
  if (stepped && (options.dt === null || !(options.dt > 0))) throw new OracleInputError('dump --core: --physics step needs a positive --dt');
  const posed = stepped ? poseSetup(doc, plant, { phase: 'reset', time: 0, referenceScale: PHYSICS_REFERENCE_SCALE, states: new Map(), ...(plant.physicsStep ? { step: plant.physicsStep } : {}) }) : poseSetup(doc, plant);
  const { setup } = posed;
  const sampled = stepped ? poseSteppedAnimations(doc, options.phase, options.samples, options.dt as number, plant) : poseAnimations(doc, options.phase, options.samples, plant);
  const leftOut = new Set(sampled.absent.map((x) => x[0]));
  const absent = [...posed.absent, ...sampled.absent].sort((x, y) => ORACLE_BLOCKS.indexOf(x[0] as OracleBlock) - ORACLE_BLOCKS.indexOf(y[0] as OracleBlock));
  const animations: OracleDocumentAnimation[] = sampled.animations.map((a) => ({
    name: a.name,
    duration: a.duration,
    samples: a.samples.map((x) => ({
      t: x.t,
      events: x.events,
      bones: leftOut.has('animations.bones') ? null : x.bones,
      slots: leftOut.has('animations.slots') ? null : x.slots,
      drawOrder: leftOut.has('animations.drawOrder') ? null : x.drawOrder,
      attachments: leftOut.has('animations.attachments') ? null : x.attachments,
      clips: leftOut.has('animations.clips') ? null : x.clips,
      clipped: leftOut.has('animations.clipped') ? null : x.clipped,
    })),
  }));
  return {
    spec: ORACLE_SPEC,
    dumper: CORE_DUMPER,
    source: { spine: null, hash: null },
    options: { phase: options.phase, samples: options.samples, skin: options.skin, physics: options.physics, dt: stepped ? options.dt : null },
    absent,
    bones: doc.bones.map((b) => b.name),
    slots: doc.slots.map((s): [string, string] => [s.name, s.bone]),
    skins: doc.skins.map((s) => s.name),
    constraints: doc.constraints.map((c): [string, string] => [c.kind, c.name]),
    physics: physicsRows(doc.constraints.flatMap((c) => (c.record?.kind === 'physics' ? [c.record as CorePhysicsRecord] : [])), gridRound) as unknown as OraclePhysicsRow[],
    paths: pathRows(doc.constraints.flatMap((c) => (c.record?.kind === 'path' ? [c.record as CorePathRecord] : [])), gridRound),
    pathAttachments: pathAttachmentRows(doc.skins, gridRound),
    setup,
    animations,
  };
}

/**
 * A block of a document, or `null` when the document leaves it absent. A
 * sample block is every sample's field, in order, or `null` when the document
 * names it absent or carries no animations.
 */
export function blockOf(doc: OracleDocument, block: OracleBlock): unknown[] | null {
  if ((SAMPLE_BLOCKS as readonly string[]).includes(block)) {
    if (doc.animations === null || doc.absent?.some((x) => x[0] === block)) return null;
    const field = sampleField(block as SampleBlock);
    return doc.animations.flatMap((a) => a.samples.map((x) => x[field]));
  }
  switch (block) {
    case 'setup.bones':
      return doc.setup.bones;
    case 'setup.slots':
      return doc.setup.slots;
    case 'setup.drawOrder':
      return doc.setup.drawOrder;
    case 'setup.attachments':
      return doc.setup.attachments;
    case 'setup.clips':
      return doc.setup.clips;
    case 'setup.clipped':
      return doc.setup.clipped;
    default:
      return doc[block as 'bones' | 'slots' | 'skins' | 'constraints' | 'physics' | 'paths' | 'pathAttachments' | 'animations'];
  }
}

/** Where a dump's input is: a build directory, or a skeleton and its atlas. */
export function resolveDumpInput(paths: readonly string[]): { skeleton: string; atlas: string } {
  if (paths.length === 1) {
    const dir = paths[0];
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      throw new OracleInputError(`dump: ${dir} is not a build directory (pass <build dir>, or <skeleton.json> <atlas>)`);
    }
    const skeleton = join(dir, 'skeleton.json');
    const atlas = join(dir, 'skeleton.atlas');
    const missing = [skeleton, atlas].filter((p) => !existsSync(p));
    if (missing.length > 0) {
      throw new OracleInputError(`dump: build directory ${dir} has no ${missing.map((p) => p.slice(dir.length + 1)).join(' and no ')} — rigc build writes both`);
    }
    return { skeleton, atlas };
  }
  if (paths.length === 2) {
    const missing = paths.filter((p) => !existsSync(p));
    if (missing.length > 0) throw new OracleInputError(`dump: no such file: ${missing.join(', ')}`);
    return { skeleton: paths[0], atlas: paths[1] };
  }
  throw new OracleInputError(`dump: expected <build dir> or <skeleton.json> <atlas>, got ${paths.length} path(s)`);
}

// ---------------------------------------------------------------------------
// compare
// ---------------------------------------------------------------------------

export interface OracleTolerance {
  xy: number;
  m: number;
}

interface Worst {
  d: number;
  what: string;
}

/** One row of the comparison: the setup pose, or one animation. */
export interface OracleRowReport {
  name: string;
  samples: number;
  boneSamples: number;
  exact: number;
  over: number;
  excluded: number;
  worstXy: Worst;
  worstM: Worst;
  vertices: number;
  verticesOver: number;
  worstVertex: Worst;
  mismatches: Record<string, number>;
  /** Every named difference, in the order found; `first` is the first. */
  findings: string[];
}

export interface OracleComparison {
  identical: boolean;
  /**
   * `<block>: not produced by <dumper>[ — why]`, one per block exactly one side
   * leaves absent, in document order. Neither compared nor counted: IDENTICAL
   * is a statement about the blocks both documents carry.
   */
  skipped: string[];
  rows: OracleRowReport[];
  /** Differences that belong to no row: rosters, constraints, parameters. */
  document: string[];
  first: string | null;
  worstXy: number;
  worstM: number;
  worstVertex: number;
  excluded: number;
  boneSamples: number;
}

/** Integer millionths — the grid every number was rounded to. */
const units = (v: number): number => Math.round(v * ORACLE_GRID);
const fmt = (u: number): string => (u / ORACLE_GRID).toFixed(6);
const at = (row: string, t: Num): string => (row === '(setup)' ? 'the setup pose' : `animation "${row}" t=${t ?? 'null'}`);

/** Throws naming the first field that is not what a `pose-oracle/3` document has. */
export function asOracleDump(value: unknown, where: string): OracleDump {
  if (typeof value !== 'object' || value === null) throw new OracleInputError(`${where}: not a JSON object`);
  const v = value as Record<string, unknown>;
  if (v.spec !== ORACLE_SPEC) throw new OracleInputError(`${where}: spec is ${JSON.stringify(v.spec)}, not "${ORACLE_SPEC}"`);
  for (const key of ['options', 'setup', 'source'] as const) {
    if (typeof v[key] !== 'object' || v[key] === null) throw new OracleInputError(`${where}: no ${key} object`);
  }
  for (const key of ['bones', 'slots', 'skins', 'constraints', 'physics', 'paths', 'pathAttachments', 'animations'] as const) {
    if (!Array.isArray(v[key])) throw new OracleInputError(`${where}: ${key} is not a list`);
  }
  return value as OracleDump;
}

/**
 * Throws naming the first field that is not what a `pose-oracle/3` document
 * has — either dumper's: a block may be `null`, and then the document's
 * `absent` list must name it, and name nothing else.
 */
export function asOracleDocument(value: unknown, where: string): OracleDocument {
  if (typeof value !== 'object' || value === null) throw new OracleInputError(`${where}: not a JSON object`);
  const v = value as Record<string, unknown>;
  if (v.spec !== ORACLE_SPEC) throw new OracleInputError(`${where}: spec is ${JSON.stringify(v.spec)}, not "${ORACLE_SPEC}"`);
  for (const key of ['options', 'setup', 'source'] as const) {
    if (typeof v[key] !== 'object' || v[key] === null) throw new OracleInputError(`${where}: no ${key} object`);
  }
  const doc = value as OracleDocument;
  const absent = v.absent;
  if (absent !== undefined && !(Array.isArray(absent) && absent.every((x) => Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && typeof x[1] === 'string'))) {
    throw new OracleInputError(`${where}: absent is not a list of [block, why] pairs`);
  }
  const named = absent === undefined ? [] : (absent as Array<[string, string]>).map((x) => x[0]);
  const nulls: string[] = [];
  for (const block of ORACLE_BLOCKS) {
    const sample = (SAMPLE_BLOCKS as readonly string[]).includes(block);
    // With no animations the sample blocks are nobody's: the `animations` line speaks for them.
    if (sample && doc.animations === null) continue;
    if (sample) {
      // Named absent: null in every sample. Not named: a list in every sample.
      const field = sampleField(block as SampleBlock);
      const cells = (doc.animations ?? []).flatMap((a) => (Array.isArray(a?.samples) ? a.samples.map((x) => x?.[field]) : [undefined]));
      const leftOut = named.includes(block);
      const odd = cells.findIndex((c) => (leftOut ? c !== null : !Array.isArray(c)));
      if (odd >= 0) throw new OracleInputError(`${where}: ${block} is ${leftOut ? 'named absent and a sample carries it' : 'not named absent and a sample carries no list for it'} (sample ${odd} in document order)`);
      if (leftOut) nulls.push(block);
      continue;
    }
    const b = blockOf(doc, block);
    if (b === undefined || (b !== null && !Array.isArray(b))) throw new OracleInputError(`${where}: ${block} is neither a list nor null`);
    if (b === null) nulls.push(block);
  }
  const unnamed = nulls.filter((b) => !named.includes(b));
  const extra = named.filter((b) => !nulls.includes(b));
  if (unnamed.length > 0) throw new OracleInputError(`${where}: ${unnamed.join(', ')} ${unnamed.length === 1 ? 'is' : 'are'} null and the absent list does not say why`);
  if (extra.length > 0) throw new OracleInputError(`${where}: the absent list names ${extra.join(', ')}, which ${extra.length === 1 ? 'is' : 'are'} present or no block of the document`);
  return doc;
}

/** Bones excluded at one sample: `|det| < ε` in either pose, and their descendants. */
export function illConditioned(a: BoneRow[], b: Map<string, BoneRow>): Set<string> {
  const bad = new Set<string>();
  const det = (row: BoneRow): number | null =>
    row[3] === null || row[4] === null || row[5] === null || row[6] === null ? null : row[3] * row[6] - row[4] * row[5];
  for (const row of a) {
    const other = b.get(row[0]);
    const da = det(row);
    const db = other === undefined ? null : det(other);
    if ((da !== null && Math.abs(da) < ORACLE_EPS_DET) || (db !== null && Math.abs(db) < ORACLE_EPS_DET)) bad.add(row[0]);
  }
  if (bad.size === 0) return bad;
  // Bones are listed parent-before-child, so one pass carries the exclusion down.
  for (const row of a) if (row[8] !== null && bad.has(row[8])) bad.add(row[0]);
  return bad;
}

function listDiff(kind: string, a: readonly string[], b: readonly string[]): string[] {
  const out: string[] = [];
  const onlyA = a.filter((x) => !b.includes(x));
  const onlyB = b.filter((x) => !a.includes(x));
  if (onlyA.length > 0) out.push(`${kind} only in A: ${onlyA.map((x) => JSON.stringify(x)).join(', ')}`);
  if (onlyB.length > 0) out.push(`${kind} only in B: ${onlyB.map((x) => JSON.stringify(x)).join(', ')}`);
  if (out.length === 0 && a.join('\u0000') !== b.join('\u0000')) out.push(`${kind} are the same names in a different order`);
  return out;
}

function numDelta(a: Num, b: Num): number | 'nonfinite' {
  if (a === null || b === null) return 'nonfinite';
  return Math.abs(units(a) - units(b));
}

function paramDiffs(kind: string, key: string, a: Record<string, unknown>, b: Record<string, unknown>, tolM: number): string[] {
  const out: string[] = [];
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of keys) {
    const va = a[k];
    const vb = b[k];
    if (typeof va === 'number' && typeof vb === 'number') {
      const d = Math.abs(units(va) - units(vb));
      if (d > tolM) out.push(`${kind} "${key}" ${k}: ${va} vs ${vb}`);
    } else if (JSON.stringify(va) !== JSON.stringify(vb)) {
      if (Array.isArray(va) && Array.isArray(vb) && va.length === vb.length && va.every((x) => typeof x === 'number')) {
        const d = Math.max(...va.map((x, i) => Math.abs(units(x as number) - units(vb[i] as number))));
        if (d > tolM) out.push(`${kind} "${key}" ${k}: worst Δ ${fmt(d)}`);
      } else {
        out.push(`${kind} "${key}" ${k}: ${JSON.stringify(va)} vs ${JSON.stringify(vb)}`);
      }
    }
  }
  return out;
}

function newRow(name: string): OracleRowReport {
  return {
    name,
    samples: 0,
    boneSamples: 0,
    exact: 0,
    over: 0,
    excluded: 0,
    worstXy: { d: 0, what: '' },
    worstM: { d: 0, what: '' },
    vertices: 0,
    verticesOver: 0,
    worstVertex: { d: 0, what: '' },
    mismatches: {},
    findings: [],
  };
}

/** The pose blocks a comparison reads; a setup pose one side leaves partly absent passes fewer. */
type PoseBlock = 'bones' | 'slots' | 'drawOrder' | 'attachments' | 'clips' | 'clipped';
const EVERY_POSE_BLOCK: ReadonlySet<PoseBlock> = new Set<PoseBlock>(['bones', 'slots', 'drawOrder', 'attachments', 'clips', 'clipped']);

function comparePose(
  row: OracleRowReport,
  t: Num,
  pa: OracleDocumentPose,
  pb: OracleDocumentPose,
  tolXy: number,
  tolM: number,
  slotBones: Map<string, string>,
  carry: ReadonlySet<PoseBlock> = EVERY_POSE_BLOCK,
): void {
  const where = at(row.name, t);
  const note = (kind: string, text: string): void => {
    row.mismatches[kind] = (row.mismatches[kind] ?? 0) + 1;
    row.findings.push(`${where}: ${text}`);
  };
  // A block not carried is compared as empty on both sides, which is nothing.
  const take = <T>(block: PoseBlock, l: T[] | null): T[] => (carry.has(block) && l !== null ? l : []);
  const a = { bones: take('bones', pa.bones), slots: take('slots', pa.slots), drawOrder: take('drawOrder', pa.drawOrder), attachments: take('attachments', pa.attachments), clips: take('clips', pa.clips), clipped: take('clipped', pa.clipped) };
  const b = { bones: take('bones', pb.bones), slots: take('slots', pb.slots), drawOrder: take('drawOrder', pb.drawOrder), attachments: take('attachments', pb.attachments), clips: take('clips', pb.clips), clipped: take('clipped', pb.clipped) };
  row.samples++;
  const bBones = new Map(b.bones.map((x) => [x[0], x]));
  const excluded = illConditioned(a.bones, bBones);
  row.excluded += excluded.size;
  for (const bone of a.bones) {
    const other = bBones.get(bone[0]);
    if (other === undefined) {
      note('roster', `bone "${bone[0]}" is in A's pose and not in B's`);
      continue;
    }
    if (bone[7] !== other[7]) note('active', `bone "${bone[0]}" active ${bone[7]} vs ${other[7]}`);
    if (bone[8] !== other[8]) note('parent', `bone "${bone[0]}" parent ${JSON.stringify(bone[8])} vs ${JSON.stringify(other[8])}`);
    if (excluded.has(bone[0])) continue;
    row.boneSamples++;
    let dxy = 0;
    let dm = 0;
    let nonFinite = false;
    for (let i = 1; i <= 6; i++) {
      const d = numDelta(bone[i] as Num, other[i] as Num);
      if (d === 'nonfinite') {
        nonFinite = true;
        continue;
      }
      if (i <= 2) dxy = Math.max(dxy, d);
      else dm = Math.max(dm, d);
    }
    if (nonFinite) note('nonFinite', `bone "${bone[0]}" has a non-finite term in A or B`);
    if (dxy === 0 && dm === 0 && !nonFinite) row.exact++;
    if (dxy > row.worstXy.d) row.worstXy = { d: dxy, what: `bone "${bone[0]}" at ${where}` };
    if (dm > row.worstM.d) row.worstM = { d: dm, what: `bone "${bone[0]}" at ${where}` };
    if (dxy > tolXy || dm > tolM) {
      row.over++;
      row.findings.push(
        `${where}: bone "${bone[0]}" Δxy ${fmt(dxy)} Δabcd ${fmt(dm)} — A [${bone.slice(1, 7).join(', ')}] B [${other.slice(1, 7).join(', ')}]`,
      );
    }
  }
  for (const bone of b.bones) if (!a.bones.some((x) => x[0] === bone[0])) note('roster', `bone "${bone[0]}" is in B's pose and not in A's`);

  const bSlots = new Map(b.slots.map((x) => [x[0], x]));
  for (const slot of a.slots) {
    const other = bSlots.get(slot[0]);
    if (other === undefined) {
      note('roster', `slot "${slot[0]}" is in A's pose and not in B's`);
      continue;
    }
    if (slot[1] !== other[1]) note('attachment', `slot "${slot[0]}" shows ${JSON.stringify(slot[1])} vs ${JSON.stringify(other[1])}`);
    if (slot[7] !== other[7]) note('path', `slot "${slot[0]}" region path ${JSON.stringify(slot[7])} vs ${JSON.stringify(other[7])}`);
    if (slot[8] !== other[8]) note('blend', `slot "${slot[0]}" blend ${JSON.stringify(slot[8])} vs ${JSON.stringify(other[8])}`);
    let dc = 0;
    for (let i = 2; i <= 5; i++) {
      const d = numDelta(slot[i] as Num, other[i] as Num);
      dc = d === 'nonfinite' ? Infinity : Math.max(dc, d);
    }
    if (dc > tolM) note('colour', `slot "${slot[0]}" colour Δ ${Number.isFinite(dc) ? fmt(dc) : 'non-finite'}`);
    const da = slot[6];
    const db = other[6];
    if ((da === null) !== (db === null)) note('dark', `slot "${slot[0]}" dark colour ${da === null ? 'absent' : 'present'} vs ${db === null ? 'absent' : 'present'}`);
    else if (da !== null && db !== null) {
      const d = Math.max(...[0, 1, 2].map((i) => {
        const x = numDelta(da[i], db[i]);
        return x === 'nonfinite' ? Infinity : x;
      }));
      if (d > tolM) note('dark', `slot "${slot[0]}" dark colour Δ ${Number.isFinite(d) ? fmt(d) : 'non-finite'}`);
    }
  }
  for (const slot of b.slots) if (!a.slots.some((x) => x[0] === slot[0])) note('roster', `slot "${slot[0]}" is in B's pose and not in A's`);

  if (a.drawOrder.join('\u0000') !== b.drawOrder.join('\u0000')) {
    const i = a.drawOrder.findIndex((s, k) => s !== b.drawOrder[k]);
    note('drawOrder', `draw order differs from position ${i}: A ${JSON.stringify(a.drawOrder[i] ?? null)} vs B ${JSON.stringify(b.drawOrder[i] ?? null)}`);
  }

  const geometry = (kind: 'attachment' | 'clip', la: Array<AttachmentRow | ClipRow>, lb: Array<AttachmentRow | ClipRow>, boneOf: (slot: string) => string | null): void => {
    const key = (x: AttachmentRow | ClipRow): string => `${x[0]}/${x[1]}`;
    const mb = new Map(lb.map((x) => [key(x), x]));
    for (const x of la) {
      const y = mb.get(key(x));
      if (y === undefined) {
        note(`${kind}Roster`, `${kind} "${key(x)}" is drawn in A and not in B`);
        continue;
      }
      if (x[2] !== y[2]) note(kind === 'attachment' ? 'kind' : 'clipEnd', `${kind} "${key(x)}" ${kind === 'attachment' ? 'kind' : 'end slot'} ${JSON.stringify(x[2])} vs ${JSON.stringify(y[2])}`);
      const bone = boneOf(x[0]);
      if (bone !== null && excluded.has(bone)) continue;
      const va = x[3];
      const vb = y[3];
      if (va.length !== vb.length) {
        note('vertexCount', `${kind} "${key(x)}" has ${va.length / 2} vertices in A and ${vb.length / 2} in B`);
        continue;
      }
      let worst = 0;
      let worstAt = -1;
      let nonFinite = false;
      for (let i = 0; i < va.length; i++) {
        const d = numDelta(va[i], vb[i]);
        if (d === 'nonfinite') {
          nonFinite = true;
          continue;
        }
        if (d > worst) {
          worst = d;
          worstAt = i >> 1;
        }
      }
      row.vertices += va.length / 2;
      if (nonFinite) note('nonFinite', `${kind} "${key(x)}" has a non-finite vertex in A or B`);
      if (worst > row.worstVertex.d) row.worstVertex = { d: worst, what: `${kind} "${key(x)}" vertex ${worstAt} at ${where}` };
      if (worst > tolXy) {
        row.verticesOver++;
        row.findings.push(`${where}: ${kind} "${key(x)}" vertex ${worstAt} moved ${fmt(worst)}`);
      }
    }
    const ma = new Set(la.map(key));
    for (const y of lb) if (!ma.has(key(y))) note(`${kind}Roster`, `${kind} "${key(y)}" is drawn in B and not in A`);
  };
  // A slot whose bone is excluded draws geometry the rule does not compare.
  geometry('attachment', a.attachments, b.attachments, (slot) => slotBones.get(slot) ?? null);
  geometry('clip', a.clips, b.clips, (slot) => slotBones.get(slot) ?? null);

  // The triangles drawn under a clip (issue #964): the rows in draw order, the clipper's return value and triangle list exact, vertices within --tol-xy and UVs within --tol-m.
  const ckey = (x: ClippedRow): string => `${x[0]}/${x[1]}`;
  if (a.clipped.map(ckey).join('\u0000') !== b.clipped.map(ckey).join('\u0000')) {
    note('clippedRoster', `the slots drawn under a clip are [${a.clipped.map(ckey).join(', ')}] in A and [${b.clipped.map(ckey).join(', ')}] in B`);
  } else {
    a.clipped.forEach((x, i) => {
      const y = b.clipped[i];
      const bone = slotBones.get(x[0]) ?? null;
      if (bone !== null && excluded.has(bone)) return;
      if (x[2] !== y[2]) note('clippedFlag', `clipped "${ckey(x)}": the clipper returned ${x[2]} in A and ${y[2]} in B`);
      if (x[5].join(',') !== y[5].join(',')) note('clippedTriangles', `clipped "${ckey(x)}": ${x[5].length / 3} triangle(s) in A and ${y[5].length / 3} in B${x[5].length === y[5].length ? ', indexed differently' : ''}`);
      if (x[3].length !== y[3].length || x[4].length !== y[4].length) {
        note('clippedCount', `clipped "${ckey(x)}" has ${x[3].length / 2} vertices in A and ${y[3].length / 2} in B`);
        return;
      }
      let worst = 0;
      let worstAt = -1;
      let worstUv = 0;
      for (let k = 0; k < x[3].length; k++) {
        const d = numDelta(x[3][k], y[3][k]);
        const du = numDelta(x[4][k], y[4][k]);
        if (d === 'nonfinite' || du === 'nonfinite') {
          note('nonFinite', `clipped "${ckey(x)}" has a non-finite number in A or B`);
          return;
        }
        if (d > worst) {
          worst = d;
          worstAt = k >> 1;
        }
        worstUv = Math.max(worstUv, du);
      }
      row.vertices += x[3].length / 2;
      if (worst > row.worstVertex.d) row.worstVertex = { d: worst, what: `clipped "${ckey(x)}" vertex ${worstAt} at ${where}` };
      if (worst > tolXy) {
        row.verticesOver++;
        row.findings.push(`${where}: clipped "${ckey(x)}" vertex ${worstAt} moved ${fmt(worst)}`);
      }
      if (worstUv > tolM) note('clippedUv', `clipped "${ckey(x)}" UV Δ ${fmt(worstUv)}`);
    });
  }
}

function compareEvents(row: OracleRowReport, t: Num, a: EventRow[], b: EventRow[], tolM: number): void {
  const where = at(row.name, t);
  const same =
    a.length === b.length &&
    a.every((e, i) => {
      const f = b[i];
      const dt = numDelta(e[1], f[1]);
      const df = numDelta(e[3], f[3]);
      return e[0] === f[0] && e[2] === f[2] && e[4] === f[4] && dt !== 'nonfinite' && dt <= tolM && df !== 'nonfinite' && df <= tolM;
    });
  if (same) return;
  row.mismatches.event = (row.mismatches.event ?? 0) + 1;
  const show = (l: EventRow[]): string => (l.length === 0 ? 'none' : l.map((e) => `${e[0]}@${e[1]}(${e[2]}, ${e[3]}, ${JSON.stringify(e[4])})`).join(' '));
  row.findings.push(`${where}: events fired A ${show(a)} vs B ${show(b)}`);
}

/** Compare two `pose-oracle/3` documents — see the header. */
export function compareDumps(a: OracleDocument, b: OracleDocument, tol: OracleTolerance): OracleComparison {
  const oa = JSON.stringify(a.options);
  const ob = JSON.stringify(b.options);
  if (oa !== ob) throw new OracleInputError(`the two documents were posed under different options: A ${oa} vs B ${ob}`);
  // Absence first: a block one side leaves out is a SKIP by name, and one
  // neither side carries is no comparison at all.
  const skipped: string[] = [];
  const carried = new Set<OracleBlock>();
  for (const block of ORACLE_BLOCKS) {
    // A sample block is compared only where both documents carry animations; otherwise the `animations` line speaks for it.
    if ((SAMPLE_BLOCKS as readonly string[]).includes(block) && (a.animations === null || b.animations === null)) continue;
    const na = blockOf(a, block) === null;
    const nb = blockOf(b, block) === null;
    if (na && nb) {
      throw new OracleInputError(`${block} is absent from both documents (A posed by ${a.dumper}, B by ${b.dumper}), so there is nothing to compare it with`);
    }
    if (!na && !nb) {
      carried.add(block);
      continue;
    }
    const side = na ? a : b;
    const why = side.absent?.find((x) => x[0] === block)?.[1];
    skipped.push(`${block}: not produced by ${side.dumper}${why === undefined ? '' : ` — ${why}`}`);
  }
  const has = (block: OracleBlock): boolean => carried.has(block);
  const tolXy = tol.xy * ORACLE_GRID;
  const tolM = tol.m * ORACLE_GRID;
  const aSlots = a.slots ?? [];
  const bSlots = b.slots ?? [];
  const slotBones = new Map((a.slots ?? bSlots).map((s) => [s[0], s[1]]));
  const bSlotBones = new Map(bSlots.map((s) => [s[0], s[1]]));
  const document: string[] = [
    ...(has('bones') ? listDiff('bones', a.bones ?? [], b.bones ?? []) : []),
    ...(has('slots') ? listDiff('slots', aSlots.map((s) => s[0]), bSlots.map((s) => s[0])) : []),
    ...(has('slots')
      ? aSlots.flatMap(([slot, bone]) => {
          const other = bSlotBones.get(slot);
          return other === undefined || other === bone ? [] : [`slot "${slot}" is on bone "${bone}" in A and "${other}" in B`];
        })
      : []),
    ...(has('skins') ? listDiff('skins', [...(a.skins ?? [])].sort(), [...(b.skins ?? [])].sort()) : []),
    ...(has('animations') ? listDiff('animations', (a.animations ?? []).map((x) => x.name).sort(), (b.animations ?? []).map((x) => x.name).sort()) : []),
    ...(has('constraints') ? listDiff('constraints', (a.constraints ?? []).map((c) => `${c[0]} ${c[1]}`), (b.constraints ?? []).map((c) => `${c[0]} ${c[1]}`)) : []),
  ];
  const byName = <T extends { name: string }>(l: T[]): Map<string, T> => new Map(l.map((x) => [x.name, x]));
  const aPhysics = has('physics') ? (a.physics ?? []) : [];
  const bPhysics = has('physics') ? (b.physics ?? []) : [];
  const pb = byName(bPhysics);
  for (const p of aPhysics) {
    const q = pb.get(p.name);
    if (q === undefined) document.push(`physics constraint "${p.name}" only in A`);
    else document.push(...paramDiffs('physics constraint', p.name, p as unknown as Record<string, unknown>, q as unknown as Record<string, unknown>, tolM));
  }
  for (const q of bPhysics) if (!aPhysics.some((p) => p.name === q.name)) document.push(`physics constraint "${q.name}" only in B`);
  const aPaths = has('paths') ? (a.paths ?? []) : [];
  const bPaths = has('paths') ? (b.paths ?? []) : [];
  const qb = byName(bPaths);
  for (const p of aPaths) {
    const q = qb.get(p.name);
    if (q === undefined) document.push(`path constraint "${p.name}" only in A`);
    else document.push(...paramDiffs('path constraint', p.name, p as unknown as Record<string, unknown>, q as unknown as Record<string, unknown>, tolM));
  }
  for (const q of bPaths) if (!aPaths.some((p) => p.name === q.name)) document.push(`path constraint "${q.name}" only in B`);
  const aPa = has('pathAttachments') ? (a.pathAttachments ?? []) : [];
  const bPa = has('pathAttachments') ? (b.pathAttachments ?? []) : [];
  const paKey = (x: OraclePathAttachmentRow): string => `${x.skin}/${x.slot}/${x.placeholder}`;
  const pab = new Map(bPa.map((x) => [paKey(x), x]));
  for (const p of aPa) {
    const q = pab.get(paKey(p));
    if (q === undefined) document.push(`path attachment "${paKey(p)}" only in A`);
    else document.push(...paramDiffs('path attachment', paKey(p), p as unknown as Record<string, unknown>, q as unknown as Record<string, unknown>, tolM));
  }
  for (const q of bPa) if (!pab.has(paKey(q)) || !aPa.some((p) => paKey(p) === paKey(q))) document.push(`path attachment "${paKey(q)}" only in B`);

  const rows: OracleRowReport[] = [];
  const setupCarry = new Set<PoseBlock>((['bones', 'slots', 'drawOrder', 'attachments', 'clips', 'clipped'] as const).filter((k) => has(`setup.${k}`)));
  if (setupCarry.size > 0) {
    const setupRow = newRow('(setup)');
    comparePose(setupRow, null, a.setup, b.setup, tolXy, tolM, slotBones, setupCarry);
    rows.push(setupRow);
  }
  const animB = byName(has('animations') ? (b.animations ?? []) : []);
  const sampleCarry = new Set<PoseBlock>((['bones', 'slots', 'drawOrder', 'attachments', 'clips', 'clipped'] as const).filter((k) => has(`animations.${k}`)));
  for (const anim of has('animations') ? (a.animations ?? []) : []) {
    const other = animB.get(anim.name);
    if (other === undefined) continue;
    const row = newRow(anim.name);
    const dd = numDelta(anim.duration, other.duration);
    if (dd === 'nonfinite' || dd > tolM) {
      row.mismatches.duration = 1;
      row.findings.push(`animation "${anim.name}": duration ${anim.duration} vs ${other.duration}`);
    }
    if (anim.samples.length !== other.samples.length) {
      row.mismatches.samples = 1;
      row.findings.push(`animation "${anim.name}": ${anim.samples.length} samples vs ${other.samples.length}`);
    }
    const count = Math.min(anim.samples.length, other.samples.length);
    for (let i = 0; i < count; i++) {
      const sa = anim.samples[i];
      const sb = other.samples[i];
      const dt = numDelta(sa.t, sb.t);
      if (dt === 'nonfinite' || dt > tolM) {
        row.mismatches.time = (row.mismatches.time ?? 0) + 1;
        row.findings.push(`animation "${anim.name}" sample ${i}: t=${sa.t} vs ${sb.t}`);
      }
      comparePose(row, sa.t, sa, sb, tolXy, tolM, slotBones, sampleCarry);
      if (has('animations.events')) compareEvents(row, sa.t, sa.events ?? [], sb.events ?? [], tolM);
    }
    rows.push(row);
  }
  const all = [...document, ...rows.flatMap((x) => x.findings)];
  return {
    identical: all.length === 0,
    skipped,
    rows,
    document,
    first: all[0] ?? null,
    worstXy: Math.max(0, ...rows.map((x) => x.worstXy.d)) / ORACLE_GRID,
    worstM: Math.max(0, ...rows.map((x) => x.worstM.d)) / ORACLE_GRID,
    worstVertex: Math.max(0, ...rows.map((x) => x.worstVertex.d)) / ORACLE_GRID,
    excluded: rows.reduce((s, x) => s + x.excluded, 0),
    boneSamples: rows.reduce((s, x) => s + x.boneSamples, 0),
  };
}

/** The report `compare` prints, one line per row, then the verdict. */
export function comparisonLines(c: OracleComparison, listed = 5): string[] {
  const out: string[] = [];
  for (const s of c.skipped) out.push(`  SKIP  ${s}`);
  for (const d of c.document.slice(0, listed * 4)) out.push(`  DOC   ${d}`);
  if (c.document.length > listed * 4) out.push(`  DOC   … ${c.document.length - listed * 4} more`);
  for (const row of c.rows) {
    const kinds = Object.entries(row.mismatches)
      .sort((x, y) => (x[0] < y[0] ? -1 : 1))
      .map(([k, v]) => `${k}×${v}`);
    out.push(
      `  ${row.findings.length === 0 ? 'SAME' : 'DIFF'}  ${row.name === '(setup)' ? '(setup)' : JSON.stringify(row.name)}: ` +
        `${row.samples} sample(s), ${row.boneSamples} bone-sample(s) compared (${row.exact} exact), ${row.over} over tolerance, ` +
        `${row.excluded} excluded (|det| < ${ORACLE_EPS_DET}); worst Δxy ${fmt(row.worstXy.d)}${row.worstXy.what ? ` (${row.worstXy.what})` : ''}, ` +
        `worst Δabcd ${fmt(row.worstM.d)}${row.worstM.what ? ` (${row.worstM.what})` : ''}; ${row.vertices} vertex-sample(s), ` +
        `${row.verticesOver} attachment-sample(s) over, worst Δvertex ${fmt(row.worstVertex.d)}${row.worstVertex.what ? ` (${row.worstVertex.what})` : ''}` +
        (kinds.length === 0 ? '' : `; mismatches ${kinds.join(' ')}`),
    );
    for (const f of row.findings.slice(0, listed)) out.push(`          ${f}`);
    if (row.findings.length > listed) out.push(`          … ${row.findings.length - listed} more`);
  }
  out.push(
    (c.identical
      ? `IDENTICAL — ${c.boneSamples} bone-sample(s) over ${c.rows.length} row(s), ${c.excluded} excluded as ill-conditioned`
      : `DIFF — first difference: ${c.first}`) +
      (c.skipped.length === 0 ? '' : `; ${c.skipped.length} block(s) SKIPPED, not compared: ${c.skipped.map((x) => x.slice(0, x.indexOf(':'))).join(', ')}`),
  );
  return out;
}

// ---------------------------------------------------------------------------
// the command
// ---------------------------------------------------------------------------

const USAGE = [
  'usage:',
  '  bun tools/pose_oracle.ts dump <build dir> --out <json> [--samples 9] [--phase grid|off|irr|dense] [--skin all|<name>] [--physics none|step] [--dt 1/60]',
  '  bun tools/pose_oracle.ts dump <skeleton.json> <atlas> --out <json> [same flags]',
  '  bun tools/pose_oracle.ts dump --core <skeleton.model.json> --out <json> [same flags]',
  '  bun tools/pose_oracle.ts compare <a.json> <b.json> [--tol-xy 1e-6] [--tol-m 1e-6]',
].join('\n');

function parseFlags(args: readonly string[], known: readonly string[]): { positional: string[]; flags: Map<string, string> } {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    if (!known.includes(arg)) throw new OracleInputError(`unknown flag ${arg}; this command takes ${known.join(', ')}`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) throw new OracleInputError(`${arg} needs a value`);
    if (flags.has(arg)) throw new OracleInputError(`${arg} given twice`);
    flags.set(arg, value);
    i++;
  }
  return { positional, flags };
}

function tolerance(flag: string, text: string | undefined): number {
  if (text === undefined) return ORACLE_DEFAULT_TOL;
  const v = Number(text);
  if (!Number.isFinite(v) || v < 0) throw new OracleInputError(`${flag} ${JSON.stringify(text)} is not a non-negative number`);
  return v;
}

/** Parse the dump flags into options, refusing every bad value by name. */
export function dumpOptions(flags: Map<string, string>): OracleOptions {
  const phase = flags.get('--phase') ?? 'grid';
  if (!(ORACLE_PHASES as readonly string[]).includes(phase)) throw new OracleInputError(`--phase ${JSON.stringify(phase)} is not one of ${ORACLE_PHASES.join(', ')}`);
  const samplesText = flags.get('--samples') ?? String(ORACLE_DEFAULT_SAMPLES);
  const samples = Number(samplesText);
  if (!Number.isInteger(samples) || samples < 1) throw new OracleInputError(`--samples ${JSON.stringify(samplesText)} is not a whole number of at least 1`);
  const physics = flags.get('--physics') ?? 'none';
  if (!(ORACLE_PHYSICS as readonly string[]).includes(physics)) throw new OracleInputError(`--physics ${JSON.stringify(physics)} is not one of ${ORACLE_PHYSICS.join(', ')}`);
  if (physics === 'none' && flags.has('--dt')) throw new OracleInputError('--dt is the stepping interval and --physics none steps nothing; pass --physics step or drop --dt');
  const dt = physics === 'step' ? parseDt(flags.get('--dt') ?? ORACLE_DEFAULT_DT) : null;
  return { phase: phase as OraclePhase, samples, skin: flags.get('--skin') ?? 'all', physics: physics as OraclePhysics, dt };
}

/** The command; returns the exit code. */
export function oracleMain(argv: readonly string[], print: (line: string) => void = console.log, warn: (line: string) => void = console.error): number {
  const [command, ...rest] = argv;
  try {
    if (command === 'dump') {
      const { positional, flags } = parseFlags(rest, ['--out', '--samples', '--phase', '--skin', '--physics', '--dt', '--core']);
      const out = flags.get('--out');
      if (out === undefined) throw new OracleInputError('dump: --out <json> is required');
      const options = dumpOptions(flags);
      const core = flags.get('--core');
      if (core !== undefined) {
        if (positional.length > 0) throw new OracleInputError(`dump --core takes the model document and no other path, got ${positional.join(' ')}`);
        if (!existsSync(core)) throw new OracleInputError(`dump --core: no such file ${core}`);
        let model: CompiledDocument;
        try {
          model = readModel(readFileSync(core, 'utf8'), core);
        } catch (err) {
          if (err instanceof CoreInputError) throw new OracleInputError(err.message);
          throw err;
        }
        const dump = coreDump(model, options);
        writeFileSync(out, dumpText(dump));
        print(
          `pose_oracle: the core posed ${core}: ${model.bones.length} bones, setup.bones ${dump.setup.bones === null ? 'ABSENT' : 'posed'}, ` +
            `${model.slots.length} slots, setup.slots ${dump.setup.slots === null ? 'ABSENT' : 'posed'}, ` +
            `setup.attachments ${dump.setup.attachments === null ? 'ABSENT' : `${dump.setup.attachments.length} posed`}, setup.clips ${dump.setup.clips === null ? 'ABSENT' : `${dump.setup.clips.length} posed`}, setup.clipped ${dump.setup.clipped === null ? 'ABSENT' : `${dump.setup.clipped.length} posed`}; ` +
            `${model.animations.length} animation(s) × ${options.samples} sample(s), animations.bones ${(dump.absent ?? []).some((x) => x[0] === 'animations.bones') ? 'ABSENT' : 'posed'}, ` +
            `animations.slots ${(dump.absent ?? []).some((x) => x[0] === 'animations.slots') ? 'ABSENT' : 'posed'}; ` +
            `absent: ${(dump.absent ?? []).map((x) => x[0]).join(', ')} → ${out}`,
        );
        return 0;
      }
      const input = resolveDumpInput(positional);
      const data = loadOracleData(readFileSync(input.skeleton, 'utf8'), readFileSync(input.atlas, 'utf8'), input.skeleton);
      const dump = dumpSkeleton(data, options);
      writeFileSync(out, dumpText(dump));
      print(
        `pose_oracle: posed ${input.skeleton} (${options.phase}, ${options.samples} sample(s), skin ${options.skin}, physics ${options.physics}): ` +
          `${dump.bones.length} bones, ${dump.slots.length} slots, ${dump.animations.length} animation(s) → ${out}`,
      );
      return 0;
    }
    if (command === 'compare') {
      const { positional, flags } = parseFlags(rest, ['--tol-xy', '--tol-m']);
      if (positional.length !== 2) throw new OracleInputError(`compare: expected <a.json> <b.json>, got ${positional.length} path(s)`);
      const read = (path: string): OracleDocument => {
        if (!existsSync(path)) throw new OracleInputError(`compare: no such file ${path}`);
        let value: unknown;
        try {
          value = JSON.parse(readFileSync(path, 'utf8'));
        } catch (err) {
          throw new OracleInputError(`${path}: not JSON — ${(err as Error).message}`);
        }
        return asOracleDocument(value, path);
      };
      const a = read(positional[0]);
      const b = read(positional[1]);
      const c = compareDumps(a, b, { xy: tolerance('--tol-xy', flags.get('--tol-xy')), m: tolerance('--tol-m', flags.get('--tol-m')) });
      print(`pose_oracle compare A=${positional[0]} B=${positional[1]}`);
      for (const line of comparisonLines(c)) print(line);
      return c.identical ? 0 : 1;
    }
    throw new OracleInputError(command === undefined ? 'no command' : `unknown command ${JSON.stringify(command)}`);
  } catch (err) {
    if (err instanceof OracleInputError) {
      warn(`pose_oracle: ${err.message}`);
      if (err.message.startsWith('no command') || err.message.startsWith('unknown command')) warn(USAGE);
      return 2;
    }
    throw err;
  }
}

if (import.meta.main) process.exit(oracleMain(process.argv.slice(2)));
