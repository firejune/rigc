import { readFileSync, writeFileSync } from 'node:fs';

const heavyPoses = JSON.parse(readFileSync('bench/runs/2026-08-24-rung3-1/heavy_poses.json', 'utf-8'));
const lightPoses = JSON.parse(readFileSync('bench/runs/2026-08-24-rung3-1/light_poses.json', 'utf-8'));

const PIVOT_X = 199.0;
const PIVOT_Y = 707.0;
const ATT_X = -307.5;
const ATT_Y = 0;

const SQ_SETUP_X = 381.35;
const SQ_SETUP_Y = 78.6;

// Rig spec
const rigSpec = {
  spec: 'rigc-rig/1',
  name: 'timing-and-spacing',
  images: 'examples/3-timing-and-spacing/images',
  skeleton: {
    width: 2176,
    height: 990,
    fps: 30,
  },
  bones: [
    { name: 'root' },
    { name: 'square', parent: 'root', x: SQ_SETUP_X, y: SQ_SETUP_Y },
    { name: 'pendulum', parent: 'root', x: PIVOT_X, y: PIVOT_Y },
  ],
  slots: [
    { name: 'square', bone: 'square', attachment: 'square' },
    { name: 'pendulum', bone: 'pendulum', attachment: 'pendulum' },
  ],
  skins: {
    default: {
      square: {
        square: { image: 'square.png' },
      },
      pendulum: {
        pendulum: { image: 'pendulum.png', x: ATT_X, y: ATT_Y },
      },
    },
  },
};

writeFileSync(
  'bench/runs/2026-08-24-rung3-1/timing-and-spacing.rig.json',
  JSON.stringify(rigSpec, null, 2)
);
console.log('Written timing-and-spacing.rig.json');

// Build tracks from dense poses or simplified keyframes
// In Spine, every frame pose can be represented as keyframes.
// Let's create keyframes at key inflection points and dense samples where needed.

function makeHeavyTracks(poses: any[]) {
  // Pendulum rotation track
  // Key points:
  // t=0 (0), t=0.0833 (0), t=0.5 (28.5), t=0.75 (108.2), t=1.0 (131.1), t=1.75 (63.3),
  // t=2.5 (107.1), t=3.0833 (81.6), t=3.5 (94.8), t=3.8333 (88.2), t=4.25 (91.5),
  // t=4.4167 (89.8), t=4.6667 (91.4), t=5.0 (90.6), t=5.3333 (90.6)
  
  // Dense / keyframed tracks
  const pKeys = poses.map((p, idx) => ({
    t: p.time,
    v: [p.pRot],
    ...(idx < poses.length - 1 ? { ease: 'smooth' } : {}),
  }));

  // Square translate & rotate
  const sTransKeys = poses.map((p, idx) => ({
    t: p.time,
    v: [Number((p.sX - SQ_SETUP_X).toFixed(2)), Number((p.sY - SQ_SETUP_Y).toFixed(2))],
    ...(idx < poses.length - 1 ? { ease: 'smooth' } : {}),
  }));

  const sRotKeys = poses.map((p, idx) => ({
    t: p.time,
    v: [p.sRot],
    ...(idx < poses.length - 1 ? { ease: 'smooth' } : {}),
  }));

  return [
    {
      bone: 'pendulum',
      property: 'rotate',
      keys: pKeys,
    },
    {
      bone: 'square',
      property: 'translate',
      keys: sTransKeys,
    },
    {
      bone: 'square',
      property: 'rotate',
      keys: sRotKeys,
    },
  ];
}

function makeLightTracks(poses: any[]) {
  const pKeys = poses.map((p, idx) => ({
    t: p.time,
    v: [p.pRot],
    ...(idx < poses.length - 1 ? { ease: 'smooth' } : {}),
  }));

  const sTransKeys = poses.map((p, idx) => ({
    t: p.time,
    v: [Number((p.sX - SQ_SETUP_X).toFixed(2)), Number((p.sY - SQ_SETUP_Y).toFixed(2))],
    ...(idx < poses.length - 1 ? { ease: 'smooth' } : {}),
  }));

  const sRotKeys = poses.map((p, idx) => ({
    t: p.time,
    v: [p.sRot],
    ...(idx < poses.length - 1 ? { ease: 'smooth' } : {}),
  }));

  return [
    {
      bone: 'pendulum',
      property: 'rotate',
      keys: pKeys,
    },
    {
      bone: 'square',
      property: 'translate',
      keys: sTransKeys,
    },
    {
      bone: 'square',
      property: 'rotate',
      keys: sRotKeys,
    },
  ];
}

const motionSpec = {
  spec: 'rigc-motion/1',
  archetype: 'timing-and-spacing',
  cut: 'timing-and-spacing',
  easings: {
    smooth: [0.25, 0.1, 0.25, 1],
    easeIn: [0.42, 0, 1, 1],
    easeOut: [0, 0, 0.58, 1],
  },
  animations: {
    heavy: {
      duration: 64 / 12,
      loop: false,
      tracks: makeHeavyTracks(heavyPoses),
    },
    light: {
      duration: 20 / 12,
      loop: false,
      tracks: makeLightTracks(lightPoses),
    },
  },
};

writeFileSync(
  'bench/runs/2026-08-24-rung3-1/timing-and-spacing.motion.json',
  JSON.stringify(motionSpec, null, 2)
);
console.log('Written timing-and-spacing.motion.json');
