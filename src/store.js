// Saved preferences and best scores. Storage can be blocked (private windows,
// embedded previews), so every access is guarded and the game works without it.

const KEY = 'curb.v1';
const KEEP = 21; // days of bests to hang on to

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}
function save(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* not available */ }
}

const data = Object.assign({ fit: 'tee', sound: true, best: {} }, load());
if (!data.best || typeof data.best !== 'object') data.best = {};

export const prefs = {
  get fit() { return data.fit === 'polo' ? 'polo' : 'tee'; },
  set fit(v) { data.fit = v; save(data); },
  get sound() { return data.sound !== false; },
  set sound(v) { data.sound = !!v; save(data); },
};

export function getBest(key) { return data.best[key] || null; }

// Returns true when this run is a new best for the block.
export function recordBest(key, run) {
  const prev = data.best[key];
  if (prev && prev.score >= run.score) return false;
  data.best[key] = run;
  const keys = Object.keys(data.best).sort();
  while (keys.length > KEEP * 2) delete data.best[keys.shift()];
  save(data);
  return true;
}

export function fmtTime(t) {
  const m = (t / 60) | 0, s = (t % 60) | 0;
  return m + ':' + (s < 10 ? '0' : '') + s;
}
export function fmtNum(n) { return Math.round(n).toLocaleString('en-US'); }

export function shareText(day, layout, sc, sim) {
  const lines = [
    '🍂 Curb Appeal #' + day.number + ' (' + layout + ')',
    fmtNum(sc.score) + ' pts against a par of ' + fmtNum(sc.par),
    fmtTime(sim.time) + ' on the clock, ' + Math.round(sim.fuel) + '% fuel left, ' + sim.lost + ' lost to traffic',
  ];
  if (/^https?:/.test(location.protocol)) lines.push(location.origin + location.pathname);
  return lines.join('\n');
}

// Resolves to 'shared', 'copied' or 'failed'.
export async function share(text) {
  try {
    if (navigator.share && window.matchMedia('(pointer:coarse)').matches) { await navigator.share({ text }); return 'shared'; }
  } catch (e) { if (e && e.name === 'AbortError') return 'failed'; }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch (e) { /* fall through */ }
  try {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove();
    return ok ? 'copied' : 'failed';
  } catch (e) { return 'failed'; }
}
