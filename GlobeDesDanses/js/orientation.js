// Fallback controls: drag (mouse or finger) and arrow keys
const DRAG_DEG_PER_PIXEL = 0.25;
const KEYBOARD_SPEED_DEG_S = 45;

const pressedKeys = new Set();
let dragOrigin = null;
let controlsEnabled = true;

export function initFallbackControls(element, onDrag) {
  element.addEventListener('pointerdown', (event) => {
    if (!controlsEnabled) return;
    dragOrigin = { x: event.clientX, y: event.clientY };
    element.setPointerCapture(event.pointerId);
  });

  element.addEventListener('pointermove', (event) => {
    if (!dragOrigin) return;
    const dx = event.clientX - dragOrigin.x;
    const dy = event.clientY - dragOrigin.y;
    dragOrigin = { x: event.clientX, y: event.clientY };
    // Grabbing the globe: moving it right brings the west under the crosshair
    onDrag(dy * DRAG_DEG_PER_PIXEL, -dx * DRAG_DEG_PER_PIXEL);
  });

  const endDrag = () => { dragOrigin = null; };
  element.addEventListener('pointerup', endDrag);
  element.addEventListener('pointercancel', endDrag);

  window.addEventListener('keydown', (event) => {
    if (!event.key.startsWith('Arrow')) return;
    event.preventDefault();
    if (controlsEnabled) pressedKeys.add(event.key);
  });
  window.addEventListener('keyup', (event) => pressedKeys.delete(event.key));
  window.addEventListener('blur', () => pressedKeys.clear());
}

export function setControlsEnabled(enabled) {
  controlsEnabled = enabled;
  if (!enabled) {
    pressedKeys.clear();
    dragOrigin = null;
  }
}

// Rotation speed in degrees per second, applied by the main loop
export function getControlVelocity() {
  const key = (name) => (pressedKeys.has(name) ? 1 : 0);
  return {
    lat: (key('ArrowUp') - key('ArrowDown')) * KEYBOARD_SPEED_DEG_S,
    lon: (key('ArrowRight') - key('ArrowLeft')) * KEYBOARD_SPEED_DEG_S,
  };
}
