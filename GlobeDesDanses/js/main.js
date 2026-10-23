import { DANCES } from '../data/dances.js';
import {
  initGlobe, renderGlobe, rotateView, getCrosshairLatLon, findNearestDance, setHighlightedMarker,
} from './globe.js';
import {
  initFallbackControls, getControlVelocity, startOrientation, calibrate,
} from './orientation.js';

const SELECTION_RADIUS_DEG = 10;
// Clamps the time step after a background tab or a slow frame
const MAX_FRAME_SECONDS = 0.1;

const SENSOR_MESSAGES = {
  unsupported: "Ton navigateur ne gère pas l'orientation : fais glisser le globe au doigt, à la souris ou avec les flèches.",
  denied: "Accès aux capteurs refusé : fais glisser le globe au doigt. Pour réactiver l'inclinaison, recharge la page et accepte la demande.",
  'no-sensor': 'Aucun capteur d’orientation détecté : fais glisser le globe à la souris ou utilise les flèches du clavier.',
};

const state = {
  crosshair: null,
  hoveredDance: null,
};

const elements = {
  globeContainer: document.getElementById('globe-container'),
  coords: document.getElementById('coords'),
  welcome: document.getElementById('welcome'),
  startButton: document.getElementById('start-button'),
  calibrateButton: document.getElementById('calibrate-button'),
};

function formatLatLon({ lat, lon }) {
  const latText = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`;
  const lonText = `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'O'}`;
  return `${latText} · ${lonText}`;
}

export function showToast(message, duration = 4500) {
  const toast = document.createElement('div');
  toast.className = 'toast glass';
  toast.textContent = message;
  document.getElementById('toasts').appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

async function start() {
  elements.welcome.classList.add('hidden');
  const result = await startOrientation();
  if (result.ok) {
    showToast('Incline ton téléphone pour explorer. « Calibrer » redéfinit la position neutre.');
  } else {
    showToast(SENSOR_MESSAGES[result.reason]);
  }
}

function onCalibrate() {
  if (calibrate()) showToast('Position neutre enregistrée ✔');
  else showToast(SENSOR_MESSAGES['no-sensor']);
}

let lastFrame = performance.now();
function loop(now) {
  const dt = Math.min((now - lastFrame) / 1000, MAX_FRAME_SECONDS);
  lastFrame = now;

  const velocity = getControlVelocity();
  if (velocity.lat || velocity.lon) rotateView(velocity.lat * dt, velocity.lon * dt);

  renderGlobe(now);

  state.crosshair = getCrosshairLatLon();
  state.hoveredDance = state.crosshair ? findNearestDance(state.crosshair, DANCES, SELECTION_RADIUS_DEG) : null;
  setHighlightedMarker(state.hoveredDance?.id ?? null);
  elements.coords.textContent = state.crosshair
    ? `${formatLatLon(state.crosshair)}${state.hoveredDance ? ' — ' + state.hoveredDance.pays : ''}`
    : '';

  requestAnimationFrame(loop);
}

initGlobe(elements.globeContainer, DANCES, () =>
  showToast("Texture de la Terre introuvable : affichage d'un globe uni.")
);
initFallbackControls(elements.globeContainer, rotateView);
elements.startButton.addEventListener('click', start);
elements.calibrateButton.addEventListener('click', onCalibrate);
requestAnimationFrame(loop);
