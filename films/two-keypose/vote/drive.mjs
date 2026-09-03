/**
 * Opens the real ballot in headless chromium, casts a real vote, and
 * photographs the page.
 *
 * Everything here goes through the ballot's own DOM rather than around it: the
 * vote JSON is what the page hands a person after they click, and `rigc vote
 * --record` then checks it against the ballot's embedded manifest. If any of
 * that were faked the record step would refuse it by name — which is the point
 * of running it at all.
 *
 * ⚠️ The ballot loads the official Spine Web Player from unpkg, so a first open
 * needs a network. If that fetch fails, a local copy of the player is served in
 * its place — same library, no network; `SPINE_PLAYER_JS` below says where to
 * look for one. The rest of the page (skeletons, atlases, pages) is already
 * embedded as data URIs by `rigc vote` itself.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';

/**
 * ADAPTED for the repository (issue #342). As run, the two paths below were
 * absolute into the machine that made the film — playwright-core out of another
 * project's `node_modules`, and a local Spine Web Player copy in the session
 * scratchpad. Neither survives being moved, so both are now resolved: an
 * environment variable if one is set, else node's own resolution from here.
 * Nothing else in this file changed.
 *
 * PLAYWRIGHT_CORE   an absolute path to playwright-core — its entry file or its
 *                   package directory, either works. Unset: resolved as an
 *                   ordinary dependency, so `bun add playwright-core` in this
 *                   film's directory is the other way to satisfy it.
 * SPINE_PLAYER_JS   a local copy of the official Spine Web Player, used only if
 *                   the CDN fetch below fails. It is NOT in this repository —
 *                   the player is Esoteric Software's, distributed by them (the
 *                   repository's NOTICE.md has the terms) — so with no network
 *                   and no copy the ballot step is the one step that cannot run.
 */
const require = createRequire(import.meta.url);
const given = process.env.PLAYWRIGHT_CORE;
const entry =
  given === undefined || given === ''
    ? require.resolve('playwright-core')
    : statSync(given).isDirectory()
      ? require.resolve(given)
      : given;
// `index.mjs` exports `chromium` by name and `index.js` hangs it off the CommonJS
// default, and which one `resolve` picks depends on the entry given — so take it
// from either rather than committing to one shape.
const playwright = await import(pathToFileURL(entry).href);
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (chromium === undefined) throw new Error(`no chromium export in ${entry}`);

const ballot = process.argv[2];
const outDir = process.argv[3];
const choice = process.argv[4] ?? 'B';
const reason = process.argv[5] ?? 'preferred';

const LOCAL_PLAYER = process.env.SPINE_PLAYER_JS ?? new URL('./spine-player.js', import.meta.url).pathname;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(`console: ${m.text()}`);
});

let servedLocal = false;
await page.route('**/*', async (route) => {
  const url = route.request().url();
  if (/unpkg\.com|jsdelivr/.test(url) && /\.js(\?|$)/.test(url)) {
    try {
      const r = await route.fetch({ timeout: 8000 });
      await route.fulfill({ response: r });
      return;
    } catch {
      if (existsSync(LOCAL_PLAYER)) {
        servedLocal = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript',
          body: readFileSync(LOCAL_PLAYER),
        });
        return;
      }
    }
  }
  await route.continue();
});

await page.goto(pathToFileURL(ballot).href, { waitUntil: 'load' });
await page.waitForFunction(() => window.rigcBallot && window.rigcBallot.status !== 'loading', null, {
  timeout: 45000,
});

const status = await page.evaluate(() => window.rigcBallot.status);
const ready = await page.evaluate(() => window.rigcBallot.ready ?? []);
const choices = await page.$$eval('.choice', (bs) => bs.map((b) => b.dataset.choice));
console.log(`STATUS ${status}   READY ${ready.join('/')}   CHOICES ${choices.join('/')}`);
console.log(`PLAYER ${servedLocal ? 'served from the local copy (no network)' : 'fetched from the CDN'}`);

// Let both panes get past t=0 so the photograph is of a ballot mid-play rather
// than of two identical first frames — both candidates state pose A there.
await page.waitForTimeout(1200);

const paneBox = {};
for (const pane of await page.$$('.pane')) {
  const label = (await pane.$eval('h2', (h) => h.textContent.trim())).replace(/\s+/g, ' ');
  paneBox[label] = await pane.boundingBox();
}
console.log(`PANES ${JSON.stringify(Object.keys(paneBox))}`);

await page.screenshot({ path: `${outDir}/ballot-full.png`, fullPage: true });

/**
 * The winner buttons, clipped to the caption and the last button rather than to
 * the flex row (which is the footer's full width, so a row shot scaled into a
 * 600 px film leaves the type five pixels tall).
 *
 * ⭐ Measured BEFORE the click and shot TWICE, before and after, because the
 * film animates a pointer arriving at the B button — and with only the pressed
 * screenshot the button reads as already chosen while the cursor is still on its
 * way over. Two real photographs of the real page, in the order they happened.
 * The clip is safe to reuse: clicking un-hides `#egress` BELOW these rows, so
 * nothing above it moves.
 */
const pad = 7;
const win = await page.evaluate(() => {
  const row = document.querySelector('footer#vote > .row');
  if (row === null) return null;
  const cap = row.querySelector('.caption');
  const btns = [...row.querySelectorAll('.choice')];
  const a = (cap ?? btns[0]).getBoundingClientRect();
  const b = btns[btns.length - 1].getBoundingClientRect();
  return {
    x: a.x,
    y: Math.min(a.y, b.y),
    width: b.x + b.width - a.x,
    height: Math.max(a.bottom, b.bottom) - Math.min(a.y, b.y),
  };
});
if (win === null) throw new Error('the ballot has no winner row');
const clip = { x: win.x - pad, y: win.y - pad, width: win.width + pad * 2, height: win.height + pad * 2 };

await page.screenshot({ path: `${outDir}/ballot-winner-row-pre.png`, clip });

/**
 * Where each button sits INSIDE that shot, in the shot's own device pixels. The
 * film draws a highlight and a pointer onto the screenshot, and those
 * coordinates have to come from the page rather than from me squinting at the
 * PNG — a hand-measured ring that misses by three pixels is the one detail a
 * viewer's eye lands on.
 */
const boxes = await page.evaluate(
  ([cx, cy, dpr]) =>
    [...document.querySelectorAll('footer#vote > .row .choice')].map((b) => {
      const r = b.getBoundingClientRect();
      return {
        choice: b.dataset.choice,
        x: Math.round((r.x - cx) * dpr),
        y: Math.round((r.y - cy) * dpr),
        w: Math.round(r.width * dpr),
        h: Math.round(r.height * dpr),
      };
    }),
  [clip.x, clip.y, 2],
);
writeFileSync(
  `${outDir}/ballot-winner-row.boxes.json`,
  `${JSON.stringify({ shot: 'ballot-winner-row.png', deviceScaleFactor: 2, buttons: boxes }, null, 2)}\n`,
);
console.log(`BOXES ${boxes.map((b) => `${b.choice}=${b.x},${b.y},${b.w}x${b.h}`).join(' ')}`);

// The vote itself, through the page's own controls.
await page.click(`.choice[data-choice="${choice}"]`);
const hasReason = (await page.$('#reason-code')) !== null;
if (hasReason) await page.selectOption('#reason-code', reason);
await page.waitForTimeout(150);

await page.screenshot({ path: `${outDir}/ballot-winner-row.png`, clip });
console.log(`SHOT ballot-winner-row{-pre,}.png  ${Math.round(win.width)}x${Math.round(win.height)} css px`);

// The two control rows together, and the whole page, for the record.
const rows = await page.$$eval('footer#vote > .row', (els) =>
  els.map((e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }),
);
if (rows.length > 0) {
  const x0 = Math.min(...rows.map((r) => r.x));
  const y0 = Math.min(...rows.map((r) => r.y));
  const x1 = Math.max(...rows.map((r) => r.x + r.w));
  const y1 = Math.max(...rows.map((r) => r.y + r.h));
  await page.screenshot({
    path: `${outDir}/ballot-choice.png`,
    clip: { x: x0 - 8, y: y0 - 8, width: x1 - x0 + 16, height: y1 - y0 + 16 },
  });
}
await page.screenshot({ path: `${outDir}/ballot-voted.png`, fullPage: true });
const pressed = await page.$$eval('.choice', (bs) =>
  bs.map((b) => `${b.dataset.choice}=${b.getAttribute('aria-pressed')}`).join(' '),
);
console.log(`PRESSED ${pressed}`);

const json = await page.inputValue('#json');
writeFileSync(`${outDir}/vote-from-browser.json`, json.endsWith('\n') ? json : `${json}\n`);
const parsed = JSON.parse(json);
console.log(`VOTE ballot=${parsed.ballot} choice=${parsed.choice} reason=${parsed.reasonCode ?? parsed.reason_code ?? '(none)'}`);
console.log(`ERRORS ${JSON.stringify(errs)}`);
await browser.close();
