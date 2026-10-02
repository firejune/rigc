/**
 * The runtime's words for each timeline a document's animation can hold
 * (issue #1054): the class it loads as, the property ids it registers and what
 * those ids carry — the values A40's sentence prints, which the document has no
 * field for and the core has no reason to know.
 *
 * ⭐ **Why they live here and not beside the core's table.** Until issue #1054
 * this table stood in `src/core/additive.ts`, beside the mode each kind's
 * application has: 34 runtime class names and their property names as string
 * literals in a module that otherwise speaks the document's words (#1011's
 * second ask). The mode is the core's — it decides what the probe computes —
 * and stays there, keyed by the document's own words (`ADDITIVE_MODE`); what
 * the runtime calls the timeline is a fact about the validator's other
 * supplier, and sits here with the constraint classes' names
 * (`RUNTIME_CONSTRAINT_CLASS`, `./constraints.ts`). Both tables are keyed by
 * the same spelling (`additiveSpelling`), and the selftest's `CO27` holds
 * every row of both against the timeline objects spine-core loads, over a
 * seeded population reaching every spelling.
 *
 * Read off the loaded timeline objects, never written from the runtime's
 * source: the class is the object's constructor name, the properties its
 * registered ids' names.
 *
 * Links nothing from the runtime.
 */

/** What a timeline's property ids are followed by: its target's index (and, for an attachment's, the attachment), or nothing. */
export type RuntimeTimelineAddress = 'bone' | 'slot' | 'attachment' | 'constraint' | 'none';

/** One timeline spelling, as the runtime loads it: its class, the properties it registers in order, and what its ids carry. */
export interface RuntimeTimelineRow {
  runtimeClass: string;
  properties: readonly string[];
  address: RuntimeTimelineAddress;
}

const row = (runtimeClass: string, properties: readonly string[], address: RuntimeTimelineAddress): RuntimeTimelineRow => ({ runtimeClass, properties, address });

/** Every timeline spelling a document's animation can hold (`additiveSpelling`'s keys), as the runtime loads it. */
export const RUNTIME_TIMELINE: Readonly<Record<string, RuntimeTimelineRow>> = {
  'bone rotate': row('RotateTimeline', ['rotate'], 'bone'),
  'bone translate': row('TranslateTimeline', ['x', 'y'], 'bone'),
  'bone translatex': row('TranslateXTimeline', ['x'], 'bone'),
  'bone translatey': row('TranslateYTimeline', ['y'], 'bone'),
  'bone scale': row('ScaleTimeline', ['scaleX', 'scaleY'], 'bone'),
  'bone scalex': row('ScaleXTimeline', ['scaleX'], 'bone'),
  'bone scaley': row('ScaleYTimeline', ['scaleY'], 'bone'),
  'bone shear': row('ShearTimeline', ['shearX', 'shearY'], 'bone'),
  'bone shearx': row('ShearXTimeline', ['shearX'], 'bone'),
  'bone sheary': row('ShearYTimeline', ['shearY'], 'bone'),
  'bone inherit': row('InheritTimeline', ['inherit'], 'bone'),
  'slot attachment': row('AttachmentTimeline', ['attachment'], 'slot'),
  'slot rgba': row('RGBATimeline', ['rgb', 'alpha'], 'slot'),
  'slot rgb': row('RGBTimeline', ['rgb'], 'slot'),
  'slot alpha': row('AlphaTimeline', ['alpha'], 'slot'),
  'slot rgba2': row('RGBA2Timeline', ['rgb', 'alpha', 'rgb2'], 'slot'),
  'slot rgb2': row('RGB2Timeline', ['rgb', 'rgb2'], 'slot'),
  'attachment deform': row('DeformTimeline', ['deform'], 'attachment'),
  'attachment sequence': row('SequenceTimeline', ['sequence'], 'attachment'),
  ik: row('IkConstraintTimeline', ['ikConstraint'], 'constraint'),
  transform: row('TransformConstraintTimeline', ['transformConstraint'], 'constraint'),
  'path position': row('PathConstraintPositionTimeline', ['pathConstraintPosition'], 'constraint'),
  'path spacing': row('PathConstraintSpacingTimeline', ['pathConstraintSpacing'], 'constraint'),
  'path mix': row('PathConstraintMixTimeline', ['pathConstraintMix'], 'constraint'),
  'physics inertia': row('PhysicsConstraintInertiaTimeline', ['physicsConstraintInertia'], 'constraint'),
  'physics strength': row('PhysicsConstraintStrengthTimeline', ['physicsConstraintStrength'], 'constraint'),
  'physics damping': row('PhysicsConstraintDampingTimeline', ['physicsConstraintDamping'], 'constraint'),
  'physics mass': row('PhysicsConstraintMassTimeline', ['physicsConstraintMass'], 'constraint'),
  'physics wind': row('PhysicsConstraintWindTimeline', ['physicsConstraintWind'], 'constraint'),
  'physics gravity': row('PhysicsConstraintGravityTimeline', ['physicsConstraintGravity'], 'constraint'),
  'physics mix': row('PhysicsConstraintMixTimeline', ['physicsConstraintMix'], 'constraint'),
  // A reset registers its property with no constraint index, named or not (measured: both read `physicsConstraintReset`).
  'physics reset': row('PhysicsConstraintResetTimeline', ['physicsConstraintReset'], 'none'),
  'slider time': row('SliderTimeline', ['sliderTime'], 'constraint'),
  'slider mix': row('SliderMixTimeline', ['sliderMix'], 'constraint'),
  drawOrder: row('DrawOrderTimeline', ['drawOrder'], 'none'),
  events: row('EventTimeline', ['event'], 'none'),
};
