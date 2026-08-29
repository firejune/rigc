/**
 * The ballot — two to four compiled candidates side by side in Esoteric
 * Software's own web player, and the machine-checkable record of which one a
 * human picked.
 *
 * ⭐ Why this exists. Instruments decide most things and they should: `validate`
 * answers "is this valid Spine", `check` answers "does it match these frames",
 * `diff` answers "how far is it from that reference". What none of them can
 * answer is the residue — a choice with no reference behind it, a pose fit with
 * two local optima that measure the same, a key density that is a matter of
 * taste. Those either stall a run or get settled by the author's guess. This is
 * the deliberate human gate for exactly that residue (issue #151).
 *
 * ## Compile first, vote last
 *
 * A candidate reaches this page only because it already compiled and passed the
 * gate — `--candidate` takes the directory `build --out` wrote, the same input
 * `check`, `bench`, `render` and `preview` take, and `build` writes nothing
 * until every assertion is green. So the human is never asked to read JSON, a
 * diff or a spec: the only thing on the page is playable pixels. Everything a
 * machine could have decided has been decided before the file is written.
 *
 * ## Why the labels are A and B and nothing else
 *
 * A voter who can see that candidate B came out of `experiments/new-idea/` is
 * not comparing pictures any more. The page therefore names the candidates
 * `A`, `B`, `C`, `D` and shows no path, no directory and no file size anywhere
 * on screen. The path→label mapping is not *hidden* — it is in the manifest
 * embedded in the same file, because the record has to be auditable — it is
 * simply never rendered.
 *
 * ## Why the record is hashes and not paths
 *
 * `A` means nothing outside one ballot: the next ballot's `A` is a different
 * rig, and a path means nothing at all once the directory is rebuilt. So every
 * candidate carries a **digest** over its skeleton, its atlas and every page,
 * the ballot id derives from those digests, and the vote that comes back is
 * checked against them. A result whose digests are not this ballot's is refused
 * by name rather than appended to the ledger — see `verifyResult`.
 *
 * ## A tie is an outcome, not a gap
 *
 * The ledger distinguishes three states and only three: a ballot with a winner,
 * a ballot the human looked at and declared a tie, and a ballot nobody opened.
 * The middle one is a **recorded** outcome and it is the one that is easy to
 * lose — an interface that offers "pick one" and nothing else turns "these are
 * indistinguishable" into an unanswered question. `both-unacceptable` is the
 * reason code that earns the whole enumeration: it is the tie that means
 * *propose again*, and it is invisible if ties are not recorded.
 *
 * ## The player is referenced, never vendored
 *
 * Identical to [`preview.ts`](preview.ts) and deliberately so: the `<script>`
 * and `<link>` point at unpkg, nothing Esoteric Software owns is copied into
 * this repository, into the published package or into the generated file, and
 * what the file *does* contain is the user's own art. See
 * [NOTICE.md](../NOTICE.md); the posture there covers this command unchanged.
 */
import { createHash } from 'node:crypto';
import {
  ATLAS_KEY,
  backgroundHex,
  dataUri,
  embeddedJson,
  escapeHtml,
  PLAYER_LINE,
  PLAYER_SCRIPT_URL,
  PLAYER_STYLE_URL,
  SKELETON_KEY,
  type PreviewPage,
} from './preview.ts';

// ---------------------------------------------------------------------------
// the vocabulary — every string a machine matches on, in one place
// ---------------------------------------------------------------------------

/** The `spec` field of a ballot manifest. */
export const BALLOT_SPEC = 'rigc-ballot/1';
/** The `spec` field of a vote result and of every ledger line. */
export const VOTE_SPEC = 'rigc-vote/1';
/** Domain separator for a candidate digest, so the hash says what it is a hash of. */
export const CANDIDATE_SPEC = 'rigc-candidate/1';

/** The `choice` that means "reviewed, and neither one wins". */
export const TIE = 'tie';

/**
 * The neutral names, in ballot order.
 *
 * Four is the ceiling because the page has to fit them side by side on one
 * screen — a comparison that needs scrolling is not a comparison — and two is
 * the floor because one candidate is not a vote, it is `rigc preview`.
 */
export const BALLOT_LABELS = ['A', 'B', 'C', 'D'] as const;
export const MIN_CANDIDATES = 2;
export const MAX_CANDIDATES = BALLOT_LABELS.length;

/**
 * Why a candidate won. Two codes, and the distinction is the actionable one:
 * `preferred` says the winner is better, `defect-in-others` says the rest are
 * broken — the second is a signal to look at what they share.
 */
export const WINNER_REASON_CODES = ['preferred', 'defect-in-others'] as const;

/**
 * Why nobody won. Four codes, and they are not synonyms:
 * `indistinguishable` — the voter could not see a difference at all;
 * `both-acceptable` — differences were visible and neither is better;
 * `both-unacceptable` — differences were visible and neither is good enough,
 *   which is the one that means *propose again* rather than *adopt either*;
 * `unsure` — the voter saw the difference and declined to judge it.
 */
export const TIE_REASON_CODES = ['indistinguishable', 'both-acceptable', 'both-unacceptable', 'unsure'] as const;

export type WinnerReasonCode = (typeof WINNER_REASON_CODES)[number];
export type TieReasonCode = (typeof TIE_REASON_CODES)[number];
export type ReasonCode = WinnerReasonCode | TieReasonCode;

/** What each code means, for the page's picker and for the docs. One sentence each. */
export const REASON_CODE_MEANINGS: Record<ReasonCode, string> = {
  preferred: 'this one simply looks better',
  'defect-in-others': 'the others have a visible defect',
  indistinguishable: 'tie — I could not see a difference',
  'both-acceptable': 'tie — different, and either would do',
  'both-unacceptable': 'tie — different, and neither is good enough (propose again)',
  unsure: 'tie — I can see the difference and cannot judge it',
};

// ---------------------------------------------------------------------------
// hashing — what identifies a candidate
// ---------------------------------------------------------------------------

/** `sha256:<64 hex>`. Prefixed so the algorithm travels with the value. */
export function sha256(body: string | Uint8Array): string {
  const buffer = typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

/**
 * One hash over everything a candidate is made of.
 *
 * Pages are folded in **sorted by name** rather than in atlas order, so the
 * digest is a property of the artifact and not of the order this process
 * happened to read it in. The skeleton and the atlas are not sorted — there is
 * one of each, and their roles are fixed by position.
 *
 * ⚠️ The paths are not in it, on purpose. Two builds of the same rig into two
 * directories are the same candidate, and a directory renamed between the
 * ballot and the vote must not invalidate the vote.
 */
export function candidateDigest(skeletonText: string, atlasText: string, pages: PreviewPage[]): string {
  const lines = [CANDIDATE_SPEC, sha256(skeletonText), sha256(atlasText)];
  for (const page of [...pages].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    lines.push(`${page.name} ${sha256(page.bytes)}`);
  }
  return sha256(`${lines.join('\n')}\n`);
}

/**
 * The ballot's identity: a hash over the animation and the candidate digests
 * **in ballot order**, truncated to 16 hex characters.
 *
 * Order-sensitive, and that is the useful behaviour rather than an accident. A
 * second ballot over the same two candidates with the sides swapped is a
 * genuinely different question — it is how a run controls for the voter's bias
 * toward the left pane — so it gets its own id and its own ledger line instead
 * of colliding with the first as a duplicate.
 *
 * Truncated because this is a name a human copies into a filename, and 64 bits
 * of a content hash is far more than enough to keep one project's ballots
 * apart. Nothing security-bearing rests on it: the digests, not the id, are
 * what `verifyResult` checks a result against.
 */
export function ballotId(animation: string | null, digests: string[]): string {
  const body = `${BALLOT_SPEC}\n${animation ?? ''}\n${digests.join('\n')}\n`;
  return sha256(body).slice('sha256:'.length, 'sha256:'.length + 16);
}

// ---------------------------------------------------------------------------
// the manifest — what the page carries about itself
// ---------------------------------------------------------------------------

/** One compiled candidate, as the caller hands it over. */
export interface BallotCandidateInput {
  /**
   * Where it came from. Recorded in the manifest so the mapping is auditable,
   * and **never rendered into the page** — see the header comment.
   */
  source: string;
  skeletonText: string;
  atlasText: string;
  pages: PreviewPage[];
}

export interface ManifestCandidate {
  /** `A`, `B`, `C` or `D` — the only name the page shows. */
  label: string;
  /** The one value that identifies this candidate anywhere. */
  digest: string;
  skeleton: string;
  atlas: string;
  pages: { name: string; sha256: string }[];
  /** The path→label mapping. In the file, never on the screen. */
  source: string;
}

export interface BallotManifest {
  spec: string;
  ballot: string;
  rigc: string;
  /** The one animation every candidate plays, or `null` for setup poses. */
  animation: string | null;
  candidates: ManifestCandidate[];
}

/** The id the embedded manifest is found under, in the page and in the parser. */
export const MANIFEST_ELEMENT_ID = 'rigc-ballot-manifest';

/** What a saved vote should be called, so the page and the CLI say the same name. */
export function resultFilename(ballot: string): string {
  return `vote-${ballot}.json`;
}

export interface BallotInput {
  candidates: BallotCandidateInput[];
  /** The animation every candidate plays, or `null` when none of them has one. */
  animation: string | null;
  /** rigc's own version, for the generated-by line and the ledger. */
  version: string;
}

/** Refused before anything is written — the caller's arguments, not the art. */
export class BallotError extends Error {}

/** The manifest for a set of candidates, digests and id included. */
export function ballotManifest(input: BallotInput): BallotManifest {
  if (input.candidates.length < MIN_CANDIDATES || input.candidates.length > MAX_CANDIDATES) {
    throw new BallotError(
      `a ballot needs ${MIN_CANDIDATES}–${MAX_CANDIDATES} candidates and this one has ${input.candidates.length}` +
        (input.candidates.length < MIN_CANDIDATES ? ' — one candidate on its own is `rigc preview`' : ''),
    );
  }
  const candidates: ManifestCandidate[] = input.candidates.map((candidate, i) => ({
    label: BALLOT_LABELS[i],
    digest: candidateDigest(candidate.skeletonText, candidate.atlasText, candidate.pages),
    skeleton: sha256(candidate.skeletonText),
    atlas: sha256(candidate.atlasText),
    pages: candidate.pages.map((page) => ({ name: page.name, sha256: sha256(page.bytes) })),
    source: candidate.source,
  }));
  return {
    spec: BALLOT_SPEC,
    ballot: ballotId(
      input.animation,
      candidates.map((c) => c.digest),
    ),
    rigc: input.version,
    animation: input.animation,
    candidates,
  };
}

/**
 * Read a manifest back out of a generated page.
 *
 * The ballot file is its own record — there is no sidecar to lose and no
 * database to be out of step with it — so `--record` reads the question out of
 * the same file the human answered.
 */
export function readBallotManifest(html: string, path: string): BallotManifest {
  const found = new RegExp(
    `<script type="application/json" id="${MANIFEST_ELEMENT_ID}">([\\s\\S]*?)</script>`,
  ).exec(html);
  if (!found) {
    throw new BallotError(
      `${path} carries no <script id="${MANIFEST_ELEMENT_ID}"> — it is not a ballot written by \`rigc vote\``,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(found[1]);
  } catch (err) {
    throw new BallotError(`${path}: its embedded manifest is not JSON — ${(err as Error).message}`);
  }
  const manifest = parsed as BallotManifest;
  if (typeof manifest !== 'object' || manifest === null || manifest.spec !== BALLOT_SPEC) {
    throw new BallotError(
      `${path}: its embedded manifest says spec ${JSON.stringify((manifest as { spec?: unknown })?.spec)}, not ${JSON.stringify(BALLOT_SPEC)}`,
    );
  }
  if (!Array.isArray(manifest.candidates) || manifest.candidates.length < MIN_CANDIDATES) {
    throw new BallotError(`${path}: its embedded manifest lists no candidate pair to vote between`);
  }
  return manifest;
}

// ---------------------------------------------------------------------------
// the result, the refusals, and the ledger
// ---------------------------------------------------------------------------

/** What the page hands the human to save. Written by the browser, read here. */
export interface VoteResult {
  spec: string;
  ballot: string;
  animation: string | null;
  /** label → digest, exactly as the ballot listed them. */
  candidates: { label: string; digest: string }[];
  /** A label, or `tie`. */
  choice: string;
  reasonCode: string;
  /** Free text. May be empty; never absent. */
  reason: string;
  /** The voter's clock, ISO 8601. Provenance, never an input to a check. */
  at: string;
  /** Which Spine Web Player line drew the pixels that were judged. */
  player: string;
}

/**
 * One line of `votes.jsonl`.
 *
 * Key order is the declaration order and `JSON.stringify` preserves it, which
 * is what makes two ledgers diffable line by line.
 */
export interface LedgerLine {
  spec: string;
  /** 1-based, and equal to the line number. An append-only file's own check. */
  seq: number;
  ballot: string;
  at: string;
  animation: string | null;
  choice: string;
  /** The winning candidate's digest, or `null` for a tie. Labels are ballot-local; this is not. */
  winner: string | null;
  reasonCode: string;
  reason: string;
  /** Which candidates this vote compared — the reviewed set, as digests. */
  coverage: { label: string; digest: string }[];
  /** 1, or n>1 for a re-vote recorded with `--again`. */
  attempt: number;
  rigc: string;
}

/** A named refusal, in the shape the validator's failures already print in. */
export interface VoteRefusal {
  rule: string;
  detail: string;
}

/** Every rule `verifyResult` can refuse on, so callers can name them without matching prose. */
export const VOTE_RULES = [
  'V00_RESULT_IS_A_RIGC_VOTE',
  'V01_RESULT_NAMES_THIS_BALLOT',
  'V02_CANDIDATE_DIGESTS_ARE_THE_BALLOTS',
  'V03_BALLOT_ID_DERIVES_FROM_ITS_CANDIDATES',
  'V04_CHOICE_IS_ON_THE_BALLOT',
  'V05_REASON_CODE_FITS_THE_CHOICE',
  'V06_NOT_ALREADY_RECORDED',
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * Check a result against the ballot it claims to answer.
 *
 * Every refusal is named, because the caller of this is an agent and "invalid
 * vote" is not something an agent can act on. The rules are ordered so the
 * earliest failure is the most fundamental one, and they **all** run: a result
 * with three things wrong with it says so in one pass rather than over three.
 */
export function verifyResult(
  manifest: BallotManifest,
  raw: unknown,
  recorded: { attempts: number; again: boolean },
): { refusals: VoteRefusal[]; line: LedgerLine | null } {
  const refusals: VoteRefusal[] = [];
  const refuse = (rule: string, detail: string): void => {
    refusals.push({ rule, detail });
  };

  const result = asRecord(raw);
  const shaped =
    result !== null &&
    result.spec === VOTE_SPEC &&
    typeof result.ballot === 'string' &&
    typeof result.choice === 'string' &&
    typeof result.reasonCode === 'string' &&
    typeof result.reason === 'string' &&
    typeof result.at === 'string' &&
    Array.isArray(result.candidates);
  if (!shaped) {
    refuse(
      'V00_RESULT_IS_A_RIGC_VOTE',
      result === null
        ? 'the file is not a JSON object'
        : `spec=${JSON.stringify(result.spec)} (want ${JSON.stringify(VOTE_SPEC)}), and it needs string ` +
          '"ballot", "choice", "reasonCode", "reason", "at" plus an array "candidates"',
    );
    // Nothing below can read a shape that is not there, and guessing at the
    // missing halves would report failures about fields the file never had.
    return { refusals, line: null };
  }
  const vote = raw as VoteResult;

  if (vote.ballot !== manifest.ballot) {
    refuse(
      'V01_RESULT_NAMES_THIS_BALLOT',
      `the result answers ballot ${JSON.stringify(vote.ballot)} and this ballot is ${JSON.stringify(manifest.ballot)} — ` +
        'point --ballot at the file this vote came from',
    );
  }

  const want = manifest.candidates.map((c) => `${c.label} ${c.digest}`);
  const got = vote.candidates.map((c) => `${c?.label} ${c?.digest}`);
  if (want.length !== got.length || want.some((entry, i) => entry !== got[i])) {
    const first = want.findIndex((entry, i) => entry !== got[i]);
    refuse(
      'V02_CANDIDATE_DIGESTS_ARE_THE_BALLOTS',
      want.length !== got.length
        ? `the result lists ${got.length} candidate(s) and the ballot has ${want.length}`
        : `candidate ${first + 1} of ${want.length}: the result says ${JSON.stringify(got[first])} and the ballot says ` +
          `${JSON.stringify(want[first])} — a vote is only about the pixels whose hashes it carries`,
    );
  }

  const derived = ballotId(
    manifest.animation,
    manifest.candidates.map((c) => c.digest),
  );
  if (derived !== manifest.ballot) {
    refuse(
      'V03_BALLOT_ID_DERIVES_FROM_ITS_CANDIDATES',
      `the ballot calls itself ${JSON.stringify(manifest.ballot)} but its own candidate digests hash to ` +
        `${JSON.stringify(derived)} — the ballot file has been edited since it was written`,
    );
  }

  const labels = manifest.candidates.map((c) => c.label);
  const isTie = vote.choice === TIE;
  const winner = manifest.candidates.find((c) => c.label === vote.choice) ?? null;
  if (!isTie && winner === null) {
    refuse(
      'V04_CHOICE_IS_ON_THE_BALLOT',
      `choice ${JSON.stringify(vote.choice)} is neither ${JSON.stringify(TIE)} nor one of [${labels.join(', ')}]`,
    );
  }

  const allowed: readonly string[] = isTie ? TIE_REASON_CODES : WINNER_REASON_CODES;
  if (!allowed.includes(vote.reasonCode)) {
    refuse(
      'V05_REASON_CODE_FITS_THE_CHOICE',
      `choice ${JSON.stringify(vote.choice)} takes a reason code from [${allowed.join(', ')}], and the result says ` +
        `${JSON.stringify(vote.reasonCode)}`,
    );
  }

  if (recorded.attempts > 0 && !recorded.again) {
    refuse(
      'V06_NOT_ALREADY_RECORDED',
      `ballot ${manifest.ballot} is already in the ledger ${recorded.attempts} time(s) — pass --again to record ` +
        'a deliberate re-vote, or point --ledger at a different file',
    );
  }

  if (refusals.length > 0) return { refusals, line: null };
  return {
    refusals,
    line: {
      spec: VOTE_SPEC,
      seq: 0, // the caller sets this from the ledger it is appending to
      ballot: manifest.ballot,
      at: vote.at,
      animation: manifest.animation,
      choice: vote.choice,
      winner: winner === null ? null : winner.digest,
      reasonCode: vote.reasonCode,
      reason: vote.reason,
      coverage: manifest.candidates.map((c) => ({ label: c.label, digest: c.digest })),
      attempt: recorded.attempts + 1,
      rigc: manifest.rigc,
    },
  };
}

/** One ledger line as the text that goes on disk, newline included. */
export function ledgerLineText(line: LedgerLine): string {
  return `${JSON.stringify(line)}\n`;
}

/**
 * Read a ledger back.
 *
 * A line that is not a vote is an error rather than a line to skip: a ledger
 * whose reader quietly drops what it does not understand cannot be the record
 * of anything, and the coverage figure computed over it would be wrong in the
 * safe-looking direction.
 */
export function parseLedger(text: string, path: string): LedgerLine[] {
  const lines: LedgerLine[] = [];
  const raw = text.split('\n');
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].trim() === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw[i]);
    } catch (err) {
      throw new BallotError(`${path}:${i + 1} is not JSON — ${(err as Error).message}`);
    }
    const record = asRecord(parsed);
    if (record === null || record.spec !== VOTE_SPEC || typeof record.ballot !== 'string') {
      throw new BallotError(`${path}:${i + 1} is not a ${VOTE_SPEC} line`);
    }
    lines.push(parsed as LedgerLine);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// the page
// ---------------------------------------------------------------------------

/**
 * One player's config, in the shape `preview.ts` established.
 *
 * ⚠️ Every candidate keys its own skeleton and atlas under the SAME names, and
 * that is safe rather than lucky: `SpinePlayer` builds one `AssetManager` and
 * one `Downloader` per instance, and `setRawDataURI` writes into that
 * instance's own map. Renaming the keys per candidate would work too, but it
 * would move each atlas page's lookup under a prefix — the player resolves a
 * page as `dirname(config.atlas) + pageName` — and the value of embedding the
 * atlas text verbatim is that the file which plays is the file that was built.
 */
function playerConfig(candidate: BallotCandidateInput, animation: string | null): Record<string, unknown> {
  const rawDataURIs: Record<string, string> = {
    [SKELETON_KEY]: dataUri('application/json', candidate.skeletonText),
    [ATLAS_KEY]: dataUri('text/plain', candidate.atlasText),
  };
  for (const page of candidate.pages) rawDataURIs[page.name] = dataUri('image/png', page.bytes);
  const config: Record<string, unknown> = {
    skeleton: SKELETON_KEY,
    atlas: ATLAS_KEY,
    rawDataURIs,
    showControls: true,
    alpha: false,
    backgroundColor: backgroundHex(),
  };
  // Present only when there is one, exactly as in `preview.ts`: the player
  // checks for the key rather than for a null, and `config.animation` is what
  // makes it autoplay looping.
  if (animation !== null) {
    config.animation = animation;
    config.animations = [animation];
  }
  return config;
}

/**
 * The whole ballot: the page, and the manifest that is embedded in it.
 *
 * Both, from one call, because the caller needs both and the digests are a hash
 * over every page's bytes — computing them twice is the kind of duplication
 * that eventually computes two different answers. There is no template file and
 * no build step, the same reasoning as `buildPreview`: the published package
 * carries this the way it carries every other module.
 */
export function buildBallot(input: BallotInput): { html: string; manifest: BallotManifest } {
  const manifest = ballotManifest(input);
  const configs = input.candidates.map((candidate) => playerConfig(candidate, input.animation));
  const labels = manifest.candidates.map((c) => c.label);
  const filename = resultFilename(manifest.ballot);
  const playing =
    input.animation === null
      ? 'the setup pose — no animation'
      : `<code>${escapeHtml(input.animation)}</code>, looping`;

  // What the page hands to the browser: the labels, the digests and the
  // animation. `source` is deliberately NOT in here — it lives in the manifest
  // element, which the page never reads, so no code path can put a path on the
  // screen by accident.
  const ballotData = {
    spec: VOTE_SPEC,
    ballot: manifest.ballot,
    animation: manifest.animation,
    candidates: manifest.candidates.map((c) => ({ label: c.label, digest: c.digest })),
    player: PLAYER_LINE,
    filename,
    reasonCodes: {
      winner: WINNER_REASON_CODES.map((code) => ({ code, meaning: REASON_CODE_MEANINGS[code] })),
      tie: TIE_REASON_CODES.map((code) => ({ code, meaning: REASON_CODE_MEANINGS[code] })),
    },
  };

  const panes = manifest.candidates
    .map(
      (c) => `<section class="pane">
  <h2>${c.label}</h2>
  <div class="stage" id="rigc-player-${c.label}"></div>
</section>`,
    )
    .join('\n');

  const choices = [...labels, TIE]
    .map(
      (value) =>
        `<button type="button" class="choice" aria-pressed="false" data-choice="${escapeHtml(value)}">${
          value === TIE ? 'tie / no preference' : escapeHtml(value)
        }</button>`,
    )
    .join('\n    ');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>rigc ballot — ${escapeHtml(manifest.ballot)}</title>
<!--
  Generated by rigc ${escapeHtml(input.version)} — https://github.com/firejune/rigc

  Every candidate's skeleton, atlas and atlas pages are embedded in this file as
  data URIs, so it plays on its own with no server and no sibling files.

  It plays them in the Spine Web Player, which is NOT embedded: the script and
  stylesheet below are loaded from unpkg. The Spine Runtimes are Copyright (c)
  2013-2025 Esoteric Software LLC and are licensed under the Spine Runtimes
  License Agreement — https://esotericsoftware.com/spine-runtimes-license — which
  requires each user of a product integrating them to hold a Spine Editor
  license. Nothing owned by Esoteric Software is redistributed by rigc.

  The candidate paths are in the manifest element below, not on the screen: a
  voter who can see where a candidate came from is no longer comparing pictures.
-->
<link rel="stylesheet" href="${PLAYER_STYLE_URL}">
<style>
  :root { color-scheme: light dark; }
  html, body { margin: 0; min-height: 100%; }
  body {
    background: ${backgroundHex()};
    color: #1a1a1a;
    font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  header, footer { padding: 10px 14px; }
  header { border-bottom: 1px solid rgba(0, 0, 0, 0.15); display: flex; gap: 14px; align-items: baseline; flex-wrap: wrap; }
  header b { font-weight: 600; }
  header span { opacity: 0.65; }
  header button { margin-left: auto; }
  button { font: inherit; padding: 4px 12px; border: 1px solid rgba(0, 0, 0, 0.35); border-radius: 4px; background: rgba(255, 255, 255, 0.6); cursor: pointer; }
  button:hover { background: rgba(255, 255, 255, 0.95); }
  button[aria-pressed="true"] { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
  #panes { display: grid; grid-template-columns: repeat(${manifest.candidates.length}, minmax(0, 1fr)); gap: 1px; background: rgba(0, 0, 0, 0.15); }
  @media (max-width: 720px) { #panes { grid-template-columns: minmax(0, 1fr); } }
  .pane { background: ${backgroundHex()}; display: flex; flex-direction: column; min-width: 0; }
  .pane h2 { margin: 0; padding: 6px 14px; font-size: 15px; letter-spacing: 0.12em; }
  .stage { height: 52vh; min-height: 260px; }
  #vote { border-top: 1px solid rgba(0, 0, 0, 0.15); display: flex; flex-direction: column; gap: 10px; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .row > label, .caption { opacity: 0.65; }
  select, input[type="text"], textarea { font: inherit; padding: 4px 6px; border: 1px solid rgba(0, 0, 0, 0.35); border-radius: 4px; background: rgba(255, 255, 255, 0.6); }
  input[type="text"] { flex: 1 1 320px; min-width: 0; }
  textarea { width: 100%; box-sizing: border-box; min-height: 150px; white-space: pre; overflow-x: auto; }
  #egress[hidden] { display: none; }
  #rigc-status { margin: 0; padding: 10px 14px; border-top: 1px solid rgba(0, 0, 0, 0.15); white-space: pre-wrap; }
  #rigc-status[data-state="error"] { background: #7d1d1d; color: #fff; }
  code { background: rgba(0, 0, 0, 0.07); padding: 0 3px; border-radius: 3px; }
</style>
</head>
<body>
<script type="application/json" id="${MANIFEST_ELEMENT_ID}">${embeddedJson(manifest)}</script>
<header>
  <b>ballot ${escapeHtml(manifest.ballot)}</b>
  <span>${manifest.candidates.length} candidates — ${playing}. Watch both, then pick one or call it a tie.</span>
  <button type="button" id="restart"${input.animation === null ? ' disabled' : ''}>restart all</button>
</header>
<div id="panes">
${panes}
</div>
<footer id="vote">
  <div class="row" role="group" aria-label="winner">
    <span class="caption">winner</span>
    ${choices}
  </div>
  <div class="row">
    <label for="reason-code">because</label>
    <select id="reason-code"></select>
    <input type="text" id="reason" placeholder="optional — what you saw, in your own words">
  </div>
  <div id="egress" hidden>
    <p>Save this as <b><code id="filename"></code></b>, then hand it back:
      <code id="record-command"></code></p>
    <div class="row">
      <button type="button" id="copy">copy to clipboard</button>
      <a id="download" download>download</a>
      <span id="copy-said"></span>
    </div>
    <textarea id="json" readonly spellcheck="false"></textarea>
  </div>
</footer>
<p id="rigc-status">loading the Spine Web Player…</p>
<script src="${PLAYER_SCRIPT_URL}"></script>
<script>
(function () {
  var data = ${embeddedJson(ballotData)};
  var configs = ${embeddedJson(configs)};
  var status = document.getElementById('rigc-status');
  var state = {
    status: 'loading',
    message: null,
    ballot: data.ballot,
    players: {},
    ready: [],
    failed: [],
    choice: null,
    at: null,
    result: null
  };
  window.rigcBallot = state;

  function say(kind, message) {
    state.status = kind;
    state.message = message;
    status.textContent = message;
    status.setAttribute('data-state', kind);
  }

  // ---- the players ---------------------------------------------------------
  if (typeof window.spine === 'undefined' || typeof window.spine.SpinePlayer !== 'function') {
    say('error', 'The Spine Web Player did not load from ${PLAYER_SCRIPT_URL} — this page needs a network connection the first time it is opened.');
  } else {
    for (var i = 0; i < data.candidates.length; i++) {
      (function (label, config) {
        config.success = function (player) {
          state.players[label] = player;
          if (state.ready.indexOf(label) === -1) state.ready.push(label);
          if (state.failed.length === 0 && state.ready.length === data.candidates.length) {
            say('ready', state.ready.join(' and ') + ' are playing in Spine Web Player ${PLAYER_LINE} — every pixel they draw is embedded in this file.');
          }
        };
        config.error = function (player, message) {
          state.failed.push(label + ': ' + String(message));
          say('error', state.failed.join('\\n'));
        };
        try {
          new window.spine.SpinePlayer('rigc-player-' + label, config);
        } catch (err) {
          state.failed.push(label + ': ' + String(err && err.message ? err.message : err));
          say('error', state.failed.join('\\n'));
        }
      })(data.candidates[i].label, configs[i]);
    }
  }

  // One button, every pane: comparing spacing means seeing the same instant of
  // two animations, and two players started seconds apart never show it.
  document.getElementById('restart').addEventListener('click', function () {
    if (data.animation === null) return;
    for (var label in state.players) {
      var player = state.players[label];
      try {
        if (player.paused) player.play();
        player.setAnimation(data.animation, true);
      } catch (err) {
        say('error', label + ': ' + String(err && err.message ? err.message : err));
      }
    }
  });

  // ---- the vote ------------------------------------------------------------
  var reasonSelect = document.getElementById('reason-code');
  var reasonText = document.getElementById('reason');
  var egress = document.getElementById('egress');
  var jsonBox = document.getElementById('json');
  var buttons = [].slice.call(document.querySelectorAll('.choice'));

  function fillReasonCodes(choice) {
    var codes = choice === ${JSON.stringify(TIE)} ? data.reasonCodes.tie : data.reasonCodes.winner;
    reasonSelect.textContent = '';
    for (var i = 0; i < codes.length; i++) {
      var option = document.createElement('option');
      option.value = codes[i].code;
      option.textContent = codes[i].code + ' — ' + codes[i].meaning;
      reasonSelect.appendChild(option);
    }
  }

  // Written key by key rather than left to JSON.stringify's argument order so
  // the shape is the one \`rigc vote --record\` documents, and two votes on one
  // ballot differ only where they disagree.
  //
  // \`at\` is stamped when the CHOICE is made and then held still, so editing the
  // wording of a reason for a minute does not keep moving the moment the vote
  // was cast.
  function resultJson() {
    return JSON.stringify({
      spec: data.spec,
      ballot: data.ballot,
      animation: data.animation,
      candidates: data.candidates,
      choice: state.choice,
      reasonCode: reasonSelect.value,
      reason: reasonText.value,
      at: state.at,
      player: data.player
    }, null, 2) + '\\n';
  }

  var downloadUrl = null;
  function refresh() {
    if (state.choice === null) return;
    var text = resultJson();
    state.result = text;
    jsonBox.value = text;
    egress.hidden = false;
    document.getElementById('filename').textContent = data.filename;
    document.getElementById('record-command').textContent =
      'rigc vote --record ' + data.filename + ' --ballot <this file>';
    var link = document.getElementById('download');
    if (downloadUrl !== null) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    link.href = downloadUrl;
    link.setAttribute('download', data.filename);
  }

  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      var choice = button.getAttribute('data-choice');
      var changed = choice !== state.choice;
      state.choice = choice;
      if (changed || state.at === null) state.at = new Date().toISOString();
      buttons.forEach(function (other) {
        other.setAttribute('aria-pressed', String(other === button));
      });
      if (changed) fillReasonCodes(choice);
      refresh();
    });
  });
  reasonSelect.addEventListener('change', refresh);
  reasonText.addEventListener('input', refresh);

  // \`navigator.clipboard\` is undefined on a file:// page in Chromium — it is not
  // a secure context — so the button falls back to selecting the textarea, and
  // the textarea is there in the first place so a manual copy always works.
  document.getElementById('copy').addEventListener('click', function () {
    var said = document.getElementById('copy-said');
    function ok() { said.textContent = 'copied'; }
    function no() { said.textContent = 'could not copy — select the text below and copy it'; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(jsonBox.value).then(ok, fallback);
    } else {
      fallback();
    }
    function fallback() {
      try {
        jsonBox.focus();
        jsonBox.select();
        if (document.execCommand('copy')) ok(); else no();
      } catch (err) { no(); }
    }
  });

  fillReasonCodes(null);
})();
</script>
</body>
</html>
`;
  return { html, manifest };
}
