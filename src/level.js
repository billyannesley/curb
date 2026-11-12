// Level generation. A level is plain data: world size, obstacles, zones and par.
// There are exactly two world shapes so scores are comparable between players.
import { rng } from './rng.js';

export const LAYOUTS = {
  wide: { W: 960, H: 600, N: 3200, road: 128, parTime: 150 },
  tall: { W: 560, H: 720, N: 2300, road: 92, parTime: 125 },
};

export function layoutFor(width, height) {
  return width / height >= 1.1 ? 'wide' : 'tall';
}

function hitsRect(x, y, w, h, r, pad) {
  return x < r.x + r.w + pad && x + w > r.x - pad && y < r.y + r.h + pad && y + h > r.y - pad;
}

export function makeLevel(seed, layoutName) {
  const L = LAYOUTS[layoutName];
  const r = rng(seed);
  const { W, H, N } = L;
  const ROAD = L.road, CURB = ROAD + 14, LANE = Math.round(ROAD * 0.4);
  const tarpRight = r() < 0.6;
  const side = tarpRight ? 1 : -1; // which way the tarp is from the middle

  const tarp = { w: Math.round(Math.min(196, W * 0.36)), h: 160 };
  const tm = Math.min(48, W * 0.06);
  tarp.x = tarpRight ? W - tarp.w - tm : tm;
  tarp.y = H - tarp.h - 42;

  // Pick the day's conditions. Every block gets two or three.
  const conditions = [];
  const hasYard = r() < 0.5, hasCar = r() < 0.55, hasPuddle = r() < 0.55, hasGust = r() < 0.4;
  const hasPlanter = r() < 0.5, hasCans = r() < 0.5;

  let yard = null;
  if (hasYard) {
    const yw = W > H ? 64 : 50;
    yard = { x: tarpRight ? 0 : W - yw, y: CURB, w: yw, h: H - CURB };
    conditions.push("Neighbor's lawn");
  }

  // Tree sits on the half away from the tarp.
  const lo = Math.max(0.2 * W, (yard ? yard.w : 0) + 66), hi = 0.42 * W;
  const tx = lo + r() * (hi - lo);
  const tree = {
    x: Math.round(tarpRight ? tx : W - tx),
    y: Math.round(CURB + (H - CURB) * (0.27 + r() * 0.13)),
    r: 17,
  };
  const bed = { x: tree.x - 38, y: tree.y - 38, w: 76, h: 76 };

  const obst = [{ shape: 'circle', kind: 'tree', x: tree.x, y: tree.y, r: tree.r }];
  const keepOut = [bed, tarp];
  if (yard) keepOut.push(yard);

  let hx = 0;
  for (let i = 0; i < 40; i++) {
    hx = Math.round(W * (0.15 + r() * 0.7));
    if (Math.abs(hx - tree.x) > 90 && !(yard && hx > yard.x - 20 && hx < yard.x + yard.w + 20)) break;
  }
  obst.push({ shape: 'circle', kind: 'hydrant', x: hx, y: CURB + 26, r: 9 });
  keepOut.push({ x: hx - 12, y: CURB + 14, w: 24, h: 24 });

  if (hasCar) {
    const ch = Math.min(56, ROAD - LANE - 14), cw = Math.round(ch * 2.35);
    const cx = Math.round(20 + r() * (W - cw - 40));
    obst.push({ shape: 'rect', kind: 'car', x: cx, y: ROAD - 5 - ch, w: cw, h: ch });
    conditions.push('Parked car');
  }

  function place(w, h, pad, y0, y1) {
    for (let i = 0; i < 60; i++) {
      const x = 16 + r() * (W - w - 32), y = y0 + r() * (y1 - y0 - h);
      let ok = true;
      for (const k of keepOut) if (hitsRect(x, y, w, h, k, pad)) ok = false;
      if (ok) {
        const rect = { x: Math.round(x), y: Math.round(y), w, h };
        keepOut.push(rect);
        return rect;
      }
    }
    return null;
  }

  if (hasPlanter) {
    const p = place(84, 30, 34, CURB + 60, H - 50);
    if (p) { obst.push({ shape: 'rect', kind: 'planter', ...p }); conditions.push('Planter box'); }
  }
  if (hasCans) {
    const p = place(52, 26, 30, CURB + 50, H - 30);
    if (p) {
      obst.push({ shape: 'circle', kind: 'can', x: p.x + 13, y: p.y + 13, r: 12 });
      obst.push({ shape: 'circle', kind: 'can', x: p.x + 39, y: p.y + 13, r: 12 });
      conditions.push('Trash cans');
    }
  }

  let wet = null;
  if (hasPuddle) {
    const rx = 62 + r() * 34, ry = 42 + r() * 22;
    for (let i = 0; i < 40 && !wet; i++) {
      const x = rx + 10 + r() * (W - 2 * rx - 20), y = CURB + ry + 10 + r() * (H - CURB - 2 * ry - 20);
      if (!hitsRect(x - rx, y - ry, 2 * rx, 2 * ry, tarp, 10)) wet = { x: Math.round(x), y: Math.round(y), rx, ry };
    }
    if (wet) conditions.push('Wet patch');
  }

  let gust = null;
  if (hasGust) {
    // Gusts never blow straight at the tarp. That would be a gift.
    const dirs = [[-side, 0], [-side * 0.94, -0.34], [-side * 0.94, 0.34], [side * 0.5, -0.4]];
    const d = dirs[(r() * dirs.length) | 0];
    gust = { dx: d[0], dy: d[1], period: 16 + r() * 6, first: 9 + r() * 4, warn: 2, length: 1.7, speed: 78 };
    conditions.push('Gusty');
  }
  if (!conditions.length) conditions.push('Calm day');

  // Par moves with the conditions so a hard block is not graded like an easy one.
  let parTime = L.parTime;
  if (wet) parTime += 10;
  if (gust) parTime += 12;
  if (yard) parTime += 6;
  if (hasPlanter || hasCans) parTime += 5;

  const start = {
    x: Math.max(40, Math.min(W - 40, tree.x + side * Math.min(220, W * 0.4))),
    y: tree.y + 40,
  };

  return {
    seed, layout: layoutName, W, H, N, ROAD, CURB, LANE,
    tarp, tree, bed, obst, yard, wet, gust, conditions, start, side,
    par: { time: parTime, fuel: 30 },
  };
}

// Pushes a point out of every obstacle. Result lands in `out`.
export const out = { x: 0, y: 0, hit: false };
export function pushOut(obst, x, y, margin) {
  out.hit = false;
  for (let k = 0; k < obst.length; k++) {
    const o = obst[k];
    if (o.shape === 'circle') {
      const dx = x - o.x, dy = y - o.y, rad = o.r + margin, d2 = dx * dx + dy * dy;
      if (d2 < rad * rad) {
        const d = Math.sqrt(d2) + 0.001;
        x = o.x + (dx / d) * rad; y = o.y + (dy / d) * rad; out.hit = true;
      }
    } else {
      const x0 = o.x - margin, x1 = o.x + o.w + margin, y0 = o.y - margin, y1 = o.y + o.h + margin;
      if (x > x0 && x < x1 && y > y0 && y < y1) {
        const dl = x - x0, dr = x1 - x, dt = y - y0, db = y1 - y, m = Math.min(dl, dr, dt, db);
        if (m === dl) x = x0; else if (m === dr) x = x1; else if (m === dt) y = y0; else y = y1;
        out.hit = true;
      }
    }
  }
  out.x = x; out.y = y;
  return out;
}

export function inRect(rc, x, y) {
  return x > rc.x && x < rc.x + rc.w && y > rc.y && y < rc.y + rc.h;
}
