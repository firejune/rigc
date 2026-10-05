/**
 * The model side's supply of `StageBoxFacts` (issue #1168): the box the
 * document's `stage.box` asks for, and what the document's `default` skin
 * holds there — its record as the runtime would load it, and its world
 * vertices at the setup pose as rigc's core poses them (`poseSetup` under no
 * skin, constraints applied, then `worldVertices`, the function every vertex
 * attachment of the core is posed by — no second arithmetic for the box).
 *
 * A `/2` or `/1` document states no stage and asks nothing; a `/3` document
 * whose stage states no box asks nothing, and neither does one that declares no
 * stage. The core's poses are held to spine-core's at tolerance 0 by
 * `tools/core_gate.ts`, which is what lets this side and the round trip print
 * one line.
 *
 * Links nothing from the runtime.
 */
import { activeBones, poseSetup, rawNumber, underNoSkin } from '../../core/index.ts';
import { worldVertices } from '../../core/vertices.ts';
import { SKIP_NO_STAGE_BOX, type StageBoxFacts, type StageBoxHeld } from '../facts/stage_box.ts';
import type { ReadDocument } from './parse.ts';

export function modelStageBox(read: ReadDocument): StageBoxFacts {
  const doc = read.doc;
  const stage = doc.stated?.stage;
  if (doc.stated === null || stage === undefined || stage === null) return { asked: null, why: SKIP_NO_STAGE_BOX, slot: false, held: null };
  if (stage.box === undefined) return { asked: null, why: SKIP_NO_STAGE_BOX, slot: false, held: null };
  const asked = { slot: stage.box.slot, attachment: stage.box.attachment, stage: { x: stage.x, y: stage.y, width: stage.width, height: stage.height } };
  const slot = doc.slots.find((s) => s.name === asked.slot);
  if (slot === undefined) return { asked, why: '', slot: false, held: null };
  const record = doc.skins.find((k) => k.name === 'default')?.attachments[asked.slot]?.[asked.attachment];
  if (record === undefined) return { asked, why: '', slot: true, held: null };
  const g = record.geometry;
  const type = record.kind === 'linkedmesh' ? 'mesh' : record.kind;
  if (g === undefined || g.kind !== 'boundingbox') return { asked, why: '', slot: true, held: { type, weighted: false, stored: [], world: '' } };
  const vertices = g.vertices;
  const stored = vertices.weighted ? [] : vertices.xy.map(Math.fround);
  const held: StageBoxHeld = { type, weighted: vertices.weighted, stored, world: poseWorld(read, slot.bone, vertices) };
  return { asked, why: '', slot: true, held };
}

/** The box's world vertices at the setup pose under no skin, or why there are none. */
function poseWorld(read: ReadDocument, bone: string, vertices: Parameters<typeof worldVertices>[0]): number[] | string {
  const view = underNoSkin(read.doc);
  if (!activeBones(view).has(bone)) return `its bone "${bone}" is inactive with no skin set, so nothing poses it`;
  const posed = poseSetup(view, { round: rawNumber });
  const world = posed.world;
  if (world === null) return posed.absent.find(([block]) => block === 'setup.bones')?.[1] ?? "rigc's core does not pose this setup pose";
  const frame = world.get(bone);
  if (frame === undefined) return `its bone "${bone}" has no setup world transform`;
  return worldVertices(vertices, frame, world);
}
