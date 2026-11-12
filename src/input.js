// Mouse, keyboard and twin-stick touch. Turns raw events into the small input
// object the sim wants: a walk vector, an aim and a throttle between 0 and 1.
import { FEATHER } from './sim.js';

const SR = 50; // stick travel in CSS px

export function createInput({ stage, area, cv, stickL, stickR, onGesture, onModeChange, onRestart }) {
  const aim = { x: 0, y: 0 };
  const keys = {};
  const stL = { id: null, ox: 0, oy: 0, x: 0, y: 0, el: stickL }, stR = { id: null, ox: 0, oy: 0, x: 0, y: 0, el: stickR };
  let down = false, gentle = false, mouseSeen = false, following = false, aimAng = Math.PI;
  let touch = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
  let world = { W: 1, H: 1 };
  const out = { mx: 0, my: 0, aimX: undefined, aimY: undefined, ang: undefined, blow: 0 };

  function toWorld(e) {
    const r = cv.getBoundingClientRect();
    aim.x = (e.clientX - r.left) / r.width * world.W; aim.y = (e.clientY - r.top) / r.height * world.H;
  }
  function stickSet(st, e) {
    const r = stage.getBoundingClientRect();
    let vx = (e.clientX - r.left - st.ox) / SR, vy = (e.clientY - r.top - st.oy) / SR;
    const m = Math.sqrt(vx * vx + vy * vy);
    if (m > 1) { vx /= m; vy /= m; }
    st.x = vx; st.y = vy;
    st.el.firstElementChild.style.transform = 'translate(' + vx * SR + 'px,' + vy * SR + 'px)';
  }
  function stickDrop(st) {
    st.id = null; st.x = st.y = 0; st.el.hidden = true;
    stage.classList.toggle('busy', stL.id !== null || stR.id !== null);
  }
  function setTouch(v) {
    if (touch === v) return;
    touch = v; down = false; stage.classList.toggle('touch', v); onModeChange();
  }

  stage.addEventListener('pointerdown', (e) => {
    if (e.target !== cv && e.target !== stage && e.target !== area) return;
    onGesture();
    e.preventDefault();
    if (e.pointerType === 'touch') {
      setTouch(true);
      const r = stage.getBoundingClientRect();
      let st = e.clientX - r.left < r.width / 2 ? stL : stR;
      if (st.id !== null) st = st === stL ? stR : stL;
      if (st.id !== null) return;
      st.id = e.pointerId; st.ox = e.clientX - r.left; st.oy = e.clientY - r.top;
      st.el.style.left = st.ox + 'px'; st.el.style.top = st.oy + 'px'; st.el.hidden = false; stickSet(st, e);
      stage.classList.add('busy');
    } else {
      setTouch(false);
      mouseSeen = true; toWorld(e); down = true; gentle = e.button === 2;
    }
    try { stage.setPointerCapture(e.pointerId); } catch (_) { /* older browsers */ }
  });
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') { if (e.pointerId === stL.id) stickSet(stL, e); else if (e.pointerId === stR.id) stickSet(stR, e); }
    else if (!touch) { mouseSeen = true; toWorld(e); }
  });
  function up(e) {
    if (e.pointerType === 'touch') { if (e.pointerId === stL.id) stickDrop(stL); else if (e.pointerId === stR.id) stickDrop(stR); }
    else { down = false; gentle = false; }
  }
  function release() { down = false; gentle = false; for (const k in keys) keys[k] = false; stickDrop(stL); stickDrop(stR); }
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
  window.addEventListener('blur', release);
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return; // let buttons work
    const k = e.key.toLowerCase(); keys[k] = true;
    if (k === ' ' || k.indexOf('arrow') === 0) e.preventDefault();
    if (k === 'r' && !e.repeat && !e.metaKey && !e.ctrlKey) onRestart();
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  // Called at the start of every run.
  function reset(level) {
    world = level; aim.x = level.tree.x; aim.y = level.tree.y;
    aimAng = level.side > 0 ? 0 : Math.PI; following = false; mouseSeen = false; down = false; gentle = false;
  }

  function read(sim, playing) {
    out.mx = out.my = 0; out.blow = 0; out.ang = out.aimX = out.aimY = undefined;
    if (!playing) { out.ang = sim.ang; return out; }
    const P = sim.P;
    if (touch) {
      const lm = Math.sqrt(stL.x * stL.x + stL.y * stL.y);
      if (stL.id !== null && lm > 0.18) { out.mx = stL.x; out.my = stL.y; }
      const rm = Math.sqrt(stR.x * stR.x + stR.y * stR.y);
      if (stR.id !== null && rm > 0.22) {
        aimAng = Math.atan2(stR.y, stR.x);
        // push the stick a little for a gentle puff, all the way for full power
        out.blow = Math.min(1, 0.35 + 0.65 * (rm - 0.22) / 0.6);
      }
      out.ang = aimAng;
      return out;
    }
    let mx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
    let my = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
    if (mx === 0 && my === 0 && mouseSeen) {
      // follow the cursor, with a dead zone so re-aiming does not make him drift
      const tx = aim.x - P.x, ty = aim.y - (P.y - 26), td = Math.sqrt(tx * tx + ty * ty);
      if (td > 150) following = true; else if (td < 112) following = false;
      if (following) { const pace = Math.min(1, (td - 100) / 70); mx = tx / td * pace; my = ty / td * pace; }
    } else following = false;
    out.mx = mx; out.my = my; out.aimX = aim.x; out.aimY = aim.y;
    if (down || keys[' ']) out.blow = gentle || keys.shift ? FEATHER : 1;
    return out;
  }

  stage.classList.toggle('touch', touch);
  return { read, reset, get touch() { return touch; } };
}
