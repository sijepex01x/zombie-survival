// DEADZONE — bootstrap + main loop. Wires input / world / game / audio /
// HUD / touch together. No game logic lives here; see game.js + entities.js.

import { CONFIG } from './config.js';
import { mulberry32 } from './random.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { render } from './render.js';
import { createGame, updateGame, doAction } from './game.js';
import { createAudio } from './audio.js';
import { drawHUD, drawScreen, click as hudClick } from './hud.js';
import { initTouch } from './touch.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ---- World / state ----
const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
const world = createWorld(mulberry32(seed));
const input = createInput(canvas);
const audio = createAudio();
const state = createGame(world, input, audio);
state.input = input;
state.audio = audio;
initTouch(state, input);

// ---- Resize (DPR capped at 2; low quality caps at 1) ----
let dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, state.quality === 'low' ? 1 : 2);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}
window.addEventListener('resize', resize);
resize();

// ---- Audio unlock on first gesture ----
let unlocked = false;
function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  if (audio && typeof audio.unlock === 'function') audio.unlock();
}
window.addEventListener('pointerdown', unlockAudio, { once: false });
window.addEventListener('keydown', unlockAudio, { once: false });

// ---- Menu / meta keys ----
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const mode = state.mode;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (mode === 'playing') doAction(state, 'pause');
    else if (mode === 'paused') doAction(state, 'resume');
  } else if (e.code === 'KeyM') {
    state.muted = !state.muted;
    if (audio && typeof audio.setMuted === 'function') audio.setMuted(state.muted);
  } else if (e.code === 'KeyQ') {
    state.quality = state.quality === 'low' ? 'high' : 'low';
    resize();
  } else if (e.code === 'Enter') {
    if (mode === 'title') doAction(state, 'start');
    else if (mode === 'shop') doAction(state, 'closeShop');
    else if (mode === 'paused') doAction(state, 'resume');
    else if (mode === 'gameover') doAction(state, 'restart');
  } else if (e.code === 'KeyR') {
    if (mode === 'gameover') doAction(state, 'restart');
  }
});

// ---- Canvas clicks on menus -> hud.click -> doAction ----
// (In-game mouse-down firing is handled by input.mouse.down.)
canvas.addEventListener('click', (e) => {
  const mode = state.mode;
  if (mode !== 'title' && mode !== 'shop' && mode !== 'paused' && mode !== 'gameover') return;
  const r = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const action = hudClick(state, sx, sy, currentView);
  if (action) doAction(state, action);
});

// ---- Main loop ----
let currentView = { w: window.innerWidth, h: window.innerHeight, camX: 0, camY: 0, scale: 1 };
let last = performance.now();
let fps = 0, frames = 0, fpsT = 0;

window.__dz = { state, fps: 0 };

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 0;
  if (dt > 1 / 30) dt = 1 / 30;

  const w = window.innerWidth, h = window.innerHeight;

  // Camera: entities.js owns camera follow and stores it as the TOP-LEFT
  // of the viewport in world coords. On the title screen (no player
  // follow running) frame the central square instead of the NW corner.
  if (state.mode === 'title') {
    state.camera.x = Math.max(0, Math.min(CONFIG.WORLD_W - w, 1300 - w / 2));
    state.camera.y = Math.max(0, Math.min(CONFIG.WORLD_H - h, 900 - h / 2));
  }
  let camX = state.camera.x;
  let camY = state.camera.y;
  if (w >= CONFIG.WORLD_W) camX = (CONFIG.WORLD_W - w) / 2;
  else camX = Math.max(0, Math.min(CONFIG.WORLD_W - w, camX));
  if (h >= CONFIG.WORLD_H) camY = (CONFIG.WORLD_H - h) / 2;
  else camY = Math.max(0, Math.min(CONFIG.WORLD_H - h, camY));

  currentView = { w, h, camX, camY, scale: 1 };

  // Mouse position in world coords (entities.js aims with this).
  state.mouseWorld = { x: camX + input.mouse.x, y: camY + input.mouse.y };
  state.view = currentView;
  state.viewScale = 1;

  updateGame(state, dt);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render(ctx, state, currentView);
  drawHUD(ctx, state, currentView);
  drawScreen(ctx, state, currentView);

  // FPS counter (for QA).
  frames++;
  fpsT += dt;
  if (fpsT >= 0.5) {
    fps = Math.round(frames / fpsT);
    frames = 0;
    fpsT = 0;
    window.__dz.fps = fps;
  }
}

requestAnimationFrame(frame);
