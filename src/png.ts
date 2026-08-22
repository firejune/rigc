/**
 * PNG header reader.
 *
 * The only thing rigc needs from a part PNG is its true pixel size and whether
 * it carries an alpha channel, and both live in the IHDR chunk that every PNG
 * puts first. Parsing 26 bytes keeps the compiler dependency-free: no image
 * library, and nothing on the module path but rigc itself.
 *
 * Measuring instead of trusting is the whole point: an atlas `size:` that
 * disagrees with the file loads clean and collapses the UVs silently.
 */
import { readFileSync } from 'node:fs';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** PNG colour types that carry a per-pixel alpha channel. */
const COLOUR_TYPE_HAS_ALPHA: Record<number, boolean> = {
  0: false, // greyscale
  2: false, // truecolour
  3: false, // indexed (may have tRNS, but not a straight alpha channel)
  4: true, // greyscale + alpha
  6: true, // truecolour + alpha
};

export interface PngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colourType: number;
  hasAlpha: boolean;
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
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf.readUInt8(24),
    colourType,
    hasAlpha: COLOUR_TYPE_HAS_ALPHA[colourType] ?? false,
  };
}
