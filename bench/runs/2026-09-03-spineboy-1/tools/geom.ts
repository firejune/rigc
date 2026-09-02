/**
 * The frames' own coordinate system, read off the sidecar this run is allowed.
 *
 * `bench/reference/spineboy/ess/frames.json` records the world box the frames
 * were drawn in and the scale they were drawn at, so a rig authored in those
 * units renders into that box exactly — which is the framing `check` prefers
 * when a candidate's pixels are measured to land in it.
 */
import { readFileSync } from 'node:fs';

export interface Viewport {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  scale: number;
  width: number;
  height: number;
}

export function readViewport(sidecarPath: string): Viewport {
  const j = JSON.parse(readFileSync(sidecarPath, 'utf8'));
  const v = j.viewport;
  return {
    minX: v.x,
    minY: v.y,
    maxX: v.x + v.width,
    maxY: v.y + v.height,
    scale: v.scale,
    width: v.pixelWidth,
    height: v.pixelHeight,
  };
}

/** World (y up) -> frame pixels (y down). Mirrors `projector` in src/render.ts. */
export function toFrame(v: Viewport, wx: number, wy: number): [number, number] {
  return [(wx - v.minX) * v.scale, (v.maxY - wy) * v.scale];
}

/** Frame pixels (y down) -> world (y up). */
export function toWorld(v: Viewport, px: number, py: number): [number, number] {
  return [v.minX + px / v.scale, v.maxY - py / v.scale];
}

export const DEG = Math.PI / 180;

/** `pose` reports screen degrees, positive clockwise; Spine is CCW. */
export function screenToSpine(deg: number): number {
  return -deg;
}

export function wrap180(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}
