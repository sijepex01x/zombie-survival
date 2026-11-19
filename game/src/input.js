// DEADZONE — keyboard / mouse input. Touch state lives in the same object
// but is written by touch.js (W3); this module only creates the stub.

const GAME_KEYS = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    mouse: { x: 0, y: 0, sx: 0, sy: 0, down: false },
    touch: { active: false, moveX: 0, moveY: 0, fire: false, swap: false },
  };

  function updateMouse(e) {
    const r = canvas.getBoundingClientRect();
    input.mouse.x = e.clientX - r.left;
    input.mouse.y = e.clientY - r.top;
    input.mouse.sx = input.mouse.x;
    input.mouse.sy = input.mouse.y;
  }

  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    input.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.mouse.down = false;
  });

  canvas.addEventListener('mousemove', updateMouse);
  canvas.addEventListener('mousedown', (e) => {
    updateMouse(e);
    input.mouse.down = true;
  });
  window.addEventListener('mouseup', () => { input.mouse.down = false; });
  canvas.addEventListener('mouseleave', () => { input.mouse.down = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return input;
}

export function isDown(input, code) {
  return input.keys.has(code);
}
