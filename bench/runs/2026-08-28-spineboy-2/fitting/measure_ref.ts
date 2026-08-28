/** Reference change series + boxes per 12fps set — the change bands the plan must land in. */
import { refFrames, changedPixels, inkBox } from './lib.ts';

const sets = ['idle', 'walk', 'run', 'jump', 'shoot', 'hit', 'death', 'aim'];
for (const s of sets) {
  const frames = refFrames(s);
  console.log(`\n== ${s} (${frames.length} frames) ==`);
  const boxes = frames.map((f) => inkBox(f));
  const changes: number[] = [];
  for (let i = 1; i < frames.length; i++) changes.push(changedPixels(frames[i - 1], frames[i]));
  console.log('changes@8:', changes.join(' '));
  const b0 = boxes[0]!, bl = boxes[boxes.length - 1]!;
  console.log(`box f0 (${b0.minX},${b0.minY})-(${b0.maxX},${b0.maxY})  last (${bl.minX},${bl.minY})-(${bl.maxX},${bl.maxY})`);
}
