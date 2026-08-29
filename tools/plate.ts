/**
 * Minimal RGBA canvas + PNG writer.
 *
 * `src/png.ts` reads 26 bytes of header because that is all the compiler needs;
 * this writes whole files, because a rig has to have something to point at
 * before its art exists — synthetic stand-in plates, reference frames, the
 * selftest's own fixtures. Node's zlib is the only thing it leans on, so the
 * rigc package still has exactly one dependency.
 *
 * Straight (non-premultiplied) alpha, colour type 6. Premultiplied alpha is the
 * single most consequential export setting to get wrong — the renderer does not
 * un-premultiply, so every part gains a dark rim — and a writer that cannot
 * produce it is the cheapest possible guarantee.
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { drawText, textWidth } from './font5x7.ts';

export type RGBA = [number, number, number, number];

export class Plate {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  /** Source-over composite of one pixel. Alpha in 0..255. */
  blend(x: number, y: number, [r, g, b, a]: RGBA): void {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    if (a <= 0) return;
    const i = (py * this.width + px) * 4;
    const sa = a / 255;
    const da = this.data[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    for (let c = 0; c < 3; c++) {
      const sc = [r, g, b][c];
      this.data[i + c] = Math.round((sc * sa + this.data[i + c] * da * (1 - sa)) / oa);
    }
    this.data[i + 3] = Math.round(oa * 255);
  }

  /** Overwrite one pixel outright, alpha included. */
  set(x: number, y: number, [r, g, b, a]: RGBA): void {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    const i = (py * this.width + px) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }

  get(x: number, y: number): RGBA {
    const i = (y * this.width + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  /** Multiply the whole plate's alpha by a per-pixel factor in 0..1. */
  maskAlpha(f: (x: number, y: number) => number): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = (y * this.width + x) * 4;
        const k = Math.max(0, Math.min(1, f(x, y)));
        this.data[i + 3] = Math.round(this.data[i + 3] * k);
      }
    }
  }

  rect(x0: number, y0: number, w: number, h: number, colour: RGBA): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.blend(x, y, colour);
  }

  frame(x0: number, y0: number, w: number, h: number, t: number, colour: RGBA): void {
    this.rect(x0, y0, w, t, colour);
    this.rect(x0, y0 + h - t, w, t, colour);
    this.rect(x0, y0, t, h, colour);
    this.rect(x0 + w - t, y0, t, h, colour);
  }

  line(x0: number, y0: number, x1: number, y1: number, t: number, colour: RGBA): void {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2 + 1;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const cx = x0 + (x1 - x0) * u;
      const cy = y0 + (y1 - y0) * u;
      for (let dy = -t; dy <= t; dy++) for (let dx = -t; dx <= t; dx++) this.blend(cx + dx, cy + dy, colour);
    }
  }

  disc(cx: number, cy: number, r: number, colour: RGBA): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (Math.hypot(x - cx, y - cy) <= r) this.blend(x, y, colour);
      }
    }
  }

  ring(cx: number, cy: number, r: number, t: number, colour: RGBA): void {
    for (let y = Math.floor(cy - r - t); y <= Math.ceil(cy + r + t); y++) {
      for (let x = Math.floor(cx - r - t); x <= Math.ceil(cx + r + t); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (Math.abs(d - r) <= t) this.blend(x, y, colour);
      }
    }
  }

  text(str: string, x: number, y: number, scale: number, colour: RGBA): void {
    drawText(str, x, y, scale, (px, py) => this.blend(px, py, colour));
  }

  textCentred(str: string, cx: number, y: number, scale: number, colour: RGBA): void {
    this.text(str, Math.round(cx - textWidth(str, scale) / 2), y, scale, colour);
  }

  /** Alpha-weighted pixel count, and how much of it sits outside a predicate. */
  alphaStats(inside: (x: number, y: number) => boolean): {
    total: number;
    outside: number;
    outsideMaxAlpha: number;
  } {
    let total = 0;
    let outside = 0;
    let outsideMaxAlpha = 0;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const a = this.data[(y * this.width + x) * 4 + 3];
        if (a === 0) continue;
        total++;
        if (!inside(x, y)) {
          outside++;
          if (a > outsideMaxAlpha) outsideMaxAlpha = a;
        }
      }
    }
    return { total, outside, outsideMaxAlpha };
  }

  writePng(path: string): void {
    writeFileSync(path, encodePng(this.width, this.height, this.data));
  }
}

// ---------------------------------------------------------------------------
// PNG encoding
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** The eight bytes every PNG opens with. */
export const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * One PNG chunk: length, type, body, CRC.
 *
 * Exported because this writer only ever emits colour type 6, and the selftest
 * has to produce the colour types it does NOT — indexed and greyscale, with and
 * without a `tRNS` chunk — to have anything for `A19` to judge. Building those by
 * hand needs the CRC table, and a second copy of it in the test would be a second
 * thing that can be wrong.
 */
export function pngChunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(body.length + 8, crc32(out.subarray(4, body.length + 8)));
  return out;
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  // Filter type 0 (none) on every scanline. The plates are flat colour and
  // deterministic output is worth more here than a few kilobytes.
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour + alpha
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const parts = [
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))),
    pngChunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// PNG decoding
// ---------------------------------------------------------------------------

/** Samples per pixel for each PNG colour type. Anything else is not a colour type. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** The bit depths the PNG spec allows for each colour type. */
const BIT_DEPTHS: Record<number, number[]> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};

/**
 * Read one sample out of an unfiltered scanline, at the file's own bit depth.
 *
 * Returns the RAW value — 0..1 for a 1-bit file, 0..65535 for a 16-bit one — not
 * a scaled byte. Two callers need it that way: a palette index IS the raw value,
 * and a `tRNS` colour is declared at the file's depth and has to be compared
 * against samples at that depth, not against something already rounded to 8 bits.
 */
function sampleAt(line: Uint8Array, index: number, bitDepth: number): number {
  if (bitDepth === 8) return line[index];
  if (bitDepth === 16) return (line[index * 2] << 8) | line[index * 2 + 1];
  const perByte = 8 / bitDepth;
  const byte = line[Math.floor(index / perByte)];
  // Sub-byte samples are packed most-significant first.
  const shift = 8 - bitDepth * ((index % perByte) + 1);
  return (byte >> shift) & ((1 << bitDepth) - 1);
}

/** A raw sample scaled to 0..255, the range a `Plate` stores. */
function toByte(sample: number, bitDepth: number): number {
  if (bitDepth === 8) return sample;
  if (bitDepth === 16) return sample >> 8;
  return Math.round((sample * 255) / ((1 << bitDepth) - 1));
}

/**
 * Read a PNG back into a `Plate`, expanding whatever it is to straight RGBA.
 *
 * `src/png.ts` parses 26 bytes because that is all the COMPILER needs, and it
 * stays that way: the compiler never re-measures art. This
 * decoder is for the measuring tools, which is where art measurement belongs -
 * the same division that puts `mesh.center` in the manifest as a measured number
 * rather than as something the compiler derives at build time.
 *
 * ⭐ **Every colour type the gate accepts is decodable here** (issue #226). It
 * used to read colour types 2 and 6 only, which was the compiler's own old blind
 * spot rebuilt one step later: `A19` learned in #215 that indexed and greyscale
 * art carrying a `tRNS` chunk is ordinary transparent art — ImageMagick, PNG-8
 * export, GIMP indexed, aseprite and pngquant all write it — so such a part
 * builds and validates green, and would then have been refused by the one command
 * whose whole job is to show the author what they built. A wall removed at the
 * gate and rebuilt at the picture is not a wall removed.
 *
 * So the expansion happens here, at decode: a palette index becomes its `PLTE`
 * entry with its `tRNS` alpha, a greyscale sample becomes three equal channels,
 * and a `tRNS` colour on a type 0 or 2 file becomes alpha 0 on the pixels that
 * match it. Every caller above this line keeps seeing exactly one thing, RGBA.
 *
 * Interlaced files are still refused: Adam7 is a second sample layout rather than
 * a second sample format, and no tool in the corpus writes one.
 */
export function decodePng(buf: Uint8Array): Plate {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let at = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colourType = 6;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (at + 8 <= buf.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(buf[at + 4], buf[at + 5], buf[at + 6], buf[at + 7]);
    const body = buf.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      bitDepth = body[8];
      colourType = body[9];
      if (body[12] !== 0) throw new Error('interlaced PNG');
    } else if (type === 'PLTE') palette = body.slice();
    else if (type === 'tRNS') trns = body.slice();
    else if (type === 'IDAT') idat.push(body);
    at += 12 + len;
  }
  const channels = CHANNELS[colourType];
  if (channels === undefined) throw new Error(`unsupported colour type ${colourType}`);
  if (!BIT_DEPTHS[colourType].includes(bitDepth)) {
    throw new Error(`bit depth ${bitDepth} is not one PNG allows for colour type ${colourType}`);
  }
  if (colourType === 3 && palette === null) throw new Error('indexed PNG with no PLTE chunk');
  // Const copies so the null checks above narrow inside the per-pixel loop below,
  // where `palette` and `trns` are still the chunk loop's mutable bindings.
  const pal = palette ?? new Uint8Array(0);
  const alphaTable = trns;

  const raw = new Uint8Array(inflateSync(Buffer.concat(idat.map((c) => Buffer.from(c)))));
  // The filter operates on BYTES, and its "left neighbour" is one whole pixel
  // back — rounded up to a byte, so sub-byte depths compare against the byte
  // immediately to the left.
  const filterUnit = Math.max(1, Math.ceil((channels * bitDepth) / 8));
  const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
  const stride = rowBytes + 1;
  const plate = new Plate(width, height);
  let prev = new Uint8Array(rowBytes);
  // On a type 0 or 2 file a `tRNS` chunk names ONE invisible colour, one
  // big-endian 16-bit sample per channel whatever the file's own depth. (For an
  // indexed file the same chunk is something else entirely: one alpha byte per
  // palette entry, read directly below.)
  const trnsSample = (i: number): number =>
    alphaTable === null ? -1 : (alphaTable[i * 2] << 8) | alphaTable[i * 2 + 1];
  for (let y = 0; y < height; y++) {
    const filter = raw[y * stride];
    const line = raw.slice(y * stride + 1, (y + 1) * stride);
    for (let x = 0; x < rowBytes; x++) {
      const a = x >= filterUnit ? line[x - filterUnit] : 0;
      const b = prev[x];
      const c = x >= filterUnit ? prev[x - filterUnit] : 0;
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
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const first = x * channels;
      if (colourType === 3) {
        const index = sampleAt(line, first, bitDepth);
        plate.data[o] = pal[index * 3];
        plate.data[o + 1] = pal[index * 3 + 1];
        plate.data[o + 2] = pal[index * 3 + 2];
        // A tRNS shorter than the palette leaves the entries past its end opaque,
        // which is what the spec says and what pngquant relies on.
        plate.data[o + 3] = alphaTable !== null && index < alphaTable.length ? alphaTable[index] : 255;
        continue;
      }
      if (colourType === 0 || colourType === 4) {
        const grey = sampleAt(line, first, bitDepth);
        const g = toByte(grey, bitDepth);
        plate.data[o] = g;
        plate.data[o + 1] = g;
        plate.data[o + 2] = g;
        plate.data[o + 3] =
          colourType === 4
            ? toByte(sampleAt(line, first + 1, bitDepth), bitDepth)
            : alphaTable !== null && alphaTable.length >= 2 && trnsSample(0) === grey
              ? 0
              : 255;
        continue;
      }
      const r = sampleAt(line, first, bitDepth);
      const g = sampleAt(line, first + 1, bitDepth);
      const b = sampleAt(line, first + 2, bitDepth);
      plate.data[o] = toByte(r, bitDepth);
      plate.data[o + 1] = toByte(g, bitDepth);
      plate.data[o + 2] = toByte(b, bitDepth);
      plate.data[o + 3] =
        colourType === 6
          ? toByte(sampleAt(line, first + 3, bitDepth), bitDepth)
          : alphaTable !== null &&
              alphaTable.length >= 6 &&
              trnsSample(0) === r &&
              trnsSample(1) === g &&
              trnsSample(2) === b
            ? 0
            : 255;
    }
    prev = line;
  }
  return plate;
}

/**
 * Decode the PNG at `path`, naming the file if it cannot be decoded.
 *
 * The bare message says what is wrong with the bytes and nothing about which
 * bytes; a rig has as many pages as it has parts, and "unsupported colour type 5"
 * with no path is a search rather than a fix.
 */
export function readPlate(path: string): Plate {
  // Only the DECODE is wrapped. A missing file already says which one, and
  // rewording an ENOENT as a decoding problem would mislabel the commonest
  // failure of all.
  const buf = readFileSync(path);
  try {
    return decodePng(buf);
  } catch (err) {
    throw new Error(`cannot decode PNG ${path}: ${(err as Error).message}`);
  }
}
