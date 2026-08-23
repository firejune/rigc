import { join } from 'node:path';
import { loadCandidate, loadFrame, mae, Rigged } from './harness.ts';
const run = join(import.meta.dir, '..');
const rig = new Rigged(loadCandidate(join(run, 'ess', 'spine')));
const ref = loadFrame(join(run, '../../reference/spineboy/ess/idle/f0000.png'));
const plate = rig.render({ bones: {} });
console.log('setup-pose MAE vs idle/f0000:', mae(plate, ref).toFixed(3));
plate.writePng(join(run, "tools", "setup.png"));
