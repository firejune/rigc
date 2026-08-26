// beads.ts <frame...> — orange connected components (bead joints), sorted by y
import { readPlate } from '../../../../tools/plate.ts';
function comps(f: string) {
  const p = readPlate(f);
  const W = p.width, H = p.height;
  const mask = new Uint8Array(W * H);
  for (let i = 0, k = 0; k < W * H; k++, i += 4) {
    const r = p.data[i], g = p.data[i+1], b = p.data[i+2];
    if (r > 130 && r - b > 55 && r - g > 25) mask[k] = 1;
  }
  const lab = new Int32Array(W * H).fill(-1);
  const out: { n: number; cx: number; cy: number; x0: number; x1: number; y0: number; y1: number }[] = [];
  const st: number[] = [];
  for (let k = 0; k < W * H; k++) {
    if (!mask[k] || lab[k] >= 0) continue;
    const id = out.length; st.length = 0; st.push(k); lab[k] = id;
    let n = 0, sx = 0, sy = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
    while (st.length) {
      const q = st.pop()!; const x = q % W, y = (q - x) / W;
      n++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nk = ny * W + nx;
        if (mask[nk] && lab[nk] < 0) { lab[nk] = id; st.push(nk); }
      }
    }
    out.push({ n, cx: sx / n, cy: sy / n, x0, x1, y0, y1 });
  }
  return out.filter(c => c.n >= 8);
}
for (const f of process.argv.slice(2)) {
  const cs = comps(f).sort((a, b) => a.cy - b.cy);
  const name = f.split('/').slice(-1)[0];
  console.log(name + ' ' + cs.map(c => `[${c.cx.toFixed(1)},${c.cy.toFixed(1)} n${c.n} ${c.x1-c.x0+1}x${c.y1-c.y0+1}]`).join(' '));
}
