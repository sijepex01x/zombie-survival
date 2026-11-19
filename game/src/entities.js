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
export function createPlayer(x, y, charId = 'raka') {
  const ch = (CONFIG.CHARACTERS && CONFIG.CHARACTERS[charId]) || CONFIG.CHARACTERS.raka;
  const maxHp = ch.maxHp || CONFIG.PLAYER.hp;
  return {
    x, y, r: CONFIG.PLAYER.r, hp: maxHp, maxHp,
    armor: 0, stamina: CONFIG.PLAYER.stamina,
    angle: 0, weapon: 'pistol',
    weapons: ['pistol'], // owned weapons (loot/shop add smg/sniper)
    mag: {
      pistol: CONFIG.WEAPONS.pistol.mag,
      shotgun: CONFIG.WEAPONS.shotgun.mag,
      rifle: CONFIG.WEAPONS.rifle.mag,
      smg: 0, sniper: 0,
    },
    reserve: { shells: 24, rifle: 90 }, // pistol ammo is infinite
    reloading: 0, reloadT: 0, reloadDur: 0, fireCd: 0, meleeCd: 0,
    dmgMul: 1, speedMul: ch.speedMul || 1, dead: false,
    // --- character (v2) ---
    charId: ch === CONFIG.CHARACTERS[charId] ? charId : 'raka',
    charColor: ch.color || '#2a7a8a',
    staminaDrainMul: ch.staminaDrainMul || 1,
    dmgResist: ch.dmgResist || 1,
    scrapMul: ch.scrapMul || 1,
    pickupR: ch.pickupR || 24,
    medkitMul: ch.medkitMul || 1,
    regen: ch.regen || 0,
    skillCd: 0, skillCdMax: ch.skillCd || 10,
    dashT: 0, invulnT: 0, shieldT: 0,
    // --- loot (v2) ---
    grenades: CONFIG.GRENADE.startCount || 0,
    grenadeCd: 0, barricadeCd: 0,
    _eWasDown: false, _gWasDown: false, _bWasDown: false, _cWasDown: false,
    _walkPhase: 0, _lx: x, _ly: y,
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
    // --- v2 skill state (all zero/idle until the skill triggers) ---
    elite: false, enraged: false,
    swarm: false, // walker swarm: set per-frame by updateZombies
    lungeCd: rand(1, 3), lungeState: 0, lungeT: 0, lungeDir: 0,
    slamCd: rand(1.5, 3), slamState: 0, slamT: 0,
    dying: false, dyingT: 0, // boomer fuse after fatal hit
  };
}

// Elite modifier (v2): a powered-up walker/brute — glowing, tougher, and
// always drops good loot. Applied on top of a normal zombie.
export function makeElite(z) {
  const e = CONFIG.ELITE || { hpMul: 3.5, speedMul: 1.15, dmgMul: 1.2 };
  z.elite = true;
  z.maxHp = Math.round(z.hp * e.hpMul);
  z.hp = z.maxHp;
  z.speed = z.speed * (e.speedMul || 1);
  z.damage = Math.round(z.damage * (e.dmgMul || 1));
  z.r = z.r + 2;
  z.scrap = (z.scrap || 0) + 20;
  z.score = (z.score || 0) + 30;
  return z;
}

// --- toasts + alerts (v2, shared by entities.js and game.js) -------------
// Toasts: small "Picked up ..." lines, drawn by hud.js, fade after ~2.5s.
export function pushToast(state, text) {
  if (!state) return;
  state.toasts = state.toasts || [];
  state.toasts.push({ text, t: 2.5 });
  if (state.toasts.length > 3) state.toasts.shift();
}

// Alerts: queued severity banners (red/yellow/green), drawn by hud.js.
// Dedupes: the same text already queued is not added twice.
export function pushAlert(state, text, level = 'yellow') {
  if (!state) return;
  state.alerts = state.alerts || [];
  if (state.alerts.some((a) => a.text === text)) return;
  state.alerts.push({ text, level, t: 2.5 });
  if (state.alerts.length > 4) state.alerts.shift();
  state.audio?.alert?.(level);
}

export function createBullet(x, y, angle, wcfg, dmgMul = 1) {
  const SPEED = 900;
  return {
    x, y,
    vx: Math.cos(angle) * SPEED, vy: Math.sin(angle) * SPEED,
    life: wcfg.range / SPEED,
    damage: wcfg.damage * dmgMul,
    pierce: !!wcfg.pierce, // sniper: passes through zombies
    _hit: null, // pierce bullets track which zombies they already hit
    _id: (createBullet._n = (createBullet._n || 0) + 1),
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

export function damagePlayer(state, dmg) {
  const p = state.player;
  if (!p || p.dead || dmg <= 0) return;
  // v2: Raka's dash invulnerability, Budi's damage resist + Bulwark shield.
  if (p.invulnT > 0) return;
  if (p.dmgResist) dmg *= p.dmgResist;
  if (p.shieldT > 0) dmg *= 0.25;
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
    pushToast(state, 'Picked up ammo');
  } else if (p.kind === 'medkit') {
    const heal = Math.round((p.amount || 40) * (pl.medkitMul || 1));
    pl.hp = Math.min(pl.maxHp, pl.hp + heal);
    pushToast(state, `Picked up medkit (+${heal} HP)`);
  } else if (p.kind === 'armor') {
    pl.armor += p.amount || 30;
    pushToast(state, `Picked up armor plate (+${p.amount || 30})`);
  } else if (p.kind === 'grenade') {
    pl.grenades = (pl.grenades || 0) + (p.amount || 1);
    pushToast(state, `Picked up grenade x${p.amount || 1}  [G to throw]`);
  } else if (p.kind === 'weapon') {
    const w = p.weapon;
    const wcfg = CONFIG.WEAPONS[w];
    if (!wcfg) return;
    if (!(pl.weapons || []).includes(w)) {
      pl.weapons.push(w);
      pl.mag[w] = wcfg.mag;
      pl.weapon = w;
      pushToast(state, `Picked up ${wcfg.name}!  [${(CONFIG.WEAPON_ORDER || []).indexOf(w) + 1} to use]`);
    } else {
      // Already owned: convert to ammo instead.
      if (wcfg.ammo !== 'inf') pl.reserve[wcfg.ammo] = (pl.reserve[wcfg.ammo] || 0) + wcfg.mag;
      pushToast(state, `Picked up ${wcfg.name} ammo`);
    }
  } else if (p.kind === 'supply') {
    // Supply drop (every 3 waves): the best loot in one crate.
    const unowned = (CONFIG.WEAPON_ORDER || []).filter(
      (w) => (CONFIG.WEAPONS[w].ammo !== 'inf' || w === 'pistol') &&
        w !== 'pistol' && !(pl.weapons || []).includes(w));
    if (unowned.length > 0) {
      const w = pick(unowned);
      pl.weapons.push(w);
      pl.mag[w] = CONFIG.WEAPONS[w].mag;
      pl.weapon = w;
      pushToast(state, `SUPPLY DROP: ${CONFIG.WEAPONS[w].name}!`);
    } else {
      state.scrap += 100;
      pushToast(state, 'SUPPLY DROP: +100 scrap!');
    }
    pl.grenades = (pl.grenades || 0) + 2;
    pl.reserve.shells += 24;
    pl.reserve.rifle += 90;
    pl.hp = Math.min(pl.maxHp, pl.hp + 40);
    state.audio?.buy?.();
  } else if (p.kind === 'crate') {
    // Boss crate: random reward — +50 scrap or a full ammo refill.
    if (Math.random() < 0.5) {
      state.scrap += 50;
      pushToast(state, 'Weapon crate: +50 scrap');
    } else {
      pl.reserve.shells += 24;
      pl.reserve.rifle += 90;
      for (const w of Object.keys(pl.mag)) pl.mag[w] = CONFIG.WEAPONS[w].mag;
      pushToast(state, 'Weapon crate: full ammo refill');
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

// --- v2: grenades ----------------------------------------------------------
// Thrown grenades live in state.thrown: {x, y, vx, vy, t}. They fly, then
// explode on contact or when the fuse runs out.
export function tryThrowGrenade(state, p) {
  if (!p || p.dead) return false;
  if ((p.grenades || 0) <= 0) { pushToast(state, 'No grenades — find more loot'); return false; }
  if ((p.grenadeCd || 0) > 0) return false;
  const g = CONFIG.GRENADE || { damage: 90, radius: 130, fuse: 0.7, speed: 520 };
  p.grenades -= 1;
  p.grenadeCd = 0.5;
  state.thrown = state.thrown || [];
  state.thrown.push({
    x: p.x + Math.cos(p.angle) * (p.r + 8),
    y: p.y + Math.sin(p.angle) * (p.r + 8),
    vx: Math.cos(p.angle) * g.speed, vy: Math.sin(p.angle) * g.speed,
    t: g.fuse, r: 6,
  });
  state.audio?.shoot?.('shotgun');
  return true;
}

function explodeAt(state, x, y) {
  const g = CONFIG.GRENADE || { damage: 90, radius: 130 };
  const R = g.radius;
  // Zombies take falloff damage (this is also how boomers chain).
  for (const z of [...state.zombies]) {
    const d = dist(x, y, z.x, z.y);
    if (d < R + z.r) {
      const dmg = Math.round(g.damage * (1 - (d / (R + z.r)) * 0.66));
      damageZombie(state, z, Math.max(30, dmg), Math.atan2(z.y - y, z.x - x));
    }
  }
  // Smashable props in the blast are destroyed too.
  const world = state.world;
  if (world) {
    for (const prop of [...(world.crates || []), ...(world.barrels || [])]) {
      if (prop.hp > 0 && dist(x, y, prop.x, prop.y) < R + prop.r) {
        prop.hp = 0;
        if ((world.barrels || []).includes(prop)) {
          bloodBurst(state, prop.x, prop.y, 10, '#e07830');
        } else {
          state.pickups.push({ kind: 'scrap', x: prop.x, y: prop.y, amount: randInt(5, 12), t: 0 });
        }
      }
    }
    rebuildColliders(world);
  }
  bloodBurst(state, x, y, 22, '#e07830');
  bloodBurst(state, x, y, 10, '#5a5a5a');
  state.shake = Math.max(state.shake || 0, 10);
  state.audio?.explosion?.();
}

export function updateGrenades(state, dt) {
  if (!state.thrown) return;
  const world = state.world;
  for (const g of [...state.thrown]) {
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.t -= dt;
    let boom = g.t <= 0;
    if (!boom && world && circleHitsWorld(world, g.x, g.y, g.r)) boom = true;
    if (!boom) {
      for (const z of state.zombies) {
        if (dist(g.x, g.y, z.x, z.y) < z.r + g.r) { boom = true; break; }
      }
    }
    if (boom) {
      state.thrown.splice(state.thrown.indexOf(g), 1);
      explodeAt(state, g.x, g.y);
    }
  }
}

// --- v2: acid pools (spitter) ----------------------------------------------
// state.acidPools: {x, y, r, t}. Standing in one burns the player.
export function updateAcidPools(state, dt) {
  if (!state.acidPools) return;
  const p = state.player;
  for (const pool of [...state.acidPools]) {
    pool.t -= dt;
    if (pool.t <= 0) { state.acidPools.splice(state.acidPools.indexOf(pool), 1); continue; }
    // Bubbles.
    if (Math.random() < dt * 6) {
      state.particles.push(createParticle(
        pool.x + rand(-pool.r * 0.7, pool.r * 0.7),
        pool.y + rand(-pool.r * 0.7, pool.r * 0.7),
        { vx: 0, vy: -14, life: 0.5, color: '#7ac85a', size: randInt(2, 4) }));
    }
    if (p && !p.dead && dist(p.x, p.y, pool.x, pool.y) < pool.r) {
      damagePlayer(state, (CONFIG.ACID_POOL?.dps || 8) * dt);
    }
  }
}

// --- v2: place a barricade with B ------------------------------------------
function rectHitsWorld(world, x, y, w, h) {
  if (x < 0 || y < 0 || x + w > world.w || y + h > world.h) return true;
  for (const c of world.colliders) {
    if (x < c.x + c.w && x + w > c.x && y < c.y + c.h && y + h > c.y) return true;
  }
  return false;
}

export function tryPlaceBarricade(state, p) {
  if (!p || p.dead || !state.world) return false;
  const cfg = CONFIG.BARRICADE_PLACE || { cost: 25, cooldown: 3, w: 64, h: 14 };
  if ((p.barricadeCd || 0) > 0) return false;
  if ((state.scrap || 0) < cfg.cost) { pushToast(state, `Need ${cfg.cost} scrap for a barricade`); return false; }
  const horiz = Math.abs(Math.cos(p.angle)) < Math.abs(Math.sin(p.angle));
  const w = horiz ? cfg.w : cfg.h, h = horiz ? cfg.h : cfg.w;
  const cx = p.x + Math.cos(p.angle) * 52, cy = p.y + Math.sin(p.angle) * 52;
  const x = cx - w / 2, y = cy - h / 2;
  if (rectHitsWorld(state.world, x, y, w, h)) { pushToast(state, 'No room for a barricade here'); return false; }
  state.world.barricades.push({ x, y, w, h, hp: 100, maxHp: 100 });
  rebuildColliders(state.world);
  state.scrap -= cfg.cost;
  p.barricadeCd = cfg.cooldown;
  pushToast(state, `Barricade placed (-${cfg.cost} scrap)`);
  state.audio?.buy?.();
  return true;
}

// --- v2: character active skill on C ---------------------------------------
export function tryUseSkill(state, p) {
  if (!p || p.dead) return false;
  if ((p.skillCd || 0) > 0) return false;
  const ch = (CONFIG.CHARACTERS || {})[p.charId] || {};
  const cd = ch.skillCd || 10;
  p.skillCd = cd;
  p.skillCdMax = cd;
  if (p.charId === 'raka') {
    p.dashT = 0.5;
    p.invulnT = 0.7;
    pushToast(state, 'DASH!');
  } else if (p.charId === 'sari') {
    p.hp = Math.min(p.maxHp, p.hp + 40);
    pushToast(state, 'HEAL +40 HP');
    state.audio?.pickup?.();
  } else if (p.charId === 'budi') {
    p.shieldT = 5;
    pushToast(state, 'BULWARK UP! (5s)');
  } else if (p.charId === 'dina') {
    const pt = state.world ? randomOpenNear(state, p.x, p.y, 120) : { x: p.x + 40, y: p.y };
    state.pickups.push({ kind: 'crate', x: pt.x, y: pt.y, amount: 0, t: 0 });
    pushToast(state, 'LUCKY DROP! A crate appeared nearby');
    state.audio?.buy?.();
  }
  return true;
}

function randomOpenNear(state, x, y, maxD) {
  const world = state.world;
  for (let i = 0; i < 20; i++) {
    const a = rand(0, TAU), d = rand(40, maxD);
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    if (world && !circleHitsWorld(world, px, py, 20)) return { x: px, y: py };
  }
  return { x: x + 40, y };
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
  if (p.grenadeCd > 0) p.grenadeCd -= dt;
  if (p.barricadeCd > 0) p.barricadeCd -= dt;
  if (p.skillCd > 0) p.skillCd -= dt;
  if (p.dashT > 0) p.dashT -= dt;
  if (p.invulnT > 0) p.invulnT -= dt;
  if (p.shieldT > 0) p.shieldT -= dt;
  if (p.reloading) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) { p.reloading = 0; p.reloadDur = 0; finishReload(state, p); }
  }
  // Sari (Medic) slowly regenerates HP.
  if ((p.regen || 0) > 0 && p.hp < p.maxHp && !p.dead) {
    p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
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
    p.stamina = Math.max(0, p.stamina - CONFIG.PLAYER.staminaDrain * (p.staminaDrainMul || 1) * dt);
  } else {
    p.stamina = Math.min(CONFIG.PLAYER.stamina, p.stamina + CONFIG.PLAYER.staminaRegen * dt);
  }
  let speed = CONFIG.PLAYER.speed * (p.speedMul || 1) * (sprinting ? CONFIG.PLAYER.sprintMul : 1);
  if (p.dashT > 0) speed *= 2.2; // Raka's Dash
  if (len > 0.01) {
    if (state.hints) state.hints.move = true; // wave-1 tutorial hint
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
  if (firing && p.fireCd <= 0 && !p.reloading) {
    if (state.hints) state.hints.shot = true; // wave-1 tutorial hint
    fireWeapon(state, p);
  }

  // --- reload: R
  if (has('KeyR')) tryReload(state, p);

  // --- weapon switch: 1/2/3/4/5, touch SWAP cycles owned weapons only
  // BUGFIX W4: this used to cancel the reload whenever a digit key was
  // HELD (the check ran every frame while the key was down), so holding
  // 1/2/3 — or tapping it repeatedly — made the reload never finish and
  // the weapon permanently unfireable once the mag was empty. Only a
  // real weapon CHANGE cancels a reload now.
  const order = CONFIG.WEAPON_ORDER || ['pistol', 'shotgun', 'rifle'];
  const owned = p.weapons || ['pistol'];
  const prevWeapon = p.weapon;
  const digit = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
  for (let i = 0; i < digit.length && i < order.length; i++) {
    if (has(digit[i]) && owned.includes(order[i])) { p.weapon = order[i]; break; }
  }
  if (p.weapon !== prevWeapon) { p.reloading = 0; p.reloadT = 0; p.reloadDur = 0; }
  if (touch?.swap) {
    touch.swap = false; // consume the edge
    const i = owned.indexOf(p.weapon);
    p.weapon = owned[(i + 1) % owned.length];
    p.reloading = 0; p.reloadT = 0; p.reloadDur = 0;
  }
  // (A digit-key weapon change already cancelled the reload above.)

  // --- grenade (G / touch NADE button), barricade (B), skill (C) — edges
  const gDown = has('KeyG');
  if ((gDown && !p._gWasDown) || touch?.grenade) {
    if (touch) touch.grenade = false; // consume the edge
    tryThrowGrenade(state, p);
  }
  p._gWasDown = gDown;
  const bDown = has('KeyB');
  if (bDown && !p._bWasDown) tryPlaceBarricade(state, p);
  p._bWasDown = bDown;
  const cDown = has('KeyC');
  if ((cDown && !p._cWasDown) || touch?.skill) {
    if (touch) touch.skill = false; // consume the edge
    tryUseSkill(state, p);
  }
  p._cWasDown = cDown;

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

  // --- pickup collection (within pickupR; magnet handled in updatePickups)
  const pr = p.pickupR || 24;
  for (const pk of [...state.pickups]) {
    if (dist(p.x, p.y, pk.x, pk.y) < pr) {
      state.pickups.splice(state.pickups.indexOf(pk), 1);
      collectPickup(state, pk);
      if (state.hints) state.hints.loot = true; // wave-1 tutorial hint
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

  // --- goo (spitter projectiles): move, hit world / player.
  // v2: goo that lands (world hit or expiry) leaves an acid pool behind.
  if (state.goo) {
    for (const g of [...state.goo]) {
      g.x += g.vx * dt; g.y += g.vy * dt; g.life -= dt;
      let dead = g.life <= 0;
      let hitPlayer = false;
      if (!dead && world && circleHitsWorld(world, g.x, g.y, g.r)) dead = true;
      if (!dead && dist(g.x, g.y, p.x, p.y) < p.r + g.r) {
        damagePlayer(state, g.damage);
        bloodBurst(state, g.x, g.y, 5, '#4a8f7a');
        dead = true;
        hitPlayer = true;
      }
      if (dead) {
        state.goo.splice(state.goo.indexOf(g), 1);
        if (!hitPlayer) {
          state.acidPools = state.acidPools || [];
          state.acidPools.push({ x: g.x, y: g.y, r: (CONFIG.ACID_POOL?.r || 42), t: (CONFIG.ACID_POOL?.life || 4) });
        }
      }
    }
  }

  // --- walker swarm (v2): walkers with 2+ walker neighbours within 130px
  // move 35% faster and render slightly brighter.
  const walkers = state.zombies.filter((z) => z.type === 'walker' && !z.dying);
  for (const z of walkers) {
    let near = 0;
    for (const o of walkers) {
      if (o !== z && dist(z.x, z.y, o.x, o.y) < 130) near++;
    }
    z.swarm = near >= 2;
  }

  for (const z of [...state.zombies]) {
    if (z.flash > 0) z.flash -= dt;
    if (z.staggerT > 0) z.staggerT -= dt;
    if (z.attackCd > 0) z.attackCd -= dt;
    if (z.spitCd > 0) z.spitCd -= dt;

    // Boomer fuse (v2): a fatally-hit boomer swells for 0.45s, then
    // explodes — it doesn't move or attack while the fuse burns.
    if (z.dying) {
      z.dyingT -= dt;
      if (z.dyingT <= 0) explodeBoomer(state, z);
      continue;
    }

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

    // Elite enrage (v2): under 50% HP, faster + stronger + red glow.
    if (z.elite && !z.enraged && z.hp < z.maxHp * 0.5) {
      z.enraged = true;
      z.speed *= (CONFIG.ELITE?.enrageSpeedMul || 1.5);
      z.damage = Math.round(z.damage * (CONFIG.ELITE?.enrageDmgMul || 1.3));
      pushAlert(state, 'ELITE ENRAGED!', 'red');
    }

    // --- skill state machines (v2) ---
    // Runner lunge: wind-up (crouch + flash) then a fast dash at the player.
    let skillLock = false; // true while a skill animation owns movement
    if (z.type === 'runner' && !z.isBoss) {
      if (z.lungeState === 1) {
        skillLock = true;
        z.lungeT -= dt;
        if (z.lungeT <= 0) { z.lungeState = 2; z.lungeT = 0.35; state.audio?.groan?.(); }
      } else if (z.lungeState === 2) {
        skillLock = true;
        const lx = Math.cos(z.lungeDir), ly = Math.sin(z.lungeDir);
        if (world) moveCircle(world, z, lx * 420 * dt, ly * 420 * dt);
        else { z.x += lx * 420 * dt; z.y += ly * 420 * dt; }
        z.lungeT -= dt;
        if (z.lungeT <= 0) { z.lungeState = 0; z.lungeCd = 3.5; }
      } else if (z.lungeCd > 0) {
        z.lungeCd -= dt;
      } else if (d < 280 && z.staggerT <= 0) {
        z.lungeState = 1; z.lungeT = 0.45; z.lungeDir = ang;
      }
    }
    // Brute ground slam: wind-up (arms up + red flash) then an AoE slam.
    // The wind-up is the dodge window — the damage lands only at the end.
    if (z.type === 'brute' && !z.isBoss) {
      if (z.slamState === 1) {
        skillLock = true;
        z.slamT -= dt;
        if (z.slamT <= 0) {
          z.slamState = 0;
          z.slamCd = 4;
          bloodBurst(state, z.x, z.y, 14, '#a08050');
          state.shake = Math.max(state.shake || 0, 12);
          state.audio?.hit?.();
          if (dist(z.x, z.y, p.x, p.y) < 120 + p.r) damagePlayer(state, 20);
        }
      } else if (z.slamCd > 0) {
        z.slamCd -= dt;
      } else if (d < 110 && z.staggerT <= 0) {
        z.slamState = 1; z.slamT = 0.6;
      }
    }

    // Effective speed: swarm bonus for grouped walkers (v2).
    const spd = z.speed * (z.swarm ? 1.35 : 1);

    if (z.staggerT <= 0 && !skillLock) {
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
        if (world) moveCircle(world, z, ex * spd * dt, ey * spd * dt);
        else { z.x += ex * spd * dt; z.y += ey * spd * dt; }
      } else if (z.type === 'spitter') {
        // Keep ~260px: approach when far, back off when close, hold at range.
        if (d > 280) {
          attemptedMove = true;
          if (world) moveCircle(world, z, Math.cos(ang) * spd * dt, Math.sin(ang) * spd * dt);
          else { z.x += Math.cos(ang) * spd * dt; z.y += Math.sin(ang) * spd * dt; }
        } else if (d < 240) {
          attemptedMove = true;
          if (world) moveCircle(world, z, -Math.cos(ang) * spd * dt, -Math.sin(ang) * spd * dt);
          else { z.x -= Math.cos(ang) * spd * dt; z.y -= Math.sin(ang) * spd * dt; }
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
        if (world) moveCircle(world, z, Math.cos(ang) * spd * dt, Math.sin(ang) * spd * dt);
        else { z.x += Math.cos(ang) * spd * dt; z.y += Math.sin(ang) * spd * dt; }
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
              if (b.hp <= 0) {
                b.hp = 0;
                rebuildColliders(world);
                pushAlert(state, 'BARRICADE DESTROYED!', 'red');
              }
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
              if (Math.random() < 0.10) state.pickups.push({ kind: 'armor', x: prop.x + rand(-16, 16), y: prop.y + rand(-16, 16), amount: 30, t: 0 });
              if (Math.random() < 0.08) state.pickups.push({ kind: 'grenade', x: prop.x + rand(-16, 16), y: prop.y + rand(-16, 16), amount: 1, t: 0 });
            }
            rebuildColliders(world);
          }
          consumed = true;
          break;
        }
      }
    }
    if (consumed) { state.bullets.splice(state.bullets.indexOf(b), 1); continue; }

    // Hit a zombie? (Sniper bullets pierce: they keep flying, but never
    // damage the same zombie twice. Dying boomers can't be hit again.)
    let hitZ = null;
    for (const z of state.zombies) {
      if (z.dying) continue;
      if (dist(b.x, b.y, z.x, z.y) < z.r + 4) {
        if (b.pierce && b._hit && b._hit.has(z)) continue;
        hitZ = z; break;
      }
    }
    if (hitZ) {
      state.stats.hits = (state.stats.hits || 0) + 1;
      bloodBurst(state, b.x, b.y, 6);
      damageZombie(state, hitZ, b.damage, ang);
      if (b.pierce) {
        if (!b._hit) b._hit = new Set();
        b._hit.add(hitZ);
        // keep flying
      } else {
        state.bullets.splice(state.bullets.indexOf(b), 1);
        continue;
      }
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
  const pr = p.pickupR || 24;
  const magnetR = pr * 2.5;
  for (const pk of [...state.pickups]) {
    pk.t = (pk.t || 0) + dt;
    const d = dist(p.x, p.y, pk.x, pk.y);
    if (d < magnetR && d > 1) { // magnet
      const sp = 260 * dt;
      pk.x += (p.x - pk.x) / d * sp;
      pk.y += (p.y - pk.y) / d * sp;
    }
    if (dist(p.x, p.y, pk.x, pk.y) < pr) {
      state.pickups.splice(state.pickups.indexOf(pk), 1);
      collectPickup(state, pk);
      if (state.hints) state.hints.loot = true; // wave-1 tutorial hint
    }
  }
}

// ---------------------------------------------------------------- damage / death
export function damageZombie(state, z, dmg, angle) {
  if (!z || z.hp <= 0 || z.dying) return;
  z.hp -= dmg;
  z.flash = 0.12;
  if (!z.isBoss) {
    // Knockback along the hit angle + brief stagger.
    if (state.world) moveCircle(state.world, z, Math.cos(angle) * 12, Math.sin(angle) * 12);
    else { z.x += Math.cos(angle) * 12; z.y += Math.sin(angle) * 12; }
    z.staggerT = 0.22;
  }
  if (z.hp <= 0) {
    // Boomers don't die instantly — a fatal hit starts the 0.45s fuse,
    // then they explode (see explodeBoomer). Everything else dies now.
    if (z.type === 'boomer') {
      z.dying = true;
      z.dyingT = 0.45;
      z.hp = 0;
      return;
    }
    killZombie(state, z);
  }
}

// Combo bookkeeping (v2): kills within the combo window build a score +
// scrap multiplier. Shared by killZombie and explodeBoomer.
function awardKill(state, cfg, x, y) {
  const combo = state.combo || (state.combo = { n: 0, t: 0, mul: 1 });
  combo.n = combo.t > 0 ? combo.n + 1 : 1;
  combo.t = (CONFIG.COMBO?.window || 3);
  combo.mul = Math.min(
    CONFIG.COMBO?.maxMul || 2.5,
    1 + Math.min(combo.n - 1, 15) * (CONFIG.COMBO?.step || 0.1));
  state.kills += 1;
  state.score += Math.round(cfg.score * combo.mul);
  state.pickups.push({
    kind: 'scrap', x, y,
    amount: Math.max(1, Math.round(cfg.scrap * combo.mul * (state.player?.scrapMul || 1))),
    t: 0,
  });
}

// Boomer explosion (v2): AoE damage to zombies AND the player — shooting
// one in the middle of a crowd is a tactic. Chains into other boomers.
function explodeBoomer(state, z) {
  const i = state.zombies.indexOf(z);
  if (i !== -1) state.zombies.splice(i, 1);
  bloodBurst(state, z.x, z.y, 26, '#b8d020');
  bloodBurst(state, z.x, z.y, 12, '#5a5a5a');
  state.shake = Math.max(state.shake || 0, 10);
  state.audio?.explosion?.();
  for (const o of [...state.zombies]) {
    const d = dist(z.x, z.y, o.x, o.y);
    if (d < 120 + o.r) damageZombie(state, o, 60, Math.atan2(o.y - z.y, o.x - z.x));
  }
  const p = state.player;
  if (p && !p.dead && dist(z.x, z.y, p.x, p.y) < 120 + p.r) {
    damagePlayer(state, 35);
  }
  awardKill(state, CONFIG.ZOMBIES.boomer, z.x, z.y);
}

export function killZombie(state, z) {
  const i = state.zombies.indexOf(z);
  if (i === -1) return;
  state.zombies.splice(i, 1);
  const cfg = CONFIG.ZOMBIES[z.type] || CONFIG.ZOMBIES.walker;
  awardKill(state, cfg, z.x, z.y);
  state.audio?.zombieDie?.();
  bloodBurst(state, z.x, z.y, 14);
  // 25% chance of an ammo or medkit drop.
  if (Math.random() < 0.25) {
    const kind = pick(['ammo', 'medkit']);
    state.pickups.push({
      kind, x: z.x + rand(-20, 20), y: z.y + rand(-20, 20),
      amount: kind === 'medkit' ? 40 : 0, t: 0,
    });
  }
  // v2 loot: rare grenade / weapon drops (small chances, by design).
  const r = Math.random();
  if (r < 0.03) {
    state.pickups.push({ kind: 'grenade', x: z.x + rand(-20, 20), y: z.y + rand(-20, 20), amount: 1, t: 0 });
  } else if (r < 0.06) {
    const unowned = (CONFIG.WEAPON_ORDER || []).filter(
      (w) => w !== 'pistol' && !(state.player?.weapons || []).includes(w));
    if (unowned.length > 0) {
      state.pickups.push({
        kind: 'weapon', weapon: pick(unowned),
        x: z.x + rand(-20, 20), y: z.y + rand(-20, 20), amount: 0, t: 0,
      });
    }
  }
  // Elite: always drops good loot.
  if (z.elite) {
    const unowned = (CONFIG.WEAPON_ORDER || []).filter(
      (w) => w !== 'pistol' && !(state.player?.weapons || []).includes(w));
    if (unowned.length > 0) {
      state.pickups.push({
        kind: 'weapon', weapon: pick(unowned),
        x: z.x + rand(-14, 14), y: z.y + rand(-14, 14), amount: 0, t: 0,
      });
    }
    state.pickups.push({ kind: 'grenade', x: z.x + rand(-24, 24), y: z.y + rand(-24, 24), amount: 2, t: 0 });
    state.pickups.push({ kind: 'medkit', x: z.x + rand(-24, 24), y: z.y + rand(-24, 24), amount: 40, t: 0 });
  }
  if (z.isBoss) {
    state.boss = null;
    state.pickups.push({ kind: 'crate', x: z.x, y: z.y, amount: 0, t: 0 });
    state.banner = { text: 'ABOMINATION DOWN', sub: 'Weapon crate dropped', t: 3 };
  }
}
