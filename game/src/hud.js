// hud.js — DEADZONE HUD + menu screens + click handling (W3).
// All drawing in screen coords (after render restores the transform).
// Imports config.js only. Clickable rects are computed by menuRects() and
// shared by drawScreen() and click(), so they always match what is drawn.

import { CONFIG } from './config.js';

const SHOP = (CONFIG && CONFIG.SHOP) || [];
const DAY_LENGTH = (CONFIG && CONFIG.DAY_LENGTH) || 90;
const WEAPONS = (CONFIG && CONFIG.WEAPONS) || {};

// --- small helpers ---------------------------------------------------------
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bar(ctx, x, y, w, h, frac, fill, bg = 'rgba(0,0,0,0.55)') {
  frac = clamp(frac, 0, 1);
  ctx.fillStyle = bg;
  rr(ctx, x, y, w, h, h / 2);
  ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = fill;
    rr(ctx, x, y, Math.max(h, w * frac), h, h / 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  rr(ctx, x, y, w, h, h / 2);
  ctx.stroke();
}

function text(ctx, s, x, y, font, color, align = 'left', baseline = 'alphabetic') {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(s, x, y);
}

function shadowText(ctx, s, x, y, font, color, align = 'left') {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillText(s, x + 2, y + 2);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function inRect(x, y, r) {
  return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function drawButton(ctx, r, label, font, opts = {}) {
  const { fill = 'rgba(180,30,30,0.92)', stroke = '#ff5a4e', color = '#fff', disabled = false } = opts;
  ctx.globalAlpha = disabled ? 0.45 : 1;
  ctx.fillStyle = fill;
  rr(ctx, r.x, r.y, r.w, r.h, 8);
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  rr(ctx, r.x, r.y, r.w, r.h, 8);
  ctx.stroke();
  text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, font, color, 'center', 'middle');
  ctx.globalAlpha = 1;
}

// --- layout (shared by draw + click) ---------------------------------------
function btnRect(cx, y, w, h) { return { x: cx - w / 2, y, w, h }; }

function titleLayout(view) {
  const bw = Math.min(280, view.w - 80);
  return {
    startBtn: btnRect(view.w / 2, view.h * 0.72, bw, 52),
  };
}

function shopLayout(view) {
  const pw = Math.min(540, view.w - 20);
  const px = (view.w - pw) / 2;
  const rowH = view.w < 500 ? 42 : 36;
  const top = Math.max(70, view.h * 0.16);
  const rows = SHOP.map((it, i) => ({
    id: it.id,
    rect: { x: px + 10, y: top + 44 + i * (rowH + 6), w: pw - 20, h: rowH },
  }));
  const listH = SHOP.length * (rowH + 6);
  const nextBtn = btnRect(view.w / 2, top + 44 + listH + 18, Math.min(280, view.w - 80), 50);
  return { panel: { x: px, y: top, w: pw, h: 44 + listH + 18 + 50 + 16 }, rows, nextBtn, top };
}

function pausedLayout(view) {
  const bw = Math.min(280, view.w - 80);
  const cy = view.h / 2;
  return {
    resumeBtn: btnRect(view.w / 2, cy + 10, bw, 50),
    quitBtn: btnRect(view.w / 2, cy + 72, bw, 50),
  };
}

function gameoverLayout(view) {
  const bw = Math.min(280, view.w - 80);
  const cy = view.h / 2;
  return {
    retryBtn: btnRect(view.w / 2, cy + 78, bw, 50),
    quitBtn: btnRect(view.w / 2, cy + 140, bw, 50),
  };
}

// menuRects(state, view) -> rects keyed by action. The single source of
// truth for every clickable area; drawScreen() uses the same layouts.
export function menuRects(state, view) {
  const out = { buy: {} };
  if (state.mode === 'title') {
    out.start = titleLayout(view).startBtn;
  } else if (state.mode === 'shop') {
    const L = shopLayout(view);
    for (const r of L.rows) out.buy[r.id] = r.rect;
    out.closeShop = L.nextBtn;
  } else if (state.mode === 'paused') {
    const L = pausedLayout(view);
    out.resume = L.resumeBtn;
    out.quitToTitle = L.quitBtn;
  } else if (state.mode === 'gameover') {
    const L = gameoverLayout(view);
    out.restart = L.retryBtn;
    out.quitToTitle = L.quitBtn;
  }
  return out;
}

// click(state, sx, sy, view) -> action string for game.doAction, or null.
export function click(state, sx, sy, view) {
  const rects = menuRects(state, view);
  if (rects.start && inRect(sx, sy, rects.start)) return 'start';
  if (rects.resume && inRect(sx, sy, rects.resume)) return 'resume';
  if (rects.restart && inRect(sx, sy, rects.restart)) return 'restart';
  if (rects.closeShop && inRect(sx, sy, rects.closeShop)) return 'closeShop';
  if (rects.quitToTitle && inRect(sx, sy, rects.quitToTitle)) return 'quitToTitle';
  for (const id of Object.keys(rects.buy)) {
    if (inRect(sx, sy, rects.buy[id])) return 'buy:' + id;
  }
  return null;
}

// --- HUD (in-game) ----------------------------------------------------------
// No HUD on the title screen (the menu draws its own screen over the world).
export function drawHUD(ctx, state, view) {
  const p = state.player;
  if (!p || state.mode === 'title') return;
  const W = view.w, H = view.h;
  const small = W < 500;
  const fs = small ? 12 : 13;      // body font size
  const fBody = `bold ${fs}px system-ui, sans-serif`;
  const fSmall = `bold ${small ? 11 : 12}px system-ui, sans-serif`;
  const fBig = `bold ${small ? 18 : 22}px system-ui, sans-serif`;

  // ---- top-left: HP / armor / stamina ------------------------------------
  const bw = small ? Math.min(150, W * 0.38) : Math.min(200, W * 0.42);
  const bx = 10, by = 10;
  const hpFrac = p.hp / Math.max(1, p.maxHp || 100);
  const hpColor = hpFrac > 0.5 ? '#4caf50' : hpFrac > 0.25 ? '#ff9800' : '#e53935';
  bar(ctx, bx, by, bw, 15, hpFrac, hpColor);
  shadowText(ctx, `HP ${Math.ceil(p.hp)}`, bx + 6, by + 12, fSmall, '#fff');
  if (p.armor > 0) {
    bar(ctx, bx, by + 19, bw, 9, p.armor / 100, '#42a5f5');
    shadowText(ctx, `ARMOR ${Math.ceil(p.armor)}`, bx + 6, by + 27, `bold 10px system-ui, sans-serif`, '#dff1ff');
  }
  const stamY = p.armor > 0 ? by + 32 : by + 19;
  bar(ctx, bx, stamY, bw, 9, p.stamina / 100, '#cddc39');
  shadowText(ctx, 'STAMINA', bx + 6, stamY + 8, `bold 10px system-ui, sans-serif`, '#f5f5dc');

  // ---- top-right: minimap --------------------------------------------------
  const mm = small ? 84 : Math.min(150, Math.max(96, W * 0.30));
  const mx = W - mm - 10, my = 10;
  drawMinimap(ctx, state, mx, my, mm);

  // Wave strip geometry (needed by the stats / boss-bar placement below).
  // BUGFIX W4: on narrow screens the top row (HP bar + centered strip +
  // minimap) overlapped into an unreadable pile-up (verified at 390px:
  // the strip covered the HP bar and the minimap). Small screens stack
  // it instead: row 1 = HP + minimap, row 2 = full-width wave strip,
  // stats under the strip, boss bar under the stats.
  const stripW = small ? W - 20 : Math.min(300, W - 20);
  const stripX = (W - stripW) / 2;
  const stripY = small ? 72 : by;

  // ---- stats under minimap (right-aligned) --------------------------------
  let sy = small ? stripY + 46 + 8 : my + mm + 8;
  const stats = [
    [`SCORE  ${state.score || 0}`, '#fff'],
    [`SCRAP  ${state.scrap || 0}`, '#ffd54f'],
    [`KILLS  ${state.kills || 0}`, '#fff'],
  ];
  for (const [s, c] of stats) {
    shadowText(ctx, s, W - 10, sy + 11, fBody, c, 'right');
    sy += fs + 5;
  }

  // ---- top-center strip: wave / zombies left / clock ----------------------
  // (stripW / stripX / stripY were computed above; small screens put the
  // strip on its own row under the HP bar + minimap.)
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  rr(ctx, stripX, stripY, stripW, 46, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  rr(ctx, stripX, stripY, stripW, 46, 8);
  ctx.stroke();
  const waveLabel = state.wave > 0 ? `WAVE ${state.wave}` : 'GET READY';
  shadowText(ctx, waveLabel, W / 2, stripY + 19, fBig, '#ff5252', 'center');
  const left = state.zombiesLeft || 0;
  const clockLabel = clockText(state);
  shadowText(ctx, `${left} ZOMBIES LEFT  •  ${clockLabel}`, W / 2, stripY + 37, fSmall, '#eee', 'center');
  // day/night progress bar inside the strip
  const cyc = clamp((state.dayTime || 0) / DAY_LENGTH, 0, 1);
  bar(ctx, stripX + 10, stripY + 42, stripW - 20, 3,
    cyc, cyc < 0.61 ? '#ffd54f' : '#3f51b5', 'rgba(255,255,255,0.15)');

  // ---- boss health bar ------------------------------------------------------
  if (state.boss) {
    const b = state.boss;
    const bbw = Math.min(420, W * 0.72);
    // On small screens the stats sit under the strip, so the boss bar goes
    // under the stats (sy has advanced past the three stat lines).
    const bbx = (W - bbw) / 2, bby = small ? sy + 8 : stripY + 56;
    shadowText(ctx, 'ABOMINATION', W / 2, bby + 12, fBody, '#ff8a80', 'center');
    bar(ctx, bbx, bby + 16, bbw, 12, b.hp / Math.max(1, b.maxHp), '#b71c1c');
  }

  // ---- bottom-left: ammo ----------------------------------------------------
  const wcfg = WEAPONS[p.weapon] || {};
  const wname = (wcfg.name || p.weapon || '').toUpperCase();
  const mag = p.mag ? p.mag[p.weapon] : 0;
  const magSize = (wcfg.mag || 0);
  let reserveTxt;
  if (p.weapon === 'pistol') reserveTxt = '∞';
  else if (p.weapon === 'shotgun') reserveTxt = String(p.reserve ? p.reserve.shells : 0);
  else reserveTxt = String(p.reserve ? p.reserve.rifle : 0);
  const ax = 10, ay = H - 10;
  shadowText(ctx, wname, ax, ay - 34, fBody, '#ffd54f');
  // weapon slots 1/2/3
  const slots = ['pistol', 'shotgun', 'rifle'];
  slots.forEach((w, i) => {
    const sx = ax + i * 22;
    ctx.fillStyle = w === p.weapon ? 'rgba(255,213,79,0.9)' : 'rgba(0,0,0,0.55)';
    rr(ctx, sx, ay - 30, 18, 18, 4);
    ctx.fill();
    text(ctx, String(i + 1), sx + 9, ay - 17, `bold 11px system-ui, sans-serif`,
      w === p.weapon ? '#000' : '#ccc', 'center', 'middle');
  });
  if (p.reloading > 0) {
    shadowText(ctx, 'RELOADING…', ax + 74, ay - 20, fBody, '#ffab91');
  } else {
    shadowText(ctx, `${mag}`, ax + 74, ay - 2, `bold ${small ? 26 : 30}px system-ui, sans-serif`,
      mag === 0 ? '#ef5350' : '#fff');
    shadowText(ctx, `/ ${reserveTxt}`, ax + 74 + (String(mag).length * (small ? 15 : 17)) + 4, ay - 2,
      fBody, '#bbb');
  }

  // ---- breather countdown ---------------------------------------------------
  if (state.mode === 'playing' && state.waveState === 'breather') {
    const t = Math.max(0, Math.ceil(state.breatherT || 0));
    const msg = `WAVE CLEARED — NEXT WAVE IN ${t}s`;
    ctx.font = fBig;
    const tw = ctx.measureText(msg).width + 28;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    rr(ctx, (W - tw) / 2, H - 64, tw, 34, 8);
    ctx.fill();
    shadowText(ctx, msg, W / 2, H - 41, fBig, '#a5d6a7', 'center');
  }

  // ---- wave banner -----------------------------------------------------------
  if (state.banner && state.banner.t > 0) {
    const b = state.banner;
    const alpha = clamp(b.t / 0.6, 0, 1);
    ctx.globalAlpha = alpha;
    const bf = `bold ${small ? 30 : 44}px system-ui, sans-serif`;
    shadowText(ctx, b.text, W / 2, H * 0.30, bf, '#ff5252', 'center');
    if (b.sub) shadowText(ctx, b.sub, W / 2, H * 0.30 + (small ? 28 : 38), fBig, '#fff', 'center');
    ctx.globalAlpha = 1;
  }

  // ---- low HP vignette pulse -------------------------------------------------
  if (hpFrac <= 0.25 && state.mode === 'playing') {
    const pulse = 0.10 + 0.08 * Math.sin((state.time || 0) * 6);
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(200,0,0,0)');
    g.addColorStop(1, `rgba(200,0,0,${pulse})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

function clockText(state) {
  const t = state.dayTime || 0;
  if (t < 55) return 'DAY';
  if (t < 60) return 'DUSK';
  if (t < 85) return 'NIGHT';
  return 'DAWN';
}

function drawMinimap(ctx, state, x, y, size) {
  const world = state.world;
  const ww = (world && world.w) || 2600;
  const wh = (world && world.h) || 1800;
  // Single uniform scale (BUGFIX W4: this used sx=size/ww for x but
  // sy=size/wh for y, so every dot was stretched ~1.44x too far down and
  // spilled out of the minimap's bottom edge). Map height follows aspect.
  const s = size / ww;
  const mh = wh * s;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  rr(ctx, x - 3, y - 3, size + 6, mh + 6, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  rr(ctx, x - 3, y - 3, size + 6, mh + 6, 6);
  ctx.stroke();
  // ground
  ctx.fillStyle = '#2c3a2a';
  ctx.fillRect(x, y, size, mh);
  // buildings
  if (world && world.buildings) {
    ctx.fillStyle = '#6b7a8a';
    for (const b of world.buildings) ctx.fillRect(x + b.x * s, y + b.y * s, Math.max(2, b.w * s), Math.max(2, b.h * s));
  }
  if (world && world.cars) {
    ctx.fillStyle = '#9aa5b1';
    for (const c of world.cars) ctx.fillRect(x + c.x * s, y + c.y * s, Math.max(2, c.w * s), Math.max(2, c.h * s));
  }
  // square
  if (world && world.square) {
    ctx.fillStyle = 'rgba(255,213,79,0.35)';
    ctx.fillRect(x + world.square.x * s, y + world.square.y * s, world.square.w * s, world.square.h * s);
  }
  // zombies (red dots)
  ctx.fillStyle = '#ef5350';
  for (const z of state.zombies || []) {
    ctx.fillRect(x + z.x * s - 1, y + z.y * s - 1, 3, 3);
  }
  // boss (bigger dot, white ring)
  if (state.boss) {
    ctx.fillStyle = '#ff1744';
    ctx.beginPath();
    ctx.arc(x + state.boss.x * s, y + state.boss.y * s, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }
  // player (green dot)
  if (state.player) {
    ctx.fillStyle = '#69f0ae';
    ctx.beginPath();
    ctx.arc(x + state.player.x * s, y + state.player.y * s, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // viewport rect (main.js sets state.view every frame; BUGFIX W4: this
  // used to read state._viewW/_viewH, which nothing ever sets, so the
  // viewport rect was never drawn).
  if (state.view && state.camera) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.strokeRect(x + state.camera.x * s, y + state.camera.y * s,
      state.view.w * s, state.view.h * s);
  }
}

// --- full-screen menus --------------------------------------------------------
// Only menu modes draw anything. (BUGFIX W4: this used to fill a 78% dark
// overlay on EVERY frame, including 'playing' — the game ran permanently
// dimmed. Now it returns immediately outside menu modes.)
export function drawScreen(ctx, state, view) {
  if (state.mode !== 'title' && state.mode !== 'shop' &&
      state.mode !== 'paused' && state.mode !== 'gameover') return;
  const W = view.w, H = view.h;
  const small = W < 500;
  ctx.fillStyle = 'rgba(5,8,12,0.78)';
  ctx.fillRect(0, 0, W, H);

  if (state.mode === 'title') return drawTitle(ctx, state, view, small);
  if (state.mode === 'shop') return drawShop(ctx, state, view, small);
  if (state.mode === 'paused') return drawPaused(ctx, state, view, small);
  if (state.mode === 'gameover') return drawGameOver(ctx, state, view, small);
}

function drawTitle(ctx, state, view, small) {
  const W = view.w, H = view.h;
  const L = titleLayout(view);
  const logoSize = small ? 52 : 84;
  // logo
  const grad = ctx.createLinearGradient(0, H * 0.16, 0, H * 0.16 + logoSize);
  grad.addColorStop(0, '#ff8a80');
  grad.addColorStop(0.55, '#e53935');
  grad.addColorStop(1, '#7f0000');
  ctx.font = `900 ${logoSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillText('DEADZONE', W / 2 + 4, H * 0.16 + logoSize + 4);
  ctx.fillStyle = grad;
  ctx.fillText('DEADZONE', W / 2, H * 0.16 + logoSize);
  shadowText(ctx, 'GRAYFIELD  •  LAST STAND  •  SURVIVE THE NIGHT', W / 2,
    H * 0.16 + logoSize + 30, `bold ${small ? 12 : 15}px system-ui, sans-serif`, '#ffd54f', 'center');

  // controls
  const cy = H * 0.16 + logoSize + 64;
  const lines = [
    ['WASD / Arrows', 'Move'],
    ['Mouse', 'Aim  •  Click / Space — Shoot'],
    ['Shift', 'Sprint (stamina)'],
    ['R', 'Reload    •    1 / 2 / 3 — Switch weapon'],
    ['F', 'Melee shove    •    E — Repair barricade'],
    ['P / Esc', 'Pause    •    M — Mute    •    Q — Quality'],
    ['Touch', 'Left stick move  •  FIRE + SWAP buttons'],
  ];
  const lh = small ? 20 : 23;
  // BUGFIX W4: the two-column layout (key right-aligned at center, value
  // left-aligned) overflowed the right edge at 390px — long values like
  // "Reload • 1 / 2 / 3 — Switch weapon" were cut off. Small screens get
  // one centered line per control instead ("KEY — value").
  if (small) {
    ctx.font = `bold 12px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    lines.forEach(([k, v], i) => {
      const y = cy + i * lh;
      const kPart = k + ' — ';
      const kw = ctx.measureText(kPart).width;
      const vw = ctx.measureText(v).width;
      const x = Math.max(6, (W - kw - vw) / 2);
      ctx.fillStyle = '#ffd54f';
      ctx.fillText(kPart, x, y);
      ctx.fillStyle = '#ddd';
      ctx.fillText(v, x + kw, y);
    });
  } else {
    ctx.font = `bold ${small ? 12 : 14}px system-ui, sans-serif`;
    lines.forEach(([k, v], i) => {
      const y = cy + i * lh;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffd54f';
      ctx.fillText(k, W / 2 - 8, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ddd';
      ctx.fillText(v, W / 2 + 8, y);
    });
  }

  if (state.best > 0) {
    shadowText(ctx, `BEST SCORE: ${state.best}`, W / 2, cy + lines.length * lh + 14,
      `bold ${small ? 14 : 16}px system-ui, sans-serif`, '#a5d6a7', 'center');
  }
  drawButton(ctx, L.startBtn, '▶  START', `bold ${small ? 18 : 20}px system-ui, sans-serif`);
  shadowText(ctx, 'or press ENTER', W / 2, L.startBtn.y + L.startBtn.h + 24,
    `bold ${small ? 11 : 12}px system-ui, sans-serif`, '#999', 'center');
}

function drawShop(ctx, state, view, small) {
  const W = view.w, H = view.h;
  const L = shopLayout(view);
  const fs = small ? 13 : 15;
  // panel
  ctx.fillStyle = 'rgba(10,14,10,0.92)';
  rr(ctx, L.panel.x, L.panel.y, L.panel.w, L.panel.h, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,213,79,0.5)';
  ctx.lineWidth = 2;
  rr(ctx, L.panel.x, L.panel.y, L.panel.w, L.panel.h, 12);
  ctx.stroke();

  shadowText(ctx, 'SUPPLY SHOP', W / 2, L.top + 26, `bold ${small ? 20 : 24}px system-ui, sans-serif`, '#ffd54f', 'center');
  // scrap value right-aligned inside panel
  ctx.font = `bold ${fs}px system-ui, sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffd54f';
  ctx.fillText(`SCRAP: ${state.scrap || 0}`, L.panel.x + L.panel.w - 14, L.top + 26);

  for (const row of L.rows) {
    const item = SHOP.find((s) => s.id === row.id);
    if (!item) continue;
    const afford = (state.scrap || 0) >= item.cost;
    const r = row.rect;
    ctx.fillStyle = afford ? 'rgba(76,175,80,0.14)' : 'rgba(229,57,53,0.10)';
    rr(ctx, r.x, r.y, r.w, r.h, 6);
    ctx.fill();
    ctx.strokeStyle = afford ? 'rgba(76,175,80,0.5)' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    rr(ctx, r.x, r.y, r.w, r.h, 6);
    ctx.stroke();
    text(ctx, item.name, r.x + 12, r.y + r.h / 2 + 1, `bold ${fs}px system-ui, sans-serif`,
      afford ? '#fff' : '#999', 'left', 'middle');
    text(ctx, `${item.cost} scrap`, r.x + r.w - 12, r.y + r.h / 2 + 1,
      `bold ${fs}px system-ui, sans-serif`, afford ? '#ffd54f' : '#ef5350', 'right', 'middle');
  }
  drawButton(ctx, L.nextBtn, 'NEXT WAVE  ▶', `bold ${small ? 16 : 18}px system-ui, sans-serif`,
    { fill: 'rgba(46,125,50,0.95)', stroke: '#81c784' });
  shadowText(ctx, 'Tap an item to buy  •  ENTER for next wave', W / 2,
    L.nextBtn.y + L.nextBtn.h + 22, `bold ${small ? 11 : 12}px system-ui, sans-serif`, '#999', 'center');
}

function drawPaused(ctx, state, view, small) {
  const W = view.w, H = view.h;
  const L = pausedLayout(view);
  shadowText(ctx, 'PAUSED', W / 2, H * 0.5 - 40, `bold ${small ? 36 : 48}px system-ui, sans-serif`, '#fff', 'center');
  shadowText(ctx, `Wave ${state.wave}  •  Score ${state.score || 0}`, W / 2, H * 0.5 - 12,
    `bold ${small ? 13 : 15}px system-ui, sans-serif`, '#bbb', 'center');
  drawButton(ctx, L.resumeBtn, 'RESUME', `bold ${small ? 17 : 19}px system-ui, sans-serif`,
    { fill: 'rgba(46,125,50,0.95)', stroke: '#81c784' });
  drawButton(ctx, L.quitBtn, 'QUIT TO TITLE', `bold ${small ? 17 : 19}px system-ui, sans-serif`,
    { fill: 'rgba(60,60,60,0.9)', stroke: '#999' });
}

function drawGameOver(ctx, state, view, small) {
  const W = view.w, H = view.h;
  const L = gameoverLayout(view);
  const cy = H / 2;
  shadowText(ctx, 'YOU DIED', W / 2, cy - 96, `bold ${small ? 40 : 56}px system-ui, sans-serif`, '#e53935', 'center');
  shadowText(ctx, 'Grayfield claims another survivor.', W / 2, cy - 66,
    `bold ${small ? 13 : 15}px system-ui, sans-serif`, '#bbb', 'center');

  const shots = (state.stats && state.stats.shots) || 0;
  const hits = (state.stats && state.stats.hits) || 0;
  const acc = shots > 0 ? Math.round((hits / shots) * 100) : 0;
  const isBest = (state.score || 0) > 0 && (state.score || 0) >= (state.best || 0);
  const rows = [
    ['WAVES SURVIVED', String(Math.max(0, (state.wave || 1) - 1))],
    ['KILLS', String(state.kills || 0)],
    ['ACCURACY', `${acc}%  (${hits}/${shots})`],
    ['SCORE', String(state.score || 0)],
    ['BEST', String(state.best || 0)],
  ];
  const lh = small ? 22 : 25;
  rows.forEach(([k, v], i) => {
    const y = cy - 34 + i * lh;
    ctx.font = `bold ${small ? 13 : 15}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#999';
    ctx.fillText(k, W / 2 - 10, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = k === 'SCORE' ? '#ffd54f' : '#fff';
    ctx.fillText(v, W / 2 + 10, y);
  });
  if (isBest) {
    shadowText(ctx, '★ NEW BEST SCORE! ★', W / 2, cy - 34 + rows.length * lh + 8,
      `bold ${small ? 15 : 17}px system-ui, sans-serif`, '#ffd54f', 'center');
  }
  drawButton(ctx, L.retryBtn, '↻  RETRY', `bold ${small ? 17 : 19}px system-ui, sans-serif`);
  drawButton(ctx, L.quitBtn, 'QUIT TO TITLE', `bold ${small ? 17 : 19}px system-ui, sans-serif`,
    { fill: 'rgba(60,60,60,0.9)', stroke: '#999' });
  shadowText(ctx, 'or press R to retry', W / 2, L.quitBtn.y + L.quitBtn.h + 22,
    `bold ${small ? 11 : 12}px system-ui, sans-serif`, '#999', 'center');
}
