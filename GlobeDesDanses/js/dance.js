import { getStepBpm } from '../data/dances.js';
import { getMusicTime } from './audio.js';

// ml5 weighs several MB: it is only loaded the first time someone dances
const ML5_URL = 'https://cdn.jsdelivr.net/npm/ml5@1.3.1/dist/ml5.min.js';
const BODYPOSE_OPTIONS = { modelType: 'SINGLEPOSE_LIGHTNING' };
const CAMERA_CONSTRAINTS = { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false };

const ROUND_DURATION_S = 20;
const COUNTDOWN_S = 3;
const SUCCESS_RATIO = 0.6;
const BEAT_TOLERANCE_S = 0.15;

// Movement energy = summed speed of these keypoints, in video widths per second
const TRACKED_KEYPOINTS = ['left_wrist', 'right_wrist', 'left_ankle', 'right_ankle', 'left_hip', 'right_hip'];
const MIN_CONFIDENCE = 0.3;
const ENERGY_SMOOTHING = 0.5;
const MIN_PEAK_ENERGY = 0.6;
// Two peaks closer than half a beat are the same movement
const MIN_PEAK_GAP_BEATS = 0.5;
// Camera + inference delay: a pose describes the body as it was slightly earlier
const DETECTION_LATENCY_S = 0.1;
// A beat is judged a bit after its window closes, so that late detections still count
const JUDGE_DELAY_S = 0.3;

const GAUGE_GAIN_PER_HIT = 0.12;
const GAUGE_LOSS_PER_MISS = 0.08;
const HIT_POPUP_MS = 800;

const SKELETON_COLOR = '#c3b1ff';
const KEYPOINT_COLOR = '#ff8a80';
const SKELETON_LINE_WIDTH = 4;
const KEYPOINT_RADIUS = 5;

const CAMERA_ERRORS = {
  NotAllowedError: 'Caméra refusée. Autorise-la dans les réglages du navigateur (icône à gauche de l’adresse) puis réessaie, ou joue en tapant le rythme.',
  SecurityError: 'Caméra bloquée par le navigateur. Ouvre la page en HTTPS (GitHub Pages), ou joue en tapant le rythme.',
  NotFoundError: 'Aucune caméra trouvée sur cet appareil. Tu peux jouer en tapant le rythme.',
  OverconstrainedError: 'Aucune caméra compatible trouvée. Tu peux jouer en tapant le rythme.',
  NotReadableError: 'La caméra est déjà utilisée par une autre application. Ferme-la et réessaie, ou joue en tapant le rythme.',
  NotSupportedError: 'La caméra n’est accessible qu’en HTTPS (GitHub Pages) ou sur localhost. Tu peux jouer en tapant le rythme.',
};
const MODEL_ERROR = 'Le modèle d’IA n’a pas pu être chargé (connexion ?). Tu peux jouer en tapant le rythme.';

const elements = {
  panel: document.getElementById('dance-panel'),
  title: document.getElementById('dance-title'),
  stage: document.getElementById('dance-stage'),
  video: document.getElementById('dance-video'),
  canvas: document.getElementById('dance-canvas'),
  countdown: document.getElementById('dance-countdown'),
  tapZone: document.getElementById('tap-zone'),
  beatDot: document.getElementById('beat-dot'),
  gaugeFill: document.getElementById('gauge-fill'),
  status: document.getElementById('dance-status'),
  hits: document.getElementById('dance-hits'),
  retryButton: document.getElementById('retry-button'),
  tapModeButton: document.getElementById('tap-mode-button'),
};
const context = elements.canvas.getContext('2d');
// Hidden copy of the current camera frame, analysed by the pose model. On iPhone, a camera
// video read directly by the model (WebGL) arrives rotated by 90°, while drawImage keeps it
// upright: the model must see exactly what is displayed.
const frameCanvas = document.createElement('canvas');
const frameContext = frameCanvas.getContext('2d');

let ml5Loading = null;
let bodyPose = null;
let skeleton = [];
let stream = null;
let session = null;

function loadMl5() {
  if (window.ml5) return Promise.resolve();
  if (!ml5Loading) {
    ml5Loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = ML5_URL;
      script.onload = resolve;
      script.onerror = () => {
        ml5Loading = null;
        script.remove();
        reject(new Error('ml5 unavailable'));
      };
      document.head.appendChild(script);
    });
  }
  return ml5Loading;
}

async function getBodyPose() {
  await loadMl5();
  if (!bodyPose) {
    // Without p5.js, ml5 1.x returns a promise that resolves once the model is loaded
    const model = await window.ml5.bodyPose('MoveNet', BODYPOSE_OPTIONS);
    skeleton = model.getSkeleton();
    bodyPose = model;
  }
  return bodyPose;
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    const error = new Error('getUserMedia unavailable');
    error.name = 'NotSupportedError';
    throw error;
  }
  stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
  const video = elements.video;
  video.srcObject = stream;
  await video.play();
  syncVideoSize();
}

// Phones often change the camera size after the first frames (e.g. 640x480 -> 480x640 in
// portrait): keep both canvases equal to the real frame size
function syncVideoSize() {
  const { video, canvas } = elements;
  const { videoWidth, videoHeight } = video;
  if (!videoWidth || (canvas.width === videoWidth && canvas.height === videoHeight)) return;
  canvas.width = frameCanvas.width = videoWidth;
  canvas.height = frameCanvas.height = videoHeight;
}

function stopCamera() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  elements.video.srcObject = null;
}

function setStatus(text) {
  if (elements.status.textContent !== text) elements.status.textContent = text;
}

export function isDanceModeOpen() {
  return session !== null;
}

// callbacks.onRoundEnd({ score, success }) is called at the end of each round (score in %)
export async function openDanceMode(dance, callbacks) {
  session = {
    dance,
    callbacks,
    beatInterval: 60 / getStepBpm(dance),
    mode: 'loading',
    round: null,
    lastPose: null,
    lastPoseTime: 0,
    energyHistory: [],
    lastPeakTime: -Infinity,
    lastBeatShown: null,
  };
  const current = session;

  elements.title.textContent = `${dance.danse} · ${dance.pays}`;
  elements.panel.style.setProperty('--accent', dance.couleur);
  elements.panel.classList.remove('hidden');
  elements.stage.classList.remove('tap-mode');
  elements.retryButton.classList.add('hidden');
  elements.tapModeButton.classList.add('hidden');
  elements.gaugeFill.style.width = '0%';
  elements.countdown.textContent = '';
  context.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
  setStatus('📷 Ouverture de la caméra…');

  try {
    await startCamera();
  } catch (error) {
    console.warn('Camera unavailable:', error);
    if (session === current) showFallback(CAMERA_ERRORS[error.name] ?? CAMERA_ERRORS.NotFoundError);
    return;
  }
  if (session !== current) {
    stopCamera();
    return;
  }

  setStatus('🤖 Chargement de l’IA…');
  let model;
  try {
    model = await getBodyPose();
  } catch (error) {
    console.warn('bodyPose unavailable:', error);
    if (session === current) {
      stopCamera();
      showFallback(MODEL_ERROR);
    }
    return;
  }
  if (session !== current) return;

  session.mode = 'camera';
  model.detectStart(frameCanvas, onPoses);
  startRound();
}

function showFallback(message) {
  session.mode = 'error';
  setStatus(message);
  elements.retryButton.textContent = '🔁 Réessayer';
  elements.tapModeButton.classList.remove('hidden');
  elements.retryButton.classList.remove('hidden');
}

export function startTapMode() {
  if (!session) return;
  session.mode = 'tap';
  elements.stage.classList.add('tap-mode');
  elements.tapModeButton.classList.add('hidden');
  startRound();
}

export function retryRound() {
  if (!session) return;
  if (session.mode === 'error') {
    // Camera or model failed: try the whole setup again
    const { dance, callbacks } = session;
    closeDanceMode();
    openDanceMode(dance, callbacks);
    return;
  }
  startRound();
}

export function closeDanceMode() {
  if (!session) return;
  if (session.mode === 'camera') bodyPose?.detectStop();
  stopCamera();
  session = null;
  elements.panel.classList.add('hidden');
  elements.hits.replaceChildren();
}

function startRound() {
  const musicTime = getMusicTime() ?? 0;
  const interval = session.beatInterval;
  // The round starts on a beat, after the countdown
  const firstBeat = Math.ceil((musicTime + COUNTDOWN_S) / interval);
  const start = firstBeat * interval;
  const end = start + ROUND_DURATION_S;
  session.round = {
    start,
    end,
    firstBeat,
    lastBeat: Math.ceil(end / interval) - 1,
    nextBeatToJudge: firstBeat,
    hits: new Set(),
    gauge: 0,
    finished: false,
  };
  elements.retryButton.classList.add('hidden');
  elements.gaugeFill.style.width = '0%';
}

// ml5 callback, called for every analysed video frame
function onPoses(poses) {
  if (!session || session.mode !== 'camera') return;
  const pose = poses[0] ?? null;
  const now = performance.now() / 1000;
  const musicTime = getMusicTime();

  if (pose && session.lastPose && musicTime !== null) {
    const dt = now - session.lastPoseTime;
    if (dt > 0) {
      const energy = computeEnergy(pose, session.lastPose) / dt;
      detectPeak(energy, musicTime - DETECTION_LATENCY_S);
    }
  }
  session.lastPose = pose;
  session.lastPoseTime = now;
}

function computeEnergy(pose, previousPose) {
  const width = frameCanvas.width || 1;
  let energy = 0;
  for (const name of TRACKED_KEYPOINTS) {
    const current = pose[name];
    const previous = previousPose[name];
    if (!current || !previous || current.confidence < MIN_CONFIDENCE || previous.confidence < MIN_CONFIDENCE) continue;
    energy += Math.hypot(current.x - previous.x, current.y - previous.y) / width;
  }
  return energy;
}

// A peak is a local maximum of the smoothed energy, above a threshold
function detectPeak(energy, time) {
  const history = session.energyHistory;
  const previousSmoothed = history.length ? history[history.length - 1].value : energy;
  history.push({ value: previousSmoothed + (energy - previousSmoothed) * ENERGY_SMOOTHING, time });
  if (history.length > 3) history.shift();
  if (history.length < 3) return;

  const [before, candidate, after] = history;
  const isPeak = candidate.value > before.value
    && candidate.value >= after.value
    && candidate.value > MIN_PEAK_ENERGY
    && candidate.time - session.lastPeakTime > MIN_PEAK_GAP_BEATS * session.beatInterval;
  if (isPeak) {
    session.lastPeakTime = candidate.time;
    registerMovement(candidate.time);
  }
}

function registerMovement(time) {
  const round = session?.round;
  if (!round || round.finished || time < round.start - BEAT_TOLERANCE_S) return;
  const beat = Math.round(time / session.beatInterval);
  if (beat < round.firstBeat || beat > round.lastBeat || round.hits.has(beat)) return;
  if (Math.abs(time - beat * session.beatInterval) > BEAT_TOLERANCE_S) return;

  round.hits.add(beat);
  round.gauge = Math.min(1, round.gauge + GAUGE_GAIN_PER_HIT);
  showHit();
}

function onTap(event) {
  if (!session || session.mode !== 'tap') return;
  event.preventDefault();
  const musicTime = getMusicTime();
  if (musicTime !== null) registerMovement(musicTime);
  elements.tapZone.classList.remove('pressed');
  void elements.tapZone.offsetWidth;
  elements.tapZone.classList.add('pressed');
}

function showHit() {
  const popup = document.createElement('span');
  popup.className = 'hit-popup';
  popup.textContent = '+1';
  popup.style.left = `${20 + Math.random() * 60}%`;
  elements.hits.appendChild(popup);
  setTimeout(() => popup.remove(), HIT_POPUP_MS);

  elements.stage.classList.remove('flash');
  void elements.stage.offsetWidth; // restarts the CSS animation
  elements.stage.classList.add('flash');
}

// The displayed canvas shows the same frame as the one analysed by the model, with the
// skeleton on top: they cannot drift apart whatever the screen or the camera
function renderStage() {
  const video = elements.video;
  if (video.readyState < video.HAVE_CURRENT_DATA) return;
  syncVideoSize();
  frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
  context.drawImage(frameCanvas, 0, 0);
  drawSkeleton(session.lastPose);
}

function drawSkeleton(pose) {
  if (!pose) return;

  context.lineWidth = SKELETON_LINE_WIDTH;
  context.strokeStyle = SKELETON_COLOR;
  for (const [a, b] of skeleton) {
    const start = pose.keypoints[a];
    const end = pose.keypoints[b];
    if (start.confidence < MIN_CONFIDENCE || end.confidence < MIN_CONFIDENCE) continue;
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }
  context.fillStyle = KEYPOINT_COLOR;
  for (const keypoint of pose.keypoints) {
    if (keypoint.confidence < MIN_CONFIDENCE) continue;
    context.beginPath();
    context.arc(keypoint.x, keypoint.y, KEYPOINT_RADIUS, 0, Math.PI * 2);
    context.fill();
  }
}

// Called by the main loop on every frame while the dance mode is open
export function updateDanceMode() {
  if (session?.mode === 'camera') renderStage();
  const round = session?.round;
  if (!round || round.finished) return;
  const musicTime = getMusicTime();
  if (musicTime === null) return;
  const interval = session.beatInterval;

  // Metronome dot: flashes on every beat
  const currentBeat = Math.floor(musicTime / interval);
  if (currentBeat !== session.lastBeatShown) {
    session.lastBeatShown = currentBeat;
    elements.beatDot.classList.remove('beat');
    void elements.beatDot.offsetWidth;
    elements.beatDot.classList.add('beat');
  }

  if (musicTime < round.start) {
    elements.countdown.textContent = String(Math.ceil(round.start - musicTime));
    setStatus(session.mode === 'tap'
      ? '👆 Prépare-toi à taper sur chaque temps…'
      : '💃 Recule pour être vu en entier, et marque chaque temps par un geste vif !');
    return;
  }
  elements.countdown.textContent = '';

  // Beats whose window has closed without a movement make the gauge drop
  while (round.nextBeatToJudge <= round.lastBeat
    && round.nextBeatToJudge * interval + BEAT_TOLERANCE_S + JUDGE_DELAY_S < musicTime) {
    if (!round.hits.has(round.nextBeatToJudge)) round.gauge = Math.max(0, round.gauge - GAUGE_LOSS_PER_MISS);
    round.nextBeatToJudge++;
  }
  elements.gaugeFill.style.width = `${Math.round(round.gauge * 100)}%`;

  const total = round.lastBeat - round.firstBeat + 1;
  if (musicTime < round.end + BEAT_TOLERANCE_S + JUDGE_DELAY_S) {
    const remaining = Math.max(0, Math.ceil(round.end - musicTime));
    setStatus(`${session.mode === 'tap' ? '👆 Tape' : '💃 Danse'} ! ${remaining} s · ${round.hits.size} / ${total} temps réussis`);
    return;
  }
  finishRound(round, total);
}

function finishRound(round, total) {
  round.finished = true;
  const ratio = round.hits.size / total;
  const score = Math.round(ratio * 100);
  const success = ratio >= SUCCESS_RATIO;
  setStatus(success
    ? `🎉 Bravo ! ${score} % des temps réussis : ${session.dance.danse} débloquée !`
    : `${score} % des temps réussis, il en faut ${Math.round(SUCCESS_RATIO * 100)} %. Essaie encore !`);
  elements.retryButton.textContent = success ? '🔁 Rejouer' : '🔁 Réessayer';
  elements.retryButton.classList.remove('hidden');
  session.callbacks.onRoundEnd?.({ score, success });
}

elements.tapZone.addEventListener('pointerdown', onTap);
window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && session?.mode === 'tap') onTap(event);
});
