// DEADZONE — Grayfield town: layout, colliders, collision helpers.
// All colliders are axis-aligned AABBs; every prop is drawn axis-aligned too.

import { CONFIG } from './config.js';

const W = CONFIG.WORLD_W;
const H = CONFIG.WORLD_H;

// Fixed building footprints [x, y, w, h] — laid out in blocks around the
// streets and the central square, with a little seeded jitter at build time.
const BUILDING_SPOTS = [
  // NW block
  [120, 380, 150, 110], [300, 380, 130, 110],
  [120, 540, 140, 120], [300, 540, 130, 120],
  // NE block
  [2180, 380, 150, 110], [2360, 380, 130, 110],
  [2180, 540, 140, 120], [2360, 540, 130, 120],
  // W middle block
  [120, 1000, 150, 120], [300, 1000, 130, 120],
  [120, 1160, 140, 120], [300, 1160, 130, 120],
  // E middle block
  [2180, 1000, 150, 120], [2360, 1000, 130, 120],
  [2180, 1160, 140, 120], [2360, 1160, 130, 120],
  // N middle block
  [700, 380, 160, 120], [900, 380, 140, 110],
  [700, 540, 150, 120], [900, 540, 140, 120],
  // N-east / S-middle blocks
  [1700, 380, 150, 120], [1700, 540, 140, 120],
  [700, 1300, 160, 120], [900, 1300, 140, 120],
  [1150, 1300, 150, 120], [1400, 1300, 140, 120],
  [1700, 1300, 150, 120], [1900, 1300, 140, 120],
];

const ROOF_COLORS = ['#5a4a3a', '#4a3a4a', '#3a4a5a', '#54423a', '#463a52', '#3f4a3a'];

const CAR_COLORS = ['#7a3a3a', '#3a5a7a', '#6a6a5a', '#4a4a55', '#7a6a3a'];

function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function circleHitsAABB(x, y, r, b) {
  const cx = Math.max(b.x, Math.min(x, b.x + b.w));
  const cy = Math.max(b.y, Math.min(y, b.y + b.h));
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

export function createWorld(rand) {
  const R = typeof rand === 'function' ? rand : Math.random;
  const jr = (v) => (R() * 2 - 1) * v; // jitter helper

  const world = {
    w: W, h: H,
    square: { x: 1150, y: 750, w: 300, h: 300 },
    park: { x: 620, y: 1220, w: 420, h: 300 },
    streets: [
      { x: 0, y: 250, w: W, h: 80 },    // top horizontal
      { x: 0, y: 1470, w: W, h: 80 },   // bottom horizontal
      { x: 420, y: 0, w: 80, h: H },    // west vertical
      { x: 2100, y: 0, w: 80, h: H },   // east vertical
      { x: 1080, y: 690, w: 440, h: 60 },  // square north approach
      { x: 1080, y: 1050, w: 440, h: 60 }, // square south approach
    ],
    buildings: [],
    cars: [],
    crates: [],
    barrels: [],
    lamps: [],
    barricades: [],
    trees: [],
    colliders: [],
  };

  // Buildings (+ church north of the square, taller and distinct).
  for (const [bx, by, bw, bh] of BUILDING_SPOTS) {
    world.buildings.push({
      x: bx + jr(8), y: by + jr(8), w: bw, h: bh,
      color: ROOF_COLORS[Math.floor(R() * ROOF_COLORS.length)],
    });
  }
  world.buildings.push({
    x: 1250, y: 560, w: 200, h: 140, color: '#5a4a6a', church: true,
  });

  // Wrecked cars: on the roads and a couple near the square.
  const carSpots = [
    [650, 278, 72, 34], [1500, 278, 72, 34], [900, 1498, 72, 34], [1800, 1498, 72, 34],
    [448, 700, 34, 72], [448, 1200, 34, 72], [2128, 800, 34, 72], [2128, 1300, 34, 72],
    [1000, 700, 72, 34], [1600, 1080, 72, 34],
  ];
  for (const [cx, cy, cw, ch] of carSpots) {
    world.cars.push({
      x: cx, y: cy, w: cw, h: ch,
      color: CAR_COLORS[Math.floor(R() * CAR_COLORS.length)],
    });
  }

  // Street lamps: square corners + along the main roads.
  world.lamps = [
    { x: 1120, y: 720 }, { x: 1480, y: 720 },
    { x: 1120, y: 1080 }, { x: 1480, y: 1080 },
    { x: 600, y: 250 }, { x: 2000, y: 250 },
    { x: 600, y: 1550 }, { x: 2000, y: 1550 },
    { x: 420, y: 900 }, { x: 2180, y: 900 },
  ];

  // Barricades ringing the central square (6 segments, hp 100 each).
  const sq = world.square;
  const bar = (x, y, w, h) => ({ x, y, w, h, hp: 100, maxHp: 100 });
  world.barricades = [
    bar(sq.x + 30, sq.y - 24, 110, 18),
    bar(sq.x + 160, sq.y - 24, 110, 18),
    bar(sq.x + 30, sq.y + sq.h + 6, 110, 18),
    bar(sq.x + 160, sq.y + sq.h + 6, 110, 18),
    bar(sq.x - 24, sq.y + 80, 18, 140),
    bar(sq.x + sq.w + 6, sq.y + 80, 18, 140),
  ];

  // Trees: a cluster in the park + a few scattered loners.
  for (let i = 0; i < 10; i++) {
    world.trees.push({
      x: world.park.x + 30 + R() * (world.park.w - 60),
      y: world.park.y + 30 + R() * (world.park.h - 60),
      r: 20 + R() * 8,
    });
  }
  for (const [tx, ty] of [[560, 900], [2050, 900], [1000, 1620], [1600, 180]]) {
    world.trees.push({ x: tx, y: ty, r: 22 });
  }

  // Crates / barrels: scattered in open ground, never overlapping a
  // building, car, tree, street edge or the square's barricade ring.
  function solidAt(x, y, r) {
    for (const b of world.buildings) if (aabbOverlap(x - r, y - r, r * 2, r * 2, b.x, b.y, b.w, b.h)) return true;
    for (const c of world.cars) if (aabbOverlap(x - r, y - r, r * 2, r * 2, c.x, c.y, c.w, c.h)) return true;
    for (const t of world.trees) {
      const dx = x - t.x, dy = y - t.y;
      if (dx * dx + dy * dy < (r + t.r) * (r + t.r)) return true;
    }
    for (const s of world.streets) if (aabbOverlap(x - r, y - r, r * 2, r * 2, s.x, s.y, s.w, s.h)) return true;
    return false;
  }

  function scatter(n, r, make) {
    let placed = 0, tries = 0;
    while (placed < n && tries < 300) {
      tries++;
      const x = 60 + R() * (W - 120);
      const y = 60 + R() * (H - 120);
      if (!solidAt(x, y, r + 6)) { make(x, y); placed++; }
    }
  }
  scatter(14, 16, (x, y) => world.crates.push({ x, y, r: 16, hp: 20 }));
  scatter(8, 13, (x, y) => world.barrels.push({ x, y, r: 13, hp: 20 }));

  rebuildColliders(world);
  return world;
}

// Rebuild the flat collider list from live props. Call whenever a
// crate/barrel/barricade dies (or is repaired back into existence).
export function rebuildColliders(world) {
  const c = [];
  for (const b of world.buildings) c.push({ x: b.x, y: b.y, w: b.w, h: b.h });
  for (const car of world.cars) c.push({ x: car.x, y: car.y, w: car.w, h: car.h });
  for (const t of world.trees) c.push({ x: t.x - t.r, y: t.y - t.r, w: t.r * 2, h: t.r * 2 });
  for (const cr of world.crates) if (cr.hp > 0) c.push({ x: cr.x - cr.r, y: cr.y - cr.r, w: cr.r * 2, h: cr.r * 2 });
  for (const ba of world.barrels) if (ba.hp > 0) c.push({ x: ba.x - ba.r, y: ba.y - ba.r, w: ba.r * 2, h: ba.r * 2 });
  for (const bd of world.barricades) if (bd.hp > 0) c.push({ x: bd.x, y: bd.y, w: bd.w, h: bd.h });
  world.colliders = c;
}

export function circleHitsWorld(world, x, y, r) {
  if (x - r < 0 || y - r < 0 || x + r > world.w || y + r > world.h) return true;
  const cols = world.colliders;
  for (let i = 0; i < cols.length; i++) {
    if (circleHitsAABB(x, y, r, cols[i])) return true;
  }
  return false;
}

// Total penetration depth of circle (x,y,r) into the world (>= 0; 0 when
// clear). Used only to let an already-overlapping entity escape.
// Center-inside an AABB counts as r + distance to the nearest edge
// (the exit distance), so depth falls monotonically as the circle climbs
// back out — a plain "r - dist" would stay flat at r while the center is
// inside and no step would ever be allowed.
function overlapDepth(world, x, y, r) {
  let depth = 0;
  if (x - r < 0) depth += r - x;
  if (y - r < 0) depth += r - y;
  if (x + r > world.w) depth += x + r - world.w;
  if (y + r > world.h) depth += y + r - world.h;
  const cols = world.colliders;
  for (let i = 0; i < cols.length; i++) {
    const b = cols[i];
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 0.0001) depth += r - Math.sqrt(d2);
      else depth += r + Math.min(x - b.x, b.x + b.w - x, y - b.y, b.y + b.h - y);
    }
  }
  return depth;
}

// Push a circle out of any collider it overlaps, along the smallest exit.
// The zombie separation step moves zombies without collision checks, so a
// horde pressed against a wall can shove a zombie's centre inside a
// building; without this it could never move again (every step still
// overlaps). Returns true if anything was overlapping.
export function ejectFromWorld(world, e) {
  let moved = false;
  for (const b of world.colliders) {
    const cx = Math.max(b.x, Math.min(e.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(e.y, b.y + b.h));
    const dx = e.x - cx, dy = e.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= e.r * e.r) continue;
    if (d2 > 0.0001) {
      // Centre outside: push along the normal to exactly touching.
      const d = Math.sqrt(d2), push = e.r - d;
      e.x += (dx / d) * push; e.y += (dy / d) * push;
    } else {
      // Centre inside: push out the nearest edge.
      const left = e.x - b.x, right = b.x + b.w - e.x;
      const top = e.y - b.y, bottom = b.y + b.h - e.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) e.x = b.x - e.r;
      else if (m === right) e.x = b.x + b.w + e.r;
      else if (m === top) e.y = b.y - e.r;
      else e.y = b.y + b.h + e.r;
    }
    moved = true;
  }
  // World bounds.
  if (e.x - e.r < 0) { e.x = e.r; moved = true; }
  if (e.y - e.r < 0) { e.y = e.r; moved = true; }
  if (e.x + e.r > world.w) { e.x = world.w - e.r; moved = true; }
  if (e.y + e.r > world.h) { e.y = world.h - e.r; moved = true; }
  return moved;
}

// Axis-separated movement with wall sliding: try x, then y; cancel the
// axis that would collide.
// BUGFIX W4: an entity whose circle already overlaps a collider (pushed in
// by zombie separation / knockback, which ignore collision) could never
// move again — every small step still overlapped, so every step was
// blocked and the zombie sat stuck on a building forever, soft-locking
// the wave. When already overlapping, a step is now allowed if it
// strictly reduces the total penetration depth, so the entity can climb
// back out. Non-overlapping entities keep the old strict rule.
export function moveCircle(world, e, dx, dy) {
  if (dx !== 0) {
    if (!circleHitsWorld(world, e.x + dx, e.y, e.r)) e.x += dx;
    else if (circleHitsWorld(world, e.x, e.y, e.r) &&
      overlapDepth(world, e.x + dx, e.y, e.r) < overlapDepth(world, e.x, e.y, e.r)) e.x += dx;
  }
  if (dy !== 0) {
    if (!circleHitsWorld(world, e.x, e.y + dy, e.r)) e.y += dy;
    else if (circleHitsWorld(world, e.x, e.y, e.r) &&
      overlapDepth(world, e.x, e.y + dy, e.r) < overlapDepth(world, e.x, e.y, e.r)) e.y += dy;
  }
}

export function randomEdgeSpawn(world, rand) {
  const R = typeof rand === 'function' ? rand : Math.random;
  const m = 30; // just inside the edge
  const edge = Math.floor(R() * 4);
  if (edge === 0) return { x: m + R() * (world.w - m * 2), y: m };
  if (edge === 1) return { x: m + R() * (world.w - m * 2), y: world.h - m };
  if (edge === 2) return { x: m, y: m + R() * (world.h - m * 2) };
  return { x: world.w - m, y: m + R() * (world.h - m * 2) };
}

export function randomOpenPoint(world, rand) {
  const R = typeof rand === 'function' ? rand : Math.random;
  for (let i = 0; i < 60; i++) {
    const x = 50 + R() * (world.w - 100);
    const y = 50 + R() * (world.h - 100);
    if (!circleHitsWorld(world, x, y, 20)) return { x, y };
  }
  // Fallback: middle of the square is always open.
  const s = world.square;
  return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
}
