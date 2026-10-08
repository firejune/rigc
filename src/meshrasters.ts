/**
 * The art-derived rasters one mesh measurement reads — every quantity of
 * `measureMeshQuality`'s raster rows (`src/meshquality.ts`) whose only input is
 * the art: the art bits at the threshold, the filled silhouette at both
 * background connectivities and each one's distance transform, the
 * 4-connected island labels, and the traced outline in drawing pixels.
 *
 * ## Why it is a value and not a cache
 *
 * `reduceMesh` measures one candidate per step against art that never changes
 * within the call, and recomputing these per step was nearly all of its cost
 * (issue #1240: 98.98 % of a 1101-step call's samples in the measurement, at
 * least 40 % in functions of the art alone). So the call takes them once, at
 * admission, and hands this object to every measurement it makes. There is no
 * module-level cache and no hidden state: the object is created by the caller,
 * passed explicitly, and dropped with the call. `measureMeshQuality` itself
 * makes a fresh one per call, so its behaviour is the uncached one.
 *
 * Each quantity is computed on first read and kept, so a measurement that
 * never reaches a row (a source that is not one loop, art under its sample
 * floor) computes no more than it did before. `tally` counts every
 * computation and every measurement handed the object — the count a control
 * reads to see that a reduction computed each quantity once.
 *
 * ## What it is taken at, and the refusal
 *
 * The object holds the `ArtInput` it was made from. A measurement handed it
 * for a different art is refused, not served stale numbers: the mask array,
 * the mask's size, the threshold and the frame's scale and size are each
 * compared, and a difference is `REDUCE_ART_RASTERS_MISMATCH` naming the field,
 * the value the rasters were taken at and the value the input requires
 * (`checkArtRasters`, `src/meshquality.ts`).
 *
 * Not re-exported by `src/mesh.ts`: nothing here is on `spine-rigc/mesh`.
 */
import { artOf, fillEnclosed, labelIslands, MeshError, prunePolygon, squaredDistanceToSet, traceAlphaOutline } from './mesh.ts';
import type { ArtInput } from './meshquality.ts';

/** How many times each quantity was computed, and how many measurements were handed the object. */
export interface ArtRasterTally {
  /** Measurements that read the object (each after its own check). */
  uses: number;
  artBits: number;
  fills: number;
  toFilled8: number;
  toFilled4: number;
  islands: number;
  traced: number;
}

/** The traced art outline in drawing pixels, pruned — or the tracer's refusal, as its message. */
export type TracedArt = { outline: Array<[number, number]> } | { refused: string };

export interface ArtRasters {
  /** The art these were taken from: its mask array, size, threshold and frame. */
  readonly art: ArtInput;
  readonly tally: ArtRasterTally;
  /** `artOf(mask, threshold)`: 1 where alpha >= threshold. */
  artBits(): Uint8Array;
  /** The number of art pixels in `artBits()`. */
  artCount(): number;
  /** `fillEnclosed` of the art at both background connectivities, and whether they differ anywhere. */
  fills(): { fill8: Uint8Array; fill4: Uint8Array; differ: boolean };
  /** `squaredDistanceToSet` of the filled silhouette at one connectivity. */
  toFilled(connectivity: 4 | 8): Float64Array;
  /** `labelIslands` of the art: 4-connected labels, 1-based, and each island's size. */
  islands(): { label: Int32Array; sizes: number[] };
  /** `traceAlphaOutline` at the threshold, carried to drawing pixels by `pageScale` and pruned. */
  traced(): TracedArt;
}

/**
 * The rasters of one art, each computed on first read. Reads nothing at
 * construction, so it may be made before the art is validated; every reader
 * checks it against a validated input first.
 */
export function artRastersOf(art: ArtInput): ArtRasters {
  const tally: ArtRasterTally = { uses: 0, artBits: 0, fills: 0, toFilled8: 0, toFilled4: 0, islands: 0, traced: 0 };
  let bits: { bits: Uint8Array; count: number } | null = null;
  let fills: { fill8: Uint8Array; fill4: Uint8Array; differ: boolean } | null = null;
  let toFilled8: Float64Array | null = null;
  let toFilled4: Float64Array | null = null;
  let islands: { label: Int32Array; sizes: number[] } | null = null;
  let traced: TracedArt | null = null;
  const artBitsOf = (): { bits: Uint8Array; count: number } => {
    if (bits === null) {
      tally.artBits++;
      const b = artOf(art.mask, art.threshold);
      let count = 0;
      for (const bit of b) count += bit;
      bits = { bits: b, count };
    }
    return bits;
  };
  const fillsOf = (): { fill8: Uint8Array; fill4: Uint8Array; differ: boolean } => {
    if (fills === null) {
      tally.fills++;
      const { width: w, height: h } = art.mask;
      const b = artBitsOf().bits;
      const fill8 = fillEnclosed(b, w, h, 8).filled;
      const fill4 = fillEnclosed(b, w, h, 4).filled;
      let differ = false;
      for (let i = 0; i < fill8.length; i++) {
        if (fill8[i] !== fill4[i]) {
          differ = true;
          break;
        }
      }
      fills = { fill8, fill4, differ };
    }
    return fills;
  };
  return {
    art,
    tally,
    artBits: () => artBitsOf().bits,
    artCount: () => artBitsOf().count,
    fills: fillsOf,
    toFilled: (connectivity) => {
      const { width: w, height: h } = art.mask;
      if (connectivity === 8) {
        if (toFilled8 === null) {
          tally.toFilled8++;
          toFilled8 = squaredDistanceToSet(fillsOf().fill8, w, h);
        }
        return toFilled8;
      }
      if (toFilled4 === null) {
        tally.toFilled4++;
        toFilled4 = squaredDistanceToSet(fillsOf().fill4, w, h);
      }
      return toFilled4;
    },
    islands: () => {
      if (islands === null) {
        tally.islands++;
        islands = labelIslands(artBitsOf().bits, art.mask.width, art.mask.height);
      }
      return islands;
    },
    traced: () => {
      if (traced === null) {
        tally.traced++;
        const scale = art.frame.pageScale;
        try {
          const t = traceAlphaOutline(art.mask, art.threshold);
          traced = { outline: prunePolygon(t.outline.map(([x, y]): [number, number] => [x / scale, y / scale])) };
        } catch (err) {
          if (!(err instanceof MeshError)) throw err;
          traced = { refused: err.message };
        }
      }
      return traced;
    },
  };
}
