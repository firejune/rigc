/**
 * The single-file preview — a compiled artifact playing in Esoteric Software's
 * own web player, with nothing beside it.
 *
 * ⭐ Why this exists at all. `validate` answers "is this valid Spine", `check`
 * answers "does it match these frames", and neither of them can answer the
 * question a first user actually has: *does it look right?* A rig whose head sits
 * visibly off its torso compiles green, loads in `spine-core` and steps
 * numerically clean — the offsets are the ones the spec asked for. The only
 * remedy for that class of error is looking, and until this command the package
 * offered no way to look (issue #216).
 *
 * ## Why the official player, and not our own renderer
 *
 * There is a rasteriser in [`render.ts`](render.ts) already, and `rigc render`
 * uses it. This is deliberately the other thing: `SpinePlayer` is the runtime
 * Esoteric ships, so a rig that plays here has been played by the reference
 * implementation rather than by ours. Every picture our own code draws is, at
 * some level, rigc checking its own work — this one is not, which is why issue
 * #151 settled on it as the surface a human votes on.
 *
 * ## Why one file, and what `rawDataURIs` is doing
 *
 * `SpinePlayer` normally fetches its skeleton, atlas and pages over HTTP, which
 * would make a preview a directory plus a web server — a thing to set up rather
 * than a thing to open. Its `rawDataURIs` option maps each of those paths to a
 * `data:` URI instead, and the player's downloader takes the mapping in
 * preference to the network. So the whole artifact — skeleton JSON, atlas text
 * and every page's PNG bytes — is embedded, and the result is one `.html` file
 * that plays when double-clicked and can be attached to a message.
 *
 * ⚠️ The keys are the paths the player asks for, and they must match exactly.
 * `config.atlas` has no directory part, so the player's own texture resolution
 * (`parentPath + pageName`) asks for each page under **the name the atlas spells**
 * — `../parts/torso.png` and all. That is why the atlas text is embedded verbatim
 * rather than rewritten to flat names: the file that plays is the file that was
 * built, which is the entire value of the interop proof.
 *
 * ## The player is referenced, never vendored
 *
 * The `<script>` and `<link>` point at unpkg. Nothing Esoteric owns is copied
 * into this repository or into the published package — see [NOTICE.md](../NOTICE.md)
 * — and the generated page belongs to whoever ran the command. The cost is that
 * the file needs the network the first time it is opened, which the page says out
 * loud when the script does not arrive.
 */
import { SPINE_VERSION } from './compile.ts';
import { BACKGROUND } from './render.ts';

/**
 * The Spine Web Player line the generated page loads.
 *
 * Derived from the runtime line the compiler emits rather than written down
 * twice: a page playing 4.2 data in a 4.3 player (or the reverse) is a failure
 * mode nobody would look for, and this makes the two impossible to edit apart.
 *
 * The **patch** is deliberately a wildcard where `SPINE_VERSION` is exact. Data
 * compatibility is a property of the minor line, and pinning a patch would break
 * every generated page on the day spine-core ships a version the player did not.
 */
export const PLAYER_LINE = `${SPINE_VERSION.split('.').slice(0, 2).join('.')}.*`;
export const PLAYER_SCRIPT_URL = `https://unpkg.com/@esotericsoftware/spine-player@${PLAYER_LINE}/dist/iife/spine-player.js`;
export const PLAYER_STYLE_URL = `https://unpkg.com/@esotericsoftware/spine-player@${PLAYER_LINE}/dist/spine-player.css`;

/** The name the embedded skeleton and atlas are asked for under, inside the page. */
export const SKELETON_KEY = 'skeleton.json';
export const ATLAS_KEY = 'skeleton.atlas';

/** One atlas page, named exactly as the atlas spells it, with its bytes. */
export interface PreviewPage {
  /** The page name from the atlas text — a path, quite possibly a relative one. */
  name: string;
  bytes: Uint8Array;
}

export interface PreviewInput {
  skeletonText: string;
  atlasText: string;
  pages: PreviewPage[];
  /** The animation to autoplay and loop, or `null` for a skeleton with none. */
  animation: string | null;
  /** Every animation the page offers in its picker. */
  animations: string[];
  /** What the page calls itself — the skeleton's path, for the tab and the header. */
  label: string;
  /** rigc's own version, for the generated-by line and the header's gate line. */
  version: string;
  /** What the gate said about this candidate on THIS run — see `PreviewGate`. */
  gate: PreviewGate;
}

/**
 * The gate's reading of a candidate, taken when the page is written (issue #837).
 *
 * ⭐ Both strings are the validator's own lines, never a paraphrase: `summary`
 * is the `N assertions: …` line `rigc validate <dir>` prints last and `refusal`
 * is its first `FAIL` line, each without the report's gutter. The caller
 * measures them on the run that writes the page, because a figure carried over
 * from the build would be a claim about bytes nothing here read — and a bare
 * directory re-gated is NOT what `build` gated: with no rig spec and no second
 * compile, `A09` and `A18` report SKIP there, so the two runs print different
 * counts over the same files and only this one's belongs on this page.
 *
 * `refusal` is `null` on green. A refused candidate is still previewed —
 * looking at a red build is what this command is for — and its header says so
 * in the gate's words.
 */
export interface PreviewGate {
  summary: string;
  refusal: string | null;
}

/** The header's gate line, as one element: which rigc, what ran, and what it said. */
export function gateLine(gate: PreviewGate, version: string): string {
  const said =
    `rigc ${escapeHtml(version)}, re-gated as <code>rigc validate &lt;dir&gt;</code> gates it: ${escapeHtml(gate.summary)}`;
  return gate.refusal === null
    ? `<span class="rigc-gate" data-gate="green">${said}</span>`
    : `<span class="rigc-gate" data-gate="refused" style="opacity: 1; color: #7d1d1d; font-weight: 600">${said} — ` +
        `refused: ${escapeHtml(gate.refusal)}</span>`;
}

/** What a header says its player is playing. */
function playedText(animation: string | null, animations: string[]): string {
  return animation === null
    ? 'no animation — the setup pose'
    : `${escapeHtml(animation)}${animations.length > 1 ? ` (of ${animations.length}; pick another in the controls)` : ''}`;
}

/** The header over one player: the path, what it plays, and the gate's line. */
function headerHtml(input: PreviewInput): string {
  return (
    `<header><b>${escapeHtml(input.label)}</b> <span>— ${playedText(input.animation, input.animations)}</span>` +
    `<br>${gateLine(input.gate, input.version)}</header>`
  );
}

/**
 * One player's config. `animation` is left off a skeleton with none rather than
 * set to null: the player checks for the key's presence, and the setup pose
 * held still is the honest picture of a rig that has no animation to play.
 */
function previewConfig(input: PreviewInput): Record<string, unknown> {
  const rawDataURIs: Record<string, string> = {
    [SKELETON_KEY]: dataUri('application/json', input.skeletonText),
    [ATLAS_KEY]: dataUri('text/plain', input.atlasText),
  };
  for (const page of input.pages) rawDataURIs[page.name] = dataUri('image/png', page.bytes);
  const config: Record<string, unknown> = {
    skeleton: SKELETON_KEY,
    atlas: ATLAS_KEY,
    rawDataURIs,
    animations: input.animations,
    showControls: true,
    alpha: false,
    backgroundColor: backgroundHex(),
  };
  if (input.animation !== null) config.animation = input.animation;
  return config;
}

/**
 * The licence paragraph, spelled once for the one-candidate page and the page
 * of panes so the two cannot drift. The ballot keeps its own copy of the same
 * words: its bytes are held by `vote`'s controls, not moved by this card.
 */
const PLAYER_LICENCE = `  It plays them in the Spine Web Player, which is NOT embedded: the script and
  stylesheet below are loaded from unpkg. The Spine Runtimes are Copyright (c)
  2013-2025 Esoteric Software LLC and are licensed under the Spine Runtimes
  License Agreement — https://esotericsoftware.com/spine-runtimes-license — which
  requires each user of a product integrating them to hold a Spine Editor
  license. Nothing owned by Esoteric Software is redistributed by rigc.`;

// ---------------------------------------------------------------------------
// panes — the layout `vote` built first, shared rather than copied
// ---------------------------------------------------------------------------

/**
 * The grid panes sit in, as the style lines the ballot has always carried: one
 * column per pane, one column on a narrow screen. `buildBallot` calls this too,
 * so a ballot's bytes are what they were and the two pages cannot drift.
 */
export function paneGridCss(count: number): string {
  return `  #panes { display: grid; grid-template-columns: repeat(${count}, minmax(0, 1fr)); gap: 1px; background: rgba(0, 0, 0, 0.15); }
  @media (max-width: 720px) { #panes { grid-template-columns: minmax(0, 1fr); } }
  .pane { background: ${backgroundHex()}; display: flex; flex-direction: column; min-width: 0; }`;
}

/** The box a pane's player mounts in, as the ballot styles it. */
export const PANE_STAGE_CSS = '  .stage { height: 52vh; min-height: 260px; }';

/** One pane: a heading the caller writes, over the element its player mounts in. */
export function paneSection(stageId: string, heading: string): string {
  return `<section class="pane">
  ${heading}
  <div class="stage" id="${stageId}"></div>
</section>`;
}

/** The element pane `i` (0-based) mounts its player in, numbered from 1 as the CLI numbers candidates. */
export function previewPaneId(i: number): string {
  return `rigc-player-${i + 1}`;
}

/**
 * A `data:` URI the player's downloader will take the fast path on.
 *
 * ⚠️ Base64 for the text assets too, not only for the PNGs. The downloader
 * decides a value is a data URI rather than an alias by asking whether it
 * contains a `.` — and a percent-encoded skeleton JSON is full of them, so the
 * un-encoded form would be handed to `XMLHttpRequest` as a URL instead. Base64's
 * alphabet has no `.` in it, so this always lands on the branch that decodes.
 */
export function dataUri(mime: string, body: string | Uint8Array): string {
  const base64 = (typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body)).toString('base64');
  return `data:${mime};base64,${base64}`;
}

/** `#rrggbb` for the player's background, so a preview and `rigc render` agree. */
export function backgroundHex(): string {
  return `#${BACKGROUND.slice(0, 3)
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** The five characters that can end an element or an attribute early. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * JSON for embedding inside a `<script>` element.
 *
 * The escape is on `<` alone and it is enough: an HTML parser ends a script at
 * `</script`, and it cannot see one if no `<` survives. `<` is the same
 * string to a JSON reader, so nothing about the value changes. Page names come
 * out of a file somebody else wrote, which is exactly why this is not optional.
 */
export function embeddedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * The whole page, as text.
 *
 * There is no template file and no build step: this is a `.ts` string, so the
 * published package carries it the way it carries every other module, and the
 * page it produces has no dependency of its own except the player URL above.
 */
export function buildPreview(input: PreviewInput): string {
  const config = previewConfig(input);
  const label = escapeHtml(input.label);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>rigc preview — ${label}</title>
<!--
  Generated by rigc ${escapeHtml(input.version)} — https://github.com/firejune/rigc

  The skeleton, the atlas and every atlas page are embedded in this file as data
  URIs, so it plays on its own with no server and no sibling files.

${PLAYER_LICENCE}
-->
<link rel="stylesheet" href="${PLAYER_STYLE_URL}">
<style>
  :root { color-scheme: light dark; }
  html, body { margin: 0; height: 100%; }
  body {
    display: flex; flex-direction: column;
    background: ${backgroundHex()};
    color: #1a1a1a;
    font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  header { padding: 10px 14px; border-bottom: 1px solid rgba(0, 0, 0, 0.15); }
  header b { font-weight: 600; }
  header span { opacity: 0.65; }
  #rigc-player { flex: 1 1 auto; min-height: 0; }
  #rigc-status { margin: 0; padding: 10px 14px; border-top: 1px solid rgba(0, 0, 0, 0.15); white-space: pre-wrap; }
  #rigc-status[data-state="error"] { background: #7d1d1d; color: #fff; }
</style>
</head>
<body>
${headerHtml(input)}
<div id="rigc-player"></div>
<p id="rigc-status">loading the Spine Web Player…</p>
<script src="${PLAYER_SCRIPT_URL}"></script>
<script>
(function () {
  var status = document.getElementById('rigc-status');
  var state = { status: 'loading', message: null, player: null };
  window.rigcPreview = state;
  function say(kind, message) {
    state.status = kind;
    state.message = message;
    status.textContent = message;
    status.setAttribute('data-state', kind);
  }
  if (typeof window.spine === 'undefined' || typeof window.spine.SpinePlayer !== 'function') {
    say('error', 'The Spine Web Player did not load from ${PLAYER_SCRIPT_URL} — this page needs a network connection the first time it is opened.');
    return;
  }
  var config = ${embeddedJson(config)};
  config.success = function (player) {
    state.player = player;
    say('ready', 'playing in Spine Web Player ${PLAYER_LINE} — everything it is drawing is embedded in this file.');
  };
  config.error = function (player, message) {
    state.player = player;
    say('error', String(message));
  };
  try {
    new window.spine.SpinePlayer('rigc-player', config);
  } catch (err) {
    say('error', String(err && err.message ? err.message : err));
  }
})();
</script>
</body>
</html>
`;
}

/**
 * Several candidates on one page, a pane per candidate in the order given
 * (issue #837).
 *
 * ⭐ This page asks nothing, and that is the whole difference from the ballot
 * whose layout it borrows. A ballot hides where each candidate came from
 * because a voter who can see it is no longer comparing pictures; here the
 * question is "show me these", so each pane is headed exactly as a
 * one-candidate preview is — its path, what it plays, the gate's line for it —
 * and each player offers every animation its own skeleton has. No manifest, no
 * digests and no result form: there is no answer to record.
 *
 * Each pane plays its own candidate's animation (the one `--animation` names,
 * or its own first). The ballot refuses two panes playing two animations
 * because the labels are A and B and nothing would say so; here the header over
 * each pane names what it plays.
 */
export function buildPreviewPanes(inputs: PreviewInput[], version: string): string {
  const configs = inputs.map((input) => previewConfig(input));
  const panes = inputs.map((input, i) => paneSection(previewPaneId(i), headerHtml(input))).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>rigc preview — ${inputs.length} candidates</title>
<!--
  Generated by rigc ${escapeHtml(version)} — https://github.com/firejune/rigc

  Every candidate's skeleton, atlas and atlas pages are embedded in this file as
  data URIs, so it plays on its own with no server and no sibling files.

${PLAYER_LICENCE}
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
  header { padding: 10px 14px; border-bottom: 1px solid rgba(0, 0, 0, 0.15); overflow-wrap: anywhere; }
  header b { font-weight: 600; }
  header span { opacity: 0.65; }
${paneGridCss(inputs.length)}
${PANE_STAGE_CSS}
  #rigc-status { margin: 0; padding: 10px 14px; border-top: 1px solid rgba(0, 0, 0, 0.15); white-space: pre-wrap; }
  #rigc-status[data-state="error"] { background: #7d1d1d; color: #fff; }
</style>
</head>
<body>
<div id="panes">
${panes}
</div>
<p id="rigc-status">loading the Spine Web Player…</p>
<script src="${PLAYER_SCRIPT_URL}"></script>
<script>
(function () {
  var configs = ${embeddedJson(configs)};
  var status = document.getElementById('rigc-status');
  var state = { status: 'loading', message: null, players: [], ready: [], failed: [] };
  window.rigcPreview = state;
  function say(kind, message) {
    state.status = kind;
    state.message = message;
    status.textContent = message;
    status.setAttribute('data-state', kind);
  }
  if (typeof window.spine === 'undefined' || typeof window.spine.SpinePlayer !== 'function') {
    say('error', 'The Spine Web Player did not load from ${PLAYER_SCRIPT_URL} — this page needs a network connection the first time it is opened.');
    return;
  }
  for (var i = 0; i < configs.length; i++) {
    (function (pane, config) {
      config.success = function (player) {
        state.players[pane - 1] = player;
        if (state.ready.indexOf(pane) === -1) state.ready.push(pane);
        if (state.failed.length === 0 && state.ready.length === configs.length) {
          say('ready', 'all ' + configs.length + ' panes are playing in Spine Web Player ${PLAYER_LINE} — everything they draw is embedded in this file.');
        }
      };
      config.error = function (player, message) {
        state.players[pane - 1] = player;
        state.failed.push('pane ' + pane + ': ' + String(message));
        say('error', state.failed.join('\\n'));
      };
      try {
        new window.spine.SpinePlayer('rigc-player-' + pane, config);
      } catch (err) {
        state.failed.push('pane ' + pane + ': ' + String(err && err.message ? err.message : err));
        say('error', state.failed.join('\\n'));
      }
    })(i + 1, configs[i]);
  }
})();
</script>
</body>
</html>
`;
}
