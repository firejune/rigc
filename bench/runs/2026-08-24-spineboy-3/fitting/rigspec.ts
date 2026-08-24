/**
 * Build the rig spec. Bone origins ("anchors") are points in each art file's
 * own frame, seeded from that file's alpha geometry (work/anatomy.ts) and then
 * refined by the global setup fit; the setup pose comes from the five parts the
 * template estimator identifies without ambiguity, with the rest closed
 * kinematically.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const V = JSON.parse(readFileSync('bench/reference/spineboy/ess/frames.json', 'utf8')).viewport;
export const SCALE = V.scale as number;
export const toWorld = (px: number, py: number): [number, number] => [V.x + px / SCALE, V.y + V.height - py / SCALE];
export const toPx = (wx: number, wy: number): [number, number] => [(wx - V.x) * SCALE, (V.y + V.height - wy) * SCALE];

const D = Math.PI / 180;
export const rotv = (th: number, a: number[]): [number, number] => {
  const c = Math.cos(th * D), s = Math.sin(th * D);
  return [c * a[0] - s * a[1], s * a[0] + c * a[1]];
};
export const unrotv = (th: number, v: number[]): [number, number] => {
  const c = Math.cos(th * D), s = Math.sin(th * D);
  return [c * v[0] + s * v[1], -s * v[0] + c * v[1]];
};

/** bone origin inside each art file, art-local, y up, relative to the art centre. */
export const ANCHOR: Record<string, [number, number]> = {
  torso: [0, -72],
  neck: [0, -16],
  head: [-24, -98],
  'front-thigh': [0, 47],
  'front-shin': [0, 70],
  'front-foot': [-35, 17],
  'rear-thigh': [0, 36],
  'rear-shin': [0, 68],
  'rear-foot': [-32, 12],
  'front-upper-arm': [0, 39],
  'front-bracer': [0, 32],
  'front-fist-closed': [0, 31],
  'front-fist-open': [-2, 33],
  'rear-upper-arm': [0, 35],
  'rear-bracer': [0, 29],
  gun: [-32, 50],
};
/** the far end of each limb art, art-local y up — where the next joint sits. */
export const TIP: Record<string, [number, number]> = {
  torso: [0, 76],
  neck: [0, 16],
  'front-thigh': [0, -47],
  'front-shin': [-4, -77],
  'rear-thigh': [0, -38],
  'rear-shin': [-4, -75],
  'front-upper-arm': [0, -39],
  'front-bracer': [0, -32],
  'rear-upper-arm': [0, -35],
  'rear-bracer': [0, -29],
};

/** setup-pose world placement of the parts the estimator identifies cleanly. */
export const SETUP_MATCH: Record<string, { px: [number, number]; th: number }> = {
  torso: { px: [172.75, 270.25], th: -7 },
  head: { px: [187.5, 223.75], th: 2.25 },
  gun: { px: [211.5, 282.75], th: 29.5 },
  'front-shin': { px: [161.5, 313.5], th: -20.25 },
  'rear-shin': { px: [191.75, 312.75], th: 6 },
};

export interface BoneDef { name: string; parent?: string; x?: number; y?: number; rotation?: number; length?: number }

/** angle that points a bone's anchor->tip axis along d, for an art axis of -y. */
export const aimAngle = (d: [number, number]): number => Math.atan2(d[0], -d[1]) / D;

export interface Setup {
  origin: Record<string, [number, number]>;  // world
  rot: Record<string, number>;               // world degrees
}

export function buildSetup(): Setup {
  const origin: Record<string, [number, number]> = {};
  const rot: Record<string, number> = {};
  const place = (part: string) => {
    const m = SETUP_MATCH[part];
    const c = toWorld(m.px[0], m.px[1]);
    rot[part] = m.th;
    const d = rotv(m.th, ANCHOR[part]);
    origin[part] = [c[0] + d[0], c[1] + d[1]];
  };
  for (const p of Object.keys(SETUP_MATCH)) place(p);
  // hip: the torso's own origin
  origin['hip'] = origin['torso'];
  rot['hip'] = 0;
  // knees / ankles from the shins
  for (const side of ['front', 'rear'] as const) {
    const shin = `${side}-shin`;
    const cShin = toWorld(SETUP_MATCH[shin].px[0], SETUP_MATCH[shin].px[1]);
    const knee = origin[shin];
    const tip = rotv(rot[shin], TIP[shin]);
    const ankle: [number, number] = [cShin[0] + tip[0], cShin[1] + tip[1]];
    const thigh = `${side}-thigh`;
    origin[thigh] = origin['hip'];
    rot[thigh] = aimAngle([knee[0] - origin['hip'][0], knee[1] - origin['hip'][1]]);
    origin[`${side}-foot`] = ankle;
    rot[`${side}-foot`] = 0;
  }
  // neck + head off the torso's top
  const cTorso = toWorld(SETUP_MATCH.torso.px[0], SETUP_MATCH.torso.px[1]);
  const shoulderLine = rotv(rot['torso'], TIP['torso']);
  origin['neck'] = [cTorso[0] + shoulderLine[0], cTorso[1] + shoulderLine[1]];
  rot['neck'] = rot['torso'];
  const cHead = toWorld(SETUP_MATCH.head.px[0], SETUP_MATCH.head.px[1]);
  const headAnchor = rotv(rot['head'] ?? 0, ANCHOR['head']);
  origin['head'] = [cHead[0] + headAnchor[0], cHead[1] + headAnchor[1]];
  // shoulders, in torso-local
  const shoulder = (dx: number, dy: number): [number, number] => {
    const d = rotv(rot['torso'], [dx, dy]);
    return [origin['torso'][0] + d[0], origin['torso'][1] + d[1]];
  };
  origin['front-upper-arm'] = shoulder(14, 118);
  origin['rear-upper-arm'] = shoulder(-8, 116);
  // rear arm closes on the gun's grip by two-link IK
  const wrist = origin['gun'];
  const ik = twoLink(origin['rear-upper-arm'], wrist, 70, 58, +1);
  rot['rear-upper-arm'] = ik.a;
  rot['rear-bracer'] = ik.b;
  origin['rear-bracer'] = ik.mid;
  rot['gun'] = SETUP_MATCH.gun.th;
  // front arm: hangs and forward, refined by the fit
  rot['front-upper-arm'] = 20;
  const elbowF = step(origin['front-upper-arm'], rot['front-upper-arm'], 74);
  origin['front-bracer'] = elbowF;
  rot['front-bracer'] = 55;
  origin['front-fist'] = step(elbowF, rot['front-bracer'], 62);
  rot['front-fist'] = 55;
  return { origin, rot };
}

export function step(from: [number, number], th: number, len: number): [number, number] {
  const d = rotv(th, [0, -len]);
  return [from[0] + d[0], from[1] + d[1]];
}

/** two-link IK: returns the two world angles and the mid joint. */
export function twoLink(a: [number, number], c: [number, number], l1: number, l2: number, sign: number): { a: number; b: number; mid: [number, number] } {
  const dx = c[0] - a[0], dy = c[1] - a[1];
  const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 1e-3);
  const base = Math.atan2(dx, -dy) / D;
  const cosA = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const A = (Math.acos(cosA) / D) * sign;
  const th1 = base + A;
  const mid = step(a, th1, l1);
  const th2 = aimAngle([c[0] - mid[0], c[1] - mid[1]]);
  return { a: th1, b: th2, mid };
}
