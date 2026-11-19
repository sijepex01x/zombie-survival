// DEADZONE — game.js (W2 gameplay)
// Wave flow, modes, shop, darkness, best score. Vanilla JS, zero libraries.
// Imports only entities.js, config.js and world.js helpers per CONTRACT.md.
import { CONFIG } from './config.js';
import {
  createPlayer, updatePlayer, updateZombies, updateBullets,
  updateParticles, updatePickups, createZombie,
} from './entities.js';
import { randomEdgeSpawn, rebuildColliders } from './world.js';

const BEST_KEY = 'deadzone-best';

function spawnInterval(wave) {
  // 0.9s on wave 1, shrinking to a 0.35s floor.
  return Math.max(0.35, 0.9 - (wave - 1) * 0.06);
}

function pickZombieType(wave) {
  const r = Math.random();
  if (wave >= 7 && r < 0.15) return 'spitter';
  if (wave >= 5 && r < 0.30) return 'brute';
  if (wave >= 3 && r < 0.55) return 'runner';
  return 'walker';
}

function spawnOne(state) {
  const type = pickZombieType(state.wave);
  let x, y;
  try {
    ({ x, y } = randomEdgeSpawn(state.world, Math.random));
  } catch {
    // Fallback if the world helper is unavailable: a random map edge.
    const w = state.world?.w || CONFIG.WORLD_W, h = state.world?.h || CONFIG.WORLD_H;
    const edge = Math.floor(Math.random() * 4);
    if (edge === 0) { x = Math.random() * w; y = 20; }
    else if (edge === 1) { x = Math.random() * w; y = h - 20; }
    else if (edge === 2) { x = 20; y = Math.random() * h; }
    else { x = w - 20; y = Math.random() * h; }
  }
  state.zombies.push(createZombie(type, x, y));
}

function playerSpawn(world) {
  if (world?.square) {
    return { x: world.square.x + world.square.w / 2, y: world.square.y + world.square.h / 2 };
  }
  return { x: (world?.w || CONFIG.WORLD_W) / 2, y: (world?.h || CONFIG.WORLD_H) / 2 };
}

function readBest() {
  try {
    if (typeof localStorage === 'undefined') return 0;
    return parseInt(localStorage.getItem(BEST_KEY), 10) || 0;
  } catch { return 0; }
}

// Reset the run in place (keeps the same state object, best, input, audio,
// world, muted and quality) — used by 'start' and 'restart'.
function resetRun(state, mode) {
  const s = playerSpawn(state.world);
  state.player = createPlayer(s.x, s.y);
  state.mode = mode;
  state.time = 0;
  state.dayTime = 0;
  state.wave = 0;
  state.waveState = 'idle';
  state.breatherT = 0;
  state.spawnQueue = 0;
  state.spawnT = 0;
  state.zombiesLeft = 0;
  state.kills = 0;
  state.scrap = 0;
  state.score = 0;
  state.zombies = [];
  state.bullets = [];
  state.particles = [];
  state.pickups = [];
  state.goo = [];
  state.shake = 0;
  state.banner = null;
  state.boss = null;
  state.stats = { shots: 0, hits: 0 };
  if (state.camera) { state.camera.x = 0; state.camera.y = 0; }
}

// ---------------------------------------------------------------- creation
export function createGame(world, input, audio) {
  const s = playerSpawn(world);
  return {
    mode: 'title',
    time: 0,
    dayTime: 0,
    wave: 0, waveState: 'idle',
    breatherT: 0, spawnQueue: 0, spawnT: 0,
    zombiesLeft: 0,
    kills: 0, scrap: 0, score: 0,
    best: readBest(),
    player: createPlayer(s.x, s.y),
    zombies: [], bullets: [], particles: [], pickups: [], goo: [],
    world, camera: { x: 0, y: 0 },
    shake: 0, banner: null,
    boss: null,
    shopItems: CONFIG.SHOP,
    stats: { shots: 0, hits: 0 },
    muted: false, quality: 'high',
    input: input || null, audio: audio || null,
  };
}

// ---------------------------------------------------------------- darkness
export function darkness(state) {
  const t = state.dayTime || 0;
  if (t < 55) return 0;
  if (t < 60) return ((t - 55) / 5) * 0.85;
  if (t <= 85) return 0.85;
  if (t < 90) return 0.85 * ((90 - t) / 5);
  return 0;
}

// ---------------------------------------------------------------- waves
export function startWave(state, n) {
  state.wave = n;
  state.waveState = 'spawning';
  const count = CONFIG.WAVES.base + n * CONFIG.WAVES.perWave;
  const isBossWave = n % 5 === 0;
  if (isBossWave) {
    // Boss spawns first, alone, with horn + roar + banner.
    let bx, by;
    try {
      ({ x: bx, y: by } = randomEdgeSpawn(state.world, Math.random));
    } catch {
      bx = (state.world?.w || CONFIG.WORLD_W) / 2; by = 20;
    }
    const boss = createZombie('boss', bx, by);
    boss._roared = true; // roar is played here, not on first update
    state.zombies.push(boss);
    state.boss = boss;
    state.spawnQueue = Math.floor(count / 2);
    state.banner = { text: `WAVE ${n} — ABOMINATION`, sub: 'Something huge is coming', t: 3 };
    state.audio?.horn?.();
    state.audio?.roar?.();
  } else {
    state.spawnQueue = count;
    state.banner = { text: `WAVE ${n}`, sub: "They're coming", t: 3 };
    state.audio?.horn?.();
  }
  state.spawnT = 0.6;
  state.zombiesLeft = state.spawnQueue + (isBossWave ? 1 : 0);
}

// ---------------------------------------------------------------- shop
export function buyItem(state, id) {
  const item = (state.shopItems || CONFIG.SHOP).find((it) => it.id === id);
  if (!item) return false;
  if ((state.scrap || 0) < item.cost) return false;
  const p = state.player;
  if (!p) return false;
  switch (id) {
    case 'shells': p.reserve.shells += 12; break;
    case 'rifle': p.reserve.rifle += 30; break;
    case 'medkit': p.hp = Math.min(p.maxHp, p.hp + 50); break;
    case 'armor': p.armor += 50; break;
    case 'repair':
      for (const b of state.world?.barricades || []) b.hp = b.maxHp;
      // BUGFIX W4: destroyed barricades are out of the collider list;
      // without a rebuild, zombies walk straight through "repaired" ones.
      if (state.world) rebuildColliders(state.world);
      break;
    case 'damage': p.dmgMul = p.dmgMul * 1.15; break;
    case 'maxhp': p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); break;
    default: return false;
  }
  state.scrap -= item.cost;
  state.audio?.buy?.();
  return true;
}

// ---------------------------------------------------------------- best score
export function saveBest(state) {
  if (state.score > (state.best || 0)) {
    state.best = state.score;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(BEST_KEY, String(state.best));
    } catch { /* storage unavailable (e.g. file:// private mode) — best stays in memory */ }
  }
}

// ---------------------------------------------------------------- actions
export function doAction(state, action) {
  if (!action) return false;
  if (action === 'start') {
    if (state.mode !== 'title' && state.mode !== 'gameover') return false;
    resetRun(state, 'playing');
    startWave(state, 1);
    return true;
  }
  if (action === 'resume') {
    if (state.mode !== 'paused') return false;
    state.mode = 'playing';
    return true;
  }
  if (action === 'pause') {
    if (state.mode !== 'playing') return false;
    state.mode = 'paused';
    return true;
  }
  if (action === 'restart') {
    resetRun(state, 'playing');
    startWave(state, 1);
    return true;
  }
  if (action === 'quitToTitle') {
    resetRun(state, 'title');
    return true;
  }
  if (action === 'closeShop') {
    if (state.mode !== 'shop') return false;
    state.mode = 'playing';
    startWave(state, state.wave + 1);
    return true;
  }
  if (action.startsWith('buy:')) return buyItem(state, action.slice(4));
  return false;
}

// ---------------------------------------------------------------- master update
export function updateGame(state, dt) {
  if (!state || dt <= 0) return;
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 24);
  if (state.banner) {
    state.banner.t -= dt;
    if (state.banner.t <= 0) state.banner = null;
  }

  if (state.mode === 'title') {
    // Idle world animation behind the title screen.
    state.time += dt;
    state.dayTime = (state.dayTime + dt) % CONFIG.DAY_LENGTH;
    updateParticles(state, dt);
    return;
  }

  if (state.mode !== 'playing') {
    // 'shop' (frozen world, timer not advancing), 'paused', 'gameover'.
    return;
  }

  state.time += dt;
  state.dayTime = (state.dayTime + dt) % CONFIG.DAY_LENGTH;

  updatePlayer(state, dt);
  updateZombies(state, dt);
  updateBullets(state, dt);
  updateParticles(state, dt);
  updatePickups(state, dt);

  // --- wave flow
  if (state.waveState === 'spawning') {
    state.spawnT -= dt;
    if (state.spawnQueue > 0 && state.spawnT <= 0) {
      if (state.zombies.length < CONFIG.WAVES.maxAlive) {
        spawnOne(state);
        state.spawnQueue -= 1;
        state.spawnT = spawnInterval(state.wave);
      } else {
        state.spawnT = 0.2; // at the alive cap — retry shortly
      }
    }
    if (state.spawnQueue === 0) state.waveState = 'fighting';
  } else if (state.waveState === 'fighting') {
    if (state.zombies.length === 0 && state.spawnQueue === 0) {
      state.waveState = 'breather';
      state.breatherT = CONFIG.WAVES.breather;
      state.banner = { text: 'WAVE CLEARED', sub: 'Breather — patch up, then the shop', t: 3 };
      state.audio?.waveClear?.();
    }
  } else if (state.waveState === 'breather') {
    state.breatherT -= dt;
    if (state.breatherT <= 0) {
      state.waveState = 'idle';
      state.mode = 'shop';
    }
  }
  state.zombiesLeft = state.zombies.length + state.spawnQueue;

  // --- player death
  const p = state.player;
  if (p && (p.dead || p.hp <= 0)) {
    p.dead = true;
    p.hp = 0;
    state.mode = 'gameover';
    saveBest(state);
    state.audio?.gameOver?.();
  }
}
