/**
 * Rung 7 — does my authored mesh draw the same picture a region does?
 *
 * A grid mesh over the whole PNG, at its setup pose, must be bit-identical to a
 * region attachment of the same PNG on the same bone. Nothing about that is
 * guaranteed by the gate: A22 checks the UVs are in unit range and A04 checks the
 * triangles decode, and both pass on a mesh whose v axis runs the wrong way — which
 * would draw the sack upside down, keep its bounding box, and move only its
 * centroid. This is the control AUTHORING.md §8 asks for: a transform whose answer
 * is already known.
 */
import { Plate } from '../../../../tools/plate.ts';
import { applyPose, framesBox, makeRig, renderInto, windowViewport, type Knob } from './pose.ts';
import { masksOf } from './frames.ts';

const ref = framesBox('bench/reference-local/7-anticipation');
const view = windowViewport(ref, 0, 0, ref.width, ref.height, 1);

function measure(dir: string): void {
  const rig = makeRig(dir);
  const knobs: Knob[] = [];
  applyPose(rig, knobs, []);
  const plate = new Plate(ref.width, ref.height);
  renderInto(rig, plate, view);
  const m = masksOf(plate);
  const s = m.sackP;
  console.log(
    `  ${dir.padEnd(52)} sack box [${s.left}..${s.right}] x [${s.top}..${s.bottom}]  ` +
      `${s.right - s.left + 1}x${s.bottom - s.top + 1}  area ${s.area}  centroid (${s.cx.toFixed(1)}, ${s.cy.toFixed(1)})`,
  );
}

console.log('reference rest pose (hello/f0000): sack box [102..188] x [596..749]  87x154  area 8399  centroid (146.1, 677.2)');
for (const d of process.argv.slice(2)) measure(d);
