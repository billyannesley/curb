// A plain herding bot. It is not clever: it finds the busiest patch of
// leaves, walks behind it and pushes one long stroke home, then repeats. It exists
// so the tests can prove a block is winnable and so par and fuel can be tuned
// against real runs. A person who feathers the throttle should beat it.
import { step } from '../src/sim.js';

export function runBot(s, maxSeconds = 400) {
  const L = s.level, tc = { x: L.tarp.x + L.tarp.w / 2, y: L.tarp.y + L.tarp.h / 2 };
  const CELL = 40, cols = Math.ceil(L.W / CELL), rows = Math.ceil(L.H / CELL);
  const grid = new Uint16Array(cols * rows), skip = new Uint8Array(cols * rows);
  let cell = 0, cellCount = 0, tries = 0;
  const input = { mx: 0, my: 0, aimX: tc.x, aimY: tc.y, blow: 0 };
  let mode = 'pick', sx = 0, sy = 0, timer = 0, from = { x: 0, y: 0 };

  while (!s.over && s.time < maxSeconds && s.steps < maxSeconds * 90) {
    if (mode === 'pick') {
      // go where the leaves are: the busiest patch, with the gutter and far ground weighted up
      grid.fill(0);
      for (let i = 0; i < L.N; i++) {
        if (s.lst[i] || s.ltp[i]) continue;
        grid[((s.ly[i] / CELL) | 0) * cols + ((s.lx[i] / CELL) | 0)]++;
      }
      let bc = -1, bw = 0;
      for (let c = 0; c < grid.length; c++) {
        if (!grid[c] || skip[c]) continue;
        const x = (c % cols + 0.5) * CELL, y = ((c / cols | 0) + 0.5) * CELL;
        const w = grid[c] * (y < L.CURB ? 3 : 1) * (0.6 + Math.hypot(x - tc.x, y - tc.y) / 600);
        if (w > bw) { bw = w; bc = c; }
      }
      if (bc < 0) { skip.fill(0); input.blow = 0; step(s, input); if (!bw && tries++ > 600) break; continue; }
      cell = bc; cellCount = grid[bc];
      sx = (bc % cols + 0.5) * CELL; sy = ((bc / cols | 0) + 0.5) * CELL;
      let ax = sx - tc.x, ay = sy - tc.y;
      const al = Math.hypot(ax, ay) + 0.001; ax /= al; ay /= al;
      from.x = sx + ax * 70; from.y = sy + ay * 70;
      mode = 'go'; timer = 0;
    }
    timer++;
    if (mode === 'go') {
      const facing = tc.x >= s.P.x ? 1 : -1;
      const gx = from.x - facing * 12.5 - s.P.x, gy = from.y + 28 - s.P.y, gl = Math.hypot(gx, gy);
      input.mx = gx / (gl + 0.001); input.my = gy / (gl + 0.001); input.blow = 0;
      input.aimX = tc.x; input.aimY = tc.y;
      if (gl < 6 || timer > 420) { mode = 'push'; timer = 0; }
    } else {
      const gx = tc.x - s.hand.x, gy = tc.y - s.hand.y, gl = Math.hypot(gx, gy);
      input.mx = gx / gl; input.my = gy / gl; input.blow = 1;
      // open the stroke by aiming at the leaf itself, in case we could not get behind it
      if (timer < 30) { input.aimX = sx; input.aimY = sy; } else { input.aimX = tc.x; input.aimY = tc.y; }
      if (gl < 135 || timer > 600) {
        // if the stroke left the patch as full as it found it, it is somewhere awkward
        let left = 0;
        for (let i = 0; i < L.N; i++) {
          if (!s.lst[i] && !s.ltp[i] && (((s.ly[i] / CELL) | 0) * cols + ((s.lx[i] / CELL) | 0)) === cell) left++;
        }
        if (left > cellCount * 0.7) skip[cell] = 1;
        mode = 'pick';
      }
    }
    step(s, input);
  }
  return s;
}
