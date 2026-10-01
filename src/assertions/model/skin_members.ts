/**
 * The model side's supply of `SkinMemberFacts` (issue #1025, step 4c of
 * #380): the bones, the constraints and each skin's lists, read off the
 * document and joined the way the runtime's loader joins them.
 *
 * - **Bones**: the document's `bones` in order, each with its `skinRequired`
 *   as stated (absent is not required) and its parent entry.
 * - **Constraints**: the document's `constraints` in order — update order, the
 *   order the emitter writes them in — each skin-required exactly when it
 *   states `skin: true`, the field the emitter writes through unchanged.
 * - **Skins**: in the emitter's order (`editorSkinOrder`, `src/compile.ts`); a
 *   skin's bones as it lists them, each the FIRST bone of that name; its
 *   constraints kind by kind in the emitter's key order
 *   (`RIG_SKIN_CONSTRAINT_KEYS`, which `emitSkins` walks), each the first
 *   constraint of that kind and name — the object the loader finds, and the
 *   same object `constraints` holds, so a body asking whether one is listed
 *   asks by identity. `readModel` refuses a skin listing a constraint of a
 *   kind and name the document lacks; a bone name it lacks is this module's to
 *   refuse, by name.
 *
 * Links nothing from the runtime.
 */
import { editorSkinOrder } from '../../compile.ts';
import { RIG_SKIN_CONSTRAINT_KEYS } from '../../rig.ts';
import type { MemberBone, MemberConstraint, MemberSkin, SkinMemberFacts } from '../facts/skin_members.ts';
import { isObj } from '../values.ts';
import type { ReadDocument } from './parse.ts';

export function modelSkinMembers(read: ReadDocument): SkinMemberFacts {
  const doc = read.doc;
  const bones: MemberBone[] = [];
  const boneByName = new Map<string, MemberBone>();
  for (const bone of doc.bones) {
    const parent = bone.parent === undefined ? null : boneByName.get(bone.parent);
    if (parent === undefined) throw new Error(`internal: bone "${bone.name}" names parent "${bone.parent}", which the reader accepted and no earlier bone is`);
    const entry: MemberBone = { name: bone.name, skinRequired: bone.skinRequired === true, parent };
    bones.push(entry);
    if (!boneByName.has(bone.name)) boneByName.set(bone.name, entry);
  }
  const constraints: Array<MemberConstraint & { kind: string }> = [];
  const stated = Array.isArray(read.json.constraints) ? read.json.constraints.filter(isObj) : [];
  for (const constraint of stated) {
    constraints.push({ name: String(constraint.name), kind: String(constraint.kind), skinRequired: constraint.skin === true });
  }
  const skins: MemberSkin[] = editorSkinOrder(doc.skins).map((skin) => {
    const listedBones = skin.bones.map((name) => {
      const found = boneByName.get(name);
      if (found === undefined) throw new Error(`skin "${skin.name}" lists bone "${name}", which is not a bone of the document`);
      return found;
    });
    const listedConstraints: MemberConstraint[] = [];
    for (const kind of RIG_SKIN_CONSTRAINT_KEYS) {
      for (const name of skin.constraints[kind]) {
        const found = constraints.find((c) => c.kind === kind && c.name === name);
        if (found === undefined) throw new Error(`internal: skin "${skin.name}" lists ${kind} constraint "${name}", which the reader accepted and the document does not hold`);
        listedConstraints.push(found);
      }
    }
    return { name: skin.name, bones: listedBones, constraints: listedConstraints };
  });
  return { skins, bones, constraints };
}
