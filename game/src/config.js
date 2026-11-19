// DEADZONE — central tuning. All numbers the other modules read live here.
export const CONFIG = {
  WORLD_W: 2600,
  WORLD_H: 1800,
  DAY_LENGTH: 90,

  PLAYER: {
    r: 16, hp: 100, speed: 185, sprintMul: 1.5,
    stamina: 100, staminaDrain: 28, staminaRegen: 16,
  },

  WEAPONS: {
    pistol:  { name: 'Pistol',  damage: 25, rate: 0.22, spread: 0.06, pellets: 1, range: 520, reload: 0.9, mag: 12, ammo: 'inf',    kick: 2 },
    shotgun: { name: 'Shotgun', damage: 18, rate: 0.80, spread: 0.35, pellets: 6, range: 300, reload: 1.6, mag: 6,  ammo: 'shells', kick: 7 },
    rifle:   { name: 'Rifle',   damage: 34, rate: 0.11, spread: 0.03, pellets: 1, range: 700, reload: 1.4, mag: 30, ammo: 'rifle',  kick: 3 },
    // Loot/shop weapons (v2): SMG shares rifle ammo, Sniper shares shells.
    smg:     { name: 'SMG',     damage: 12, rate: 0.07, spread: 0.12, pellets: 1, range: 450, reload: 1.2, mag: 32, ammo: 'rifle',  kick: 1 },
    sniper:  { name: 'Sniper',  damage: 120, rate: 1.10, spread: 0.01, pellets: 1, range: 900, reload: 1.8, mag: 5,  ammo: 'shells', kick: 8, pierce: true },
  },
  // Fixed weapon order (slots 1-5, touch SWAP cycles owned only).
  WEAPON_ORDER: ['pistol', 'shotgun', 'rifle', 'smg', 'sniper'],

  ZOMBIES: {
    walker:  { hp: 50,  speed: 55,  damage: 12, r: 16, scrap: 5,   score: 10,  color: '#6a8f5f' },
    runner:  { hp: 35,  speed: 125, damage: 10, r: 14, scrap: 7,   score: 15,  color: '#a89a4a' },
    brute:   { hp: 260, speed: 38,  damage: 25, r: 26, scrap: 20,  score: 40,  color: '#7a4a6a' },
    spitter: { hp: 45,  speed: 48,  damage: 8,  r: 15, scrap: 10,  score: 25,  color: '#4a8f7a' },
    boomer:  { hp: 60,  speed: 50,  damage: 10, r: 18, scrap: 12,  score: 20,  color: '#7a9a2a' },
    boss:    { hp: 1500, speed: 45, damage: 35, r: 40, scrap: 150, score: 200, color: '#8f2a2a' },
  },

  // Elites: walker base with these multipliers (see entities.makeElite).
  ELITE: { hpMul: 3.5, speedMul: 1.15, dmgMul: 1.2, enrageSpeedMul: 1.5, enrageDmgMul: 1.3 },

  GRENADE: { damage: 90, radius: 130, fuse: 0.7, speed: 520, startCount: 1 },
  COMBO: { window: 3, step: 0.1, maxMul: 2.5 },
  BARRICADE_PLACE: { cost: 25, cooldown: 3, w: 64, h: 14 },
  ACID_POOL: { r: 42, life: 4, dps: 8 },

  WAVES: { base: 6, perWave: 4, maxAlive: 40, breather: 20 },

  SHOP: [
    { id: 'shells',  name: 'Shotgun shells x12', cost: 40 },
    { id: 'rifle',   name: 'Rifle ammo x30',     cost: 40 },
    { id: 'medkit',  name: 'Medkit (+50 HP)',    cost: 60 },
    { id: 'armor',   name: 'Armor (+50)',        cost: 80 },
    { id: 'repair',  name: 'Repair barricades',  cost: 30 },
    { id: 'damage',  name: 'Damage +15%',        cost: 150 },
    { id: 'maxhp',   name: 'Max HP +25',         cost: 120 },
    { id: 'smg',     name: 'SMG',                cost: 400 },
    { id: 'sniper',  name: 'Sniper',             cost: 500 },
    { id: 'grenade', name: 'Grenades x2',        cost: 80 },
  ],

  // Playable survivors (character select on the title screen).
  // Mods are read by entities.createPlayer; skillCd is the active skill's
  // cooldown in seconds. Keep them roughly balanced — no one dominates.
  CHARACTERS: {
    raka: {
      name: 'Raka', role: 'Runner', tagline: 'Fast on his feet',
      skill: 'Dash', skillDesc: 'Burst of speed + brief invulnerability', skillCd: 6,
      color: '#2a7a8a', speedMul: 1.15, staminaDrainMul: 0.65,
      stats: 'SPD+  •  STA drain−',
    },
    sari: {
      name: 'Sari', role: 'Medic', tagline: 'Keeps the squad alive',
      skill: 'Heal', skillDesc: 'Restore 40 HP instantly', skillCd: 20,
      color: '#3a9a5a', medkitMul: 1.5, regen: 1.5,
      stats: 'Medkit+  •  HP regen',
    },
    budi: {
      name: 'Budi', role: 'Heavy', tagline: 'A walking wall',
      skill: 'Bulwark', skillDesc: 'Shield 5s — damage reduced 75%', skillCd: 15,
      color: '#5a5a6a', maxHp: 140, dmgResist: 0.8, speedMul: 0.92,
      stats: 'HP 140  •  Tougher',
    },
    dina: {
      name: 'Dina', role: 'Scavenger', tagline: 'Finds loot everywhere',
      skill: 'Lucky Drop', skillDesc: 'Drop a random loot crate nearby', skillCd: 30,
      color: '#c8762a', scrapMul: 1.5, pickupR: 36,
      stats: 'Scrap +50%  •  Loot reach+',
    },
  },
  CHARACTER_ORDER: ['raka', 'sari', 'budi', 'dina'],
};
