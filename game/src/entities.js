// DEADZONE — entities.js (W2 gameplay)
// Player, zombies, bullets, particles, pickups. Vanilla JS, zero libraries.
// Imports only config.js, world.js helpers and random.js per CONTRACT.md.
// No import of game.js (no cycles), no render/hud/audio imports —
// audio is reached only via state.audio, input only via state.input.
import { CONFIG } from './config.js';
import { moveCircle, circleHitsWorld, rebuildColliders, ejectFromWorld } from './world.js';
import { rand, randInt, pick } from './random.js';

const TAU = Math.PI * 2;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }

// ---------------------------------------------------------------- creators
export function createPlayer(x, y) {
  return {
    x, y, r: CONFIG.PLAYER.r, hp: CONFIG.PLAYER.hp, maxHp: CONFIG.PLAYER.hp,
    armor: 0, stamina: CONFIG.PLAYER.stamina,
    angle: 0, weapon: 'pistol',
    mag: {
      pistol: CONFIG.WEAPONS.pistol.mag,
      shotgun: CONFIG.WEAPONS.shotgun.mag,
      rifle: CONFIG.WEAPONS.rifle.mag,
    },
    reserve: { shells: 24, rifle: 90 }, // pistol ammo is infinite
    reloading: 0, reloadT: 0, reloadDur: 0, fireCd: 0, meleeCd: 0,
    dmgMul: 1, speedMul: 1, dead: false,
    _eWasDown: false,
  };
}

export function createZombie(type, x, y) {
  const c = CONFIG.ZOMBIES[type] || CONFIG.ZOMBIES.walker;
  return {
    type, x, y, r: c.r, hp: c.hp, maxHp: c.hp,
    speed: c.speed, damage: c.damage, color: c.color, // BUGFIX W4: color
    // was never set, so render.js fell back to walker green for EVERY type
    // (runners, brutes, spitters and the boss all looked identical).
    angle: rand(0, TAU), staggerT: 0, attackCd: 0,
    groanT: rand(2, 6), spitCd: rand(1, 2.5),
    isBoss: type === 'boss', flash: 0,
  };
}

export function createBullet(x, y, angle, wcfg, dmgMul = 1) {
  const SPEED = 900;
  return {
    x, y,
    vx: Math.cos(angle) * SPEED, vy: Math.sin(angle) * SPEED,
    life: wcfg.range / SPEED,
    damage: wcfg.damage * dmgMul,
  };
}

export function createParticle(x, y, opts = {}) {
  const life = opts.life ?? 0.5;
  return {
    x, y,
    vx: opts.vx ?? rand(-90, 90), vy: opts.vy ?? rand(-90, 90),
    life, maxLife: life,
    color: opts.color || '#b02020', size: opts.size ?? 3,
  };
}

// ---------------------------------------------------------------- helpers
function bloodBurst(state, x, y, n = 12, color = '#b02020') {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(40, 220);
    state.particles.push(createParticle(x, y, {
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(0.25, 0.6), color, size: randInt(2, 5),
    }));
  }
}

function damagePlayer(state, dmg) {
  const p = state.player;
  if (!p || p.dead || dmg <= 0) return;
  let rest = dmg;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, rest);
    p.armor -= absorbed;
    rest -= absorbed;
  }
  if (rest > 0) p.hp -= rest;
  state.shake = Math.max(state.shake || 0, 7);
  bloodBurst(state, p.x, p.y, 6, '#c03030');
  state.audio?.playerHurt?.();
  if (p.hp <= 0) { p.hp = 0; p.dead = true; }
}

function nearestZombie(state, x, y, maxDist) {
  let best = null, bestD = maxDist;
  for (const z of state.zombies) {
    const d = dist(x, y, z.x, z.y);
    if (d < bestD) { bestD = d; best = z; }
  }
  return best;
}

function collectPickup(state, p) {
  const pl = state.player;
  if (!pl) return;
  if (p.kind === 'scrap') {
    state.scrap += p.amount || 0;
  } else if (p.kind === 'ammo') {
    pl.reserve.shells += 12;
    pl.reserve.rifle += 30;
  } else if (p.kind === 'medkit') {
    pl.hp = Math.min(pl.maxHp, pl.hp + (p.amount || 40));
  } else if (p.kind === 'crate') {
    // Boss crate: random reward — +50 scrap or a full ammo refill.
    if (Math.random() < 0.5) {
      state.scrap += 50;
    } else {
      pl.reserve.shells += 24;
      pl.reserve.rifle += 90;
      for (const w of Object.keys(pl.mag)) pl.mag[w] = CONFIG.WEAPONS[w].mag;
    }
  }
  state.audio?.pickup?.();
  bloodBurst(state, p.x, p.y, 5, '#e8c84a');
}

function tryReload(state, p) {
  if (p.reloading) return;
  const wcfg = CONFIG.WEAPONS[p.weapon];
  if (p.mag[p.weapon] >= wcfg.mag) return;
  if (wcfg.ammo !== 'inf' && (p.reserve[wcfg.ammo] || 0) <= 0) return;
  p.reloading = 1;
  p.reloadT = wcfg.reload;
  p.reloadDur = wcfg.reload; // render.js draws the reload ring from this
  state.audio?.reload?.();
}

function finishReload(state, p) {
  const wcfg = CONFIG.WEAPONS[p.weapon];
  const need = wcfg.mag - p.mag[p.weapon];
  if (need <= 0) return;
  if (wcfg.ammo === 'inf') {
    p.mag[p.weapon] += need;
  } else {
    const take = Math.min(need, p.reserve[wcfg.ammo] || 0);
    p.mag[p.weapon] += take;
    p.reserve[wcfg.ammo] -= take;
  }
}

function fireWeapon(state, p) {
  const wcfg = CONFIG.WEAPONS[p.weapon];
  if (p.mag[p.weapon] <= 0) { tryReload(state, p); return; }
  p.mag[p.weapon] -= 1;
  p.fireCd = wcfg.rate;
  state.stats.shots = (state.stats.shots || 0) + 1;
  const mx = p.x + Math.cos(p.angle) * (p.r + 12);
  const my = p.y + Math.sin(p.angle) * (p.r + 12);
  for (let i = 0; i < wcfg.pellets; i++) {
    const a = p.angle + rand(-1, 1) * wcfg.spread;
    state.bullets.push(createBullet(mx, my, a, wcfg, p.dmgMul));
  }
  state.shake = Math.max(state.shake || 0, wcfg.kick * 0.3);
  state.audio?.shoot?.(p.weapon);
  if (p.mag[p.weapon] <= 0) tryReload(state, p); // auto-reload on empty
}

// ---------------------------------------------------------------- player
export function updatePlayer(state, dt) {
  const p = state.player;
  if (!p || p.dead) return;
  // Only live in 'playing' mode (mode undefined = playing, for unit tests).
  if (state.mode && state.mode !== 'playing') return;
  const input = state.input;
  const world = state.world;

  // --- timers
  if (p.fireCd > 0) p.fireCd -= dt;
  if (p.meleeCd > 0) p.meleeCd -= dt;
  if (p.reloading) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) { p.reloading = 0; p.reloadDur = 0; finishReload(state, p); }
  }

  const keys = input?.keys;
  const has = (code) => keys?.has(code) || false;

  // --- movement: WASD / arrows + touch joystick
  let mx = 0, my = 0;
  if (has('KeyW') || has('ArrowUp')) my -= 1;
  if (has('KeyS') || has('ArrowDown')) my += 1;
  if (has('KeyA') || has('ArrowLeft')) mx -= 1;
  if (has('KeyD') || has('ArrowRight')) mx += 1;
  const touch = input?.touch;
  if (touch?.active) { mx += touch.moveX || 0; my += touch.moveY || 0; }
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }

  // --- sprint (Shift): drain stamina, regen when not sprinting
  const wantSprint = (has('ShiftLeft') || has('ShiftRight')) && len > 0.1 && p.stamina > 0;
  const sprinting = wantSprint && p.stamina > 0;
  if (sprinting) {
    p.stamina = Math.max(0, p.stamina - CONFIG.PLAYER.staminaDrain * dt);
  } else {
    p.stamina = Math.min(CONFIG.PLAYER.stamina, p.stamina + CONFIG.PLAYER.staminaRegen * dt);
  }
  const speed = CONFIG.PLAYER.speed * (p.speedMul || 1) * (sprinting ? CONFIG.PLAYER.sprintMul : 1);
  if (len > 0.01) {
    if (world) moveCircle(world, p, mx * speed * dt, my * speed * dt);
    else {
      p.x = clamp(p.x + mx * speed * dt, p.r, (world?.w || CONFIG.WORLD_W) - p.r);
      p.y = clamp(p.y + my * speed * dt, p.r, (world?.h || CONFIG.WORLD_H) - p.r);
    }
  }

  // --- aim: touch auto-aim (nearest zombie within 420px while firing)
  // otherwise mouse world position.
  const firingTouch = !!(touch?.active && touch.fire);
  let autoTarget = null;
  if (touch?.active && firingTouch) autoTarget = nearestZombie(state, p.x, p.y, 420);
  if (autoTarget) {
    p.angle = Math.atan2(autoTarget.y - p.y, autoTarget.x - p.x);
  } else if (input?.mouse) {
    const scale = state.viewScale || 1;
    const camX = state.camera?.x || 0, camY = state.camera?.y || 0;
    const wx = camX + (input.mouse.x ?? 0) / scale;
    const wy = camY + (input.mouse.y ?? 0) / scale;
    if (wx !== p.x || wy !== p.y) p.angle = Math.atan2(wy - p.y, wx - p.x);
  }

  // --- fire: mouse down / Space / touch fire
  const firing = !!(input?.mouse?.down || has('Space') || firingTouch);
  if (firing && p.fireCd <= 0 && !p.reloading) fireWeapon(state, p);

  // --- reload: R
  if (has('KeyR')) tryReload(state, p);

  // --- weapon switch: 1/2/3, touch SWAP cycles
  // BUGFIX W4: this used to cancel the reload whenever a digit key was
  // HELD (the check ran every frame while the key was down), so holding
  // 1/2/3 — or tapping it repeatedly — made the reload never finish and
  // the weapon permanently unfireable once the mag was empty. Only a
  // real weapon CHANGE cancels a reload now.
  const weapons = ['pistol', 'shotgun', 'rifle'];
  const prevWeapon = p.weapon;
  if (has('Digit1')) p.weapon = 'pistol';
  else if (has('Digit2')) p.weapon = 'shotgun';
  else if (has('Digit3')) p.weapon = 'rifle';
  if (p.weapon !== prevWeapon) { p.reloading = 0; p.reloadT = 0; p.reloadDur = 0; }
  if (touch?.swap) {
    touch.swap = false; // consume the edge
    const i = weapons.indexOf(p.weapon);
    p.weapon = weapons[(i + 1) % weapons.length];
    p.reloading = 0; p.reloadT = 0; p.reloadDur = 0;
  }
  // (A digit-key weapon change already cancelled the reload above.)

  // --- melee shove: F, or auto when a zombie is touching the player.
  // Auto range is deliberately contact-only (center distance < r1+r2):
  // a zombie's contact attack triggers just outside that range, so the
  // attack still lands first — a wider auto range would shove zombies
  // away before they could ever hit, making the player invulnerable.
  let meleeTarget = null;
  for (const z of state.zombies) {
    if (dist(p.x, p.y, z.x, z.y) < p.r + z.r) { meleeTarget = z; break; }
  }
  if ((has('KeyF') || meleeTarget) && p.meleeCd <= 0) {
    p.meleeCd = 0.6;
    state.audio?.hit?.();
    for (const z of [...state.zombies]) {
      const d = dist(p.x, p.y, z.x, z.y);
      if (d < 90) {
        const a = Math.atan2(z.y - p.y, z.x - p.x);
        damageZombie(state, z, 12 * p.dmgMul, a);
        // Extra shove beyond damageZombie's own knockback.
        if (z.hp > 0 && world) moveCircle(world, z, Math.cos(a) * 60, Math.sin(a) * 60);
        else if (z.hp > 0) { z.x += Math.cos(a) * 60; z.y += Math.sin(a) * 60; }
      }
    }
  }

  // --- pickup collection (within 24px; magnet handled in updatePickups)
  for (const pk of [...state.pickups]) {
    if (dist(p.x, p.y, pk.x, pk.y) < 24) {
      state.pickups.splice(state.pickups.indexOf(pk), 1);
      collectPickup(state, pk);
    }
  }

  // --- barricade repair with E (edge-triggered): 10 scrap per 25 hp,
  // nearest damaged barricade within 40px, playing mode only.
  const eDown = has('KeyE');
  if (eDown && !p._eWasDown && world?.barricades) {
    let bestB = null, bestD = 40;
    for (const b of world.barricades) {
      if (b.hp >= b.maxHp) continue;
      // Distance from player to the barricade rect.
      const cx = clamp(p.x, b.x, b.x + b.w), cy = clamp(p.y, b.y, b.y + b.h);
      const d = dist(p.x, p.y, cx, cy);
      if (d < bestD) { bestD = d; bestB = b; }
    }
    if (bestB && state.scrap >= 10) {
      state.scrap -= 10;
      bestB.hp = Math.min(bestB.maxHp, bestB.hp + 25);
      // BUGFIX W4: a destroyed barricade (hp 0) is out of the collider list;
      // repairing it must put it back, or zombies walk straight through it.
      rebuildColliders(world);
      state.audio?.buy?.();
      bloodBurst(state, bestB.x + bestB.w / 2, bestB.y + bestB.h / 2, 4, '#e8c84a');
    }
  }
  p._eWasDown = eDown;

  // --- camera follow (camera = top-left of the viewport in world coords)
  const vw = state.viewW || state.view?.w || (typeof window !== 'undefined' ? window.innerWidth : 960);
  const vh = state.viewH || state.view?.h || (typeof window !== 'undefined' ? window.innerHeight : 540);
  const ww = world?.w || CONFIG.WORLD_W, wh = world?.h || CONFIG.WORLD_H;
  if (state.camera) {
    state.camera.x = vw >= ww ? (ww - vw) / 2 : clamp(p.x - vw / 2, 0, ww - vw);
    state.camera.y = vh >= wh ? (wh - vh) / 2 : clamp(p.y - vh / 2, 0, wh - vh);
  }
}

// ---------------------------------------------------------------- zombies
export function updateZombies(state, dt) {
  const p = state.player;
  if (!p || p.dead) return;
  if (state.mode && state.mode !== 'playing') return;
  const world = state.world;

  // --- goo (spitter projectiles): move, hit world / player
  if (state.goo) {
    for (const g of [...state.goo]) {
      g.x += g.vx * dt; g.y += g.vy * dt; g.life -= dt;
      let dead = g.life <= 0;
      if (!dead && world && circleHitsWorld(world, g.x, g.y, g.r)) dead = true;
      if (!dead && dist(g.x, g.y, p.x, p.y) < p.r + g.r) {
        damagePlayer(state, g.damage);
        bloodBurst(state, g.x, g.y, 5, '#4a8f7a');
        dead = true;
      }
      if (dead) state.goo.splice(state.goo.indexOf(g), 1);
    }
  }

  for (const z of [...state.zombies]) {
    if (z.flash > 0) z.flash -= dt;
    if (z.staggerT > 0) z.staggerT -= dt;
    if (z.attackCd > 0) z.attackCd -= dt;
    if (z.spitCd > 0) z.spitCd -= dt;

    // BUGFIX W4: the separation step below moves zombies without collision
    // checks, so a horde can shove one inside a building collider. Eject
    // it before it moves, or it can never get out again (soft-lock).
    if (world && circleHitsWorld(world, z.x, z.y, z.r)) ejectFromWorld(world, z);

    // Boss roar once on first update (startWave sets _roared to avoid a double).
    if (z.isBoss && !z._roared) { z._roared = true; state.audio?.roar?.(); }

    // Groans, only when the player is near enough to hear them.
    z.groanT -= dt;
    if (z.groanT <= 0) {
      z.groanT = rand(3, 7);
      if (dist(z.x, z.y, p.x, p.y) < 700) state.audio?.groan?.();
    }

    const d = dist(z.x, z.y, p.x, p.y);
    const ang = Math.atan2(p.y - z.y, p.x - z.x);
    z.angle = ang;

    if (z.staggerT <= 0) {
      const ox = z.x, oy = z.y;
      let attemptedMove = false; // true when this frame tried to move
      let chewed = false;        // true when blocked by a barricade (chewing it)
      if (z._escapeT > 0) {
        // Escaping a pocket: hold the escape heading for its duration
        // instead of seeking (see the stuck-trigger below). moveCircle
        // still slides along walls, so this also rounds corners.
        z._escapeT -= dt;
        attemptedMove = true;
        const ex = Math.cos(z._escapeDir), ey = Math.sin(z._escapeDir);
        if (world) moveCircle(world, z, ex * z.speed * dt, ey * z.speed * dt);
        else { z.x += ex * z.speed * dt; z.y += ey * z.speed * dt; }
      } else if (z.type === 'spitter') {
        // Keep ~260px: approach when far, back off when close, hold at range.
        if (d > 280) {
          attemptedMove = true;
          if (world) moveCircle(world, z, Math.cos(ang) * z.speed * dt, Math.sin(ang) * z.speed * dt);
          else { z.x += Math.cos(ang) * z.speed * dt; z.y += Math.sin(ang) * z.speed * dt; }
        } else if (d < 240) {
          attemptedMove = true;
          if (world) moveCircle(world, z, -Math.cos(ang) * z.speed * dt, -Math.sin(ang) * z.speed * dt);
          else { z.x -= Math.cos(ang) * z.speed * dt; z.y -= Math.sin(ang) * z.speed * dt; }
        }
        if (d < 420 && z.spitCd <= 0) {
          z.spitCd = 2.5;
          state.goo.push({
            x: z.x + Math.cos(ang) * (z.r + 8), y: z.y + Math.sin(ang) * (z.r + 8),
            vx: Math.cos(ang) * 260, vy: Math.sin(ang) * 260,
            life: 3, damage: z.damage, r: 6,
          });
          state.audio?.groan?.();
        }
      } else {
        // Seek the player, sliding along walls via moveCircle.
        attemptedMove = true;
        if (world) moveCircle(world, z, Math.cos(ang) * z.speed * dt, Math.sin(ang) * z.speed * dt);
        else { z.x += Math.cos(ang) * z.speed * dt; z.y += Math.sin(ang) * z.speed * dt; }
      }

      // Blocked by a barricade (moved ~nowhere, not yet touching the
      // player): chew through it. This is what makes barricades a
      // resource — they hold zombies off, then need E / shop repair.
      if (world?.barricades && dist(ox, oy, z.x, z.y) < 0.5 &&
          dist(z.x, z.y, p.x, p.y) > z.r + p.r + 4) {
        for (const b of world.barricades) {
          if (b.hp <= 0) continue;
          const cx = clamp(z.x, b.x, b.x + b.w), cy = clamp(z.y, b.y, b.y + b.h);
          if (dist(z.x, z.y, cx, cy) < z.r + 2) {
            chewed = true;
            if (z.attackCd <= 0) {
              z.attackCd = 0.8;
              b.hp -= z.damage;
              bloodBurst(state, cx, cy, 4, '#a08050');
              state.audio?.hit?.();
              if (b.hp <= 0) { b.hp = 0; rebuildColliders(world); }
            }
            break;
          }
        }
      }

      // BUGFIX W4 — stuck / pocket escape. A zombie walking a straight line
      // at the player can end up in a dead-end pocket (building face on
      // one side, a crate/car on the other) where the approach AND both
      // wall-slide directions are blocked — the old one-frame sideways
      // nudge could not get it out (verified in QA: two walkers sat in
      // such pockets for 400s+ while the wave could never clear). When a
      // seek attempt moves ~nowhere, probe headings for a free step and
      // hold the first one for ~1.2s: wall-slide first, then back out,
      // then diagonals. The heading persists across frames so the zombie
      // actually leaves the pocket instead of jittering in place.
      if (attemptedMove && !chewed && world && !(z._escapeT > 0) &&
          dist(ox, oy, z.x, z.y) < 0.3 &&
          dist(z.x, z.y, p.x, p.y) > z.r + p.r + 4) {
        const stepLen = z.speed * dt;
        const candidates = [
          ang + Math.PI / 2, ang - Math.PI / 2, ang + Math.PI,
          ang + Math.PI / 4, ang - Math.PI / 4,
          ang + 3 * Math.PI / 4, ang - 3 * Math.PI / 4,
        ];
        let dir = null;
        for (const c of candidates) {
          if (!circleHitsWorld(world, z.x + Math.cos(c) * stepLen, z.y + Math.sin(c) * stepLen, z.r)) { dir = c; break; }
        }
        if (dir === null) { // truly surrounded at full step — try half steps
          for (const c of candidates) {
            if (!circleHitsWorld(world, z.x + Math.cos(c) * stepLen * 0.5, z.y + Math.sin(c) * stepLen * 0.5, z.r)) { dir = c; break; }
          }
        }
        if (dir !== null) {
          z._escapeDir = dir;
          z._escapeT = 2.0; // hold ~2s (~110px at walker speed)
        }
        // If no heading is free even at half step, stay put this frame;
        // separation / eject may free it later.
      }
    }

    // Contact attack, 0.8s cooldown.
    if (d < z.r + p.r + 4 && z.attackCd <= 0) {
      z.attackCd = 0.8;
      damagePlayer(state, z.damage);
    }
  }

  // Light separation so zombies don't stack on one point.
  const zs = state.zombies;
  for (let i = 0; i < zs.length; i++) {
    for (let j = i + 1; j < zs.length; j++) {
      const a = zs[i], b = zs[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy), min = a.r + b.r;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2, nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }
}

// ---------------------------------------------------------------- bullets
export function updateBullets(state, dt) {
  const world = state.world;
  for (const b of [...state.bullets]) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) { state.bullets.splice(state.bullets.indexOf(b), 1); continue; }

    const ang = Math.atan2(b.vy, b.vx);
    let consumed = false;

    // Smashable crates / barrels first (they are also colliders, so check
    // before the generic world-block test).
    if (world && !consumed) {
      for (const prop of [...(world.crates || []), ...(world.barrels || [])]) {
        if (prop.hp <= 0) continue;
        if (dist(b.x, b.y, prop.x, prop.y) < prop.r + 3) {
          prop.hp -= b.damage;
          bloodBurst(state, b.x, b.y, 4, '#c8a84a');
          if (prop.hp <= 0) {
            const isBarrel = (world.barrels || []).includes(prop);
            if (isBarrel) {
              // Barrel explodes: hurts nearby zombies.
              bloodBurst(state, prop.x, prop.y, 16, '#e07830');
              for (const z of [...state.zombies]) {
                if (dist(prop.x, prop.y, z.x, z.y) < 100) damageZombie(state, z, 40, Math.atan2(z.y - prop.y, z.x - prop.x));
              }
            } else {
              state.pickups.push({ kind: 'scrap', x: prop.x, y: prop.y, amount: randInt(5, 12), t: 0 });
              if (Math.random() < 0.25) state.pickups.push({ kind: 'ammo', x: prop.x + rand(-16, 16), y: prop.y + rand(-16, 16), amount: 0, t: 0 });
            }
            rebuildColliders(world);
          }
          consumed = true;
          break;
        }
      }
    }
    if (consumed) { state.bullets.splice(state.bullets.indexOf(b), 1); continue; }

    // Hit a zombie?
    let hitZ = null;
    for (const z of state.zombies) {
      if (dist(b.x, b.y, z.x, z.y) < z.r + 4) { hitZ = z; break; }
    }
    if (hitZ) {
      state.stats.hits = (state.stats.hits || 0) + 1;
      bloodBurst(state, b.x, b.y, 6);
      damageZombie(state, hitZ, b.damage, ang);
      state.bullets.splice(state.bullets.indexOf(b), 1);
      continue;
    }

    // Blocked by the world / out of bounds.
    const ww = world?.w || CONFIG.WORLD_W, wh = world?.h || CONFIG.WORLD_H;
    if (b.x < 0 || b.y < 0 || b.x > ww || b.y > wh ||
        (world && circleHitsWorld(world, b.x, b.y, 2))) {
      bloodBurst(state, b.x, b.y, 3, '#c8c8c8');
      state.bullets.splice(state.bullets.indexOf(b), 1);
    }
  }
}

// ---------------------------------------------------------------- particles / pickups
export function updateParticles(state, dt) {
  for (const pt of [...state.particles]) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.92; pt.vy *= 0.92;
    pt.life -= dt;
    if (pt.life <= 0) state.particles.splice(state.particles.indexOf(pt), 1);
  }
}

export function updatePickups(state, dt) {
  const p = state.player;
  if (!p) return;
  for (const pk of [...state.pickups]) {
    pk.t = (pk.t || 0) + dt;
    const d = dist(p.x, p.y, pk.x, pk.y);
    if (d < 60 && d > 1) { // magnet
      const sp = 260 * dt;
      pk.x += (p.x - pk.x) / d * sp;
      pk.y += (p.y - pk.y) / d * sp;
    }
    if (dist(p.x, p.y, pk.x, pk.y) < 24) {
      state.pickups.splice(state.pickups.indexOf(pk), 1);
      collectPickup(state, pk);
    }
  }
}

// ---------------------------------------------------------------- damage / death
export function damageZombie(state, z, dmg, angle) {
  if (!z || z.hp <= 0) return;
  z.hp -= dmg;
  z.flash = 0.12;
  if (!z.isBoss) {
    // Knockback along the hit angle + brief stagger.
    if (state.world) moveCircle(state.world, z, Math.cos(angle) * 12, Math.sin(angle) * 12);
    else { z.x += Math.cos(angle) * 12; z.y += Math.sin(angle) * 12; }
    z.staggerT = 0.22;
  }
  if (z.hp <= 0) killZombie(state, z);
}

export function killZombie(state, z) {
  const i = state.zombies.indexOf(z);
  if (i === -1) return;
  state.zombies.splice(i, 1);
  const cfg = CONFIG.ZOMBIES[z.type] || CONFIG.ZOMBIES.walker;
  state.kills += 1;
  state.score += cfg.score;
  state.audio?.zombieDie?.();
  bloodBurst(state, z.x, z.y, 14);
  // Scrap drop, always.
  state.pickups.push({ kind: 'scrap', x: z.x, y: z.y, amount: cfg.scrap, t: 0 });
  // 25% chance of an ammo or medkit drop.
  if (Math.random() < 0.25) {
    const kind = pick(['ammo', 'medkit']);
    state.pickups.push({
      kind, x: z.x + rand(-20, 20), y: z.y + rand(-20, 20),
      amount: kind === 'medkit' ? 40 : 0, t: 0,
    });
  }
  if (z.isBoss) {
    state.boss = null;
    state.pickups.push({ kind: 'crate', x: z.x, y: z.y, amount: 0, t: 0 });
    state.banner = { text: 'ABOMINATION DOWN', sub: 'Weapon crate dropped', t: 3 };
  }
}
