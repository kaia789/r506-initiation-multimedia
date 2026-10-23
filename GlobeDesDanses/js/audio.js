import { getStepBpm } from '../data/dances.js';

const AUDIO_FOLDER = 'audio/';
const MASTER_VOLUME = 0.8;
const START_DELAY_S = 0.05;
const FADE_OUT_S = 0.25;

// Lookahead scheduler: a timer regularly schedules the notes of the next few milliseconds
// on the audio clock, which stays precise even when the timer is late
const SCHEDULER_INTERVAL_MS = 25;
const SCHEDULE_AHEAD_S = 0.12;
// Kick on each beat, hi-hat on each half beat
const STEPS_PER_BEAT = 2;

const KICK_START_HZ = 150;
const KICK_END_HZ = 45;
const KICK_DURATION_S = 0.35;
const KICK_VOLUME = 1;
const HIHAT_HIGHPASS_HZ = 7000;
const HIHAT_DURATION_S = 0.05;
const HIHAT_VOLUME = 0.25;

let audioContext = null;
let noiseBuffer = null;
// id -> AudioBuffer, or null when audio/<id>.mp3 is missing (avoids fetching it again)
const bufferCache = new Map();
let playback = null;
// Incremented on every play/stop so that a slow fetch cannot start an outdated track
let playRequest = 0;

// Must be called from a user gesture (click), otherwise browsers keep the audio muted.
// The mp3 files also go through this context, so later playback needs no gesture (iOS).
export function unlockAudio() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    audioContext = new AudioContextClass();
  }
  if (audioContext.state === 'suspended') audioContext.resume();
  return true;
}

async function loadDanceBuffer(id) {
  if (bufferCache.has(id)) return bufferCache.get(id);
  let buffer = null;
  try {
    const response = await fetch(`${AUDIO_FOLDER}${id}.mp3`);
    if (response.ok) buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
  } catch {
    buffer = null;
  }
  bufferCache.set(id, buffer);
  return buffer;
}

function getNoiseBuffer() {
  if (!noiseBuffer) {
    const length = Math.ceil(audioContext.sampleRate * HIHAT_DURATION_S);
    noiseBuffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function playKick(time, output) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.setValueAtTime(KICK_START_HZ, time);
  oscillator.frequency.exponentialRampToValueAtTime(KICK_END_HZ, time + KICK_DURATION_S);
  gain.gain.setValueAtTime(KICK_VOLUME, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + KICK_DURATION_S);
  oscillator.connect(gain).connect(output);
  oscillator.start(time);
  oscillator.stop(time + KICK_DURATION_S);
}

function playHiHat(time, output) {
  const noise = audioContext.createBufferSource();
  noise.buffer = getNoiseBuffer();
  const filter = audioContext.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = HIHAT_HIGHPASS_HZ;
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(HIHAT_VOLUME, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + HIHAT_DURATION_S);
  noise.connect(filter).connect(gain).connect(output);
  noise.start(time);
}

function startSyntheticBeat(dance, output, startTime) {
  const stepDuration = 60 / getStepBpm(dance) / STEPS_PER_BEAT;
  let step = 0;
  let nextStepTime = startTime;
  const schedule = () => {
    while (nextStepTime < audioContext.currentTime + SCHEDULE_AHEAD_S) {
      if (step % STEPS_PER_BEAT === 0) playKick(nextStepTime, output);
      playHiHat(nextStepTime, output);
      nextStepTime += stepDuration;
      step++;
    }
  };
  schedule();
  return setInterval(schedule, SCHEDULER_INTERVAL_MS);
}

// Resolves to { synthetic: boolean }, or null if another play/stop happened meanwhile
export async function playDanceMusic(dance) {
  stopMusic();
  const request = playRequest;
  if (!unlockAudio()) return null;

  const buffer = await loadDanceBuffer(dance.id);
  if (request !== playRequest) return null;

  const output = audioContext.createGain();
  output.gain.value = MASTER_VOLUME;
  output.connect(audioContext.destination);
  const startTime = audioContext.currentTime + START_DELAY_S;

  playback = { output, startTime, source: null, timer: null };
  if (buffer) {
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(output);
    source.start(startTime);
    playback.source = source;
  } else {
    playback.timer = startSyntheticBeat(dance, output, startTime);
  }
  return { synthetic: !buffer };
}

export function stopMusic() {
  playRequest++;
  if (!playback) return;
  const { output, source, timer } = playback;
  clearInterval(timer);
  // Short fade to avoid an audible click
  const now = audioContext.currentTime;
  output.gain.setValueAtTime(output.gain.value, now);
  output.gain.linearRampToValueAtTime(0, now + FADE_OUT_S);
  source?.stop(now + FADE_OUT_S);
  setTimeout(() => output.disconnect(), FADE_OUT_S * 1000 + 50);
  playback = null;
}

// Seconds elapsed since the first beat of the current music, or null when nothing plays.
// Beat k happens at k * (60 / bpm): the mp3 files are assumed to start on a beat.
export function getMusicTime() {
  if (!playback) return null;
  return audioContext.currentTime - playback.startTime;
}
