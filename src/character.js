// The guy and his blower. Pure canvas drawing, shared by the game and the intro portrait.
import { rng } from './rng.js';

const SKIN = '#e9b998', HAIR = '#2a1c16';

export function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

export function drawBlower(c, x, y, ang, s) {
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
  c.fillStyle = '#26262a'; rr(c, 5, -2.6, 26, 5.2, 2); c.fill();
  c.fillStyle = '#111'; c.fillRect(28, -3.2, 3.5, 6.4);
  c.fillStyle = '#e2702a'; rr(c, -8, -5.5, 15, 11, 3.5); c.fill();
  c.fillStyle = '#b9521a'; c.beginPath(); c.arc(-1, 0, 3.2, 0, 7); c.fill();
  c.restore();
}

// Feet at origin, about 56 units tall. o: { fit, phase, drink, facing }
export function drawGuy(c, x, y, s, o) {
  const tee = o.fit === 'tee', bob = Math.sin(o.phase) * 1.6, bob2 = Math.sin(o.phase + Math.PI) * 1.6;
  const shirt = tee ? '#d4212b' : '#4d5b3c';
  c.save(); c.translate(x, y); c.scale(s * (o.facing || 1), s);
  c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(0, 0, 13, 4, 0, 0, 7); c.fill();
  // legs
  if (tee) {
    c.fillStyle = SKIN; rr(c, -6.2, -15, 5, 13 + bob, 2); c.fill(); rr(c, 1.2, -15, 5, 13 + bob2, 2); c.fill();
  } else {
    c.fillStyle = '#3f5f93'; rr(c, -6.6, -21, 5.8, 19 + bob, 2); c.fill(); rr(c, 0.8, -21, 5.8, 19 + bob2, 2); c.fill();
  }
  c.fillStyle = tee ? '#efece4' : '#d8c8a2';
  rr(c, -7.4, -3.4 + bob, 7, 3.6, 1.6); c.fill(); rr(c, 0.4, -3.4 + bob2, 7, 3.6, 1.6); c.fill();
  if (tee) {
    c.fillStyle = '#e9e2cf'; rr(c, -8.2, -23, 16.4, 11.5, 2.5); c.fill();
    c.strokeStyle = '#cfc6ad'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(0, -20); c.lineTo(0, -11.5); c.stroke();
    c.strokeStyle = '#fff'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(-1.6, -21.5); c.lineTo(-1, -19); c.moveTo(1.6, -21.5); c.lineTo(1, -19); c.stroke();
  }
  // torso
  c.fillStyle = shirt; rr(c, -9.2, -37, 18.4, 16.5, 4); c.fill();
  if (tee) {
    c.fillStyle = '#fff'; c.fillRect(-4, -33.6, 8, 1); c.fillRect(-5.4, -31.8, 10.8, 1.6);
    c.beginPath(); c.ellipse(0, -27.6, 3.6, 2, 0, 0, 7); c.fill();
    c.fillStyle = '#3a6b33'; c.beginPath(); c.ellipse(0, -27.6, 2.7, 1.3, 0, 0, 7); c.fill();
    c.fillStyle = '#7a3b22'; c.beginPath(); c.arc(-0.9, -27.7, 0.8, 0, 7); c.arc(0.9, -27.4, 0.8, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.fillRect(-3.6, -24.6, 7.2, 0.9); c.fillRect(-5, -23.2, 10, 1.5);
  } else {
    c.fillStyle = '#3d4930'; c.beginPath(); c.moveTo(-4, -37); c.lineTo(0, -33.5); c.lineTo(4, -37); c.lineTo(2.2, -38.2); c.lineTo(-2.2, -38.2); c.closePath(); c.fill();
    c.fillRect(-0.3, -33.5, 0.6, 4);
  }
  // back arm on hip, with the watch
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = SKIN; c.lineWidth = 3.4; c.beginPath(); c.moveTo(-9.6, -33); c.lineTo(-13.4, -27.5); c.lineTo(-9, -22.5); c.stroke();
  c.strokeStyle = '#161616'; c.lineWidth = 3.7; c.beginPath(); c.moveTo(-11.2, -25); c.lineTo(-10.4, -24.1); c.stroke();
  c.strokeStyle = shirt; c.lineWidth = 4.6; c.beginPath(); c.moveTo(-9.2, -34); c.lineTo(-11, -31.2); c.stroke();
  // front arm
  if (o.drink) {
    c.strokeStyle = SKIN; c.lineWidth = 3.4; c.beginPath(); c.moveTo(9.6, -33); c.lineTo(13, -28); c.lineTo(12, -35); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(12, -36); c.lineTo(12, -40); c.moveTo(10.4, -36); c.lineTo(13.6, -36); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.moveTo(9.2, -46); c.lineTo(14.8, -46); c.quadraticCurveTo(14.8, -40, 12, -40); c.quadraticCurveTo(9.2, -40, 9.2, -46); c.fill(); c.stroke();
    c.fillStyle = '#f08a9b'; c.beginPath(); c.moveTo(9.6, -43.6); c.lineTo(14.4, -43.6); c.quadraticCurveTo(14.2, -40.4, 12, -40.4); c.quadraticCurveTo(9.8, -40.4, 9.6, -43.6); c.fill();
  } else {
    c.strokeStyle = SKIN; c.lineWidth = 3.4; c.beginPath(); c.moveTo(9.4, -33); c.lineTo(11, -24.5); c.stroke();
  }
  c.strokeStyle = shirt; c.lineWidth = 4.6; c.beginPath(); c.moveTo(9.2, -34); c.lineTo(10.6, -31.2); c.stroke();
  // head
  c.fillStyle = SKIN; c.fillRect(-2.2, -40.5, 4.4, 4.5);
  c.beginPath(); c.arc(-7.4, -45, 1.5, 0, 7); c.arc(7.4, -45, 1.5, 0, 7); c.fill();
  c.beginPath(); c.ellipse(0, -46, 7.3, 8, 0, 0, 7); c.fill();
  c.fillStyle = 'rgba(70,45,32,.26)'; c.beginPath(); c.ellipse(0, -46, 7.3, 8, 0, 0.12 * Math.PI, 0.88 * Math.PI); c.closePath(); c.fill();
  c.fillStyle = HAIR;
  [[-6, -51, 3], [-3, -54, 3.3], [0.5, -55, 3.4], [4, -53.6, 3.2], [6.4, -50.6, 2.8], [-7, -48.4, 2.2], [7, -48, 2], [-0.5, -52, 3.4], [2.6, -51.6, 2.8], [-3.6, -51, 2.6], [5, -55, 1.8], [-1.5, -56.6, 1.8]]
    .forEach((p) => { c.beginPath(); c.arc(p[0], p[1], p[2], 0, 7); c.fill(); });
  c.strokeStyle = HAIR; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-5, -48.6); c.lineTo(-1.6, -48.9); c.moveTo(1.6, -48.9); c.lineTo(5, -48.6); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.arc(-3.1, -45.6, 2.6, 0, 7); c.arc(3.1, -45.6, 2.6, 0, 7); c.fill();
  c.fillStyle = '#231a16'; c.beginPath(); c.arc(-3.1, -45.6, 0.75, 0, 7); c.arc(3.1, -45.6, 0.75, 0, 7); c.fill();
  c.strokeStyle = '#17140f'; c.lineWidth = 0.85;
  c.beginPath(); c.arc(-3.1, -45.6, 2.6, 0, 7); c.stroke(); c.beginPath(); c.arc(3.1, -45.6, 2.6, 0, 7); c.stroke();
  c.beginPath(); c.moveTo(-0.5, -45.9); c.lineTo(0.5, -45.9); c.moveTo(-5.7, -46); c.lineTo(-7.2, -46.6); c.moveTo(5.7, -46); c.lineTo(7.2, -46.6); c.stroke();
  c.strokeStyle = '#8a5a48'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-1.9, -41); c.lineTo(1.9, -41); c.stroke();
  c.restore();
}

export function drawPortrait(pc, fit) {
  const c = pc.getContext('2d');
  c.clearRect(0, 0, pc.width, pc.height);
  c.fillStyle = '#9a4a3a'; rr(c, 0, 0, pc.width, pc.height, 14); c.fill();
  c.save(); c.clip();
  const r = rng(3), tones = ['#a5523f', '#9a4a3a', '#b05c45', '#8e4436'];
  for (let y = 0, row = 0; y < pc.height; y += 22, row++) {
    for (let x = row % 2 ? -22 : 0; x < pc.width; x += 44) { c.fillStyle = tones[(r() * 4) | 0]; c.fillRect(x + 1, y + 1, 42, 20); }
  }
  c.fillStyle = 'rgba(27,23,20,.25)'; c.fillRect(0, 0, pc.width, pc.height);
  const tee = fit === 'tee';
  drawGuy(c, 112, 272, 4.5, { fit, phase: 0, drink: tee, facing: 1 });
  if (!tee) drawBlower(c, 112 + 11 * 4.5, 272 - 24.5 * 4.5, 2.05, 4.2);
  c.restore();
}
