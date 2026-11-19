// DEADZONE — Canvas 2D renderer. World coords -> screen via view.
// Fast: no shadows on low quality, simple culling, no per-frame allocations
// in the hot paths beyond what the draw calls need.

import { darkness } from './game.js';

const GRASS = '#2f4a2c';
const PARK_GRASS = '#3a6334';
const ASPHALT = '#33333a';
const ROAD_LINE = '#55555e';
const SQUARE = '#5d5d64';
const SQUARE_LINE = '#4a4a52';

function inView(x, y, r, vx, vy, vw, vh) {
  return x + r >= vx && x - r <= vx + vw && y + r >= vy && y - r <= vy + vh;
}

// ---- Blocky voxel figures (v2) -------------------------------------------
// Top-down Minecraft-style figures: square head, rectangular torso, blocky
// arms and legs, drawn rotated to face the entity's angle. Local coords:
// +x = facing direction. `s` scales the figure (walker s = 1).
function shade(hex, f) {
  const n = parseInt(String(hex).slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

function block(ctx, x, y, w, h, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
}

function drawBlockyGun(ctx, weapon) {
  ctx.fillStyle = '#1a1a1a';
  if (weapon === 'shotgun') {
    ctx.fillRect(6, 10, 20, 6);
    ctx.fillRect(24, 11, 8, 4);
    ctx.fillStyle = '#6a4a26';
    ctx.fillRect(6, 10, 8, 6); // wooden pump
  } else if (weapon === 'rifle') {
    ctx.fillRect(6, 11, 24, 5);
    ctx.fillRect(28, 12, 8, 3);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(14, 10, 4, 7); // sight
  } else if (weapon === 'smg') {
    ctx.fillRect(6, 11, 14, 5);
    ctx.fillRect(18, 12, 6, 3);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(8, 16, 3, 5); // grip
  } else if (weapon === 'sniper') {
    ctx.fillRect(6, 11, 28, 5);
    ctx.fillRect(32, 12, 6, 3);
    ctx.fillStyle = '#2a6a8a';
    ctx.fillRect(16, 9, 6, 4); // scope
  } else { // pistol
    ctx.fillRect(6, 11, 12, 5);
    ctx.fillRect(16, 12, 5, 3);
  }
}

function drawPlayerFigure(ctx, p, time) {
  // Walk phase advances with distance moved (render-local, visual only).
  const moved = Math.hypot(p.x - (p._lx ?? p.x), p.y - (p._ly ?? p.y));
  if (moved > 0.3) p._walkPhase = (p._walkPhase || 0) + moved * 0.09;
  p._lx = p.x; p._ly = p.y;
  const swing = Math.sin(p._walkPhase || 0) * 3.5;
  const invBlink = p.invulnT > 0 && Math.floor(time * 12) % 2 === 0;
  const body = invBlink ? '#ffffff' : (p.charColor || '#2a7a8a');

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  // Dash afterimages.
  if (p.dashT > 0) {
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = body;
    ctx.fillRect(-34, -10, 20, 20);
    ctx.fillRect(-46, -8, 16, 16);
    ctx.globalAlpha = 1;
  }
  // Legs (rear), swinging with the walk cycle.
  block(ctx, -14 - swing * 0.6, -9, 8, 7, '#1a2a33', 'rgba(0,0,0,0.5)');
  block(ctx, -14 + swing * 0.6, 2, 8, 7, '#22343d', 'rgba(0,0,0,0.5)');
  // Torso + chest strap.
  block(ctx, -10, -10, 20, 20, body, 'rgba(0,0,0,0.5)');
  block(ctx, -10, -2, 20, 4, shade(p.charColor || '#2a7a8a', 0.7));
  // Arms: left at side, right holds the weapon forward.
  block(ctx, -6, -16, 7, 6, shade(p.charColor || '#2a7a8a', 0.8), 'rgba(0,0,0,0.4)');
  block(ctx, -2, 10, 7, 6, shade(p.charColor || '#2a7a8a', 0.8), 'rgba(0,0,0,0.4)');
  drawBlockyGun(ctx, p.weapon);
  // Head: skin square, hair band at the rear, square eyes.
  block(ctx, 2, -8, 14, 16, invBlink ? '#ffffff' : '#e8b88a', 'rgba(0,0,0,0.5)');
  block(ctx, 2, -8, 4, 16, invBlink ? '#ffffff' : '#4a2f18'); // hair
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(13, -5, 2.5, 3);
  ctx.fillRect(13, 2, 2.5, 3);
  // Shield / invulnerability outline.
  if (p.shieldT > 0) {
    ctx.strokeStyle = `rgba(80,180,255,${0.5 + 0.3 * Math.sin(time * 8)})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(-18, -18, 52, 36);
  } else if (p.invulnT > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-18, -18, 52, 36);
  }
  ctx.restore();
}

function drawZombieFigure(ctx, z, time) {
  const s = z.r / 16;
  const base = z.color || '#6a8f5f';
  const flashing = z.flash > 0;
  const col = flashing ? '#ffffff' : base;
  const dark = flashing ? '#dddddd' : shade(base, 0.65);
  const light = flashing ? '#ffffff' : shade(base, 1.25);
  // Boomer fuse: swell + blink before it blows.
  let scale = 1;
  if (z.dying) scale = 1 + 0.18 * Math.sin(time * 25);
  // Runner lunge wind-up: crouch (squash along the facing axis).
  const squash = z.lungeState === 1 ? 0.8 : 1;
  const slamWindup = z.slamState === 1;

  ctx.save();
  ctx.translate(z.x, z.y);
  ctx.rotate(z.angle);
  ctx.scale(scale * squash, scale);
  const swing = Math.sin(time * 8 + z.x * 0.7) * 2.5 * s;
  // Legs (rear), shuffling.
  block(ctx, -13 * s - swing * 0.5, -9 * s, 7 * s, 7 * s, dark, 'rgba(0,0,0,0.45)');
  block(ctx, -13 * s + swing * 0.5, 2 * s, 7 * s, 7 * s, shade(base, 0.55), 'rgba(0,0,0,0.45)');
  // Torso + ribs.
  block(ctx, -10 * s, -9 * s, 18 * s, 18 * s, col, 'rgba(0,0,0,0.5)');
  block(ctx, -10 * s, -1 * s, 18 * s, 2.5 * s, dark);
  // Arms — zombie-style, stretched forward (runners trail them back).
  // Brute slam wind-up: arms raised sideways + red flash outline.
  const armH = (z.type === 'brute' || z.isBoss) ? 7 * s : 5 * s;
  if (slamWindup) {
    block(ctx, -6 * s, -17 * s, 8 * s, 6 * s, dark, 'rgba(0,0,0,0.4)');
    block(ctx, -6 * s, 11 * s, 8 * s, 6 * s, dark, 'rgba(0,0,0,0.4)');
  } else if (z.type === 'runner') {
    block(ctx, -16 * s, -13 * s, 10 * s, armH, dark, 'rgba(0,0,0,0.4)');
    block(ctx, -16 * s, 8 * s, 10 * s, armH, dark, 'rgba(0,0,0,0.4)');
  } else {
    block(ctx, 6 * s, -13 * s, 12 * s, armH, dark, 'rgba(0,0,0,0.4)');
    block(ctx, 6 * s, 8 * s, 12 * s, armH, dark, 'rgba(0,0,0,0.4)');
  }
  // Head + face.
  block(ctx, 4 * s, -7 * s, 12 * s, 14 * s, light, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = z.isBoss ? '#ff4040' : '#ffdd55';
  ctx.fillRect(12 * s, -4.5 * s, 2.5 * s, 3 * s);
  ctx.fillRect(12 * s, 1.5 * s, 2.5 * s, 3 * s);
  if (z.type === 'spitter') {
    ctx.fillStyle = '#1e4a2a'; // open mouth
    ctx.fillRect(12 * s, -3 * s, 4 * s, 6 * s);
  } else if (z.type === 'boomer') {
    ctx.fillStyle = shade(base, 0.7); // swollen cheeks
    ctx.fillRect(10 * s, -6 * s, 3 * s, 3 * s);
    ctx.fillRect(10 * s, 4 * s, 3 * s, 3 * s);
  } else {
    ctx.fillStyle = '#1e2a1a'; // classic zombie mouth
    ctx.fillRect(14 * s, -1.5 * s, 2 * s, 3 * s);
  }
  // Boss: blocky gold crown on the rear edge of the head.
  if (z.isBoss) {
    ctx.fillStyle = '#ffd54f';
    ctx.fillRect(4 * s, -8 * s, 3 * s, 3 * s);
    ctx.fillRect(4 * s, -1.5 * s, 3 * s, 4 * s);
    ctx.fillRect(4 * s, 5 * s, 3 * s, 3 * s);
  }
  // Swarm bonus: walkers in a pack render slightly brighter.
  if (z.swarm) {
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-10 * s, -9 * s, 18 * s, 18 * s);
    ctx.globalAlpha = 1;
  }
  // Boomer fuse blink.
  if (z.dying && Math.floor(time * 12) % 2 === 0) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-20 * s, -20 * s, 48 * s, 40 * s);
    ctx.globalAlpha = 1;
  }
  // Elite glow (red pulsing outline; stronger when enraged).
  if (z.elite) {
    const a = z.enraged ? 0.75 + 0.25 * Math.sin(time * 10) : 0.45 + 0.2 * Math.sin(time * 5);
    ctx.strokeStyle = `rgba(255,40,40,${a.toFixed(2)})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(-18 * s, -18 * s, 46 * s, 36 * s);
  }
  // Brute slam wind-up: red flashing outline.
  if (slamWindup) {
    ctx.strokeStyle = Math.floor(time * 10) % 2 === 0 ? 'rgba(255,40,40,0.9)' : 'rgba(255,120,120,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(-20 * s, -20 * s, 48 * s, 40 * s);
  }
  // Runner lunge wind-up: white blink outline.
  if (z.lungeState === 1 && Math.floor(time * 14) % 2 === 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-18 * s, -18 * s, 46 * s, 36 * s);
  }
  ctx.restore();
}

export function render(ctx, state, view) {
  const world = state.world;
  const lowQ = state.quality === 'low';
  const dark = darkness(state);
  const w = view.w, h = view.h;
  const scale = view.scale || 1;

  // Screen shake: jitter the camera by state.shake.
  let camX = view.camX, camY = view.camY;
  if (state.shake > 0.2) {
    camX += (Math.random() * 2 - 1) * state.shake;
    camY += (Math.random() * 2 - 1) * state.shake;
  }
  const vw = w / scale, vh = h / scale; // visible world size

  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-camX, -camY);

  // ---- Ground ----
  ctx.fillStyle = GRASS;
  ctx.fillRect(camX, camY, vw, vh);

  // Streets (asphalt + centre dashes).
  ctx.fillStyle = ASPHALT;
  for (let i = 0; i < world.streets.length; i++) {
    const s = world.streets[i];
    ctx.fillRect(s.x, s.y, s.w, s.h);
  }
  ctx.fillStyle = ROAD_LINE;
  for (let i = 0; i < world.streets.length; i++) {
    const s = world.streets[i];
    if (s.w > s.h) {
      for (let x = s.x + 10; x < s.x + s.w - 10; x += 60) ctx.fillRect(x, s.y + s.h / 2 - 2, 30, 4);
    } else {
      for (let y = s.y + 10; y < s.y + s.h - 10; y += 60) ctx.fillRect(s.x + s.w / 2 - 2, y, 4, 30);
    }
  }

  // Park.
  ctx.fillStyle = PARK_GRASS;
  ctx.fillRect(world.park.x, world.park.y, world.park.w, world.park.h);

  // Central square (stone tiles).
  const sq = world.square;
  ctx.fillStyle = SQUARE;
  ctx.fillRect(sq.x, sq.y, sq.w, sq.h);
  ctx.strokeStyle = SQUARE_LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = sq.x + 50; x < sq.x + sq.w; x += 50) {
    ctx.moveTo(x, sq.y); ctx.lineTo(x, sq.y + sq.h);
  }
  for (let y = sq.y + 50; y < sq.y + sq.h; y += 50) {
    ctx.moveTo(sq.x, y); ctx.lineTo(sq.x + sq.w, y);
  }
  ctx.stroke();
  // Square fountain ring at the centre.
  ctx.strokeStyle = '#7a7a85';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(sq.x + sq.w / 2, sq.y + sq.h / 2, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#3a5a7a';
  ctx.beginPath();
  ctx.arc(sq.x + sq.w / 2, sq.y + sq.h / 2, 20, 0, Math.PI * 2);
  ctx.fill();

  // ---- Trees (under buildings) ----
  for (let i = 0; i < world.trees.length; i++) {
    const t = world.trees[i];
    if (!inView(t.x, t.y, t.r, camX, camY, vw, vh)) continue;
    ctx.fillStyle = '#1e3a1e';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2f5a2a';
    ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.75, 0, Math.PI * 2); ctx.fill();
  }

  // ---- Buildings: roof + walls + windows ----
  for (let i = 0; i < world.buildings.length; i++) {
    const b = world.buildings[i];
    if (!inView(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) / 2, camX, camY, vw, vh)) continue;
    // Wall shadow edge.
    ctx.fillStyle = '#1c1a20';
    ctx.fillRect(b.x + 4, b.y + 4, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // Roof ridge.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    // Windows.
    ctx.fillStyle = '#ffd98a';
    const cols = Math.max(1, Math.floor(b.w / 46));
    const rows = Math.max(1, Math.floor(b.h / 42));
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        if ((cx * 7 + cy * 3 + i) % 3 === 0) continue; // some dark windows
        ctx.fillRect(b.x + 14 + cx * 44, b.y + 13 + cy * 40, 16, 14);
      }
    }
    if (b.church) {
      // Church cross on the roof.
      ctx.fillStyle = '#e8e0c8';
      const cxp = b.x + b.w / 2, cyp = b.y + b.h / 2;
      ctx.fillRect(cxp - 3, cyp - 16, 6, 32);
      ctx.fillRect(cxp - 11, cyp - 8, 22, 6);
    }
  }

  // ---- Wrecked cars ----
  for (let i = 0; i < world.cars.length; i++) {
    const c = world.cars[i];
    if (!inView(c.x + c.w / 2, c.y + c.h / 2, Math.max(c.w, c.h) / 2, camX, camY, vw, vh)) continue;
    ctx.fillStyle = '#14141a';
    ctx.fillRect(c.x + 2, c.y + 3, c.w, c.h);
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.fillStyle = '#8ab8d8';
    if (c.w > c.h) ctx.fillRect(c.x + c.w * 0.25, c.y + 5, c.w * 0.22, c.h - 10);
    else ctx.fillRect(c.x + 5, c.y + c.h * 0.25, c.w - 10, c.h * 0.22);
    ctx.fillStyle = '#22222a';
    ctx.fillRect(c.x + 4, c.y + 2, 8, 4);
    ctx.fillRect(c.x + c.w - 12, c.y + 2, 8, 4);
  }

  // ---- Crates & barrels (smashable) ----
  for (let i = 0; i < world.crates.length; i++) {
    const c = world.crates[i];
    if (c.hp <= 0 || !inView(c.x, c.y, c.r, camX, camY, vw, vh)) continue;
    ctx.fillStyle = '#6a4a26';
    ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
    ctx.strokeStyle = '#4a3016';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
    ctx.beginPath();
    ctx.moveTo(c.x - c.r, c.y - c.r); ctx.lineTo(c.x + c.r, c.y + c.r);
    ctx.moveTo(c.x + c.r, c.y - c.r); ctx.lineTo(c.x - c.r, c.y + c.r);
    ctx.stroke();
  }
  for (let i = 0; i < world.barrels.length; i++) {
    const b = world.barrels[i];
    if (b.hp <= 0 || !inView(b.x, b.y, b.r, camX, camY, vw, vh)) continue;
    ctx.fillStyle = '#7a5a1a';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#4a380a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 3, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#a87a22';
    ctx.beginPath(); ctx.arc(b.x - 3, b.y - 3, b.r * 0.45, 0, Math.PI * 2); ctx.fill();
  }

  // ---- Barricades (planks, crack when damaged) ----
  for (let i = 0; i < world.barricades.length; i++) {
    const b = world.barricades[i];
    if (b.hp <= 0 || !inView(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) / 2, camX, camY, vw, vh)) continue;
    const hurt = b.hp < b.maxHp * 0.5;
    ctx.fillStyle = hurt ? '#5a4020' : '#7a5a30';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = '#3a2a12';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.beginPath();
    if (b.w > b.h) {
      ctx.moveTo(b.x, b.y + b.h / 2); ctx.lineTo(b.x + b.w, b.y + b.h / 2);
    } else {
      ctx.moveTo(b.x + b.w / 2, b.y); ctx.lineTo(b.x + b.w / 2, b.y + b.h);
    }
    ctx.stroke();
    if (hurt) {
      ctx.strokeStyle = '#2a1c08';
      ctx.beginPath();
      ctx.moveTo(b.x + b.w * 0.2, b.y + 2); ctx.lineTo(b.x + b.w * 0.45, b.y + b.h - 2);
      ctx.moveTo(b.x + b.w * 0.7, b.y + 2); ctx.lineTo(b.x + b.w * 0.55, b.y + b.h - 2);
      ctx.stroke();
    }
  }

  // ---- Lamps ----
  for (let i = 0; i < world.lamps.length; i++) {
    const l = world.lamps[i];
    if (!inView(l.x, l.y, 24, camX, camY, vw, vh)) continue;
    ctx.fillStyle = '#22222a';
    ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
    ctx.fillStyle = dark > 0 ? '#ffe9a8' : '#c8c8b8';
    ctx.beginPath(); ctx.arc(l.x, l.y, 5, 0, Math.PI * 2); ctx.fill();
  }

  // ---- Pickups ----
  for (let i = 0; i < state.pickups.length; i++) {
    const p = state.pickups[i];
    if (!inView(p.x, p.y, 20, camX, camY, vw, vh)) continue;
    const bob = Math.sin((p.t || 0) * 4) * 2;
    if (p.kind === 'scrap') {
      ctx.fillStyle = '#e8b820';
      ctx.beginPath(); ctx.arc(p.x, p.y + bob, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a6a08';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('S', p.x, p.y + bob + 0.5);
    } else if (p.kind === 'ammo') {
      ctx.fillStyle = '#3a7a3a';
      ctx.fillRect(p.x - 8, p.y - 6 + bob, 16, 12);
      ctx.fillStyle = '#ffd23a';
      ctx.fillRect(p.x - 5, p.y - 3 + bob, 3, 6);
      ctx.fillRect(p.x + 2, p.y - 3 + bob, 3, 6);
    } else if (p.kind === 'medkit') {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(p.x - 9, p.y - 7 + bob, 18, 14);
      ctx.fillStyle = '#c82828';
      ctx.fillRect(p.x - 2, p.y - 5 + bob, 4, 10);
      ctx.fillRect(p.x - 6, p.y - 1 + bob, 12, 4);
    } else if (p.kind === 'crate') {
      ctx.fillStyle = '#8a6a2a';
      ctx.fillRect(p.x - 14, p.y - 12 + bob, 28, 24);
      ctx.strokeStyle = '#5a4210';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 14, p.y - 12 + bob, 28, 24);
      ctx.fillStyle = '#ffe9a8';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', p.x, p.y + bob);
    } else if (p.kind === 'supply') {
      // Rare supply crate: bigger, gold, with a light beam to the sky.
      ctx.globalAlpha = 0.12 + 0.05 * Math.sin(time * 4);
      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(p.x - 3, p.y - 180, 6, 160);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(p.x - 17, p.y - 14 + bob, 34, 28);
      ctx.strokeStyle = '#8a6a1a';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 17, p.y - 14 + bob, 34, 28);
      ctx.beginPath();
      ctx.moveTo(p.x - 17, p.y + bob); ctx.lineTo(p.x + 17, p.y + bob);
      ctx.moveTo(p.x, p.y - 14 + bob); ctx.lineTo(p.x, p.y + 14 + bob);
      ctx.stroke();
      ctx.fillStyle = '#3a2a00';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', p.x, p.y + 1 + bob);
    } else if (p.kind === 'weapon') {
      // Looted gun: dark box with a barrel + colored stripe per weapon.
      const stripe = p.weapon === 'sniper' ? '#2a9ad8' : '#ffd23a';
      ctx.fillStyle = '#222';
      ctx.fillRect(p.x - 11, p.y - 6 + bob, 22, 12);
      ctx.fillStyle = '#444';
      ctx.fillRect(p.x + 11, p.y - 2 + bob, 8, 4);
      ctx.fillStyle = stripe;
      ctx.fillRect(p.x - 11, p.y + 4 + bob, 22, 2);
    } else if (p.kind === 'grenade') {
      ctx.fillStyle = '#2a5a2a';
      ctx.fillRect(p.x - 5, p.y - 5 + bob, 10, 10);
      ctx.fillStyle = '#3a7a3a';
      ctx.fillRect(p.x - 5, p.y - 5 + bob, 10, 3);
      ctx.fillStyle = '#ffd23a';
      ctx.fillRect(p.x - 1, p.y - 1 + bob, 2, 2);
    } else if (p.kind === 'armor') {
      ctx.fillStyle = '#5a7a9a';
      ctx.fillRect(p.x - 8, p.y - 6 + bob, 16, 12);
      ctx.fillStyle = '#8ab4d8';
      ctx.fillRect(p.x - 8, p.y - 6 + bob, 16, 3);
      ctx.fillStyle = '#2a4a6a';
      ctx.fillRect(p.x - 2, p.y - 2 + bob, 4, 4);
    }
  }

  // ---- Goo (enemy projectiles) ----
  for (let i = 0; i < state.goo.length; i++) {
    const g = state.goo[i];
    if (!inView(g.x, g.y, g.r + 4, camX, camY, vw, vh)) continue;
    ctx.fillStyle = '#4a8f3a';
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7ac85a';
    ctx.beginPath(); ctx.arc(g.x - 2, g.y - 2, g.r * 0.45, 0, Math.PI * 2); ctx.fill();
  }

  // ---- Acid pools (spitter) ----
  for (let i = 0; i < (state.acidPools || []).length; i++) {
    const pool = state.acidPools[i];
    if (!inView(pool.x, pool.y, pool.r + 4, camX, camY, vw, vh)) continue;
    const pulse = 0.6 + 0.2 * Math.sin((state.time || 0) * 5 + pool.x);
    ctx.fillStyle = `rgba(74,143,58,${(pulse * 0.55).toFixed(2)})`;
    ctx.beginPath(); ctx.ellipse(pool.x, pool.y, pool.r, pool.r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(122,200,90,0.8)';
    for (let b = 0; b < 4; b++) {
      const ba = (state.time || 0) * 2 + b * 1.7 + pool.x;
      const bx = pool.x + Math.cos(ba) * pool.r * 0.5;
      const by = pool.y + Math.sin(ba * 1.3) * pool.r * 0.4;
      ctx.beginPath(); ctx.arc(bx, by, 3 + (b % 2), 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---- Zombies (blocky voxel figures, v2) ----
  for (let i = 0; i < state.zombies.length; i++) {
    const z = state.zombies[i];
    if (!inView(z.x, z.y, z.r + 8, camX, camY, vw, vh)) continue;
    drawZombieFigure(ctx, z, state.time || 0);
    // HP bar when damaged.
    if (z.hp < z.maxHp) {
      const bw = z.r * 2, bx = z.x - bw / 2, by = z.y - z.r - 10;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx, by, bw, 5);
      ctx.fillStyle = z.isBoss ? '#ff3030' : '#5ac83a';
      ctx.fillRect(bx, by, bw * Math.max(0, z.hp / z.maxHp), 5);
    }
  }

  // ---- Player (blocky voxel figure, v2) ----
  const p = state.player;
  if (p && !p.dead) {
    if (!lowQ && dark <= 0) {
      // Soft blob shadow in daylight only.
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + p.r * 0.7, p.r * 0.9, p.r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    }
    drawPlayerFigure(ctx, p, state.time || 0);
    // Reloading ring. (BUGFIX W4: this used to divide by p.reloading,
    // which is just the 1/0 flag — for the 1.6s shotgun reload the ring
    // started at a negative fraction and drew backwards. Now it uses the
    // stored reload duration.)
    if (p.reloading > 0 && p.reloadT > 0) {
      const frac = 1 - p.reloadT / (p.reloadDur || 1);
      ctx.strokeStyle = '#ffd23a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 6, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
    }
  }

  // ---- Bullets (tracer lines) ----
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < state.bullets.length; i++) {
    const b = state.bullets[i];
    ctx.moveTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  // ---- Thrown grenades (v2) ----
  for (let i = 0; i < (state.thrown || []).length; i++) {
    const g = state.thrown[i];
    if (!inView(g.x, g.y, 12, camX, camY, vw, vh)) continue;
    ctx.fillStyle = '#2a4a2a';
    ctx.fillRect(g.x - 4, g.y - 4, 8, 8);
    ctx.fillStyle = '#ffd23a';
    ctx.fillRect(g.x - 1, g.y - 1, 2, 2);
  }

  // ---- Particles ----
  for (let i = 0; i < state.particles.length; i++) {
    const pt = state.particles[i];
    if (!inView(pt.x, pt.y, pt.size + 2, camX, camY, vw, vh)) continue;
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;

  // ---- World border fence ----
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, world.w, world.h);

  ctx.restore();

  // ---- Night darkness + flashlight (screen space) ----
  if (dark > 0) {
    ctx.fillStyle = `rgba(4,6,20,${(dark * 0.6).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);

    if (p && !p.dead) {
      const px = (p.x - camX) * scale;
      const py = (p.y - camY) * scale;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Flashlight cone along the aim angle.
      const coneR = 340 * scale;
      const grad = ctx.createRadialGradient(px, py, 10, px, py, coneR);
      grad.addColorStop(0, 'rgba(255,220,150,0.55)');
      grad.addColorStop(0.5, 'rgba(255,200,120,0.22)');
      grad.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, coneR, p.angle - 0.55, p.angle + 0.55);
      ctx.closePath();
      ctx.fill();
      // Small warm glow right around the player.
      const glow = ctx.createRadialGradient(px, py, 4, px, py, 110 * scale);
      glow.addColorStop(0, 'rgba(255,220,150,0.35)');
      glow.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(px, py, 110 * scale, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Lamp glows at night (skip on low quality).
    if (!lowQ) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < world.lamps.length; i++) {
        const l = world.lamps[i];
        const lx = (l.x - camX) * scale, ly = (l.y - camY) * scale;
        if (lx < -80 || ly < -80 || lx > w + 80 || ly > h + 80) continue;
        const lg = ctx.createRadialGradient(lx, ly, 2, lx, ly, 70);
        lg.addColorStop(0, 'rgba(255,220,140,0.28)');
        lg.addColorStop(1, 'rgba(255,220,140,0)');
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.arc(lx, ly, 70, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
}
