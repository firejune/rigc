import { readPngInfo } from '../../../src/png.ts';
import { readPlate } from '../../../tools/plate.ts';
import { readFileSync } from 'node:fs';

const pendulumInfo = readPngInfo('examples/3-timing-and-spacing/images/pendulum.png');
const squareInfo = readPngInfo('examples/3-timing-and-spacing/images/square.png');

console.log('pendulum.png:', pendulumInfo);
console.log('square.png:', squareInfo);

const framesJson = JSON.parse(readFileSync('bench/reference/3-timing-and-spacing/frames.json', 'utf-8'));
console.log('frames.json viewport:', framesJson.viewport);
