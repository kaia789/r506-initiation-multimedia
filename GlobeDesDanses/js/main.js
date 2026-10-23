import { DANCES, getStepBpm } from '../data/dances.js';
import {
  initGlobe, renderGlobe, rotateView, flyTo, getCrosshairLatLon, findNearestDance, angularDistance,
  setHighlightedMarker,
} from './globe.js';
import {
  initFallbackControls, getControlVelocity, startOrientation, calibrate,
} from './orientation.js';
import { initMiniMap, syncMiniMap, refreshMiniMapSize } from './map.js';
import { unlockAudio, playDanceMusic, stopMusic, getMusicTime } from './audio.js';

const SELECTION_RADIUS_DEG = 10;
// A bit larger than the selection radius so that a small wobble does not stop the music
const DESELECTION_RADIUS_DEG = 12;
const DWELL_TIME_MS = 1500;
const BEAT_PULSE_SCALE = 0.18;
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
  // Dance under the crosshair and since when (to measure the dwell time)
  candidate: null,
  candidateSince: 0,
  selectedDance: null,
};

const elements = {
  globeContainer: document.getElementById('globe-container'),
  crosshair: document.getElementById('crosshair'),
  coords: document.getElementById('coords'),
  welcome: document.getElementById('welcome'),
  startButton: document.getElementById('start-button'),
  calibrateButton: document.getElementById('calibrate-button'),
  minimapPanel: document.getElementById('minimap-panel'),
  minimapToggle: document.getElementById('minimap-toggle'),
  infoCard: document.getElementById('info-card'),
  infoCountry: document.getElementById('info-country'),
  infoDance: document.getElementById('info-dance'),
  infoStatus: document.getElementById('info-status'),
  infoDescription: document.getElementById('info-description'),
  infoMeta: document.getElementById('info-meta'),
  infoAudio: document.getElementById('info-audio'),
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
  // Both must be triggered by the click itself (autoplay policy, iOS permission prompt)
  if (!unlockAudio()) showToast("Le son n'est pas disponible dans ce navigateur.");
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

function toggleMiniMap() {
  const collapsed = elements.minimapPanel.classList.toggle('collapsed');
  elements.minimapToggle.setAttribute('aria-expanded', String(!collapsed));
  if (!collapsed) refreshMiniMapSize();
}

function showInfoCard(dance) {
  elements.infoCard.style.setProperty('--accent', dance.couleur);
  elements.infoCountry.textContent = dance.pays;
  elements.infoDance.textContent = dance.danse;
  elements.infoDescription.textContent = dance.description;
  const stepBpm = getStepBpm(dance);
  elements.infoMeta.textContent = stepBpm === dance.bpm
    ? `🥁 ${dance.bpm} BPM`
    : `🥁 ${dance.bpm} BPM (pas sur ${stepBpm})`;
  elements.infoStatus.textContent = '🔒 À débloquer';
  elements.infoAudio.textContent = '🎵 Chargement de la musique…';
  elements.infoCard.classList.remove('hidden');
}

async function selectDance(dance) {
  state.selectedDance = dance;
  showInfoCard(dance);
  const result = await playDanceMusic(dance);
  if (!result || state.selectedDance !== dance) return;
  elements.infoAudio.textContent = result.synthetic
    ? `🎵 Rythme synthétique (ajoute audio/${dance.id}.mp3 pour la vraie musique)`
    : '🎵 Musique en cours';
}

function deselectDance() {
  state.selectedDance = null;
  stopMusic();
  elements.infoCard.classList.add('hidden');
}

function updateSelection(now) {
  const hovered = state.hoveredDance;
  const selected = state.selectedDance;

  if (selected) {
    const stillOnIt = state.crosshair
      && (hovered === null || hovered === selected)
      && angularDistance(state.crosshair, selected) <= DESELECTION_RADIUS_DEG;
    if (stillOnIt) return;
    deselectDance();
  }

  if (hovered !== state.candidate) {
    state.candidate = hovered;
    state.candidateSince = now;
  }
  const dwell = hovered ? Math.min((now - state.candidateSince) / DWELL_TIME_MS, 1) : 0;
  elements.crosshair.style.setProperty('--dwell', dwell);
  if (hovered && dwell === 1) selectDance(hovered);
}

// The crosshair beats with the music
function updateBeatPulse() {
  const musicTime = getMusicTime();
  if (musicTime === null || musicTime < 0 || !state.selectedDance) {
    elements.crosshair.style.setProperty('--beat', 0);
    return;
  }
  const beatInterval = 60 / getStepBpm(state.selectedDance);
  const phase = (musicTime % beatInterval) / beatInterval;
  elements.crosshair.style.setProperty('--beat', ((1 - phase) ** 2 * BEAT_PULSE_SCALE).toFixed(3));
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
  updateSelection(now);
  updateBeatPulse();
  syncMiniMap(state.crosshair, now);

  requestAnimationFrame(loop);
}

initGlobe(elements.globeContainer, DANCES, () =>
  showToast("Texture de la Terre introuvable : affichage d'un globe uni.")
);
initFallbackControls(elements.globeContainer, rotateView);
if (!initMiniMap('minimap', DANCES, (dance) => flyTo(dance.lat, dance.lon))) {
  elements.minimapPanel.classList.add('hidden');
  showToast('La mini-carte n’a pas pu être chargée (connexion ?) : le globe reste utilisable.');
}
elements.startButton.addEventListener('click', start);
elements.calibrateButton.addEventListener('click', onCalibrate);
elements.minimapToggle.addEventListener('click', toggleMiniMap);
requestAnimationFrame(loop);
