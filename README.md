# DEADZONE — Zombie Survival

**DEADZONE** is a top-down 2D zombie survival game set in the fictional town
of Grayfield. You are the last survivor holding the town square.
Survive endless waves of zombies, collect scrap from kills, spend it in the
shop between waves, and take down the Abomination — a huge boss that attacks
every 5th wave.

A fun build, not a bounty entry. Vanilla JS + Canvas 2D, zero libraries,
zero network, all art procedural, all sound synthesized with WebAudio.

## How to play

- **Survive the wave.** Zombies spawn at the map edges and hunt you down.
  Clear them all to trigger a 20-second breather, then the shop opens.
- **Spend scrap.** Kills drop scrap. Between waves, buy ammo, medkits,
  armor, barricade repairs, and permanent upgrades (damage, max HP).
- **Watch the clock.** A full day/night cycle lasts ~90 seconds. Nights are
  darker and deadlier — your flashlight cone is your best friend.
- **Boss every 5 waves.** The Abomination is huge, slow, and very tough.
  Kill it and it drops a weapon crate: +50 scrap or a full ammo refill.
- **Use the town.** Smash crates for scrap, shoot red barrels to blow
  zombies up (40 damage in 100 px), repair the barricades ringing the
  square with **E** (10 scrap per 25 HP) — zombies chew through them
  when blocked.
- **Score** = kills + waves reached. Your best score is saved in the
  browser. When you die, press **R** to go again.

### Zombies

| Type | Appears | Notes |
| --- | --- | --- |
| Walker | Wave 1 | Slow, basic |
| Runner | Wave 3+ | Fast, low HP |
| Brute | Wave 5+ | Big, slow, heavy damage |
| Spitter | Wave 7+ | Keeps its distance, fires goo |
| **Abomination (boss)** | **Every 5th wave** | Huge HP, drops a weapon crate |

## Controls

### Keyboard + mouse

| Key | Action |
| --- | --- |
| **WASD / Arrows** | Move |
| **Mouse** | Aim — **Click / Space** to shoot |
| **Shift** | Sprint (drains stamina) |
| **R** | Reload (auto-reloads on empty) |
| **1 / 2 / 3** | Pistol / Shotgun / Rifle |
| **F** | Melee shove (also triggers automatically on contact) |
| **E** | Repair a damaged barricade nearby (10 scrap / 25 HP) |
| **P / Esc** | Pause / resume |
| **M** | Mute |
| **Q** | Toggle quality (high / low) |
| **Enter** | Start / continue / next wave |
| **R** (on game over) | Retry |

### Touch (phones & tablets)

- **Left virtual joystick** — move (appears where your thumb lands).
- **FIRE button** — shoot, with auto-aim assist at the nearest zombie.
- **SWAP button** — cycle weapons.

## Weapons

| Weapon | Damage | Notes |
| --- | --- | --- |
| Pistol | 25 | Infinite ammo, fast, weak |
| Shotgun | 18 × 6 pellets | Spread, close range, shells are scarce |
| Rifle | 34 | Fast, mid damage, uses rifle ammo |

## How to run

No build step, no install, no server required.

**Option 1 — open the file directly:**

Open `game/index.html` in any modern browser (double-click it, or
drag it into a browser window). Works from `file://`.

**Option 2 — static server (recommended for the cleanest experience):**

```bash
cd game
python3 -m http.server 8000
# then open http://localhost:8000
```

or:

```bash
cd game
npx serve
```

## Tech notes

- **Vanilla JS + Canvas 2D**, ES modules, no libraries, no network
  requests, no build step. All art is drawn procedurally; all sound is
  synthesized with WebAudio (gunshots, groans, horns, roars — no audio
  files).
- **Size:** `game/` is ~104 KB total (12 files: `index.html` + 11 modules
  under `src/`).
- **Performance:** 60 fps target on desktop and mobile. Measured in QA:
  ~0.2 ms/frame of game logic (Node harness, busy night scene) and
  ~14.7 ms/frame including real Canvas 2D rasterization at 1280×800
  with 30 zombies at night (software renderer; GPU browsers run faster).
- **Saves:** best score in `localStorage` under `deadzone-best`.
- **Files:** `game/index.html`, `game/src/` (`main.js`, `game.js`,
  `entities.js`, `world.js`, `render.js`, `hud.js`, `input.js`,
  `touch.js`, `audio.js`, `config.js`, `random.js`).
- **Screenshots:** real renders of the running game live in
  `screenshots/` — title, daylight fight, night with flashlight, boss
  wave, shop, and mobile views.

## Tips

- Don't let runners surround you — keep moving and use the streets.
- Shotgun at point-blank range one-shots a walker; save shells for brutes.
- Repair barricades *before* they break — a destroyed one costs a shop
  visit to fully restore.
- Lure zombies into barrel range, then shoot the barrel.
