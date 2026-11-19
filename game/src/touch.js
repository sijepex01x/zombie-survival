// touch.js — DEADZONE touch controls (W3). Standalone: takes state + input,
// writes input.touch.{active, moveX, moveY, fire, swap}. No imports.
// Overlay is created once, appended to document.body, inline styles only.
// Shown only on touch devices or small screens; the container itself has
// pointer-events:none so canvas clicks pass through everywhere except the
// actual controls.

export function isTouch() {
  return (
    (typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0))) ||
    (typeof window !== 'undefined' && window.innerWidth < 700)
  );
}

const STICK_R = 52; // joystick travel radius in px

export function initTouch(state, input) {
  if (typeof document === 'undefined') return null;
  if (!input.touch) input.touch = { active: false, moveX: 0, moveY: 0, fire: false, swap: false };

  const root = document.createElement('div');
  root.id = 'dz-touch';
  root.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:30', 'pointer-events:none',
    'touch-action:none', 'user-select:none', '-webkit-user-select:none',
    'display:none', 'font-family:system-ui,sans-serif',
  ].join(';');
  document.body.appendChild(root);

  // ---- left joystick zone (dynamic origin) -------------------------------
  const stickZone = document.createElement('div');
  stickZone.style.cssText = [
    'position:absolute', 'left:0', 'bottom:0', 'width:46%', 'height:55%',
    'pointer-events:auto', 'touch-action:none',
  ].join(';');
  root.appendChild(stickZone);

  const base = document.createElement('div');
  base.style.cssText = [
    'position:absolute', 'width:116px', 'height:116px', 'border-radius:50%',
    'border:2px solid rgba(255,255,255,0.35)', 'background:rgba(0,0,0,0.30)',
    'display:none', 'pointer-events:none',
  ].join(';');
  root.appendChild(base);

  const knob = document.createElement('div');
  knob.style.cssText = [
    'position:absolute', 'width:52px', 'height:52px', 'border-radius:50%',
    'background:rgba(255,255,255,0.55)', 'border:2px solid rgba(255,255,255,0.8)',
    'display:none', 'pointer-events:none',
  ].join(';');
  root.appendChild(knob);

  let stickId = null;
  let ox = 0, oy = 0; // origin in client coords

  function stickStart(e) {
    e.preventDefault();
    const t = e.changedTouches[0];
    stickId = t.identifier;
    ox = t.clientX;
    oy = t.clientY;
    base.style.display = 'block';
    knob.style.display = 'block';
    base.style.left = ox - 58 + 'px';
    base.style.top = oy - 58 + 'px';
    knob.style.left = ox - 26 + 'px';
    knob.style.top = oy - 26 + 'px';
    input.touch.active = true;
    input.touch.moveX = 0;
    input.touch.moveY = 0;
  }

  function stickMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      let dx = t.clientX - ox;
      let dy = t.clientY - oy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_R) {
        dx = (dx / len) * STICK_R;
        dy = (dy / len) * STICK_R;
      }
      knob.style.left = ox + dx - 26 + 'px';
      knob.style.top = oy + dy - 26 + 'px';
      input.touch.moveX = dx / STICK_R;
      input.touch.moveY = dy / STICK_R;
    }
  }

  function stickEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      stickId = null;
      base.style.display = 'none';
      knob.style.display = 'none';
      input.touch.active = false;
      input.touch.moveX = 0;
      input.touch.moveY = 0;
    }
  }

  stickZone.addEventListener('touchstart', stickStart, { passive: false });
  stickZone.addEventListener('touchmove', stickMove, { passive: false });
  stickZone.addEventListener('touchend', stickEnd);
  stickZone.addEventListener('touchcancel', stickEnd);

  // ---- right buttons -------------------------------------------------------
  function makeButton(label, size, right, bottom, bg) {
    const b = document.createElement('div');
    b.textContent = label;
    b.style.cssText = [
      'position:absolute', `width:${size}px`, `height:${size}px`,
      'border-radius:50%', `right:${right}px`, `bottom:${bottom}px`,
      'display:flex', 'align-items:center', 'justify-content:center',
      `background:${bg}`, 'border:2px solid rgba(255,255,255,0.6)',
      'color:#fff', 'font-weight:800', `font-size:${Math.round(size * 0.22)}px`,
      'pointer-events:auto', 'touch-action:none',
    ].join(';');
    root.appendChild(b);
    return b;
  }

  // FIRE — big, bottom-right
  const fireBtn = makeButton('FIRE', 92, 22, 26, 'rgba(180,30,30,0.55)');
  fireBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    input.touch.fire = true;
    fireBtn.style.background = 'rgba(230,50,50,0.85)';
  }, { passive: false });
  const fireOff = () => {
    input.touch.fire = false;
    fireBtn.style.background = 'rgba(180,30,30,0.55)';
  };
  fireBtn.addEventListener('touchend', fireOff);
  fireBtn.addEventListener('touchcancel', fireOff);

  // SWAP — smaller, above FIRE (edge flag; consumer clears it)
  const swapBtn = makeButton('SWAP', 62, 34, 136, 'rgba(30,90,160,0.55)');
  swapBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    input.touch.swap = true;
    swapBtn.style.background = 'rgba(60,140,230,0.85)';
    setTimeout(() => { swapBtn.style.background = 'rgba(30,90,160,0.55)'; }, 120);
  }, { passive: false });

  // ---- visibility ----------------------------------------------------------
  function refresh() {
    root.style.display = isTouch() ? 'block' : 'none';
  }
  refresh();
  window.addEventListener('resize', refresh);

  return root;
}
