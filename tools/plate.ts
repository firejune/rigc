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

/**
 * Read an 8-bit RGB/RGBA PNG back into a `Plate`.
 *
 * `src/png.ts` parses 26 bytes because that is all the COMPILER needs, and it
 * stays that way: the compiler never re-measures art. This
 * decoder is for the measuring tools, which is where art measurement belongs -
 * the same division that puts `mesh.center` in the manifest as a measured number
 * rather than as something the compiler derives at build time.
 */
export function decodePng(buf: Uint8Array): Plate {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let at = 8;
  let width = 0;
  let height = 0;
  let colourType = 6;
  const idat: Uint8Array[] = [];
  while (at < buf.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(buf[at + 4], buf[at + 5], buf[at + 6], buf[at + 7]);
    const body = buf.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      if (body[8] !== 8) throw new Error(`unsupported bit depth ${body[8]}`);
      colourType = body[9];
      if (body[12] !== 0) throw new Error('interlaced PNG');
    } else if (type === 'IDAT') idat.push(body);
    at += 12 + len;
  }
  const bpp = colourType === 6 ? 4 : colourType === 2 ? 3 : 0;
  if (!bpp) throw new Error(`unsupported colour type ${colourType}`);
  const raw = new Uint8Array(inflateSync(Buffer.concat(idat.map((c) => Buffer.from(c)))));
  const stride = width * bpp + 1;
  const plate = new Plate(width, height);
  let prev = new Uint8Array(width * bpp);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * stride];
    const line = raw.slice(y * stride + 1, (y + 1) * stride);
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
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      plate.data[o] = line[x * bpp];
      plate.data[o + 1] = line[x * bpp + 1];
      plate.data[o + 2] = line[x * bpp + 2];
      plate.data[o + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return plate;
}

export function readPlate(path: string): Plate {
  return decodePng(readFileSync(path));
}
