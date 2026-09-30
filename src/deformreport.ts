/**
 * The `DEFORM` report block `rigc explain` prints (issue #316), as a function of
 * the deform survey alone (issue #969): moved out of `cli.ts` whole, so that a
 * control can render it off a survey taken through either poser — spine-core
 * over the Spine skeleton, rigc's own core over the model document — and hold
 * the two blocks to each other. `cli.ts`'s `deformReportLines` states why the
 * block is a report and not an assertion, and what it deliberately leaves out.
 */
import type { CompileResult } from './types.ts';
import type { DeformExtreme, DeformKeyMeasure, DeformSpan, DeformSurvey } from './deformmeasure.ts';
import { unreachableWhy } from './deformmeasure.ts';
import { float32Step } from './timelines.ts';

/**
 * One extreme, as `x0.637306 tri 0`, or an em dash when no triangle on the key
 * could carry the quantity.
 *
 * A dash rather than `x1.000000`: a key over a mesh whose every triangle is a
 * hair has no ratio and no map, and printing the identity there would report a
 * measurement that was never taken — this repository's favourite false green.
 */
function deformExtreme(extreme: DeformExtreme | null): string {
  return extreme === null ? '—'.padEnd(9) : `x${extreme.value.toFixed(6)} tri ${extreme.triangle}`;
}

/** `head/head key 1`, which is how A39's own message names a key. */
function deformKeyName(key: DeformKeyMeasure): string {
  return `${key.slot}/${key.attachment} key ${key.key}`;
}

/**
 * Does this compiled `transform` report belong to this loaded key?
 *
 * ⚠️ The two times are not the same number and cannot be compared with `===`.
 * The report's is the spec's own `t`; the survey's came back through
 * `Float32Array`, because that is what `spine-core` reads a timeline's frames
 * into — a key written `0.62` arrives as `0.6200000047683716`. So the tolerance
 * is one float32 step at this magnitude (`float32Step`): the compiler emits a
 * key time as a float's name — the spec's own time when it names one, the float
 * below it when it does not (issue #716) — so the loaded float is within one
 * step of the spec's `t` either way, which is narrower than any key spacing the
 * format can hold.
 */
function sameKeyTime(specTime: number, loaded: number): boolean {
  return Math.abs(specTime - loaded) <= float32Step(loaded);
}

/** The block, off `survey` — `cli.ts`'s `deformReportLines` says what each line is and why. */
export function deformReportBlock(survey: DeformSurvey, deformTransforms: CompileResult['deformTransforms'], exempt: ReadonlySet<string>): string[] {
  if (survey.timelines === 0) return [];
  const out: string[] = ['', 'deform  (what each key does to the geometry — figures with names, never a bar; issue #316)'];
  // The legend costs six lines and is worth them exactly once — on a report that
  // has figures in it. A bounding box or a clipping polygon deformed and nothing
  // else gets the reason it has no figures and no essay about them.
  if (survey.keys.length) {
    out.push(
      '  ..    every key measured at its OWN time against the same pose with the deform CLEARED, so the',
      '  ..    denominator is 1.000 by definition and a NEGATIVE area ratio IS a reversed triangle',
      '  ..    the FRAME is on each key line: on a track, or the slider that applies the animation with the',
      '  ..    dial value its mapping was inverted to — a slider picks the time, so the key\'s time IS it',
      '  ..    stretch is the two singular values of the map from the cleared triangle to the deformed one —',
      '  ..    the worst stretch and the worst squash the drawing takes there; their product is |area ratio|',
      '  ..    coverage is NOT here: it is rasterised from the uvs, which no deform moves, so the figure on',
      '  ..    the `meshes` line below is already the deformed one',
    );
  }
  if (survey.notAMesh.length) {
    out.push(`  ..    ${survey.notAMesh.join(', ')} deform an attachment with no triangles — nothing to measure`);
  }
  for (const key of survey.keys) {
    const model = deformTransforms.find(
      (g) =>
        g.animation === key.animation &&
        g.skin === key.skin &&
        g.slot === key.slot &&
        g.attachment === key.placeholder &&
        sameKeyTime(g.time, key.time),
    );
    // A stated model is quoted rather than reduced to its results: `yaw
    // radius=170 degrees=12` is what a reviewer checks the ratios against, and an
    // authored table says so instead of saying nothing, because "no model here"
    // is itself the thing a reader of a wrong ratio needs to know.
    const states = model === undefined ? 'authored table' : `transform ${model.kind}  ${model.stated}`;
    out.push(
      `  DEFORM  ${key.animation}  ${key.skin}/${key.slot}/${key.placeholder}  key ${key.key}  ` +
        `t=${key.time.toFixed(6)}  ${states}`,
    );
    // 🔒 The frame, on every key, because the derivation is shared with A39 and
    // this block is where a reader finds out which one it was (issue #407). A
    // track frame says so in three words; a slider frame names the dial value
    // its own mapping inverts this time to, which is the number an author sets.
    out.push(
      `          frame      ${key.reach.label}` +
        (key.dial === null
          ? ''
          : `, dial ${key.dial.value.toFixed(6)}` +
            // ⚠️ `reach.drive` names the field when it is NOT the one `property`
            // names, which happens under `local: false` on a rotated parent — a
            // bare figure there would read as a value of the wrong field (#419).
            (key.reach.local || key.dial.driven === key.dial.value
              ? ''
              : ` (bone local ${key.reach.drive === null ? '' : `${key.reach.drive} `}${key.dial.driven.toFixed(6)})`) +
            ` -> t=${key.dial.applied.toFixed(6)}`),
    );
    // A key at a time no dial selects: the figures below are the frame the
    // runtime DOES land on, which is some other time's geometry, so the line
    // that says so comes before them and the gate reads none of them.
    if (key.dial?.unreachable === true) {
      out.push(
        `          unreachable A39 gates nothing here: ${unreachableWhy(key)}. Every figure below is that other ` +
          "frame's, not this key's",
      );
    }
    // ⚠️ An exemption nobody can see is how a gate comes to look kept while
    // checking nothing (issue #401). A key the gate passed over because the mesh
    // draws no pixels there says so on its own line, in the survey's own words,
    // whether or not it folds.
    if (key.draw.blank !== null) {
      out.push(
        `          skipped    A39 reads no winding off this key: ${key.draw.blank} — a triangle that draws no ` +
          'pixels cannot draw them backwards',
      );
    }
    // And when the slot shows something else, the figures below would be a
    // second falsehood rather than a caveat: the runtime applies no deform to a
    // slot that is not showing the mesh (`DeformTimeline.applyToSlot`), so every
    // figure would be the identity and `moved 0` would read as "this key is the
    // setup pose" — which is exactly what the key is NOT.
    if (!key.draw.showsThisMesh) {
      out.push(
        `          ..         the slot shows ${key.draw.shown === null ? 'no attachment' : `"${key.draw.shown}"`} ` +
          'here, so the runtime applied no deform and there is no posed geometry to measure' +
          (key.draw.blank === null
            ? ' — but the mesh IS drawn in another slot this deform reaches (timelineSlots), so nothing here is exempt'
            : ''),
      );
      continue;
    }
    // A key that moves nothing gets one line and no figures. `{ "t": 2.2 }` with
    // no run is the format's own way of writing "back to the setup pose" (§4.11),
    // and its geometry is bit-identical to the cleared pose it would be measured
    // against — so `x1.000000` there is the definition and not a measurement, and
    // four lines of it on every loop's opening and closing key is the noise that
    // stops the block being read. It is still counted in the rollup below,
    // because A39 measures it too.
    if (key.moved === 0) {
      out.push(
        `          moved      0 of ${key.vertices} vertices — this key IS the setup pose, so every ` +
          `figure is the identity (${key.triangles} triangles, all kept)`,
      );
      continue;
    }
    out.push(
      `          moved      ${key.moved} of ${key.vertices} vertices, ` +
        `worst ${key.maxDisplacement.toFixed(4)}px at v${key.maxDisplacementVertex}`,
    );
    out.push(
      `          area       min ${deformExtreme(key.areaRatioMin)}   max ${deformExtreme(key.areaRatioMax)}   ` +
        `(${key.triangles} triangles, ${key.degenerate} with no area at the cleared pose, band ${key.band.toFixed(6)}px²)`,
    );
    out.push(
      `          stretch    max ${deformExtreme(key.stretchMax)}   min ${deformExtreme(key.stretchMin)}`,
    );
    // The marker has to know about the exemption, or it says the false half of
    // the truth on the one build where it matters: a declared fold IS a fold and
    // A39 does not refuse it — it SKIPs the slot entirely.
    const exempted = exempt.has(key.slot);
    const fold = key.reversed.length
      ? key.draw.blank !== null
        ? '  <- a fold, and nothing gates it: this key draws no pixels (see above)'
        : exempted
          ? '  <- a fold, and A39 does not gate it — see below'
          : '  <- a fold: A39 refuses this key by name'
      : '';
    out.push(
      `          winding    ${key.triangles - key.reversed.length} of ${key.triangles} kept, ` +
        `${key.collapsed} collapsed${fold}`,
    );
    if (exempted) {
      out.push(
        `          ..         A39 is exempt on "${key.slot}" (invariants.deformMayFold), so nothing here is gated`,
      );
    }
  }
  // The folds at times no key lands on (issue #403), printed after the keys they
  // lie between rather than interleaved: they are a different measurement — the
  // closed form named the time and the runtime was posed there — and a reader
  // needs to be able to tell the two apart at a glance.
  for (const span of survey.spans) {
    if (span.fold === null) continue;
    const at = span.fold;
    out.push(
      `  BETWEEN ${span.animation}${span.reach.kind === 'slider' ? ` via ${span.reach.slider}` : ''}  ` +
        `${span.skin}/${span.slot}/${span.placeholder}  key ${span.fromKey} -> ` +
        `${span.toKey}  t=${at.time.toFixed(6)}  ${span.curve}` +
        (span.curve === 'stepped' ? '  (held, not interpolated)' : `  ${(at.percent * 100).toFixed(1)}% of the way`),
    );
    out.push(
      `          winding    ${at.measure.triangles - at.measure.reversed.length} of ${at.measure.triangles} kept, ` +
        `${at.measure.collapsed} collapsed  <- a fold at a time no key lands on` +
        (at.measure.draw.blank !== null
          ? ', and nothing gates it: nothing is drawn there'
          : exempt.has(span.slot)
            ? ', and A39 does not gate it (invariants.deformMayFold)'
            : `: A39 refuses this span by name, at alpha ${at.measure.draw.alpha.toFixed(4)}`),
    );
  }
  // The rollup, per animation: the worst key by each quantity. A timeline's own
  // eight keys are eight blocks above, and "which of them is the one to look at"
  // is the question the sweep in issue #313's landing comment answered by hand.
  //
  // ⚠️ Per animation AND per frame (issue #407). Two sliders applying one
  // animation are two frames and two rollups: merging them would average a fold
  // one dial reaches into a run of keys another one is clean over, which is the
  // hiding the two frames exist to prevent.
  // 🔒 ONE derivation of a rollup's identity, read by every filter below.
  //
  // ⚠️ It was spelled three times and one of them drifted. The two key filters
  // separate animation from slider with a NUL; the span filter used a SPACE, so
  // its `=== id` never matched on any rig and `spans` was always empty — the
  // "N span(s) … scanned" line silently stopped printing everywhere, taking with
  // it the one thing issue #403 added it to say: that the scan RAN and found
  // nothing, as opposed to never having run. A dead branch is the same silence
  // this tool exists to convert into a named failure, and it survived because
  // the identity was a literal at each site rather than a derivation (#440).
  const rollupId = (animation: string, slider: string | null): string => `${animation}\u0000${slider ?? ''}`;
  /**
   * The readings A39 puts on its stats line for the three things this rollup
   * reports — each spelled ONCE here and nowhere else in this file.
   *
   * 🔒 Checked rather than derived, and the difference is forced: `src/validate.ts`
   * sets these on a `Record<string, number | string>`, so there is no type to take
   * a name off and no constant to import. So they are spelled here and a control
   * compiles a rig that triggers each one, then asserts the breadcrumb names a
   * reading A39 really printed — two independent derivations compared, which is
   * the shape `CUR07` uses for the same reason.
   */
  const A39_COUNTS = {
    notDrawn: 'deformKeysNotDrawn',
    unreachable: 'deformKeysUnreachable',
    dialsDisagreed: 'deformDialsDisagreed',
    dialDisagreed: 'deformDialDisagreed',
  } as const;
  const rollups = new Map<string, { animation: string; label: string }>();
  for (const key of survey.keys) {
    rollups.set(rollupId(key.animation, key.reach.slider), {
      animation: key.animation,
      label: key.reach.kind === 'slider' ? `${key.animation} via ${key.reach.slider}` : key.animation,
    });
  }
  for (const [id, { animation, label }] of rollups) {
    // Only the keys the gate ran on, because the line ends by claiming A39 reads
    // the same two counts and A39 reads none of a key that draws nothing, nor of
    // one at a time no dial selects. The ones it left out get their own line
    // rather than a silence (issues #401, #407).
    const mine = survey.keys.filter((k) => rollupId(k.animation, k.reach.slider) === id);
    const unreachable = mine.filter((k) => k.dial?.unreachable === true);
    const keys = mine.filter((k) => k.dial?.unreachable !== true && k.draw.blank === null);
    const blank = mine.filter((k) => k.dial?.unreachable !== true && k.draw.blank !== null);
    const worst = (
      pick: (key: DeformKeyMeasure) => DeformExtreme | null,
      better: (a: number, b: number) => boolean,
    ): string => {
      let best: { key: DeformKeyMeasure; extreme: DeformExtreme } | null = null;
      for (const key of keys) {
        const extreme = pick(key);
        if (extreme === null) continue;
        if (best === null || better(extreme.value, best.extreme.value)) best = { key, extreme };
      }
      return best === null ? '—' : `x${best.extreme.value.toFixed(6)} (${deformKeyName(best.key)} tri ${best.extreme.triangle})`;
    };
    const reversed = keys.reduce((n, k) => n + k.reversed.length, 0);
    const collapsed = keys.reduce((n, k) => n + k.collapsed, 0);
    const samples = keys.reduce((n, k) => n + k.triangles, 0);
    if (keys.length) {
      out.push(
        `  WORST   ${label}  area ${worst((k) => k.areaRatioMin, (a, b) => a < b)}  ` +
          `stretch ${worst((k) => k.stretchMax, (a, b) => a > b)}  ` +
          `squash ${worst((k) => k.stretchMin, (a, b) => a < b)}`,
      );
      out.push(
        `  ..      ${''.padEnd(label.length)}  reversed ${reversed}, collapsed ${collapsed}, over ` +
          `${keys.length} key(s) and ${samples} triangle sample(s)  <- A39 reads the same two counts`,
      );
    }
    if (blank.length) {
      out.push(
        `  ..      ${keys.length ? ''.padEnd(label.length) : label}  ${blank.length} key(s) draw no pixels ` +
          `at their own time and are read for no winding, carrying ` +
          `${blank.reduce((n, k) => n + k.reversed.length, 0)} reversed triangle(s) nothing gates  <- A39 counts ` +
          `them as ${A39_COUNTS.notDrawn}`,
      );
    }
    if (unreachable.length) {
      out.push(
        `  ..      ${keys.length || blank.length ? ''.padEnd(label.length) : label}  ${unreachable.length} key(s) ` +
          'at a time no dial selects, measured in the frame the runtime lands on instead and read for no winding, ' +
          `carrying ${unreachable.reduce((n, k) => n + k.reversed.length, 0)} reversed triangle(s) nothing gates ` +
          ` <- A39 counts them as ${A39_COUNTS.unreachable}`,
      );
    }
    // ⚠️ The dial rigc's two halves disagree about (issues #427, #440). It is a
    // property of the SLIDER and not of any one key, so it is placed by the
    // rollup's own identity rather than by a key filter — and it is REPORTED,
    // never gated: A39 refuses nothing for it, because a disagreement can pose
    // every frame correctly. Both readings are named because they differ by one
    // letter, and a breadcrumb that named only one of `deformDialsDisagreed` /
    // `deformDialDisagreed` would send a reader to grep for the other.
    const disputes = survey.dialDisputes.filter((dispute) => rollupId(animation, dispute.slider) === id);
    if (disputes.length) {
      out.push(
        `  ..      ${keys.length || blank.length || unreachable.length ? ''.padEnd(label.length) : label}  ` +
          `${disputes.length} dial(s) the skeleton and the probe disagree about: ` +
          disputes
            .map(
              (dispute) =>
                `the skeleton reads ${dispute.bone}.${dispute.stated} and the probe drives ` +
                `${dispute.bone}.${dispute.drive}, ` +
                (dispute.outside.length === 0
                  ? 'and both answers pose the same frames'
                  : `${dispute.outside.length} key time(s) outside what the skeleton's own field reaches`),
            )
            .join('; ') +
          `  <- A39 counts them as ${A39_COUNTS.dialsDisagreed} and spells them out as ${A39_COUNTS.dialDisagreed}`,
      );
    }
    // ⚠️ Printed on a clean animation too. "The scan ran and found nothing" and
    // "the scan never ran" are the two things a gate must never say the same
    // way, and this line is the only place an author can tell them apart
    // (issue #403).
    const spans = survey.spans.filter((s) => rollupId(s.animation, s.reach.slider) === id);
    if (spans.length) {
      out.push(
        `  ..      ${keys.length || blank.length || unreachable.length || disputes.length ? ''.padEnd(label.length) : label}  ` +
          `${spans.length} span(s) between consecutive keys scanned for a fold no key lands on: ` +
          `${spanTally(spans)}  <- A39 reads the same scan`,
      );
    }
  }
  // ⚠️ And the spans that were NOT scanned, once, because a scan that did not
  // run has to be distinguishable from one that ran and found nothing — the same
  // rule the line above keeps, on the other side of it (issue #407).
  if (survey.spansNotScanned) {
    out.push(
      `  ..      ${survey.spansNotScanned} span(s) NOT scanned: one of the two keys bounding each is at a time no ` +
        'dial selects, so the interpolation between them is between two poses of some other time',
    );
  }
  return out;
}

/** What the between-keys scan found, in one clause (issue #403). */
function spanTally(spans: readonly DeformSpan[]): string {
  const folds = spans.filter((s) => s.fold !== null).length;
  const notDrawn = spans.filter((s) => s.notDrawn > 0).length;
  const unconfirmed = spans.filter((s) => s.unconfirmed).length;
  const probes = spans.reduce((n, s) => n + s.probed.length, 0);
  if (folds === 0 && notDrawn === 0 && unconfirmed === 0) {
    return `none folds (the closed form flagged nothing, so no span cost a posed measurement)`;
  }
  return (
    [
      folds ? `${folds} fold(s)` : '',
      notDrawn ? `${notDrawn} folding only where nothing is drawn` : '',
      unconfirmed ? `${unconfirmed} predicted a fold no probe reproduced` : '',
    ]
      .filter(Boolean)
      .join(', ') + `, at a cost of ${probes} posed measurement(s)`
  );
}
