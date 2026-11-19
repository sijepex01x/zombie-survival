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

  // ---- Zombies ----
  for (let i = 0; i < state.zombies.length; i++) {
    const z = state.zombies[i];
    if (!inView(z.x, z.y, z.r + 8, camX, camY, vw, vh)) continue;
    const col = z.color || '#6a8f5f';
    if (z.isBoss) {
      // Crown spikes.
      ctx.fillStyle = '#3a1414';
      for (let s = 0; s < 8; s++) {
        const a = (s / 8) * Math.PI * 2 + (state.time || 0) * 0.3;
        const sx = z.x + Math.cos(a) * (z.r + 6);
        const sy = z.y + Math.sin(a) * (z.r + 6);
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * 8, sy + Math.sin(a) * 8);
        ctx.lineTo(sx + Math.cos(a + 0.3) * 6, sy + Math.sin(a + 0.3) * 6);
        ctx.lineTo(sx + Math.cos(a - 0.3) * 6, sy + Math.sin(a - 0.3) * 6);
        ctx.fill();
      }
    }
    ctx.fillStyle = z.flash > 0 ? '#ffffff' : col;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke();
    // Eyes toward facing angle.
    const ex = Math.cos(z.angle), ey = Math.sin(z.angle);
    const px = -ey, py = ex; // perpendicular
    ctx.fillStyle = z.isBoss ? '#ff4040' : '#ffdd55';
    ctx.beginPath(); ctx.arc(z.x + ex * z.r * 0.45 + px * z.r * 0.3, z.y + ey * z.r * 0.45 + py * z.r * 0.3, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(z.x + ex * z.r * 0.45 - px * z.r * 0.3, z.y + ey * z.r * 0.45 - py * z.r * 0.3, 2.5, 0, Math.PI * 2); ctx.fill();
    // HP bar when damaged.
    if (z.hp < z.maxHp) {
      const bw = z.r * 2, bx = z.x - bw / 2, by = z.y - z.r - 10;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx, by, bw, 5);
      ctx.fillStyle = z.isBoss ? '#ff3030' : '#5ac83a';
      ctx.fillRect(bx, by, bw * Math.max(0, z.hp / z.maxHp), 5);
    }
  }

  // ---- Player ----
  const p = state.player;
  if (p && !p.dead) {
    if (!lowQ && dark <= 0) {
      // Soft blob shadow in daylight only.
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + p.r * 0.7, p.r * 0.9, p.r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    }
    // Gun barrel along aim.
    const gx = Math.cos(p.angle), gy = Math.sin(p.angle);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(p.x + gx * 8, p.y + gy * 8);
    ctx.lineTo(p.x + gx * (p.r + 12), p.y + gy * (p.r + 12));
    ctx.stroke();
    // Body.
    ctx.fillStyle = '#2a7a8a';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#123a44';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
    // Head / face toward aim.
    ctx.fillStyle = '#e8b88a';
    ctx.beginPath(); ctx.arc(p.x + gx * 5, p.y + gy * 5, p.r * 0.55, 0, Math.PI * 2); ctx.fill();
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
