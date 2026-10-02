/**
 * Every atlas-region lookup a skeleton's attachments ask for, read off its raw
 * JSON (issue #589) — moved here unchanged from `./validate.ts` (issue #1052),
 * which re-exports it.
 *
 * Its own module because two readers need it and only one of them links the
 * runtime: `A08`'s runtime supplier in `./validate.ts`, and `explain`, which
 * refuses art it cannot pose (`refuseUnposableArt`) and runs in an entry that
 * links nothing of spine-core. The walk names no runtime class — it reads the
 * file, and is measured against the runtime's loader by `PS127`.
 */
import { attachmentRegionLookups, type AttachmentRegionJoin } from './assertions/region_lookups.ts';
import { isObj } from './assertions/values.ts';

/**
 * Every atlas-region lookup `AtlasAttachmentLoader` will perform, read off the
 * RAW skeleton JSON — before the loader is asked, which is the whole point.
 *
 * 🚨 This is a SECOND implementation of a join `spine-core` already performs,
 * and the tree's standing judgment about a second opinion on somebody else's
 * format is that it is measured rather than asserted: `PS127` runs the loader
 * with its `findRegion` recording what it asked for, and compares. A wrong walk
 * here would refuse correct foreign data by name, which is the one failure that
 * would be worse than the silence #589 removed.
 *
 * Which entries resolve a region is the parser's list, not a guess:
 * `SkeletonJson.readAttachment` (`dist/SkeletonJson.js:524-575`) calls the
 * loader with a path for `region`, `mesh` and `linkedmesh` — a linked mesh
 * resolves its own region before the `source` branch — and for nothing else.
 * `type` defaults to `region` (`:527`), `name` to the placeholder (`:526`) and
 * `path` to the name (`:529`, `:560`): three names that default into one
 * another, which is why a report printing only the last of them cannot say
 * what to change.
 */
export function attachmentRegionJoins(raw: unknown): AttachmentRegionJoin[] {
  const joins: AttachmentRegionJoin[] = [];
  if (!isObj(raw) || !Array.isArray(raw.skins)) return joins;
  for (const skin of raw.skins as unknown[]) {
    if (!isObj(skin) || !isObj(skin.attachments)) continue;
    const skinName = typeof skin.name === 'string' ? skin.name : '(unnamed)';
    for (const [slot, entries] of Object.entries(skin.attachments)) {
      if (!isObj(entries)) continue;
      for (const [placeholder, entry] of Object.entries(entries)) {
        if (!isObj(entry)) continue;
        const type = entry.type === undefined ? 'region' : entry.type;
        if (type !== 'region' && type !== 'mesh' && type !== 'linkedmesh') continue;
        const name = typeof entry.name === 'string' ? entry.name : placeholder;
        const path = typeof entry.path === 'string' ? entry.path : name;
        joins.push({ skin: skinName, slot, placeholder, name, lookups: attachmentRegionLookups(entry.sequence, path) });
      }
    }
  }
  return joins;
}
