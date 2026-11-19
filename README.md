# DEADZONE — Zombie Survival

**DEADZONE** is a top-down 2D zombie survival game set in the fictional town
of Grayfield. You are the last survivor holding the town square.
Survive endless waves of zombies, collect scrap from kills, spend it in the
shop between waves, and take down the Abomination — a huge boss that attacks
every 5th wave.

A fun build, not a bounty entry. Vanilla JS + Canvas 2D, zero libraries,
zero network, all art procedural, all sound synthesized with WebAudio.

**v2 (Nov 19, 2026):** blocky Minecraft-style characters, swapped HUD
(minimap top-left, HP/stamina top-right), looting (SMG + Sniper, grenades,
supply drops, elites), unique zombie skills (incl. the new Boomer),
character select with 4 survivors, tutorial, and alert banners.

## How to play

- **Pick your survivor.** Four characters on the title screen, each with
  different stats and an active skill on **C** (or the **SKILL** touch
  button): Raka the Runner (Dash), Sari the Medic (Heal), Budi the Heavy
  (Bulwark shield), Dina the Scavenger (Lucky Drop).
- **Survive the wave.** Zombies spawn at the map edges and hunt you down.
  Clear them all to trigger a 20-second breather, then the shop opens.
- **Spend scrap.** Kills drop scrap. Between waves, buy ammo, medkits,
  armor, barricade repairs, and permanent upgrades (damage, max HP) —
  plus the SMG, Sniper, and grenades.
- **Loot.** Zombies drop medkits, ammo, armor plates, grenades, and
  sometimes a new weapon. Elites (glowing, from wave 3) always drop good
  loot. A supply drop crate lands every 3 waves — find it on the minimap.
- **Chain kills.** Kills within 3 seconds build a combo multiplier for
  score and scrap (shown in the HUD).
- **Watch the clock.** A full day/night cycle lasts ~90 seconds. Nights are
  darker and deadlier — your flashlight cone is your best friend.
- **Boss every 5 waves.** The Abomination is huge, slow, and very tough.
  Kill it and it drops a weapon crate: +50 scrap or a full ammo refill.
- **Use the town.** Smash crates for scrap, shoot red barrels to blow
  zombies up (40 damage in 100 px), repair the barricades ringing the
  square with **E** (10 scrap per 25 HP) — zombies chew through them
  when blocked. Press **B** to place a new barricade in front of you
  (25 scrap, 3s cooldown).
- **Score** = kills + waves reached. Your best score is saved in the
  browser. When you die, press **R** to go again.

### Zombies

| Type | Appears | Skill |
| --- | --- | --- |
| Walker | Wave 1 | **Swarm** — faster in a group |
| Runner | Wave 3+ | **Lunge** — dashes after a crouch |
| Brute | Wave 5+ | **Ground Slam** — AoE, step away |
| Spitter | Wave 7+ | **Acid Pool** — goo leaves a damaging pool |
| Boomer | Wave 4+ | **Explode** — blows up on death, hurts zombies too |
| **Elite** | **Wave 3+** | **Enrage** — faster + stronger under 50% HP |
| **Abomination (boss)** | **Every 5th wave** | Huge HP, drops a weapon crate |

Every skill has a visible wind-up (flash / color / animation) and a
cooldown, so it can be dodged. See the bestiary on the pause screen.

## Controls

### Keyboard + mouse

| Key | Action |
| --- | --- |
| **WASD / Arrows** | Move |
| **Mouse** | Aim — **Click / Space** to shoot |
| **Shift** | Sprint (drains stamina) |
| **R** | Reload (auto-reloads on empty) |
| **1 / 2 / 3 / 4 / 5** | Pistol / Shotgun / Rifle / SMG / Sniper |
| **F** | Melee shove (also triggers automatically on contact) |
| **E** | Repair a damaged barricade nearby (10 scrap / 25 HP) |
| **G** | Throw a grenade |
| **B** | Place a barricade in front of you (25 scrap, 3s cooldown) |
| **C** | Use your character's skill |
| **H** or **?** | Tutorial / help |
| **P / Esc** | Pause / resume |
| **M** | Mute |
| **Q** | Toggle quality (high / low) |
| **Enter** | Start / continue / next wave |
| **R** (on game over) | Retry |

### Touch (phones & tablets)

- **Left virtual joystick** — move (appears where your thumb lands).
- **FIRE button** — shoot, with auto-aim assist at the nearest zombie.
- **SWAP button** — cycle weapons.
- **GREN button** — throw a grenade.
- **SKILL button** — use your character's skill.

## Weapons

| Weapon | Damage | Notes |
| --- | --- | --- |
| Pistol | 25 | Infinite ammo, fast, weak |
| Shotgun | 18 × 6 pellets | Spread, close range, shells are scarce |
| Rifle | 34 | Fast, mid damage, uses rifle ammo |
| SMG | 12 | Very fast, low damage, uses rifle ammo |
| Sniper | 120 | Slow, huge damage, bullets pierce |

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
