// The whole game simulation: wind field, leaves, the guy, fuel and win/lose rules.
// No DOM in here. It advances in fixed 1/60 s steps so it behaves the same on a
// 60Hz laptop, a 120Hz phone and inside the Node test runner.
import { rng } from './rng.js';
import { pushOut, inRect } from './level.js';

export const DT = 1 / 60;
export const WIN = 0.9;          // share of leaves that must reach the tarp
export const LOSS_LIMIT = 0.1;   // lose more than this to the street and the run is over
export const FUEL_SECONDS = 190; // tank life at full throttle
export const FEATHER = 0.45;     // the gentle setting

const CS = 10; // wind cell size
const DS = 8;  // pile density cell size
const LEAF_KINDS = 7;

export function createSim(level) {
  const { W, H, N } = level;
  const GW = W / CS, GH = H / CS, DW = W / DS, DH = H / DS;
  const f32 = (n) => new Float32Array(n), u8 = (n) => new Uint8Array(n);
  const s = {
    level, GW, GH, DW, DH,
    u: f32(GW * GH), v: f32(GW * GH), u2: f32(GW * GH), v2: f32(GW * GH),
    solid: u8(GW * GH), dens: new Uint16Array(DW * DH),
    lx: f32(N), ly: f32(N), px: f32(N), py: f32(N), lvx: f32(N), lvy: f32(N),
    lr: f32(N), lvr: f32(N), lz: f32(N), lthr: f32(N), lsz: f32(N), lph: f32(N),
    lset: f32(N), lfade: f32(N),
    lty: u8(N), lair: u8(N), lst: u8(N), lwet: u8(N), ltp: u8(N),
    P: { x: level.start.x, y: level.start.y, px: 0, py: 0, phase: 0, facing: -level.side },
    hand: { x: 0, y: 0 }, ang: Math.PI, dx: -1, dy: 0,
    throttle: 0, fuel: 100, time: 0, steps: 0, started: false, over: '',
    onTarp: 0, lost: 0, inYard: 0, moving: 0, emptyT: 0,
    gust: { state: 'idle', t: level.gust ? level.gust.first : Infinity, env: 0 },
    ev: { tarp: 0, lost: 0, warn: 0, gust: 0, empty: 0 },
    wx: 0, wy: 0,
  };

  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    if (pushOut(level.obst, (i + 0.5) * CS, (j + 0.5) * CS, 0).hit) s.solid[j * GW + i] = 1;
  }
  const p = pushOut(level.obst, s.P.x, s.P.y, 10);
  s.P.x = s.P.px = p.x; s.P.y = s.P.py = p.y;
  spawnLeaves(s);
  placeHand(s);
  return s;
}

function spawnLeaves(s) {
  const L = s.level, { W, H, N, ROAD, CURB, tree, tarp, yard, wet } = L;
  const r = rng(L.seed ^ 0x5eaf);
  const g = () => (r() + r() + r() + r() - 2) / 0.58;
  for (let i = 0; i < N; i++) {
    let x = 0, y = 0, ok = false;
    while (!ok) {
      const p = r();
      if (p < 0.5) { x = tree.x + g() * Math.min(120, W * 0.19); y = tree.y + 8 + g() * 85; }
      else if (p < 0.93) { x = 10 + r() * (W - 20); y = CURB + 8 + r() * (H - CURB - 18); }
      else { x = 10 + r() * (W - 20); y = ROAD - 30 + r() * 40; }
      ok = x > 8 && x < W - 8 && y > ROAD - 34 && y < H - 8 && !inRect(tarp, x, y) &&
        !(yard && inRect(yard, x, y)) && !pushOut(L.obst, x, y, 3).hit;
    }
    s.lx[i] = s.px[i] = x; s.ly[i] = s.py[i] = y;
    s.lr[i] = r() * 6.28; s.lvr[i] = (r() - 0.5) * 22;
    s.lthr[i] = 42 + r() * 46; s.lsz[i] = 0.8 + r() * 0.55; s.lph[i] = r() * 6.28;
    s.lty[i] = (r() * LEAF_KINDS) | 0;
    if (wet) {
      const ex = (x - wet.x) / wet.rx, ey = (y - wet.y) / wet.ry;
      if (ex * ex + ey * ey < 1) { s.lwet[i] = 1; s.lthr[i] *= 2.3; }
    }
  }
}

export function sampleWind(s, x, y) {
  const { GW, GH, u, v } = s;
  let gx = x / CS - 0.5, gy = y / CS - 0.5;
  if (gx < 0) gx = 0; else if (gx > GW - 1.001) gx = GW - 1.001;
  if (gy < 0) gy = 0; else if (gy > GH - 1.001) gy = GH - 1.001;
  const xi = gx | 0, yi = gy | 0, fx = gx - xi, fy = gy - yi, a = yi * GW + xi;
  s.wx = (u[a] * (1 - fx) + u[a + 1] * fx) * (1 - fy) + (u[a + GW] * (1 - fx) + u[a + GW + 1] * fx) * fy;
  s.wy = (v[a] * (1 - fx) + v[a + 1] * fx) * (1 - fy) + (v[a + GW] * (1 - fx) + v[a + GW + 1] * fx) * fy;
}

// The blower: a cone of fast air that widens and weakens with distance.
function inject(s, nx, ny, dx, dy, power) {
  const { GW, GH, u, v } = s;
  const R = 195 * (0.55 + 0.45 * power), S = 390 * power, k = Math.min(1, 12 * DT);
  const i0 = Math.max(1, ((nx - R) / CS) | 0), i1 = Math.min(GW - 2, ((nx + R) / CS) | 0);
  const j0 = Math.max(1, ((ny - R) / CS) | 0), j1 = Math.min(GH - 2, ((ny + R) / CS) | 0);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const rx = (i + 0.5) * CS - nx, ry = (j + 0.5) * CS - ny, al = rx * dx + ry * dy;
    if (al < -4 || al > R) continue;
    const pe = Math.abs(ry * dx - rx * dy), hw = 16 + al * 0.4;
    if (pe > hw) continue;
    const f = Math.sqrt(1 - al / R) * Math.sqrt(1 - pe / hw), len = Math.sqrt(rx * rx + ry * ry) + 0.001;
    const fx = dx * 0.93 + (rx / len) * 0.07, fy = dy * 0.93 + (ry / len) * 0.07, id = j * GW + i;
    const tx = fx * S * f, ty = fy * S * f;
    if (tx * tx + ty * ty > u[id] * u[id] + v[id] * v[id]) { u[id] += (tx - u[id]) * k; v[id] += (ty - v[id]) * k; }
  }
}

function stepGust(s) {
  const G = s.level.gust, g = s.gust;
  if (!G || !s.started) return;
  g.t -= DT;
  if (g.state === 'idle' && g.t <= G.warn) { g.state = 'warn'; s.ev.warn++; }
  else if (g.state === 'warn' && g.t <= 0) { g.state = 'blow'; g.t = G.length; s.ev.gust++; }
  else if (g.state === 'blow' && g.t <= 0) { g.state = 'idle'; g.t = G.period; g.env = 0; }
  if (g.state !== 'blow') return;
  const { GW, GH, u, v, solid } = s;
  g.env = Math.sin(Math.PI * (1 - g.t / G.length));
  const k = Math.min(1, 6 * DT);
  for (let j = 1; j < GH - 1; j++) {
    const sp = G.speed * g.env * (0.8 + 0.2 * Math.sin(j * 0.7 + s.time * 5));
    const tx = G.dx * sp, ty = G.dy * sp, t2 = tx * tx + ty * ty;
    for (let i = 1; i < GW - 1; i++) {
      const id = j * GW + i;
      if (!solid[id] && t2 > u[id] * u[id] + v[id] * v[id]) { u[id] += (tx - u[id]) * k; v[id] += (ty - v[id]) * k; }
    }
  }
}

function stepWind(s) {
  const { GW, GH, u, v, u2, v2, solid } = s;
  const k = DT / CS, dec = Math.exp(-2.6 * DT);
  for (let j = 1; j < GH - 1; j++) for (let i = 1; i < GW - 1; i++) {
    const id = j * GW + i;
    let x = i - u[id] * k, y = j - v[id] * k;
    if (x < 0) x = 0; else if (x > GW - 1.001) x = GW - 1.001;
    if (y < 0) y = 0; else if (y > GH - 1.001) y = GH - 1.001;
    const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, a = yi * GW + xi;
    u2[id] = (u[a] * (1 - fx) + u[a + 1] * fx) * (1 - fy) + (u[a + GW] * (1 - fx) + u[a + GW + 1] * fx) * fy;
    v2[id] = (v[a] * (1 - fx) + v[a + 1] * fx) * (1 - fy) + (v[a + GW] * (1 - fx) + v[a + GW + 1] * fx) * fy;
  }
  for (let j = 1; j < GH - 1; j++) for (let i = 1; i < GW - 1; i++) {
    const id = j * GW + i;
    if (solid[id]) { u[id] = 0; v[id] = 0; continue; }
    u[id] = (u2[id] * 0.6 + 0.1 * (u2[id - 1] + u2[id + 1] + u2[id - GW] + u2[id + GW])) * dec;
    v[id] = (v2[id] * 0.6 + 0.1 * (v2[id - 1] + v2[id + 1] + v2[id - GW] + v2[id + GW])) * dec;
  }
}

function stepLeaves(s) {
  const L = s.level, { W, H, N, tarp, yard, obst, LANE } = L;
  const { DW, DH, dens, lx, ly, lvx, lvy, lr, lvr, lz, lthr, lph, lset, lfade, lair, lst, ltp } = s;
  const t = s.time, dt = DT;
  const tx0 = tarp.x + 3, tx1 = tarp.x + tarp.w - 3, ty0 = tarp.y + 3, ty1 = tarp.y + tarp.h - 3;

  dens.fill(0);
  for (let i = 0; i < N; i++) {
    if (lst[i]) continue;
    const c = ((ly[i] / DS) | 0) * DW + ((lx[i] / DS) | 0);
    if (c >= 0 && c < dens.length) dens[c]++;
  }

  let onTarp = 0, moving = 0, inYard = 0;
  for (let i = 0; i < N; i++) {
    if (lst[i]) { // swept off by traffic
      if (lst[i] === 1) { lx[i] += 260 * dt; lfade[i] -= dt / 0.7; if (lfade[i] <= 0) lst[i] = 2; }
      continue;
    }
    let x = lx[i], y = ly[i];
    const tp = ltp[i];
    if (tp) onTarp++;
    else if (yard && inRect(yard, x, y)) inYard++;

    sampleWind(s, x, y);
    const wx = s.wx, wy = s.wy, ws = Math.sqrt(wx * wx + wy * wy);
    if (!lair[i]) {
      if (ws > lthr[i] * (tp ? 3.2 : 1)) lair[i] = 1;
      else if (lset[i] <= 0) continue; // fully at rest: nothing to do
    }

    // pile volume: leaves that are moving or just landed slide out of crowded cells
    const ci = (x / DS) | 0, cj = (y / DS) | 0;
    if (ci > 0 && ci < DW - 1 && cj > 0 && cj < DH - 1) {
      const c = cj * DW + ci;
      if (dens[c] > 8) {
        const gx = dens[c + 1] - dens[c - 1], gy = dens[c + DW] - dens[c - DW];
        const qx = x - (gx + Math.sin(lph[i]) * 0.6) * 7 * dt, qy = y - (gy + Math.cos(lph[i]) * 0.6) * 7 * dt;
        if (!tp || (qx > tx0 && qx < tx1 && qy > ty0 && qy < ty1)) { x = qx; y = qy; }
      }
    }
    if (!lair[i]) { lset[i] -= dt; lx[i] = x; ly[i] = y; continue; }

    let vx = lvx[i], vy = lvy[i];
    vx += (wx - vx) * 3.2 * dt; vy += (wy - vy) * 3.2 * dt;
    if (ws > 1) { const f = Math.sin(t * 9 + lph[i]) * 0.9 * dt; vx += -wy * f; vy += wx * f; }
    const damp = Math.exp(-(tp ? 3 : 1.3) * dt); vx *= damp; vy *= damp;
    x += vx * dt; y += vy * dt;

    if (tp) { // the tarp keeps what it catches: leaves can swirl on it but not leave
      if (x < tx0) { x = tx0; vx = 0; } else if (x > tx1) { x = tx1; vx = 0; }
      if (y < ty0) { y = ty0; vy = 0; } else if (y > ty1) { y = ty1; vy = 0; }
    } else if (inRect(tarp, x, y)) { ltp[i] = 1; s.ev.tarp++; }

    const sp = Math.sqrt(vx * vx + vy * vy);
    lr[i] += lvr[i] * dt * Math.min(1, sp / 90);
    lz[i] += (Math.min(1, ws / 260) - lz[i]) * 5 * dt;
    if (sp > 25) moving++;
    if (tp ? (ws < lthr[i] * 0.9 && sp < 30) : (ws < lthr[i] * 0.4 && sp < 14)) {
      lair[i] = 0; lset[i] = 1; vx = vy = 0; lz[i] = 0;
    }
    const o = pushOut(obst, x, y, 2); x = o.x; y = o.y;
    if (x < 5) { x = 5; vx = 0; } else if (x > W - 5) { x = W - 5; vx = 0; }
    if (y > H - 5) { y = H - 5; vy = 0; }
    if (y < LANE + 1 && !ltp[i]) { // crossed the lane line: gone
      lst[i] = 1; lfade[i] = 1; lair[i] = 0; s.lost++; s.ev.lost++;
    }
    lx[i] = x; ly[i] = y; lvx[i] = vx; lvy[i] = vy;
  }
  s.onTarp = onTarp; s.moving = moving; s.inYard = inYard;
}

function placeHand(s) {
  s.hand.x = s.P.x + s.P.facing * 12.5;
  s.hand.y = s.P.y - 28;
}

// input: { mx, my }   walk vector, length 0..1
//        { ang }      aim angle, or { aimX, aimY } to aim at a world point
//        { blow }     throttle 0..1
export function step(s, input) {
  const L = s.level, P = s.P;
  s.px.set(s.lx); s.py.set(s.ly); P.px = P.x; P.py = P.y;
  s.steps++;

  let blow = s.over || s.fuel <= 0 ? 0 : Math.max(0, Math.min(1, input.blow || 0));
  if (!s.over) {
    let mx = input.mx || 0, my = input.my || 0, ml = Math.sqrt(mx * mx + my * my);
    if (ml > 1) { mx /= ml; my /= ml; ml = 1; }
    if (ml > 0.01) {
      const sp = (blow > 0 ? 100 : 165) * DT;
      P.x += mx * sp; P.y += my * sp; P.phase += DT * (5 + 6 * ml);
    } else P.phase = 0;
    const o = pushOut(L.obst, P.x, P.y, 9);
    P.x = Math.max(14, Math.min(L.W - 14, o.x));
    P.y = Math.max(L.LANE + 28, Math.min(L.H - 4, o.y));
    if (input.ang !== undefined) {
      const ca = Math.cos(input.ang);
      if (Math.abs(ca) > 0.15) P.facing = ca > 0 ? 1 : -1;
      placeHand(s); s.ang = input.ang;
    } else if (input.aimX !== undefined) {
      if (Math.abs(input.aimX - P.x) > 6) P.facing = input.aimX >= P.x ? 1 : -1;
      placeHand(s); s.ang = Math.atan2(input.aimY - s.hand.y, input.aimX - s.hand.x);
    } else placeHand(s);
    s.dx = Math.cos(s.ang); s.dy = Math.sin(s.ang);
  }

  s.throttle += (blow - s.throttle) * Math.min(1, (blow > s.throttle ? 7 : 9) * DT);
  if (s.throttle > 0.02 && !s.over) {
    if (blow > 0) s.started = true;
    inject(s, s.hand.x + s.dx * 34, s.hand.y + s.dy * 34, s.dx, s.dy, s.throttle);
    const before = s.fuel;
    s.fuel = Math.max(0, s.fuel - Math.pow(s.throttle, 1.5) * DT * 100 / FUEL_SECONDS);
    if (before > 0 && s.fuel === 0) s.ev.empty++;
  }

  stepGust(s);
  stepWind(s);
  stepLeaves(s);

  if (s.started && !s.over) {
    s.time += DT;
    if (s.onTarp >= Math.ceil(L.N * WIN)) s.over = 'win';
    else if (s.lost > L.N * LOSS_LIMIT) s.over = 'street';
    else if (s.fuel <= 0) {
      s.emptyT += DT;
      if (s.emptyT > 3.5 || (s.emptyT > 1.2 && s.moving === 0)) s.over = 'gas';
    }
  }
}

// One number for the run. Faster, thriftier and tidier all push it up.
export function scoreRun(s) {
  const par = s.level.par;
  const won = s.over === 'win';
  const timePts = Math.round(5000 * Math.max(0, 1 - s.time / (2.5 * par.time)));
  const fuelPts = Math.round(s.fuel * 20);
  const penalty = s.lost * 2 + s.inYard * 3;
  const parScore = 3000 + par.fuel * 20;
  return {
    won, timePts, fuelPts, penalty, par: parScore,
    score: won ? Math.max(0, timePts + fuelPts - penalty) : 0,
  };
}
