import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash, today } from '../src/rng.js';
import { makeLevel, LAYOUTS, inRect, pushOut } from '../src/level.js';
import { createSim, step, scoreRun, DT, FUEL_SECONDS, FEATHER, WIN } from '../src/sim.js';
import { runBot } from './bot.js';

const seeds = Array.from({ length: 30 }, (_, i) => hash('test:' + i));
const idle = { mx: 0, my: 0, blow: 0 };

test('levels are deterministic and well formed', () => {
  for (const layout of Object.keys(LAYOUTS)) for (const seed of seeds) {
    const a = makeLevel(seed, layout), b = makeLevel(seed, layout);
    assert.deepEqual(a, b);
    assert.equal(a.W % 40, 0); assert.equal(a.H % 40, 0);
    assert.ok(a.tarp.x >= 0 && a.tarp.x + a.tarp.w <= a.W && a.tarp.y + a.tarp.h <= a.H);
    for (const o of a.obst) {
      const cx = o.shape === 'circle' ? o.x : o.x + o.w / 2, cy = o.shape === 'circle' ? o.y : o.y + o.h / 2;
      assert.ok(cx > 0 && cx < a.W && cy > a.LANE && cy < a.H, o.kind + ' in bounds');
      assert.ok(!inRect(a.tarp, cx, cy), o.kind + ' is not on the tarp');
    }
  }
});

test('every leaf starts somewhere legal', () => {
  for (const layout of Object.keys(LAYOUTS)) for (const seed of seeds.slice(0, 8)) {
    const L = makeLevel(seed, layout), s = createSim(L);
    for (let i = 0; i < L.N; i++) {
      const x = s.lx[i], y = s.ly[i];
      assert.ok(y > L.LANE + 20, 'clear of the lane line');
      assert.ok(!inRect(L.tarp, x, y), 'not already on the tarp');
      assert.ok(!(L.yard && inRect(L.yard, x, y)), 'not on the lawn');
      assert.ok(!pushOut(L.obst, x, y, 0).hit, 'not inside an obstacle');
    }
  }
});

test('the same inputs always give the same run', () => {
  const run = () => runBot(createSim(makeLevel(today(new Date(2026, 10, 12)).seed, 'wide')), 20);
  const a = run(), b = run();
  assert.equal(a.onTarp, b.onTarp); assert.equal(a.fuel, b.fuel); assert.equal(a.steps, b.steps);
  assert.deepEqual(Array.from(a.lx.slice(0, 200)), Array.from(b.lx.slice(0, 200)));
});

test('a full tank lasts FUEL_SECONDS at full throttle, then the run ends', () => {
  const s = createSim(makeLevel(seeds[0], 'wide'));
  const input = { mx: 0, my: 0, ang: Math.PI / 2, blow: 1 };
  while (!s.over && s.steps < (FUEL_SECONDS + 30) * 60) step(s, input);
  assert.equal(s.over, 'gas');
  assert.ok(Math.abs(s.time - FUEL_SECONDS) < 6, 'ran dry at ' + s.time.toFixed(1) + 's');
  assert.equal(scoreRun(s).score, 0);
});

test('feathering the throttle stretches the tank', () => {
  const burn = (blow) => {
    const s = createSim(makeLevel(seeds[1], 'wide'));
    for (let i = 0; i < 600; i++) step(s, { mx: 0, my: 0, ang: Math.PI / 2, blow });
    return 100 - s.fuel;
  };
  const full = burn(1), soft = burn(FEATHER);
  assert.ok(soft < full * FEATHER, 'gentle burn ' + soft.toFixed(2) + ' vs full ' + full.toFixed(2));
});

test('leaves blown across the lane line are lost, and too many ends the run', () => {
  const L = makeLevel(seeds[2], 'wide'), s = createSim(L);
  step(s, { ...idle, blow: 1 }); // start the clock
  for (let i = 0; i < 40; i++) { s.lx[i] = 300 + i; s.ly[i] = L.LANE + 3; s.lair[i] = 1; s.lvy[i] = -200; }
  for (let i = 0; i < 10; i++) step(s, idle);
  assert.equal(s.lost, 40);
  for (let i = 40; i < 400; i++) { s.lx[i] = 300 + i; s.ly[i] = L.LANE + 3; s.lair[i] = 1; s.lvy[i] = -200; }
  for (let i = 0; i < 10; i++) step(s, idle);
  assert.equal(s.over, 'street');
});

test('reaching 90% on the tarp wins and scores against par', () => {
  const L = makeLevel(seeds[3], 'tall'), s = createSim(L);
  step(s, { ...idle, blow: 1 });
  for (let i = 0; i < Math.ceil(L.N * WIN); i++) { s.lx[i] = L.tarp.x + 20; s.ly[i] = L.tarp.y + 20; s.ltp[i] = 1; }
  s.time = L.par.time; s.fuel = L.par.fuel;
  step(s, idle);
  assert.equal(s.over, 'win');
  const sc = scoreRun(s);
  assert.ok(Math.abs(sc.score - sc.par) < 30, 'a par run scores par: ' + sc.score + ' vs ' + sc.par);
});

test('the player cannot walk into traffic or through obstacles', () => {
  const L = makeLevel(seeds[4], 'wide'), s = createSim(L);
  for (let i = 0; i < 600; i++) step(s, { mx: 0, my: -1, blow: 0 });
  assert.ok(s.P.y >= L.LANE + 28);
  assert.ok(!pushOut(L.obst, s.P.x, s.P.y, 8).hit);
});

test('a simple herding bot makes real progress on today-style blocks', () => {
  for (const layout of Object.keys(LAYOUTS)) {
    const L = makeLevel(hash('curb:20261113'), layout), s = runBot(createSim(L), 400);
    assert.ok(s.onTarp / L.N > 0.5, layout + ': bot tarped ' + Math.round(100 * s.onTarp / L.N) + '%');
    assert.ok(s.lost < L.N * 0.1, layout + ': lost ' + s.lost);
  }
});

test('one sim step is cheap', () => {
  const s = createSim(makeLevel(seeds[5], 'wide'));
  const t0 = performance.now();
  for (let i = 0; i < 600; i++) step(s, { mx: 0.5, my: 0, ang: 0, blow: 1 });
  const ms = (performance.now() - t0) / 600;
  assert.ok(ms < 4, 'step took ' + ms.toFixed(2) + 'ms');
  assert.ok(Math.abs(s.steps * DT - 10) < 1e-6);
});
