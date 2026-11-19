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
  },

  ZOMBIES: {
    walker:  { hp: 50,  speed: 55,  damage: 12, r: 16, scrap: 5,   score: 10,  color: '#6a8f5f' },
    runner:  { hp: 35,  speed: 125, damage: 10, r: 14, scrap: 7,   score: 15,  color: '#a89a4a' },
    brute:   { hp: 260, speed: 38,  damage: 25, r: 26, scrap: 20,  score: 40,  color: '#7a4a6a' },
    spitter: { hp: 45,  speed: 48,  damage: 8,  r: 15, scrap: 10,  score: 25,  color: '#4a8f7a' },
    boss:    { hp: 1500, speed: 45, damage: 35, r: 40, scrap: 150, score: 200, color: '#8f2a2a' },
  },

  WAVES: { base: 6, perWave: 4, maxAlive: 40, breather: 20 },

  SHOP: [
    { id: 'shells',  name: 'Shotgun shells x12', cost: 40 },
    { id: 'rifle',   name: 'Rifle ammo x30',     cost: 40 },
    { id: 'medkit',  name: 'Medkit (+50 HP)',    cost: 60 },
    { id: 'armor',   name: 'Armor (+50)',        cost: 80 },
    { id: 'repair',  name: 'Repair barricades',  cost: 30 },
    { id: 'damage',  name: 'Damage +15%',        cost: 150 },
    { id: 'maxhp',   name: 'Max HP +25',         cost: 120 },
  ],
};
