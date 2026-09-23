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

function hexBytes(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

/** The signature every PNG begins with, as the messages below print it. */
const PNG_SIGNATURE_HEX = hexBytes(Uint8Array.from(SIGNATURE));

function startsWith(buf: Uint8Array, at: number, bytes: ReadonlyArray<number>): boolean {
  if (buf.length < at + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) if (buf[at + i] !== bytes[i]) return false;
  return true;
}

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

/**
 * The image formats a page file is found to be in instead, by their own
 * signatures. Each entry is the format's fixed leading bytes and nothing
 * inferred from them — rigc decodes none of these, so the one honest thing to
 * say about such a file is what its first bytes are.
 *
 * ⭐ Named at all because a file's NAME is not evidence (issue #732): a
 * production pack shipped WebP pages called `*.png`, and "bad signature" sent
 * the author to look for corruption in a well-formed image of another format.
 */
const OTHER_FORMATS: ReadonlyArray<{ name: string; matches: (buf: Uint8Array) => boolean }> = [
  // A RIFF container with the form type at byte 8. The first chunk's FourCC
  // (`VP8 `, `VP8L`, `VP8X`) is printed beside it by `whatItIs`, never read.
  { name: 'WebP', matches: (buf) => startsWith(buf, 0, ascii('RIFF')) && startsWith(buf, 8, ascii('WEBP')) },
  { name: 'JPEG', matches: (buf) => startsWith(buf, 0, [0xff, 0xd8, 0xff]) },
  { name: 'GIF', matches: (buf) => startsWith(buf, 0, ascii('GIF87a')) || startsWith(buf, 0, ascii('GIF89a')) },
  { name: 'KTX', matches: (buf) => startsWith(buf, 0, [0xab, ...ascii('KTX 11'), 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { name: 'KTX2', matches: (buf) => startsWith(buf, 0, [0xab, ...ascii('KTX 20'), 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]) },
];

/** What a file that does not begin with the PNG signature is, as a phrase. */
function whatItIs(buf: Uint8Array): string {
  const found = OTHER_FORMATS.find((format) => format.matches(buf));
  if (found === undefined) {
    return (
      'in no image format rigc recognises by its signature (it names ' +
      `${OTHER_FORMATS.map((format) => format.name).join(', ')} when it meets them)`
    );
  }
  if (found.name === 'WebP' && buf.length >= 16) {
    const chunk = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);
    return `a WebP image (a RIFF/WEBP container whose first chunk is ${JSON.stringify(chunk)})`;
  }
  return `a ${found.name} image`;
}

/**
 * Why the bytes at `path` are not a PNG rigc can read, as one sentence — or
 * `null` when they are.
 *
 * 🔒 **The one reader of a page file's identity** (issue #732). Every reader of
 * a page goes through it: `readPngInfo` and `readPngHeader` below (the size
 * `A06` judges, the alpha `A19` judges on a one-part page, the sizes the
 * compiler takes from a loose part or a pack's page) and `readPlate` in
 * [`tools/plate.ts`](../tools/plate.ts) (the renderer, `A19`'s scan of a shared
 * page, the region lift and the packer). Before it, one WebP page reached the
 * gate as `A06`'s `threw: not a PNG (bad signature)` and `A19`'s `threw: cannot
 * decode PNG …: unexpected end of file`, and reached `build --atlas-in` as a
 * stack trace — three sentences about one file, and none said what it was.
 *
 * It says three things and decodes nothing: what the file is instead (by the
 * signature it does carry, with its first bytes in hex either way), whether a
 * file that begins as a PNG ends before its chunks do, and whether IHDR comes
 * first. The chunk walk reads only the eight-byte chunk headers, so it costs a
 * skip through the file and no inflate.
 *
 * ⚠️ **"Truncated" is judged by the chunk walk, not by a length floor.** The
 * floor that stood here (`buf.length < 26`, "too short") never said truncated,
 * and a PNG cut anywhere after its IHDR passed it: measured on a packed page
 * cut to 60 bytes, the default profile built it green and wrote a skeleton
 * whose page no reader could decode. A PNG ends at its IEND chunk, so a file
 * that runs out first is truncated wherever it runs out.
 */
export function pngProblem(buf: Uint8Array, path: string): string | null {
  if (buf.length === 0) return `${path} is empty (0 bytes), and a PNG's first 8 bytes are ${PNG_SIGNATURE_HEX}`;
  if (!startsWith(buf, 0, SIGNATURE.slice(0, Math.min(buf.length, SIGNATURE.length)))) {
    const shown = buf.subarray(0, 12);
    const byName = /\.png$/i.test(path) ? '; its name ends in .png, and it is the bytes that decide what a file is' : '';
    return (
      `${path} is ${whatItIs(buf)}, not a PNG: its first ${shown.length} byte(s) are ${hexBytes(shown)}, where a ` +
      `PNG's first 8 are ${PNG_SIGNATURE_HEX}${byName}. rigc reads PNG and nothing else — its page-size and alpha ` +
      'readers, its renderer and its region lift all decode PNG, and it links no decoder for any other format — ' +
      'so nothing in this file was measured. Re-export it as PNG'
    );
  }
  const truncated = (where: string): string =>
    `${path} is a truncated PNG: it is ${buf.length} byte(s) long and ${where}, so no reader can decode it. ` +
    'Re-export or re-copy the file whole';
  if (buf.length < SIGNATURE.length) return truncated(`ends ${buf.length} byte(s) into the 8-byte PNG signature`);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let at = SIGNATURE.length;
  let previous = 'the signature';
  for (;;) {
    if (at + 8 > buf.length) {
      return truncated(
        at === buf.length
          ? `ends after ${previous} with no IEND chunk`
          : `ends ${buf.length - at} byte(s) into the header of the chunk after ${previous}`,
      );
    }
    const length = view.getUint32(at);
    const type = String.fromCharCode(buf[at + 4], buf[at + 5], buf[at + 6], buf[at + 7]);
    if (at === SIGNATURE.length && type !== 'IHDR') {
      return `${path} is a PNG whose first chunk is ${JSON.stringify(type)} rather than the IHDR the format requires first`;
    }
    if (type === 'IHDR' && length !== 13) {
      return `${path} is a PNG whose IHDR chunk declares ${length} byte(s) of data, where the format's is 13`;
    }
    const next = at + 12 + length; // 4 length + 4 type + body + 4 CRC
    if (next > buf.length) {
      return truncated(
        `its ${type} chunk at byte ${at} declares ${length} byte(s) of data, which with its CRC runs to byte ${next}`,
      );
    }
    if (type === 'IEND') return null;
    previous = `its ${type} chunk at byte ${at}`;
    at = next;
  }
}

/**
 * A file that is not a PNG rigc can read, thrown by the readers that return a
 * value or nothing (`readPngInfo`, `readPlate`). The message is `pngProblem`'s,
 * whole; a caller that owns a named failure — the gate, a `CompileError` —
 * reads the sentence instead of catching the throw (`readPngHeader`).
 */
export class NotAPngError extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(message);
    this.name = 'NotAPngError';
    this.path = path;
  }
}

/** `pngProblem` as a refusal, for the readers that return a value or throw. */
export function assertPng(buf: Uint8Array, path: string): void {
  const problem = pngProblem(buf, path);
  if (problem !== null) throw new NotAPngError(path, problem);
}

/**
 * A page's header, or the sentence that says why it has none — for a caller
 * whose failures are named rather than thrown.
 */
export function readPngHeader(path: string): { info: PngInfo; problem: null } | { info: null; problem: string } {
  const buf = readFileSync(path);
  const problem = pngProblem(buf, path);
  return problem === null ? { info: headerOf(buf), problem: null } : { info: null, problem };
}

export function readPngInfo(path: string): PngInfo {
  const buf = readFileSync(path);
  assertPng(buf, path);
  return headerOf(buf);
}

/** The IHDR fields of a file `pngProblem` has already accepted. */
function headerOf(buf: Buffer): PngInfo {
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
