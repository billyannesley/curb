// Canvas renderer. The sidewalk is painted once into `bg`. Leaves that are at rest
// are baked into `rest`, so a normal frame only draws the leaves that are moving.
import { rng } from './rng.js';
import { sampleWind } from './sim.js';
import { rr, drawGuy, drawBlower } from './character.js';

const LEAFC = ['#c8551b', '#e08a1e', '#d9a521', '#8c3b1a', '#b5651d', '#a8891f', '#d4421c'];
const TILE = 40; // world units per cache tile
const DISPLAY = '"Bowlby One","Arial Black",Impact,sans-serif';

function leafSprite(col, i, wet) {
  const s = document.createElement('canvas'); s.width = s.height = 32;
  const c = s.getContext('2d');
  c.translate(16, 16); c.scale(2, 2);
  c.fillStyle = col; c.beginPath();
  if (i % 3 === 0) { c.moveTo(-7, 0); c.bezierCurveTo(-3, -5, 3, -5, 7, 0); c.bezierCurveTo(3, 5, -3, 5, -7, 0); }
  else if (i % 3 === 1) { c.moveTo(-6, 0); c.lineTo(-2, -2); c.lineTo(-3, -5); c.lineTo(1, -3); c.lineTo(3, -6); c.lineTo(4, -2); c.lineTo(7, 0); c.lineTo(4, 2); c.lineTo(3, 6); c.lineTo(1, 3); c.lineTo(-3, 5); c.lineTo(-2, 2); c.closePath(); }
  else { c.moveTo(-6, 1); c.bezierCurveTo(-4, -5, 4, -4, 6, -1); c.bezierCurveTo(4, 4, -2, 5, -6, 1); }
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(-6, 0); c.lineTo(6, 0); c.stroke();
  if (wet) { // soaked leaves read darker and a bit blue
    c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(22,26,44,.5)'; c.fillRect(-8, -8, 16, 16);
  }
  return s;
}

export function createRenderer(cv) {
  const ctx = cv.getContext('2d');
  const bg = document.createElement('canvas'), rest = document.createElement('canvas');
  const rctx = rest.getContext('2d');
  const sprites = LEAFC.map((c, i) => leafSprite(c, i, false)).concat(LEAFC.map((c, i) => leafSprite(c, i, true)));
  let L = null, K = 1, leafScale = 1;
  let baked = null, bx = null, by = null, dirty = null, lists = null, tcols = 0, trows = 0;
  const puffs = [], floats = [];
  let puffAcc = 0, glow = 0, lostFlash = 0, streakT = 0;

  function setLevel(level) {
    L = level;
    baked = new Uint8Array(L.N); bx = new Float32Array(L.N); by = new Float32Array(L.N);
    tcols = Math.ceil(L.W / TILE); trows = Math.ceil(L.H / TILE);
    dirty = new Uint8Array(tcols * trows);
    lists = Array.from({ length: tcols * trows }, () => []);
    puffs.length = 0; floats.length = 0; glow = 0; lostFlash = 0;
  }

  // px: canvas backing size. mobile bumps leaf size so they read on a small screen.
  function resize(pxW, pxH, mobile) {
    if (cv.width !== pxW || cv.height !== pxH) { cv.width = pxW; cv.height = pxH; }
    K = cv.width / L.W; leafScale = mobile ? 1.2 : 1;
    bg.width = rest.width = cv.width; bg.height = rest.height = cv.height;
    baked.fill(0); dirty.fill(0);
    paintBackground();
  }

  function paintBackground() {
    const c = bg.getContext('2d'), r = rng(L.seed ^ 77);
    const { W, H, ROAD, CURB, LANE, tarp, tree, bed, yard, wet } = L;
    c.setTransform(K, 0, 0, K, 0, 0);
    // road. Everything above the lane line is live traffic.
    c.fillStyle = '#34363a'; c.fillRect(0, 0, W, ROAD);
    c.fillStyle = '#2b2d31'; c.fillRect(0, 0, W, LANE);
    for (let i = 0; i < 1400; i++) { c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.12)'; c.fillRect(r() * W, r() * ROAD, 1.4, 1.4); }
    c.fillStyle = '#e9c84a'; c.fillRect(0, LANE - 2.5, W, 5);
    c.fillStyle = '#e9e6dc'; c.fillRect(0, ROAD - 24, W, 3);
    const mhy = (LANE + ROAD - 24) / 2 + 2, mhr = Math.min(20, (ROAD - 24 - LANE) / 2 - 5);
    c.fillStyle = '#2b2c2f'; c.beginPath(); c.arc(120, mhy, mhr, 0, 7); c.fill();
    c.strokeStyle = '#44464a'; c.lineWidth = 2; c.beginPath(); c.arc(120, mhy, mhr * 0.72, 0, 7); c.stroke();
    // curb
    c.fillStyle = '#b9b4a8'; c.fillRect(0, ROAD, W, CURB - ROAD);
    c.fillStyle = '#8f8a7f'; c.fillRect(0, CURB - 3, W, 3);
    for (let x = 60; x < W; x += 120) { c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x, ROAD, 1, CURB - ROAD); }
    // brick
    c.fillStyle = '#5e3a30'; c.fillRect(0, CURB, W, H - CURB);
    const bw = 26, bh = 13, tones = ['#a5523f', '#9a4a3a', '#b05c45', '#8e4436', '#a65a48', '#93503f'];
    for (let y = CURB, row = 0; y < H; y += bh, row++) {
      for (let x = row % 2 ? -bw / 2 : 0; x < W; x += bw) {
        c.fillStyle = tones[(r() * tones.length) | 0];
        c.fillRect(x + 0.7, y + 0.7, bw - 1.4, bh - 1.4);
        if (r() < 0.25) { c.fillStyle = 'rgba(0,0,0,.10)'; c.fillRect(x + 0.7, y + 0.7, bw - 1.4, bh - 1.4); }
      }
    }
    // the neighbor's lawn
    if (yard) {
      c.fillStyle = '#4f8a3c'; c.fillRect(yard.x, yard.y, yard.w, yard.h);
      for (let i = 0; i < yard.h * 1.6; i++) {
        c.fillStyle = r() < 0.5 ? '#5c9a45' : '#447a34';
        c.fillRect(yard.x + r() * (yard.w - 2), yard.y + r() * (yard.h - 4), 1.4, 4);
      }
      const ex = yard.x === 0 ? yard.w - 4 : yard.x;
      c.fillStyle = '#8f8a7f'; c.fillRect(ex, yard.y, 4, yard.h);
      // a small, pointed sign
      const sx = yard.x + yard.w / 2, sy = yard.y + Math.min(120, yard.h * 0.3);
      c.fillStyle = '#5b4130'; c.fillRect(sx - 1.2, sy, 2.4, 16);
      c.fillStyle = '#f4ead6'; rr(c, sx - 17, sy - 12, 34, 15, 2); c.fill();
      c.fillStyle = '#b3261e'; c.font = '700 6px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('KEEP OFF', sx, sy - 4.2);
    }
    // wet patch
    if (wet) {
      c.fillStyle = 'rgba(16,24,44,.34)'; c.beginPath(); c.ellipse(wet.x, wet.y, wet.rx, wet.ry, 0, 0, 7); c.fill();
      c.fillStyle = 'rgba(16,24,44,.2)'; c.beginPath(); c.ellipse(wet.x + 6, wet.y - 4, wet.rx * 0.7, wet.ry * 0.62, 0, 0, 7); c.fill();
      c.strokeStyle = 'rgba(210,225,255,.2)'; c.lineWidth = 1.4; c.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const a = r() * 6.28, d = 0.25 + r() * 0.5, x = wet.x + Math.cos(a) * wet.rx * d, y = wet.y + Math.sin(a) * wet.ry * d;
        c.beginPath(); c.moveTo(x - 9, y); c.quadraticCurveTo(x, y - 3, x + 9, y); c.stroke();
      }
    }
    // tree bed and canopy shade
    c.fillStyle = '#3d2c20'; rr(c, bed.x, bed.y, bed.w, bed.h, 6); c.fill();
    c.strokeStyle = '#75706a'; c.lineWidth = 3; c.stroke();
    for (let i = 0; i < 160; i++) { c.fillStyle = r() < 0.5 ? '#4a3728' : '#33241a'; c.fillRect(bed.x + 4 + r() * (bed.w - 8), bed.y + 4 + r() * (bed.h - 8), 2, 2); }
    for (let i = 0; i < 26; i++) {
      const a = r() * 6.28, d = r() * 120;
      c.fillStyle = 'rgba(20,12,8,.10)'; c.beginPath(); c.arc(tree.x + Math.cos(a) * d, tree.y + Math.sin(a) * d * 0.8, 28 + r() * 38, 0, 7); c.fill();
    }
    // tarp
    c.fillStyle = 'rgba(0,0,0,.28)'; rr(c, tarp.x + 4, tarp.y + 6, tarp.w, tarp.h, 5); c.fill();
    c.fillStyle = '#2f6fd0'; rr(c, tarp.x, tarp.y, tarp.w, tarp.h, 5); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      const y0 = tarp.y + 12 + i * (tarp.h - 24) / 6;
      c.beginPath(); c.moveTo(tarp.x + 6, y0 + r() * 8);
      c.bezierCurveTo(tarp.x + tarp.w * 0.3, y0 - 8 + r() * 16, tarp.x + tarp.w * 0.66, y0 - 8 + r() * 16, tarp.x + tarp.w - 6, y0 + r() * 8); c.stroke();
    }
    c.strokeStyle = '#1f4f9c'; c.lineWidth = 3; rr(c, tarp.x + 1.5, tarp.y + 1.5, tarp.w - 3, tarp.h - 3, 4); c.stroke();
    c.fillStyle = '#c9ccd2';
    [[8, 8], [tarp.w - 8, 8], [8, tarp.h - 8], [tarp.w - 8, tarp.h - 8], [tarp.w / 2, 8], [tarp.w / 2, tarp.h - 8]]
      .forEach((p) => { c.beginPath(); c.arc(tarp.x + p[0], tarp.y + p[1], 3, 0, 7); c.fill(); });
    // things in the way
    for (const o of L.obst) paintObstacle(c, o, r);
  }

  function paintObstacle(c, o, r) {
    if (o.kind === 'tree') {
      c.fillStyle = '#5b4130'; c.beginPath(); c.arc(o.x, o.y, 17, 0, 7); c.fill();
      c.strokeStyle = '#3e2b1f'; c.lineWidth = 2;
      c.beginPath(); c.arc(o.x, o.y, 11, 0, 7); c.stroke(); c.beginPath(); c.arc(o.x, o.y, 5, 0, 7); c.stroke();
    } else if (o.kind === 'hydrant') {
      c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(o.x + 4, o.y + 4, 11, 8, 0, 0, 7); c.fill();
      c.fillStyle = '#d8b21c'; c.beginPath(); c.arc(o.x, o.y, 9, 0, 7); c.fill();
      c.fillStyle = '#f0cf45'; c.beginPath(); c.arc(o.x, o.y, 4.5, 0, 7); c.fill();
    } else if (o.kind === 'can') {
      c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(o.x + 3, o.y + 4, o.r + 1, o.r - 1, 0, 0, 7); c.fill();
      c.fillStyle = '#2f4a3a'; c.beginPath(); c.arc(o.x, o.y, o.r, 0, 7); c.fill();
      c.fillStyle = '#3d5f4a'; c.beginPath(); c.arc(o.x, o.y, o.r - 2.5, 0, 7); c.fill();
      c.strokeStyle = '#22362a'; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); c.moveTo(o.x - 4, o.y); c.lineTo(o.x + 4, o.y); c.stroke();
    } else if (o.kind === 'planter') {
      c.fillStyle = 'rgba(0,0,0,.28)'; rr(c, o.x + 3, o.y + 5, o.w, o.h, 3); c.fill();
      c.fillStyle = '#7a5a3c'; rr(c, o.x, o.y, o.w, o.h, 3); c.fill();
      c.fillStyle = '#3a2a1e'; rr(c, o.x + 4, o.y + 4, o.w - 8, o.h - 8, 2); c.fill();
      for (let i = 0; i < 9; i++) {
        c.fillStyle = ['#3f7a3a', '#4f8f45', '#35682f'][i % 3];
        c.beginPath(); c.arc(o.x + 10 + i * (o.w - 20) / 8, o.y + o.h / 2 + (r() - 0.5) * 6, 6 + r() * 3, 0, 7); c.fill();
      }
    } else if (o.kind === 'car') {
      const col = ['#b8452f', '#3c6e8f', '#d9d4c7', '#3d4a3a'][(r() * 4) | 0];
      c.fillStyle = 'rgba(0,0,0,.32)'; rr(c, o.x + 4, o.y + 6, o.w, o.h, 12); c.fill();
      c.fillStyle = col; rr(c, o.x, o.y, o.w, o.h, 12); c.fill();
      c.fillStyle = 'rgba(0,0,0,.14)'; rr(c, o.x + o.w * 0.2, o.y + 3, o.w * 0.56, o.h - 6, 8); c.fill();
      c.fillStyle = '#1d2630';
      rr(c, o.x + o.w * 0.22, o.y + 6, o.w * 0.1, o.h - 12, 3); c.fill();
      rr(c, o.x + o.w * 0.64, o.y + 6, o.w * 0.12, o.h - 12, 3); c.fill();
      c.fillStyle = 'rgba(255,255,255,.16)'; rr(c, o.x + o.w * 0.34, o.y + 7, o.w * 0.28, o.h - 14, 4); c.fill();
      c.fillStyle = '#f3e9b0'; c.fillRect(o.x + o.w - 3, o.y + 6, 3, 7); c.fillRect(o.x + o.w - 3, o.y + o.h - 13, 3, 7);
      c.fillStyle = '#a3261d'; c.fillRect(o.x, o.y + 6, 2.5, 7); c.fillRect(o.x, o.y + o.h - 13, 2.5, 7);
    }
  }

  function leafRadius(s, i) { return s.lsz[i] * leafScale * 11.4; }

  function stamp(c, s, i, x, y, lift) {
    const k = K * s.lsz[i] * leafScale * (1 + lift * 0.45), a = s.lr[i], cs = Math.cos(a) * k, sn = Math.sin(a) * k;
    c.setTransform(cs, sn, -sn, cs, x * K, y * K);
    c.drawImage(sprites[s.lty[i] + (s.lwet[i] ? LEAFC.length : 0)], -8, -8, 16, 16);
  }

  // Keep the baked layer in step with the sim. Landing is one stamp. Lifting off
  // means the tiles under that leaf get repainted from the leaves still resting there.
  function syncRestLayer(s) {
    const N = L.N, { lair, lset, lst, lx, ly } = s;
    let anyDirty = false;
    for (let i = 0; i < N; i++) {
      const still = !lair[i] && lset[i] <= 0 && !lst[i];
      if (still === !!baked[i]) continue;
      if (still) { stamp(rctx, s, i, lx[i], ly[i], 0); baked[i] = 1; bx[i] = lx[i]; by[i] = ly[i]; }
      else {
        baked[i] = 0; anyDirty = true;
        const rad = leafRadius(s, i);
        const i0 = Math.max(0, ((bx[i] - rad) / TILE) | 0), i1 = Math.min(tcols - 1, ((bx[i] + rad) / TILE) | 0);
        const j0 = Math.max(0, ((by[i] - rad) / TILE) | 0), j1 = Math.min(trows - 1, ((by[i] + rad) / TILE) | 0);
        for (let j = j0; j <= j1; j++) for (let t = i0; t <= i1; t++) dirty[j * tcols + t] = 1;
      }
    }
    if (!anyDirty) return;
    for (let i = 0; i < N; i++) {
      if (!baked[i]) continue;
      const rad = leafRadius(s, i);
      const i0 = Math.max(0, ((bx[i] - rad) / TILE) | 0), i1 = Math.min(tcols - 1, ((bx[i] + rad) / TILE) | 0);
      const j0 = Math.max(0, ((by[i] - rad) / TILE) | 0), j1 = Math.min(trows - 1, ((by[i] + rad) / TILE) | 0);
      for (let j = j0; j <= j1; j++) for (let t = i0; t <= i1; t++) if (dirty[j * tcols + t]) lists[j * tcols + t].push(i);
    }
    for (let t = 0; t < dirty.length; t++) {
      if (!dirty[t]) continue;
      dirty[t] = 0;
      const tx = t % tcols, ty = (t / tcols) | 0;
      const x0 = Math.round(tx * TILE * K), y0 = Math.round(ty * TILE * K);
      const x1 = Math.round((tx + 1) * TILE * K), y1 = Math.round((ty + 1) * TILE * K);
      rctx.setTransform(1, 0, 0, 1, 0, 0);
      rctx.clearRect(x0, y0, x1 - x0, y1 - y0);
      const list = lists[t];
      if (list.length) {
        rctx.save(); rctx.beginPath(); rctx.rect(x0, y0, x1 - x0, y1 - y0); rctx.clip();
        for (let n = 0; n < list.length; n++) stamp(rctx, s, list[n], bx[list[n]], by[list[n]], 0);
        rctx.restore();
        list.length = 0;
      }
    }
  }

  // fx hooks, called by the game loop when the sim reports something
  function tarpHit(n) { glow = Math.min(1, glow + 0.08 * n); }
  function lostHit() { lostFlash = 1; }
  function callout(text, x, y, color) { floats.push({ text, x, y, t: 0, color: color || '#f4ead6' }); }

  // alpha: how far we are between the previous sim step and the current one
  function draw(s, alpha, dt, view) {
    const { N } = L, { lx, ly, px, py, lst, lfade, lz } = s;
    syncRestLayer(s);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0); ctx.drawImage(rest, 0, 0);

    for (let i = 0; i < N; i++) {
      if (baked[i] || lst[i] === 2) continue;
      if (lst[i] === 1) { ctx.globalAlpha = Math.max(0, lfade[i]); stamp(ctx, s, i, lx[i], ly[i], 0.6); ctx.globalAlpha = 1; continue; }
      stamp(ctx, s, i, px[i] + (lx[i] - px[i]) * alpha, py[i] + (ly[i] - py[i]) * alpha, lz[i]);
    }
    ctx.setTransform(K, 0, 0, K, 0, 0);

    const P = s.P, X = P.px + (P.x - P.px) * alpha, Y = P.py + (P.y - P.py) * alpha;
    const hx = X + P.facing * 12.5, hy = Y - 28, dx = s.dx, dy = s.dy;
    const nx = hx + dx * 34, ny = hy + dy * 34;

    // air streaks out of the nozzle, carried by the wind field
    if (s.throttle > 0.02 && !s.over) {
      puffAcc += dt * 120 * s.throttle;
      while (puffAcc >= 1 && puffs.length < 140) { puffAcc--; puffs.push({ x: nx + (Math.random() - 0.5) * 8, y: ny + (Math.random() - 0.5) * 8, l: 0.5 + Math.random() * 0.3 }); }
      if (puffAcc > 1) puffAcc = 0;
    }
    ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]; p.l -= dt;
      if (p.l <= 0) { puffs[i] = puffs[puffs.length - 1]; puffs.pop(); continue; }
      sampleWind(s, p.x, p.y);
      ctx.moveTo(p.x, p.y); p.x += s.wx * dt; p.y += s.wy * dt; ctx.lineTo(p.x + s.wx * 0.03, p.y + s.wy * 0.03);
    }
    ctx.stroke();

    // aim hint while the trigger is off
    if (view.playing && !s.over && s.throttle < 0.6) {
      const ga = 0.16 * (1 - s.throttle / 0.6), gr = ctx.createLinearGradient(nx, ny, nx + dx * 150, ny + dy * 150);
      gr.addColorStop(0, 'rgba(255,255,255,' + ga + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.beginPath();
      ctx.moveTo(nx - dy * 14, ny + dx * 14); ctx.lineTo(nx + dx * 160 - dy * 72, ny + dy * 160 + dx * 72);
      ctx.lineTo(nx + dx * 160 + dy * 72, ny + dy * 160 - dx * 72); ctx.lineTo(nx + dy * 14, ny - dx * 14); ctx.closePath(); ctx.fill();
    }

    // the tarp lights up as it catches leaves
    if (glow > 0.01) {
      const t = L.tarp;
      ctx.strokeStyle = 'rgba(190,220,255,' + (glow * 0.85) + ')'; ctx.lineWidth = 3 + glow * 3;
      rr(ctx, t.x - 1, t.y - 1, t.w + 2, t.h + 2, 6); ctx.stroke();
      glow *= Math.exp(-5 * dt);
    }
    // the lane line flashes when traffic takes a leaf
    if (lostFlash > 0.01) {
      ctx.fillStyle = 'rgba(255,90,60,' + (lostFlash * 0.7) + ')'; ctx.fillRect(0, L.LANE - 3.5, L.W, 7);
      lostFlash *= Math.exp(-4 * dt);
    }

    const behind = dy < -0.2, shake = s.throttle > 0.1 ? (Math.random() - 0.5) * s.throttle * 0.9 : 0;
    if (behind) drawBlower(ctx, hx, hy + shake, s.ang, 1.05);
    drawGuy(ctx, X, Y, 1.05, { fit: view.fit, phase: P.phase, facing: P.facing });
    if (!behind) drawBlower(ctx, hx, hy + shake, s.ang, 1.05);

    drawGust(s, dt);

    // floating callouts
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]; f.t += dt;
      if (f.t > 1.6) { floats.splice(i, 1); continue; }
      const a = f.t < 0.15 ? f.t / 0.15 : Math.max(0, 1 - (f.t - 0.9) / 0.7), sc = f.t < 0.15 ? 0.7 + 2 * f.t : 1;
      ctx.globalAlpha = a; ctx.font = '400 ' + 30 * sc + 'px ' + DISPLAY;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(27,23,20,.85)'; ctx.lineJoin = 'round';
      ctx.strokeText(f.text, f.x, f.y - f.t * 26); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - f.t * 26);
      ctx.globalAlpha = 1;
    }
  }

  function drawGust(s, dt) {
    const G = L.gust, g = s.gust;
    if (!G || g.state === 'idle') return;
    const cx = L.W / 2, cy = L.CURB + 46, ang = Math.atan2(G.dy, G.dx);
    if (g.state === 'blow') {
      streakT += dt;
      ctx.strokeStyle = 'rgba(255,255,255,' + 0.22 * g.env + ')'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath();
      const r = rng(11);
      for (let i = 0; i < 46; i++) {
        const span = L.W + L.H, len = 40 + r() * 70;
        const base = r() * span, off = (base + streakT * (260 + r() * 160)) % span - span / 2;
        const lat = (r() - 0.5) * span;
        const x = cx + G.dx * off - G.dy * lat, y = L.H / 2 + G.dy * off + G.dx * lat;
        ctx.moveTo(x, y); ctx.lineTo(x + G.dx * len, y + G.dy * len);
      }
      ctx.stroke();
    }
    // warning badge with an arrow showing which way it will push
    const blink = g.state === 'warn' ? 0.55 + 0.45 * Math.sin(performance.now() / 70) : g.env;
    ctx.globalAlpha = Math.max(0, Math.min(1, blink));
    ctx.fillStyle = 'rgba(27,23,20,.82)'; rr(ctx, cx - 62, cy - 17, 124, 34, 9); ctx.fill();
    ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#f4ead6'; ctx.font = '400 17px ' + DISPLAY; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('GUST', cx - 50, cy + 1);
    ctx.save(); ctx.translate(cx + 36, cy); ctx.rotate(ang);
    ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.moveTo(4, -6); ctx.lineTo(11, 0); ctx.lineTo(4, 6); ctx.stroke();
    ctx.restore(); ctx.globalAlpha = 1;
  }

  return { setLevel, resize, draw, tarpHit, lostHit, callout, get K() { return K; } };
}
