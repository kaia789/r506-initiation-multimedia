// Tilt control: speed grows with the tilt angle relative to the calibrated neutral position
const DEAD_ZONE_DEG = 4;
const MAX_TILT_DEG = 30;
const MAX_TILT_SPEED_DEG_S = 70;
// Exponential smoothing factor per sensor event (0 = frozen, 1 = raw values)
const TILT_SMOOTHING = 0.15;
// Desktop browsers expose the API but never send values: wait this long before giving up
const SENSOR_TIMEOUT_MS = 1500;

// Fallback controls: drag (mouse or finger) and arrow keys
const DRAG_DEG_PER_PIXEL = 0.25;
const KEYBOARD_SPEED_DEG_S = 45;

const pressedKeys = new Set();
let dragOrigin = null;
let controlsEnabled = true;

let smoothedTilt = null;
let neutralTilt = null;

function handleOrientation(event) {
  if (event.beta === null || event.gamma === null) return;
  if (!smoothedTilt) {
    smoothedTilt = { beta: event.beta, gamma: event.gamma };
  } else {
    smoothedTilt.beta += (event.beta - smoothedTilt.beta) * TILT_SMOOTHING;
    smoothedTilt.gamma += (event.gamma - smoothedTilt.gamma) * TILT_SMOOTHING;
  }
  // The way the phone is held at start becomes the neutral position
  if (!neutralTilt) neutralTilt = { ...smoothedTilt };
}

// Must be called from a click handler: iOS only shows the permission prompt after a user gesture.
// Resolves to { ok: true } or { ok: false, reason: 'unsupported' | 'denied' | 'no-sensor' }
export async function startOrientation() {
  if (!('DeviceOrientationEvent' in window)) return { ok: false, reason: 'unsupported' };

  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') return { ok: false, reason: 'denied' };
    } catch {
      return { ok: false, reason: 'denied' };
    }
  }

  // The listener stays active so that a late sensor still works
  window.addEventListener('deviceorientation', handleOrientation);
  await new Promise((resolve) => setTimeout(resolve, SENSOR_TIMEOUT_MS));
  return smoothedTilt ? { ok: true } : { ok: false, reason: 'no-sensor' };
}

export function hasOrientationSensor() {
  return smoothedTilt !== null;
}

export function calibrate() {
  if (!smoothedTilt) return false;
  neutralTilt = { ...smoothedTilt };
  return true;
}

function tiltToSpeed(tiltDeg) {
  const beyondDeadZone = Math.abs(tiltDeg) - DEAD_ZONE_DEG;
  if (beyondDeadZone <= 0) return 0;
  const ratio = Math.min(beyondDeadZone / (MAX_TILT_DEG - DEAD_ZONE_DEG), 1);
  return Math.sign(tiltDeg) * ratio * MAX_TILT_SPEED_DEG_S;
}

// beta is in [-180, 180]: keep the difference on the short side
function angleDifference(a, b) {
  return ((((a - b + 180) % 360) + 360) % 360) - 180;
}

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
  if (!controlsEnabled) return { lat: 0, lon: 0 };

  const key = (name) => (pressedKeys.has(name) ? 1 : 0);
  let lat = (key('ArrowUp') - key('ArrowDown')) * KEYBOARD_SPEED_DEG_S;
  let lon = (key('ArrowRight') - key('ArrowLeft')) * KEYBOARD_SPEED_DEG_S;

  if (smoothedTilt && neutralTilt) {
    // Tilting the top of the phone away (beta decreases) goes north, tilting right goes east
    lat += tiltToSpeed(angleDifference(neutralTilt.beta, smoothedTilt.beta));
    lon += tiltToSpeed(smoothedTilt.gamma - neutralTilt.gamma);
  }
  return { lat, lon };
}
