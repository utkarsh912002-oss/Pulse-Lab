// Pulse Lab: a tiny step sequencer. Pattern data, audio scheduling and drawing
// are kept in separate functions so the app is easier to follow and extend.
const TRACKS = [
  { id: 'kick', name: 'KICK', kind: 'LOW DRUM', color: '#c8f169' },
  { id: 'snare', name: 'SNARE', kind: 'NOISE DRUM', color: '#f38a70' },
  { id: 'hat', name: 'HI-HAT', kind: 'TICK', color: '#87b5ed' },
  { id: 'synth', name: 'SYNTH', kind: 'C MINOR', color: '#d4a6f5' }
];
const STORAGE_KEY = 'pulse-lab-patterns-v1';
const NOTES = [48, 0, 51, 0, 55, 0, 58, 0, 60, 0, 58, 0, 55, 0, 51, 0];
const DEFAULT_STEPS = {
  kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], synth: [0, 3, 6, 8, 11, 14]
};
const PRESETS = {
  afterglow: { name: 'Afterglow', tempo: 112, swing: 12, steps: { kick:[0,4,8,12],snare:[4,12],hat:[2,6,10,14],synth:[0,3,6,8,11,14] } },
  sidewalk: { name: 'Sidewalk', tempo: 98, swing: 28, steps: { kick:[0,3,8,11],snare:[4,12],hat:[0,2,4,6,8,10,12,14],synth:[1,4,7,9,12,15] } },
  orbit: { name: 'Orbit', tempo: 128, swing: 4, steps: { kick:[0,6,8,14],snare:[4,12],hat:[0,2,4,6,8,10,12,14],synth:[0,2,7,8,10,15] } }
};

let pattern = makePattern(DEFAULT_STEPS);
let audioContext = null;
let masterGain = null;
let analyser = null;
let noiseBuffer = null;
let isPlaying = false;
let nextStep = 0;
let nextStepTime = 0;
let loopStartTime = 0;
let playStartTime = 0;
let timerId = null;
let visualFrame = null;
let toastTimer = null;

function makePattern(stepMap) {
  return { tempo: 112, swing: 12, tracks: TRACKS.map(track => ({
    id: track.id, muted: false, solo: false,
    steps: Array.from({ length: 16 }, (_, i) => stepMap[track.id]?.includes(i) || false)
  })) };
}

function getTrack(id) { return pattern.tracks.find(track => track.id === id); }

function buildGrid() {
  const numbers = document.querySelector('#step-numbers');
  numbers.replaceChildren(...Array.from({ length: 16 }, (_, i) => {
    const number = document.createElement('span');
    number.textContent = i % 4 === 0 ? String(i / 4 + 1) : '·';
    if (i % 4 === 0) number.className = 'beat-number';
    number.setAttribute('aria-hidden', 'true');
    return number;
  }));
  const container = document.querySelector('#tracks');
  container.replaceChildren(...TRACKS.map(definition => {
    const data = getTrack(definition.id);
    const row = document.createElement('div'); row.className = 'track-row'; row.dataset.track = definition.id;
    const info = document.createElement('div'); info.className = 'track-info'; info.style.setProperty('--track', definition.color);
    const color = document.createElement('span'); color.className = 'track-color'; color.setAttribute('aria-hidden', 'true');
    const meta = document.createElement('div'); meta.className = 'track-meta';
    const name = document.createElement('div'); name.className = 'track-name'; name.textContent = definition.name;
    const kind = document.createElement('div'); kind.className = 'track-kind'; kind.textContent = definition.kind;
    meta.append(name, kind);
    const controls = document.createElement('div'); controls.className = 'track-mini';
    for (const mode of ['mute', 'solo']) {
      const button = document.createElement('button'); button.className = 'mini-button'; button.type = 'button';
      button.textContent = mode === 'mute' ? 'M' : 'S'; button.setAttribute('aria-label', `${mode === 'mute' ? 'Mute' : 'Solo'} ${definition.name}`);
      button.setAttribute('aria-pressed', data[mode === 'mute' ? 'muted' : 'solo']); button.dataset.mode = mode;
      button.addEventListener('click', () => {
        data[mode === 'mute' ? 'muted' : 'solo'] = !data[mode === 'mute' ? 'muted' : 'solo'];
        button.setAttribute('aria-pressed', data[mode === 'mute' ? 'muted' : 'solo']);
        if (mode === 'mute') steps.classList.toggle('track-muted', data.muted);
      });
      controls.append(button);
    }
    info.append(color, meta, controls);
    const steps = document.createElement('div'); steps.className = 'steps';
    steps.classList.toggle('track-muted', data.muted);
    data.steps.forEach((active, index) => {
      const button = document.createElement('button'); button.className = 'step'; button.type = 'button';
      button.style.setProperty('--track', definition.color);
      button.setAttribute('aria-label', `${definition.name}, step ${index + 1}`);
      button.setAttribute('aria-pressed', active);
      if (index % 4 === 0) button.classList.add('beat-start');
      button.addEventListener('click', () => {
        data.steps[index] = !data.steps[index];
        button.setAttribute('aria-pressed', data.steps[index]);
        if (data.steps[index]) previewStep(definition.id, index);
      });
      steps.append(button);
    });
    row.append(info, steps);
    return row;
  }));
}

function createAudio() {
  if (audioContext) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) { showToast('Web Audio is not supported in this browser.'); return; }
  audioContext = new AudioContextClass();
  masterGain = audioContext.createGain(); masterGain.gain.value = 0.72;
  analyser = audioContext.createAnalyser(); analyser.fftSize = 1024;
  masterGain.connect(analyser); analyser.connect(audioContext.destination);
  noiseBuffer = makeNoiseBuffer(audioContext);
}

function makeNoiseBuffer(context) {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
  return buffer;
}

function playKick(context, output, time, velocity = 0.9) {
  const osc = context.createOscillator(); const gain = context.createGain();
  osc.type = 'sine'; osc.frequency.setValueAtTime(145, time); osc.frequency.exponentialRampToValueAtTime(42, time + 0.13);
  gain.gain.setValueAtTime(0.0001, time); gain.gain.exponentialRampToValueAtTime(velocity * 0.85, time + 0.006); gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.32);
  osc.connect(gain); gain.connect(output); osc.start(time); osc.stop(time + 0.34);
}

function playNoise(context, output, time, type, velocity = 0.65) {
  const source = context.createBufferSource(); source.buffer = noiseBufferFor(context);
  const filter = context.createBiquadFilter(); filter.type = type === 'hat' ? 'highpass' : 'bandpass';
  filter.frequency.setValueAtTime(type === 'hat' ? 7200 : 1900, time);
  const gain = context.createGain(); const length = type === 'hat' ? 0.065 : 0.20;
  gain.gain.setValueAtTime(0.0001, time); gain.gain.exponentialRampToValueAtTime(velocity * (type === 'hat' ? 0.23 : 0.38), time + 0.004); gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
  source.connect(filter); filter.connect(gain); gain.connect(output); source.start(time); source.stop(time + length + 0.02);
  if (type === 'snare') {
    const tone = context.createOscillator(); const toneGain = context.createGain();
    tone.type = 'triangle'; tone.frequency.setValueAtTime(185, time);
    toneGain.gain.setValueAtTime(0.16 * velocity, time); toneGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
    tone.connect(toneGain); toneGain.connect(output); tone.start(time); tone.stop(time + 0.09);
  }
}

function midiFrequency(note) { return 440 * Math.pow(2, (note - 69) / 12); }

function playSynth(context, output, time, note, velocity = 0.52) {
  const osc = context.createOscillator(); const filter = context.createBiquadFilter(); const gain = context.createGain();
  osc.type = 'triangle'; osc.frequency.setValueAtTime(midiFrequency(note), time);
  filter.type = 'lowpass'; filter.frequency.setValueAtTime(1450, time); filter.Q.value = 0.7;
  // This small attack-decay-sustain-release envelope is the synth's ADSR.
  gain.gain.setValueAtTime(0.0001, time); gain.gain.linearRampToValueAtTime(velocity * 0.24, time + 0.018);
  gain.gain.exponentialRampToValueAtTime(velocity * 0.12, time + 0.09); gain.gain.setValueAtTime(velocity * 0.12, time + 0.16);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
  osc.connect(filter); filter.connect(gain); gain.connect(output); osc.start(time); osc.stop(time + 0.26);
}

function noiseBufferFor(context) {
  if (context === audioContext && noiseBuffer) return noiseBuffer;
  return makeNoiseBuffer(context);
}

function trackIsAudible(track) {
  const anySolo = pattern.tracks.some(item => item.solo);
  return !track.muted && (!anySolo || track.solo);
}

function scheduleTrackStep(context, output, trackId, step, time, velocity = 0.9) {
  const track = pattern.tracks.find(item => item.id === trackId);
  if (!track?.steps[step] || !trackIsAudible(track)) return;
  if (trackId === 'kick') playKick(context, output, time, velocity);
  if (trackId === 'snare') playNoise(context, output, time, 'snare', velocity);
  if (trackId === 'hat') playNoise(context, output, time, 'hat', velocity);
  if (trackId === 'synth' && NOTES[step]) playSynth(context, output, time, NOTES[step], velocity * 0.7);
}

function previewStep(trackId, step) {
  createAudio();
  if (!audioContext) return;
  if (audioContext.state === 'suspended') audioContext.resume();
  scheduleTrackStep(audioContext, masterGain, trackId, step, audioContext.currentTime + 0.01, 0.55);
}

function secondsPerStep() { return 60 / pattern.tempo / 4; }
function stepTime(step, origin) { return origin + step * secondsPerStep() + (step % 2 ? (pattern.swing / 100) * secondsPerStep() * 0.48 : 0); }

// Look ahead with a short timer, but schedule notes against AudioContext time.
// If the browser pauses a timer briefly, the already-scheduled notes stay steady.
function scheduler() {
  while (nextStepTime < audioContext.currentTime + 0.12) {
    const step = nextStep;
    for (const track of pattern.tracks) scheduleTrackStep(audioContext, masterGain, track.id, step, nextStepTime);
    nextStep = (nextStep + 1) % 16;
    if (nextStep === 0) loopStartTime += secondsPerStep() * 16;
    nextStepTime = stepTime(nextStep, loopStartTime);
  }
}

function startPlayback() {
  createAudio(); if (!audioContext) return;
  audioContext.resume();
  isPlaying = true; nextStep = 0; loopStartTime = audioContext.currentTime + 0.06; playStartTime = loopStartTime; nextStepTime = loopStartTime;
  scheduler(); timerId = window.setInterval(scheduler, 25);
  document.body.classList.add('is-playing');
  document.querySelector('#play-icon').textContent = 'Ⅱ'; document.querySelector('#play-label').textContent = 'PAUSE';
  document.querySelector('#play-button').setAttribute('aria-label', 'Pause playback');
  document.querySelector('#audio-hint').innerHTML = '<i></i> GROOVE IS LIVE';
  document.querySelector('#visual-state').textContent = 'MAKING NOISE';
  animateVisuals();
}

function stopPlayback() {
  isPlaying = false; window.clearInterval(timerId); cancelAnimationFrame(visualFrame);
  document.body.classList.remove('is-playing');
  document.querySelectorAll('.step.current').forEach(button => button.classList.remove('current'));
  document.querySelector('#play-icon').textContent = '▶'; document.querySelector('#play-label').textContent = 'PLAY';
  document.querySelector('#play-button').setAttribute('aria-label', 'Start playback');
  document.querySelector('#audio-hint').innerHTML = '<i></i> SOUND STARTS ON PLAY';
  document.querySelector('#visual-state').textContent = 'WAITING FOR A BEAT';
  if (audioContext && masterGain) {
    const now = audioContext.currentTime;
    masterGain.gain.cancelScheduledValues(now); masterGain.gain.setTargetAtTime(0, now, 0.025);
    window.setTimeout(() => { if (audioContext && masterGain) { masterGain.gain.cancelScheduledValues(audioContext.currentTime); masterGain.gain.setValueAtTime(0.72, audioContext.currentTime); } }, 100);
  }
}

function animateVisuals() {
  if (!isPlaying) return;
  const loopDuration = secondsPerStep() * 16;
  const phase = ((audioContext.currentTime - playStartTime) % loopDuration + loopDuration) % loopDuration;
  const loopStart = audioContext.currentTime - phase;
  let stepOn = 0;
  for (let i = 1; i < 16; i++) if (stepTime(i, loopStart) <= audioContext.currentTime) stepOn = i;
  document.querySelectorAll('.step.current').forEach(button => button.classList.remove('current'));
  document.querySelectorAll(`.track-row .step:nth-child(${stepOn + 1})`).forEach(button => button.classList.add('current'));
  drawVisualizer();
  visualFrame = requestAnimationFrame(animateVisuals);
}

function drawVisualizer() {
  const canvas = document.querySelector('#visualizer'); const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1;
  if (canvas.width !== Math.floor(rect.width * ratio) || canvas.height !== Math.floor(rect.height * ratio)) { canvas.width = rect.width * ratio; canvas.height = rect.height * ratio; }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
  if (!analyser || !isPlaying) return;
  const data = new Uint8Array(analyser.frequencyBinCount); analyser.getByteTimeDomainData(data);
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = (i / (data.length - 1)) * rect.width; const y = (data[i] / 255) * rect.height * .72 + rect.height * .12;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#c8f169'; ctx.lineWidth = 1.6; ctx.shadowColor = '#c8f169'; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;
}

function applyPattern(next, name) {
  pattern.tempo = next.tempo || 112; pattern.swing = next.swing || 0;
  pattern.tracks = TRACKS.map(definition => {
    const source = next.tracks?.find(track => track.id === definition.id);
    return { id: definition.id, muted: Boolean(source?.muted), solo: Boolean(source?.solo), steps: Array.from({ length: 16 }, (_, i) => Boolean(source?.steps?.[i])) };
  });
  document.querySelector('#tempo').value = pattern.tempo; document.querySelector('#swing').value = pattern.swing;
  document.querySelector('#tempo-output').innerHTML = `${pattern.tempo} <small>BPM</small>`;
  document.querySelector('#swing-output').innerHTML = `${pattern.swing}<small>%</small>`;
  if (name) document.querySelector('#pattern-name').value = name;
  buildGrid();
}

function readPattern() { return { tempo: pattern.tempo, swing: pattern.swing, tracks: pattern.tracks.map(track => ({ id: track.id, muted: track.muted, solo: track.solo, steps: [...track.steps] })) }; }

function loadPreset(name) {
  const preset = PRESETS[name]; if (!preset) return;
  stopPlayback(); const next = makePattern(preset.steps); next.tempo = preset.tempo; next.swing = preset.swing;
  applyPattern(next, preset.name); showToast(`${preset.name} loaded. Make it your own.`);
}

function showToast(message) {
  const toast = document.querySelector('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function loadLibrary() { try { const items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(items) ? items : []; } catch { return []; } }
function saveLibrary(items) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }

function saveCurrentPattern() {
  const name = document.querySelector('#pattern-name').value.trim() || 'Untitled groove';
  const library = loadLibrary(); library.unshift({ id: `${Date.now()}`, name, pattern: readPattern() });
  saveLibrary(library.slice(0, 25)); renderLibrary(); document.querySelector('#library-dialog').showModal(); showToast('Saved to your record crate.');
}

function renderLibrary() {
  const container = document.querySelector('#library-list'); const library = loadLibrary(); container.replaceChildren();
  if (!library.length) { const empty = document.createElement('p'); empty.className = 'library-empty'; empty.textContent = 'Your record crate is waiting for its first loop.'; container.append(empty); return; }
  for (const item of library) {
    const row = document.createElement('div'); row.className = 'library-item'; const description = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = item.name;
    const meta = document.createElement('small'); meta.textContent = `${item.pattern.tempo} BPM · 16 steps`;
    description.append(title, meta); const actions = document.createElement('div');
    const load = document.createElement('button'); load.type = 'button'; load.textContent = 'LOAD'; load.addEventListener('click', () => { stopPlayback(); applyPattern(item.pattern, item.name); document.querySelector('#library-dialog').close(); showToast('Back in the groove.'); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete'; remove.textContent = 'DELETE'; remove.addEventListener('click', () => { saveLibrary(loadLibrary().filter(saved => saved.id !== item.id)); renderLibrary(); });
    actions.append(load, remove); row.append(description, actions); container.append(row);
  }
}

function patternUrl() {
  const shareData = { n: document.querySelector('#pattern-name').value.trim() || 'Shared groove', t: pattern.tempo, w: pattern.swing, s: Object.fromEntries(pattern.tracks.map(track => [track.id, track.steps.map((on, index) => on ? index : -1).filter(index => index >= 0)])) };
  return `${location.href.split('#')[0]}#beat=${encodeURIComponent(JSON.stringify(shareData))}`;
}

async function sharePattern() {
  const url = patternUrl();
  try { await navigator.clipboard.writeText(url); showToast('Pattern link copied. Send it to a friend!'); }
  catch { window.prompt('Copy this pattern link:', url); }
}

function loadSharedPattern() {
  const hash = new URLSearchParams(location.hash.slice(1)); const raw = hash.get('beat'); if (!raw) return;
  try {
    const data = JSON.parse(raw); const map = data.s || {};
    const next = makePattern(Object.fromEntries(TRACKS.map(track => [track.id, map[track.id] || []])));
    next.tempo = Math.min(160, Math.max(70, Number(data.t) || 112)); next.swing = Math.min(60, Math.max(0, Number(data.w) || 0));
    applyPattern(next, data.n || 'Shared groove'); showToast('A friend sent you a groove.');
  } catch { showToast('That pattern link looks a little scrambled.'); }
}

function schedulePatternOffline(context, output, loopStart) {
  // This uses the same voice functions as live play, rendered by OfflineAudioContext.
  const stepDuration = secondsPerStep();
  for (let repeat = 0; repeat < 2; repeat++) {
    const repeatStart = loopStart + repeat * stepDuration * 16;
    for (let step = 0; step < 16; step++) {
      const time = repeatStart + stepDuration * step + (step % 2 ? (pattern.swing / 100) * stepDuration * .48 : 0);
      for (const track of pattern.tracks) scheduleTrackStep(context, output, track.id, step, time);
    }
  }
}

function audioBufferToWav(buffer) {
  const channels = buffer.numberOfChannels; const sampleRate = buffer.sampleRate;
  const frames = buffer.length; const bytesPerSample = 2; const dataSize = frames * channels * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataSize); const view = new DataView(arrayBuffer);
  const writeText = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  writeText(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeText(8, 'WAVE'); writeText(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true); view.setUint16(34, 16, true); writeText(36, 'data'); view.setUint32(40, dataSize, true);
  const channelData = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i)); let offset = 44;
  for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < channels; channel++) {
    const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
    view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true); offset += 2;
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

async function exportWav() {
  const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContext) { showToast('Offline audio export is not supported in this browser.'); return; }
  const button = document.querySelector('#download-button'); button.disabled = true; button.textContent = 'RENDERING…';
  try {
    const sampleRate = 44100; const duration = secondsPerStep() * 16 * 2 + 0.4;
    const offline = new OfflineContext(2, Math.ceil(sampleRate * duration), sampleRate);
    const output = offline.createGain(); output.gain.value = 0.72; output.connect(offline.destination);
    schedulePatternOffline(offline, output, 0);
    const rendered = await offline.startRendering(); const blob = audioBufferToWav(rendered);
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    const fileName = (document.querySelector('#pattern-name').value.trim() || 'pulse-lab-groove').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    link.href = url; link.download = `${fileName}.wav`; link.click(); URL.revokeObjectURL(url); showToast('Your WAV is ready. Go make someone dance.');
  } catch (error) { console.error(error); showToast('Could not render the WAV this time.'); }
  button.disabled = false; button.innerHTML = '<span>↓</span> EXPORT WAV';
}

document.querySelector('#play-button').addEventListener('click', () => isPlaying ? stopPlayback() : startPlayback());
document.querySelector('#panic-button').addEventListener('click', stopPlayback);
document.querySelector('#clear-button').addEventListener('click', () => { pattern.tracks.forEach(track => track.steps.fill(false)); buildGrid(); });
document.querySelector('#tempo').addEventListener('input', event => { pattern.tempo = Number(event.target.value); document.querySelector('#tempo-output').innerHTML = `${pattern.tempo} <small>BPM</small>`; });
document.querySelector('#swing').addEventListener('input', event => { pattern.swing = Number(event.target.value); document.querySelector('#swing-output').innerHTML = `${pattern.swing}<small>%</small>`; });
document.querySelector('#save-button').addEventListener('click', saveCurrentPattern);
document.querySelector('#share-button').addEventListener('click', sharePattern);
document.querySelector('#download-button').addEventListener('click', exportWav);
document.querySelectorAll('.preset-chip').forEach(button => button.addEventListener('click', () => loadPreset(button.dataset.preset)));
document.querySelector('#help-button').addEventListener('click', () => document.querySelector('#help-dialog').showModal());
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.close).close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
document.addEventListener('keydown', event => { if (event.code === 'Space' && !['INPUT','BUTTON'].includes(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); isPlaying ? stopPlayback() : startPlayback(); } });
window.addEventListener('resize', () => { if (isPlaying) drawVisualizer(); });

buildGrid(); loadSharedPattern();
