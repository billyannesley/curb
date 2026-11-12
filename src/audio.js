// All sound is synthesized: a two-oscillator engine, filtered noise for air and
// leaf rustle, and a handful of short one-shots for feedback.

export function createAudio() {
  let AC = null, on = true, a = {}, lastTick = 0;

  function init() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const buf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      a.noiseBuf = buf;
      const noise = () => { const n = AC.createBufferSource(); n.buffer = buf; n.loop = true; n.start(); return n; };
      a.master = AC.createGain(); a.master.gain.value = on ? 0.5 : 0; a.master.connect(AC.destination);
      a.osc = AC.createOscillator(); a.osc.type = 'sawtooth'; a.osc.frequency.value = 70;
      a.osc2 = AC.createOscillator(); a.osc2.type = 'square'; a.osc2.frequency.value = 106;
      a.og = AC.createGain(); a.og.gain.value = 0;
      const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      a.osc.connect(lp); a.osc2.connect(lp); lp.connect(a.og); a.og.connect(a.master); a.osc.start(); a.osc2.start();
      a.bp = AC.createBiquadFilter(); a.bp.type = 'bandpass'; a.bp.frequency.value = 700; a.bp.Q.value = 0.6;
      a.ng = AC.createGain(); a.ng.gain.value = 0; noise().connect(a.bp); a.bp.connect(a.ng); a.ng.connect(a.master);
      const hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
      a.rg = AC.createGain(); a.rg.gain.value = 0; noise().connect(hp); hp.connect(a.rg); a.rg.connect(a.master);
      // gust bed
      const gl = AC.createBiquadFilter(); gl.type = 'lowpass'; gl.frequency.value = 420;
      a.gg = AC.createGain(); a.gg.gain.value = 0; noise().connect(gl); gl.connect(a.gg); a.gg.connect(a.master);
    } catch (e) { AC = null; }
  }

  function setOn(v) {
    on = v;
    if (AC) a.master.gain.setTargetAtTime(on ? 0.5 : 0, AC.currentTime, 0.03);
  }

  // called every frame with the live state
  function update(throttle, moving, fuel, gustEnv) {
    if (!AC) return;
    const t = AC.currentTime;
    // the engine coughs when the tank is nearly dry
    const cough = fuel < 12 && throttle > 0.1 ? 1 - 0.35 * Math.max(0, Math.sin(t * 31) * Math.sin(t * 7.3)) : 1;
    const f = (68 + throttle * 112) * cough;
    a.osc.frequency.setTargetAtTime(f, t, 0.05);
    a.osc2.frequency.setTargetAtTime(f * 1.51, t, 0.05);
    a.og.gain.setTargetAtTime(throttle * 0.07, t, 0.04);
    a.bp.frequency.setTargetAtTime(500 + throttle * 1100, t, 0.05);
    a.ng.gain.setTargetAtTime(throttle * 0.3 * cough, t, 0.04);
    a.rg.gain.setTargetAtTime(Math.min(0.22, moving / 500 * 0.22), t, 0.08);
    a.gg.gain.setTargetAtTime(gustEnv * 0.5, t, 0.12);
  }

  function tone(freq, when, dur, type, vol) {
    const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + when;
    o.type = type || 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol || 0.2, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(a.master); o.start(t); o.stop(t + dur + 0.05);
  }
  function burst(when, dur, freq, q, vol, sweepTo) {
    const n = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), t = AC.currentTime + when;
    n.buffer = a.noiseBuf; n.loop = true; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    n.connect(f); f.connect(g); g.connect(a.master); n.start(t, Math.random()); n.stop(t + dur + 0.05);
  }

  // Leaves landing on the tarp: a soft papery tick that climbs as the tarp fills.
  function tarpTick(pct) {
    if (!AC) return;
    const now = AC.currentTime;
    if (now - lastTick < 0.045) return;
    lastTick = now;
    burst(0, 0.05, 1800 + pct * 2600 + Math.random() * 400, 3, 0.16);
  }
  function milestone(step) { if (AC) { const b = 392 * Math.pow(1.122, step * 2); tone(b, 0, 0.22, 'triangle', 0.16); tone(b * 1.5, 0.08, 0.3, 'triangle', 0.14); } }
  function lost() { if (AC) burst(0, 0.5, 900, 0.8, 0.22, 220); }
  function gustWarn() { if (AC) { tone(660, 0, 0.12, 'square', 0.05); tone(660, 0.18, 0.12, 'square', 0.05); } }
  function win() { if (AC) [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.5, 'triangle', 0.17)); }
  function fail() { if (AC) { [196, 165, 131].forEach((f, i) => tone(f, i * 0.16, 0.34, 'sawtooth', 0.09)); burst(0.1, 0.6, 300, 1, 0.12, 80); } }
  function click() { if (AC) tone(880, 0, 0.06, 'triangle', 0.08); }

  return { init, setOn, update, tarpTick, milestone, lost, gustWarn, win, fail, click };
}
