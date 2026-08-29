/**
 * PNG header reader.
 *
 * The only things rigc needs from a part PNG are its true pixel size and whether
 * it can draw a transparent pixel. The size is in the IHDR chunk that every PNG
 * puts first; transparency is in the IHDR's colour type OR in a `tRNS` chunk a
 * little further in, so the reader walks the file's small leading chunks and
 * stops at the pixel data. That keeps the compiler dependency-free — no image
 * library, and nothing on the module path but rigc itself — while still reading
 * every place the answer can be written down.
 *
 * ⚠️ It reads a header, not an image: "can this file draw a transparent pixel",
 * never "does it". Whether the art actually has a transparent margin is a
 * question about pixels, and the tools that measure pixels decode the whole file
 * ([`tools/plate.ts`](../tools/plate.ts)).
 *
 * Measuring instead of trusting is the whole point: an atlas `size:` that
 * disagrees with the file loads clean and collapses the UVs silently.
 */
import { readFileSync } from 'node:fs';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * PNG colour types that carry a per-pixel alpha channel.
 *
 * ⭐ False here does NOT mean opaque, and reading it that way is what #215 was:
 * types 0, 2 and 3 can all carry a `tRNS` chunk instead — a palette alpha table
 * for indexed art, one invisible colour for the other two — and indexed+tRNS is
 * the ordinary output of ImageMagick, Photoshop's PNG-8 export, GIMP's indexed
 * mode, aseprite and pngquant. `hasTransparency` is the field to judge art by;
 * this one answers the narrower question of where the alpha is stored.
 */
const COLOUR_TYPE_HAS_ALPHA: Record<number, boolean> = {
  0: false, // greyscale
  2: false, // truecolour
  3: false, // indexed (transparency, if any, is in tRNS)
  4: true, // greyscale + alpha
  6: true, // truecolour + alpha
};

/** The spec's name for each colour type, for messages that have to name one. */
const COLOUR_TYPE_NAMES: Record<number, string> = {
  0: 'greyscale',
  2: 'truecolour',
  3: 'indexed',
  4: 'greyscale + alpha',
  6: 'truecolour + alpha',
};

/** How to say a colour type out loud. Unknown types print as themselves. */
export function colourTypeName(colourType: number): string {
  return COLOUR_TYPE_NAMES[colourType] ?? 'unrecognised';
}

export interface PngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colourType: number;
  /** A per-pixel alpha channel in the pixel data: colour types 4 and 6, and only those. */
  hasAlpha: boolean;
  /** A `tRNS` chunk: a palette alpha table (type 3), or one invisible colour (types 0 and 2). */
  hasTrns: boolean;
  /** Either of the above — the file is able to draw a transparent pixel. */
  hasTransparency: boolean;
}

/**
 * Walk the chunk list looking for `tRNS`, stopping where it can no longer appear.
 *
 * The spec orders `tRNS` after `PLTE` and before the first `IDAT`, so this reads
 * only the file's small leading chunks and never touches the compressed bulk. A
 * length that would run past the end of the file ends the walk rather than
 * throwing: a truncated PNG is A17 and A06's business, and answering "no tRNS"
 * about a file nobody can open is the same answer either way.
 */
function scanForTrns(buf: Buffer): boolean {
  let at = 8; // past the signature; the first chunk is IHDR
  while (at + 8 <= buf.length) {
    const length = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    if (type === 'tRNS') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    const next = at + 12 + length; // 4 length + 4 type + body + 4 CRC
    if (next <= at || next > buf.length) return false;
    at = next;
  }
  return false;
}

export function readPngInfo(path: string): PngInfo {
  const buf = readFileSync(path);
  if (buf.length < 26) throw new Error(`not a PNG (too short): ${path}`);
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (buf[i] !== SIGNATURE[i]) throw new Error(`not a PNG (bad signature): ${path}`);
  }
  if (buf.toString('latin1', 12, 16) !== 'IHDR') {
    throw new Error(`PNG does not start with IHDR: ${path}`);
  }
  const colourType = buf.readUInt8(25);
  const hasAlpha = COLOUR_TYPE_HAS_ALPHA[colourType] ?? false;
  // A file with an alpha channel cannot also carry tRNS, so the scan is skipped
  // for the types that already answered — which is every PNG rigc itself writes.
  const hasTrns = hasAlpha ? false : scanForTrns(buf);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf.readUInt8(24),
    colourType,
    hasAlpha,
    hasTrns,
    hasTransparency: hasAlpha || hasTrns,
  };
}
