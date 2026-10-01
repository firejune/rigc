/**
 * A39, the body (issue #1025, cut 4c-3 of step 4c of #380): a deform keeps
 * every triangle's winding.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the deform
 * survey as a fact (`../facts/deform_survey.ts`), where it called
 * `surveyDeformKeys` on the loaded skeleton itself, and the rig info as an
 * argument. The four sentences it prints a dial, a tie and a frame with moved
 * with it, unchanged. The argument for the rule — the frame, why `archetype`,
 * the keys it reads no winding off, the spans — is above its `check` call,
 * which stays in `validate()`.
 */
import type { Verdicts } from '../harness.ts';
import type { DeformSurveyFacts } from '../facts/deform_survey.ts';
import type { RigInfo } from '../../types.ts';
import { unreachableWhy, type DeformDialDispute, type DeformDialTie, type DeformReach, type DialSpan } from '../../deformsurvey.ts';

/**
 * The clause A39 puts after an animation's name when the frame it measured is
 * not the track (issue #407).
 *
 * Empty on the track, which is what every animation no slider applies gets — so
 * a message about a rig with no sliders in it reads exactly as it always has.
 */
function frameClause(reach: DeformReach): string {
  return reach.kind === 'slider' ? ` (applied by slider "${reach.slider}", not played on a track)` : '';
}

/**
 * A dial's reach as A39's stats line spells it, or `none` when it can select no
 * part of its animation at all.
 *
 * Six decimals because a key time has six: a reach whose end is printed coarser
 * than the times it is compared against cannot be read against them.
 */
function dialSpanText(span: DialSpan | null): string {
  return span === null ? 'none' : `${span.lo.toFixed(6)}..${span.hi.toFixed(6)}s`;
}

/**
 * One disputed dial on A39's stats line — both answers, both reaches, and the
 * frames the artifact's answer could not have posed (issue #427).
 *
 * ⭐ **`outside:` is always there, `none` included.** The comparison it reports is
 * what decides whether a disagreement changed anything the survey measured, and a
 * comparison that came out equal must not look like one nobody made. It is the
 * difference between "both answers pose the same frames, so the disagreement is a
 * fact about rigc and not about this rig" and "these key times were surveyed
 * through a field the skeleton does not name and no settable value of the one it
 * does reaches them".
 *
 * ⚠️ No spaces anywhere in it: the stats line is `k=v` pairs joined by spaces, and
 * a value with a space in it turns one reading into two.
 */
function dialDisputeText(dispute: DeformDialDispute): string {
  const stated = dispute.statedResponse === null ? 'unmeasured' : dispute.statedResponse.toExponential(3);
  return (
    `${dispute.slider}|artifact:${dispute.bone}.${dispute.stated}@${stated}` +
    `|reaches:${dialSpanText(dispute.statedReach)}` +
    `|probe:${dispute.bone}.${dispute.drive}@${dispute.driveResponse.toExponential(3)}` +
    `|reaches:${dialSpanText(dispute.driveReach)}` +
    `|outside:${dispute.outside.length === 0 ? 'none' : dispute.outside.map((t) => `${t.toFixed(6)}s`).join('+')}`
  );
}

/** One tied dial on the same line, in the shape that cannot be read as a dispute. */
function dialTieText(tie: DeformDialTie): string {
  const rivals = tie.rivals.map((r) => `${tie.bone}.${r.field}@${r.response.toExponential(3)}`).join('+');
  return `${tie.slider}|artifact:${tie.bone}.${tie.drive}@${tie.driveResponse.toExponential(3)}|tied:${rivals}`;
}

export function a39DeformKeepsTriangleWinding({ fail, skip, stats }: Verdicts, facts: DeformSurveyFacts, rig: RigInfo | undefined): void {
  if (!rig) {
    return skip(
      'A39_DEFORM_KEEPS_TRIANGLE_WINDING',
      'no rig info (validating a bare directory), so the rig cannot say which slots fold on purpose',
    );
  }
  const survey = facts.survey(new Set(rig.deformMayFold));
  // 🚨 Which dial was turned, when rigc's two halves did not simply agree
  // about that — and BEFORE any of the returns below, because every one of
  // them is a run that posed frames through this dial (issue #427).
  //
  // The verdict used to live in `DeformReach.label`, which `explain` prints
  // and nothing else does, so a `build`-only run — the normal loop, and the
  // one an agent that cannot see the rig actually runs — never learned that
  // the artifact and the probe named different fields.
  //
  // ⛔ Not a refusal, and the measurement rather than taste is why (#427).
  // The frames this survey posed were each checked against `SliderPose.time`
  // by the runtime itself, so a disagreement cannot make it pose one that
  // does not happen; and the field it drives is the largest response the
  // probe found, so it cannot make it miss one that does. What a
  // disagreement CAN do is leave the rig naming a property no settable value
  // of turns far enough — which is what `outside` measures and what an
  // author can act on. A refusal would refuse a rig spine-core poses
  // correctly at every key, with no edit that would make it green.
  //
  // 🔒 A tie is not a disagreement and gets a line that cannot be read as
  // one: there the probe named no field, the artifact broke the tie, and the
  // parent-45° geometry that reaches it is legitimate.
  if (survey.dialTies.length) {
    stats.deformDialsTied = survey.dialTies.length;
    stats.deformDialTied = survey.dialTies.map(dialTieText).join(',');
  }
  if (survey.dialDisputes.length) {
    stats.deformDialsDisagreed = survey.dialDisputes.length;
    stats.deformDialDisagreed = survey.dialDisputes.map(dialDisputeText).join(',');
  }
  /** A key this rule is refusing, by the triple that identifies it. */
  const refusedKey = new Set<string>();
  for (const key of survey.keys) {
    // ⭐ The one thing this rule cannot say about a key that draws nothing.
    // Its own message below states the harm as "draws its texture
    // backwards", and that sentence is false when no pixel of the mesh
    // lands at this time — the slot has faded to alpha 0, or shows another
    // attachment. So the key is measured, reported and not gated (issue
    // #401). Per key and per time: the SAME slot folding at full alpha in
    // another animation, or at another key, is refused as before, which is
    // what makes this a measurement rather than a second `deformMayFold`.
    if (key.draw.blank !== null) continue;
    // And the one thing it cannot say about a key at a time no dial selects
    // (issue #407): the frame posed is not this key's, so its geometry
    // belongs to some other time and a winding read off it would be a
    // measurement of the wrong thing. Named below, on the stats line.
    if (key.dial?.unreachable === true) continue;
    if (key.reversed.length === 0) continue;
    refusedKey.add(`${key.animation} ${key.slot} ${key.attachment} ${key.key}`);
    const shown = key.reversed
      .slice(0, 4)
      .map((r) => `${r.triangle} [${r.ids.join(',')}] ${r.before.toFixed(3)} -> ${r.after.toFixed(3)}px²`);
    const more = key.reversed.length > shown.length ? `, and ${key.reversed.length - shown.length} more` : '';
    fail(
      'A39_DEFORM_KEEPS_TRIANGLE_WINDING',
      // ⚠️ The frame is in the message whenever it is not the track, because
      // the same key can be refused in one frame and passed over in another
      // — two sliders applying one animation are two frames — and a message
      // that named only the key would be ambiguous about which (issue #407).
      `animation "${key.animation}"${frameClause(key.reach)} deform ${key.slot}/${key.attachment} ` +
        `key ${key.key} (t=${key.time}s): ` +
        `${key.reversed.length} of ${key.triangles} triangle(s) reverse winding — triangle ${shown.join('; triangle ')}` +
        `${more}. The mesh has turned inside out there and draws its texture backwards` +
        // The alpha is in the message whenever it is not full, because the
        // one thing that would make this key exempt is alpha exactly 0 and
        // an author who has already faded the part half out needs to be
        // told that half is not none (issue #401).
        (key.draw.alpha === 1
          ? ''
          : ` at alpha ${key.draw.alpha.toFixed(4)} — visible at that strength, and only alpha exactly 0 draws ` +
            'no pixels at all') +
        '. Fix the key\'s ' +
        'offsets in the motion spec\'s deform timeline (a projection past its fold angle is the usual ' +
        'cause — docs/FACE.md §4.2 has the closed form), or, if this slot folds on purpose, declare it ' +
        `in the rig spec as invariants.deformMayFold: [{ "slot": "${key.slot}", "why": … }]`,
    );
  }
  // --- and the folds no key lands on (issue #403) ------------------------
  let spanFolds = 0;
  for (const span of survey.spans) {
    if (span.fold === null) continue;
    // Suppressed when a bounding key already says it: one defect, one
    // message. The span check is here for what the keys cannot see.
    const bounded = `${span.animation} ${span.slot} ${span.attachment} `;
    if (refusedKey.has(bounded + span.fromKey) || refusedKey.has(bounded + span.toKey)) continue;
    spanFolds++;
    const at = span.fold;
    const shown = at.measure.reversed
      .slice(0, 4)
      .map((r) => `${r.triangle} [${r.ids.join(',')}] ${r.before.toFixed(3)} -> ${r.after.toFixed(3)}px²`);
    const more =
      at.measure.reversed.length > shown.length ? `, and ${at.measure.reversed.length - shown.length} more` : '';
    // A stepped segment interpolates NOTHING — it holds the earlier key's
    // geometry across the whole span — so saying "the runtime interpolates"
    // there would be telling the author to look for a defect in the wrong
    // place. What changed across a stepped span is what the slot DRAWS.
    const held = span.curve === 'stepped';
    fail(
      'A39_DEFORM_KEEPS_TRIANGLE_WINDING',
      `animation "${span.animation}"${frameClause(span.reach)} deform ${span.slot}/${span.attachment} ` +
        `BETWEEN key ${span.fromKey} ` +
        `(t=${span.fromTime}s) and key ${span.toKey} (t=${span.toTime}s), at t=${at.time.toFixed(6)}s` +
        (held ? ' (a stepped segment)' : ` — ${(at.percent * 100).toFixed(1)}% of the way from one to the other`) +
        `: ${at.measure.reversed.length} of ${at.measure.triangles} triangle(s) reverse winding — ` +
        `triangle ${shown.join('; triangle ')}${more}. NO KEY LANDS THERE: ` +
        (held
          ? `a stepped segment interpolates nothing, it HOLDS key ${span.fromKey}'s geometry across the whole ` +
            'span — so the fold is that key\'s and what changes here is what the slot draws'
          : 'the runtime interpolates between the two keys, and the mesh is inside out for part of the way') +
        ', drawing its texture backwards' +
        (at.measure.draw.alpha === 1
          ? ''
          : ` at alpha ${at.measure.draw.alpha.toFixed(4)} — visible at that strength, and only alpha exactly 0 ` +
            'draws no pixels at all') +
        '. ' +
        (held
          ? `Fix key ${span.fromKey}'s offsets, or keep the slot drawing nothing for as long as it holds them`
          : 'Add a key inside the span so the geometry the runtime passes through is geometry you wrote, or ' +
            "move the two keys' offsets closer together (a projection past its fold angle is the usual cause " +
            '— docs/FACE.md §4.2 has the closed form)') +
        (at.measure.draw.alpha === 1
          ? ''
          : '; if the part is being faded out over this turn, land the alpha-0 key BEFORE the folding key ' +
            'rather than on it, so every frame that folds is a frame that draws nothing (docs/FACE.md §9.2)') +
        `, or, if this slot folds on purpose, declare it in the rig spec as invariants.deformMayFold: ` +
        `[{ "slot": "${span.slot}", "why": … }]`,
    );
  }
  if (survey.timelines === 0) {
    return skip('A39_DEFORM_KEEPS_TRIANGLE_WINDING', 'no animation carries a deform timeline');
  }
  if (survey.keys.length === 0) {
    const why = [
      survey.exempted.length ? `the rig declares ${survey.exempted.join(', ')} as deformMayFold` : '',
      survey.notAMesh.length ? `${survey.notAMesh.join(', ')} deform an attachment with no triangles` : '',
    ].filter(Boolean);
    return skip(
      'A39_DEFORM_KEEPS_TRIANGLE_WINDING',
      `no deform timeline here has a winding to keep: ${why.join('; ') || 'every mesh keyed has no triangles'}`,
    );
  }
  // ⚠️ Silence is not a pass. A key passed over because nothing of it is
  // drawn has to be visible on a green run too — this is the only surface
  // `validate` has, and `explain`'s DEFORM block prints the whole sentence
  // beside the key's own figures.
  // ⚠️ Unreachable first and `blank` second, in the survey's own order, so
  // the two counts partition the ungated keys instead of double-counting a
  // key that is both.
  const unreachable = survey.keys.filter((k) => k.dial?.unreachable === true);
  const blank = survey.keys.filter((k) => k.dial?.unreachable !== true && k.draw.blank !== null);
  const ungated = blank.length + unreachable.length;
  const name = (k: (typeof survey.keys)[number]): string =>
    `${k.animation}/${k.slot}/${k.attachment}#${k.key}:${k.draw.showsThisMesh ? 'alpha0' : 'notShown'}`;
  // ⚠️ `&& spanFolds === 0` because a rig whose every key draws nothing can
  // still fold at a time between two of them that DOES draw — that is issue
  // #403's own case, and a SKIP printed over a refusal would be this rule
  // reporting "nothing to measure" about the thing it just measured.
  if (ungated === survey.keys.length && spanFolds === 0) {
    const first = blank[0] ?? unreachable[0];
    return skip(
      'A39_DEFORM_KEEPS_TRIANGLE_WINDING',
      `no deform key here is measurable in the frame its animation is reached in — ` +
        `${first.animation} ${first.slot}/${first.attachment} key ${first.key}: ` +
        `${first.draw.blank ?? unreachableWhy(first)}` +
        (survey.keys.length > 1 ? `, and ${survey.keys.length - 1} more key(s) like it` : '') +
        (unreachable.length
          ? `. ${unreachable.length} of them at a time no dial selects, which is a rig defect this rule does ` +
            'not refuse and does not pass over in silence either'
          : '') +
        (survey.spans.length
          ? `. The ${survey.spans.length} span(s) between them were scanned too and none folds where anything ` +
            'is drawn'
          : ''),
    );
  }
  stats.deformKeysMeasured = survey.keys.length - ungated;
  stats.deformTrianglesMeasured = survey.trianglesMeasured;
  stats.deformTrianglesCollapsed = survey.collapsed;
  // Which frame each animation was posed in (issue #407) — printed only when
  // a slider chose one, because on every other rig it says "a track" about
  // every animation and a stats line that never varies is not a reading.
  const frames = [...new Map(survey.keys.map((k) => [`${k.animation}/${k.reach.slider ?? 'track'}`, k])).values()];
  if (frames.some((k) => k.reach.kind === 'slider')) {
    stats.deformFrames = frames
      .map((k) => `${k.animation}:${k.reach.kind === 'slider' ? `slider/${k.reach.slider}` : 'track'}`)
      .join(',');
  }
  if (blank.length) {
    stats.deformKeysNotDrawn = blank.length;
    stats.deformNotDrawn = blank.map(name).join(',');
    if (survey.notDrawnReversed) stats.deformNotDrawnReversed = survey.notDrawnReversed;
  }
  // 🚨 A key at a time no dial can select is NOT a pass and NOT a refusal —
  // it is a rig whose slider cannot reach its own animation's key, named
  // here so a green run cannot be read as having measured it (issue #407).
  if (unreachable.length) {
    stats.deformKeysUnreachable = unreachable.length;
    stats.deformUnreachable = unreachable
      .map((k) => `${k.animation}/${k.slot}/${k.attachment}#${k.key}@${k.dial?.applied.toFixed(6) ?? '?'}`)
      .join(',');
    if (survey.notReachableReversed) stats.deformUnreachableReversed = survey.notReachableReversed;
  }
  if (survey.exempted.length) stats.deformFoldExempt = survey.exempted.join(',');
  // ⚠️ The between-keys scan on the stats line, on a GREEN run too (issue
  // #403). `deformSpansScanned` is the positive control an agent can read —
  // a scan that ran and found nothing has to be distinguishable from a scan
  // that never ran — and `deformSpanProbes` is what it cost: 0 on a rig the
  // closed form flags nothing in, one posed measurement per flagged window
  // otherwise.
  stats.deformSpansScanned = survey.spans.length;
  // ⚠️ And the ones it could NOT scan, for the same reason the line above
  // exists: a span bounded by a key at a time no dial selects would be
  // solved over two poses of some other time, so it is skipped — and a skip
  // nobody can see is the silence this whole surface is against (#407).
  if (survey.spansNotScanned) stats.deformSpansNotScanned = survey.spansNotScanned;
  if (survey.spanProbes) stats.deformSpanProbes = survey.spanProbes;
  if (survey.spansNotDrawn) stats.deformSpansNotDrawn = survey.spansNotDrawn;
  // A prediction nothing reproduced. Never a refusal — that would be the
  // false red issues #44 and #262 already cost this file — and never a
  // silence either: the one case that reaches it is a weighted mesh whose
  // bones move across the span, where the closed form's fixed-pose
  // assumption is the thing that did not hold.
  if (survey.spansUnconfirmed) stats.deformSpansUnconfirmed = survey.spansUnconfirmed;
}
