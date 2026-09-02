/**
 * Give the three shots that open (or close) on the rest pose the same rest pose.
 *
 * The brief states, and the frames show, that `fall-in`'s last frame, `hello`'s
 * first and `cape-follow-example`'s first are one standing pose: their
 * silhouettes differ by **9, 22 and 31 pixels** out of ~10,245 at the 8/255 mask
 * threshold. A rig whose three openings disagree by more than that is wrong
 * about something the frames settle — and the inherited spec's did, by a lot:
 * the collar's opening key in `hello`, `cape-follow-example` and `walk` all sit
 * within a few units of (150, -180) at ~40 degrees and ~0.8 scale, which is one
 * seed a per-frame fitter never escaped in three of the four shots, while
 * `fall-in` found the collar at its own art size and 0 degrees.
 *
 * So: copy one shot's pose onto another's frame, bone by bone, compensating the
 * translation of every bone parented to `body` for the two shots' different
 * `body` keys, so the copy lands in the same place on screen rather than in the
 * same place in the parent. Bones inside the sack chain carry rotate/scale only
 * and copy across unchanged.
 *
 * This writes a seed, not an answer: `tools/refit.ts` then descends from it
 * against the frames, per frame.
 *
 * usage:
 *   bun tools/share-rest-pose.ts --motion <in> --out <out>
 *     --from <anim>:<t> --to <anim>:<t>[,<anim>:<t>...] [--bones a,b,c]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Key {
  t: number;
  v: number[];
  ease?: string;
}
interface Track {
  bone: string;
  property: 'translate' | 'rotate' | 'scale';
  keys: Key[];
}

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? undefined : process.argv[at + 1];
}

/** The key of one track nearest a time, or null past half a 24 fps interval. */
function keyAt(tracks: Track[], bone: string, property: Track['property'], t: number): Key | null {
  const track = tracks.find((k) => k.bone === bone && k.property === property);
  if (!track) return null;
  let best: Key | null = null;
  let gap = Infinity;
  for (const key of track.keys) {
    const d = Math.abs(key.t - t);
    if (d < gap) {
      gap = d;
      best = key;
    }
  }
  return best && gap <= 1 / 24 ? best : null;
}

function main(): void {
  const motionPath = resolve(flag('motion') as string);
  const outPath = resolve(flag('out') as string);
  const [fromAnim, fromT] = (flag('from') as string).split(':');
  const targets = (flag('to') as string).split(',').map((s) => s.split(':'));
  const bones = (flag('bones') ?? 'sack1,sack2,sack3,sack4,collar,panel').split(',');
  /** Bones whose translate is in `body`'s space, so a body difference must be undone. */
  const underBody = new Set(['sack1', 'collar', 'panel']);

  const motion = JSON.parse(readFileSync(motionPath, 'utf8'));
  const source = motion.animations[fromAnim].tracks as Track[];
  const sourceBody = keyAt(source, 'body', 'translate', Number(fromT));
  if (!sourceBody) throw new Error(`no body translate key near ${fromAnim}:${fromT}`);

  for (const [anim, at] of targets) {
    const t = Number(at);
    const tracks = motion.animations[anim].tracks as Track[];
    const body = keyAt(tracks, 'body', 'translate', t);
    if (!body) throw new Error(`no body translate key near ${anim}:${t}`);
    const shift = [sourceBody.v[0] - body.v[0], sourceBody.v[1] - body.v[1]];
    for (const bone of bones) {
      for (const property of ['translate', 'rotate', 'scale'] as const) {
        const from = keyAt(source, bone, property, Number(fromT));
        const into = keyAt(tracks, bone, property, t);
        if (!from || !into) {
          console.log(`  skip ${anim} ${bone}/${property} — ${!from ? 'no source key' : 'no target key'}`);
          continue;
        }
        const was = into.v.slice();
        if (property === 'translate' && underBody.has(bone)) {
          into.v = [from.v[0] + shift[0], from.v[1] + shift[1]];
        } else {
          into.v = from.v.slice();
        }
        console.log(
          `  ${anim}@${t} ${bone}/${property}  [${was.map((n) => n.toFixed(2)).join(', ')}] -> ` +
            `[${into.v.map((n) => n.toFixed(2)).join(', ')}]`,
        );
      }
    }
  }
  writeFileSync(outPath, `${JSON.stringify(motion, null, 1)}\n`);
  console.log(`wrote ${outPath}`);
}

main();
