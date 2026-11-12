// Small deterministic helpers. Everything that shapes a level goes through these,
// so the same seed always produces the same sidewalk.

export function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

const EPOCH = Date.UTC(2026, 10, 12); // block #1

// Local calendar day, so the block rolls over at the player's midnight.
export function today(d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  const key = '' + y + String(m + 1).padStart(2, '0') + String(day).padStart(2, '0');
  const number = Math.round((Date.UTC(y, m, day) - EPOCH) / 86400000) + 1;
  const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return { key, number, label, seed: hash('curb:' + key) };
}
