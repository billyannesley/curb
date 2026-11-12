// Game shell: picks the block, runs the fixed-step loop, and drives the HUD and cards.
import { today, hash } from './rng.js';
import { makeLevel, layoutFor } from './level.js';
import { createSim, step, scoreRun, DT, WIN, LOSS_LIMIT } from './sim.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { drawPortrait } from './character.js';
import { prefs, getBest, recordBest, fmtTime, fmtNum, shareText, share } from './store.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage'), area = $('area'), cv = $('game');
const renderer = createRenderer(cv);
const audio = createAudio();
audio.setOn(prefs.sound);

const day = today();
let mode = 'daily', seed = day.seed, layout = '', level = null, sim = null;
let playing = false, reported = false, fit = prefs.fit, milestone = 0, lastScore = null;

const input = createInput({
  stage, area, cv, stickL: $('stL'), stickR: $('stR'),
  onGesture: () => audio.init(),
  onModeChange: () => onResize(),
  onRestart: () => { if (playing) newRun(); },
});

/* ---------- runs ---------- */
function newRun() {
  const w = area.clientWidth, h = area.clientHeight;
  if (!w || !h) return;
  layout = layoutFor(w, h);
  level = makeLevel(seed, layout);
  sim = createSim(level);
  renderer.setLevel(level);
  input.reset(level);
  reported = false; milestone = 0; acc = 0;
  $('done').hidden = true;
  $('sYardWrap').hidden = !level.yard;
  $('sLostMax').textContent = '/' + Math.floor(level.N * LOSS_LIMIT);
  sizeCanvas();
  paintIntro();
  hud.force();
}
function bestKey() { return day.key + ':' + layout; }

function paintIntro() {
  $('iBlock').textContent = mode === 'daily' ? 'Block #' + day.number + ' · ' + day.label : 'Random block';
  const chips = $('iChips'); chips.textContent = '';
  for (const c of level.conditions) { const li = document.createElement('li'); li.textContent = c; chips.appendChild(li); }
  const best = mode === 'daily' ? getBest(bestKey()) : null;
  $('iBest').hidden = !best;
  if (best) $('iBest').textContent = 'Your best today: ' + fmtNum(best.score) + ' pts';
  $('bOtherIntro').textContent = mode === 'daily' ? 'Random block' : "Today's block";
}

function setMode(m) {
  mode = m;
  seed = m === 'daily' ? day.seed : hash('random:' + Math.random() + ':' + Date.now());
  newRun();
}

/* ---------- canvas sizing ---------- */
function sizeCanvas() {
  const w = area.clientWidth, h = area.clientHeight;
  if (!w || !h || !level) return;
  const s = Math.min(w / level.W, h / level.H), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.style.width = Math.floor(level.W * s) + 'px'; cv.style.height = Math.floor(level.H * s) + 'px';
  renderer.resize(Math.round(level.W * s * dpr), Math.round(level.H * s * dpr), input.touch || Math.min(w, h) < 520);
}
function onResize() {
  const w = area.clientWidth, h = area.clientHeight;
  if (!w || !h) return;
  // The block reshapes to fit the screen, but never in the middle of a run.
  if (!level || (!sim.started && layoutFor(w, h) !== layout)) newRun();
  else sizeCanvas();
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
if (window.ResizeObserver) new ResizeObserver(onResize).observe(area);

/* ---------- HUD: only touch the DOM when a value changes ---------- */
const hud = (() => {
  const els = { clean: $('sClean'), mClean: $('mClean'), time: $('sTime'), mFuel: $('mFuel'), fuelWrap: $('fuelWrap'), lost: $('sLost'), lostWrap: $('sLostWrap'), yard: $('sYard') };
  let last = {};
  function set(k, v, apply) { if (last[k] !== v) { last[k] = v; apply(v); } }
  return {
    force() { last = {}; },
    update() {
      const pct = sim.onTarp / level.N, limit = Math.floor(level.N * LOSS_LIMIT);
      set('clean', Math.floor(pct * 100), (v) => { els.clean.textContent = v + '%'; });
      set('mClean', Math.round(Math.min(100, pct / WIN * 100) * 2) / 2, (v) => { els.mClean.style.width = v + '%'; });
      set('time', sim.time | 0, () => { els.time.textContent = fmtTime(sim.time); });
      set('fuel', Math.round(sim.fuel * 2) / 2, (v) => { els.mFuel.style.width = v + '%'; });
      set('low', sim.fuel < 15 && sim.fuel > 0, (v) => { els.fuelWrap.classList.toggle('low', v); });
      set('lost', sim.lost, (v) => { els.lost.textContent = v; });
      set('lostHot', sim.lost > limit * 0.6, (v) => { els.lostWrap.classList.toggle('hot', v); });
      set('yard', sim.inYard, (v) => { els.yard.textContent = v; });
    },
  };
})();

/* ---------- results ---------- */
function finish() {
  reported = true;
  const sc = scoreRun(sim), pct = Math.floor(sim.onTarp / level.N * 100);
  lastScore = sc;
  let title, line;
  if (sc.won) {
    if (sc.score >= sc.par + 800) { title = 'Neighborhood legend'; line = 'The whole block watched. Somebody clapped.'; }
    else if (sc.score >= sc.par) { title = 'Solid Saturday'; line = 'Clean sidewalk, respectable pace. The tarp is full.'; }
    else { title = 'Eventually clean'; line = 'It got done. The HOA is drafting a note about the noise.'; }
    if (sim.fuel < 3) line += ' You finished on fumes.';
    if (sim.inYard > 0) line += ' The neighbor counted ' + sim.inYard + ' on the lawn.';
    audio.win();
  } else if (sim.over === 'gas') {
    title = 'Out of gas'; line = 'The tank ran dry with ' + pct + '% on the tarp. Ease off the trigger on the short pushes.';
    audio.fail();
  } else {
    title = 'Lost to traffic'; line = 'Too many leaves crossed the yellow line. You cannot reach 90% from here.';
    audio.fail();
  }
  $('rTitle').textContent = title; $('rLine').textContent = line;
  $('rScoreWrap').hidden = !sc.won;
  $('rScore').textContent = fmtNum(sc.score); $('rPar').textContent = 'Par ' + fmtNum(sc.par);
  $('rTime').textContent = fmtTime(sim.time); $('rTimePts').textContent = sc.won ? '+' + fmtNum(sc.timePts) : '';
  $('rFuel').textContent = Math.round(sim.fuel) + '%'; $('rFuelPts').textContent = sc.won ? '+' + fmtNum(sc.fuelPts) : '';
  $('rClean').textContent = pct + '%';
  $('rLost').textContent = sim.lost + sim.inYard; $('rLostPts').textContent = sc.won && sc.penalty ? '−' + fmtNum(sc.penalty) : '';
  let bestLine = '';
  if (sc.won && mode === 'daily') {
    const fresh = recordBest(bestKey(), { score: sc.score, time: Math.round(sim.time), fuel: Math.round(sim.fuel) });
    bestLine = fresh ? 'New best for today.' : 'Your best today: ' + fmtNum(getBest(bestKey()).score) + ' pts';
  } else if (mode === 'random') bestLine = 'Random blocks are practice. Only the daily block keeps a best.';
  $('rBest').textContent = bestLine; $('rBest').hidden = !bestLine;
  $('bShare').hidden = !(sc.won && mode === 'daily'); $('bShare').textContent = 'Share';
  $('bOther').textContent = mode === 'daily' ? 'Random block' : "Today's block";
  $('done').hidden = false;
  $('bAgain').focus({ preventScroll: true });
}

/* ---------- loop ---------- */
let last = 0, acc = 0;
function frame(ms) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (ms - last) / 1000 || 0); last = ms;
  if (!sim) return;
  acc += dt;
  let n = 0;
  while (acc >= DT && n < 4) { step(sim, input.read(sim, playing)); acc -= DT; n++; }
  if (n === 4) acc = 0; // too far behind: drop the backlog instead of spiralling

  const ev = sim.ev, tarp = level.tarp;
  if (ev.tarp) { renderer.tarpHit(ev.tarp); audio.tarpTick(sim.onTarp / level.N); }
  if (ev.lost) { renderer.lostHit(); audio.lost(); }
  if (ev.warn) audio.gustWarn();
  if (ev.empty) renderer.callout('Out of gas', sim.P.x, sim.P.y - 70, '#ff7a1a');
  ev.tarp = ev.lost = ev.warn = ev.gust = ev.empty = 0;
  const pct = sim.onTarp / level.N;
  while (milestone < 3 && pct >= (milestone + 1) * 0.25) {
    milestone++;
    renderer.callout(milestone * 25 + '%', tarp.x + tarp.w / 2, tarp.y - 14);
    audio.milestone(milestone);
  }
  if (sim.over && !reported) finish();

  audio.update(sim.throttle, sim.moving, sim.fuel, sim.gust.state === 'blow' ? sim.gust.env : 0);
  renderer.draw(sim, acc / DT, dt, { fit, playing });
  hud.update();
}

/* ---------- buttons ---------- */
function setFit(f) {
  fit = f; prefs.fit = f;
  $('fitTee').setAttribute('aria-pressed', f === 'tee'); $('fitPolo').setAttribute('aria-pressed', f === 'polo');
  drawPortrait($('portrait'), f);
}
function setSound(on) {
  prefs.sound = on; audio.setOn(on);
  $('bSound').textContent = on ? 'Sound on' : 'Sound off'; $('bSound').setAttribute('aria-pressed', on);
}
$('fitTee').addEventListener('click', () => setFit('tee'));
$('fitPolo').addEventListener('click', () => setFit('polo'));
$('bStart').addEventListener('click', () => { audio.init(); audio.click(); $('intro').hidden = true; playing = true; });
$('bOtherIntro').addEventListener('click', () => setMode(mode === 'daily' ? 'random' : 'daily'));
$('bAgain').addEventListener('click', () => { audio.click(); newRun(); });
$('bOther').addEventListener('click', () => { audio.click(); setMode(mode === 'daily' ? 'random' : 'daily'); });
$('bReset').addEventListener('click', function () { this.blur(); newRun(); });
$('bSound').addEventListener('click', function () { this.blur(); audio.init(); setSound(!prefs.sound); });
$('bShare').addEventListener('click', async function () {
  const res = await share(shareText(day, layout, lastScore, sim));
  this.textContent = res === 'copied' ? 'Copied' : res === 'shared' ? 'Shared' : 'Could not share';
});

// ?debug exposes the live sim for poking at it from the console and from browser tests
if (/[?&]debug\b/.test(location.search)) window.__curb = { get sim() { return sim; }, get level() { return level; } };

newRun();
setFit(fit);
setSound(prefs.sound);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => drawPortrait($('portrait'), fit));
requestAnimationFrame(frame);
