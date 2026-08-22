/**
 * PNG reading for pixel probes.
 *
 * A browser screenshot comes back as a PNG buffer and a pixel assertion has to
 * look at pixels, so 8-bit RGB/RGBA with the five standard filters is all that
 * can come out of one. This started life inside a single probe; a copied decoder
 * is the shape every drift in this project has had, so it lives here instead of
 * being duplicated into the second one.
 *
 * `src/png.ts` reads 26 bytes (the compiler only needs the header) and
 * `tools/plate.ts` decodes into a writable canvas (the plate tools need to draw).
 * This one decodes into a flat buffer for comparison and nothing else.
 */
import { inflateSync } from 'node:zlib';

export function decodePng(buf) {
  let at = 8;
  let width = 0;
  let height = 0;
  let colourType = 6;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    const body = buf.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8) throw new Error(`unsupported bit depth ${body[8]}`);
      colourType = body[9];
      if (body[12] !== 0) throw new Error('interlaced PNG');
    } else if (type === 'IDAT') idat.push(body);
    at += 12 + len;
  }
  const bpp = colourType === 6 ? 4 : colourType === 2 ? 3 : 0;
  if (!bpp) throw new Error(`unsupported colour type ${colourType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp + 1;
  const out = Buffer.alloc(width * height * bpp);
  let prev = Buffer.alloc(width * bpp);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * stride];
    const line = Buffer.from(raw.subarray(y * stride + 1, (y + 1) * stride));
    for (let x = 0; x < width * bpp; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      if (filter === 1) line[x] = (line[x] + a) & 255;
      else if (filter === 2) line[x] = (line[x] + b) & 255;
      else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    line.copy(out, y * width * bpp);
    prev = line;
  }
  return { width, height, bpp, data: out };
}

/** Manhattan distance between two images at one pixel. 8 LSB of slack. */
export function differs(a, b, x, y) {
  if (x < 0 || y < 0 || x >= a.width || y >= a.height) return false;
  const i = (y * a.width + x) * a.bpp;
  let d = 0;
  for (let c = 0; c < a.bpp; c++) d += Math.abs(a.data[i + c] - b.data[i + c]);
  return d > 8;
}
