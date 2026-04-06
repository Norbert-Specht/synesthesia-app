// =============================================================================
// SYNESTHESIA APP — main.js
// =============================================================================
//
// Milestone 1: Canvas setup, aurora animation, audio upload, play/pause.
// Milestone 2: Web Audio API integration — real-time frequency extraction,
//              amplitude tracking, beat detection. All analysis values are
//              collected into a single `audioData` object that the aurora
//              render loop reads each frame. The visuals are not yet driven
//              by audioData — that wiring happens in Milestone 3.
//
// Architecture overview:
//   loadAudioFile()
//     → initAudioContext()          (runs once; creates AudioContext pipeline)
//     → audioPlayer.play()
//
//   drawFrame()  [requestAnimationFrame loop]
//     → updateAudioData()           (reads analyser, writes audioData)
//     → drawAuroraLayer() × 5      (reads audioData — passive in M2)
// =============================================================================


// ================================
// CANVAS SETUP
// ================================

const canvas = document.getElementById('aurora-canvas');
const ctx    = canvas.getContext('2d');

// Match canvas pixel dimensions to the viewport on load and every resize.
// Without this, the canvas defaults to 300×150px and everything stretches.
function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);


// ================================
// AURORA — LAYER DEFINITIONS
//
// Each layer is a sinusoidal ribbon rendered with two passes:
//   1. Outer glow  — wide, soft, semi-transparent fill
//   2. Bright core — narrow, near-white centre that gives the "lit" look
//
// Layers use globalCompositeOperation: 'screen', which mimics how light
// blends. Overlapping cyan + green → white. Purple + green → teal.
// This is the key technique that prevents the aurora from becoming muddy.
//
// All position/size values are fractions of canvas dimensions so the
// aurora scales correctly on any screen size.
// ================================

const AURORA_LAYERS = [
  {
    yFraction:   0.15,   // vertical centre as a fraction of canvas height (0=top, 1=bottom)
    amplitude:   0.07,   // primary wave height as a fraction of canvas height
    waveFreq:    2.2,    // number of full sine cycles across the screen width
    waveSpeed:   0.20,   // how fast the wave moves horizontally (time multiplier)
    wobbleFreq:  0.9,    // frequency of the slower secondary wobble (relative to primary)
    wobbleAmp:   0.5,    // secondary wobble amplitude as a fraction of primary amplitude
    thickness:   0.20,   // ribbon half-height as a fraction of canvas height
    color:       [0, 255, 128],    // vivid green — high zone (melody / treble)
    opacity:     0.60,
    timeOffset:  0.0,    // phase offset so layers don't all move in sync
  },
  {
    yFraction:   0.28,
    amplitude:   0.06,
    waveFreq:    1.6,
    waveSpeed:   0.13,
    wobbleFreq:  1.2,
    wobbleAmp:   0.4,
    thickness:   0.17,
    color:       [0, 220, 255],    // cyan — upper-mid zone
    opacity:     0.52,
    timeOffset:  2.1,
  },
  {
    yFraction:   0.44,
    amplitude:   0.09,
    waveFreq:    2.7,
    waveSpeed:   0.24,
    wobbleFreq:  0.7,
    wobbleAmp:   0.6,
    thickness:   0.22,
    color:       [160, 80, 255],   // purple — mid zone (harmony)
    opacity:     0.46,
    timeOffset:  4.4,
  },
  {
    yFraction:   0.57,
    amplitude:   0.05,
    waveFreq:    1.4,
    waveSpeed:   0.11,
    wobbleFreq:  1.5,
    wobbleAmp:   0.3,
    thickness:   0.14,
    color:       [255, 30, 140],   // magenta — lower-mid accent
    opacity:     0.34,
    timeOffset:  1.6,
  },
  {
    yFraction:   0.67,
    amplitude:   0.07,
    waveFreq:    2.0,
    waveSpeed:   0.17,
    wobbleFreq:  0.8,
    wobbleAmp:   0.45,
    thickness:   0.22,
    color:       [0, 170, 220],    // deep teal/blue — low zone (bass)
    opacity:     0.38,
    timeOffset:  3.5,
  },
];


// ================================
// AURORA — DRAW SINGLE LAYER
//
// Renders one aurora ribbon in two passes (glow + core).
// The gradient is rebuilt each frame so it tracks the wave's
// current vertical position correctly.
// ================================

function drawAuroraLayer(layer, time) {
  const w = canvas.width;
  const h = canvas.height;

  const centerY = layer.yFraction * h;
  const amp     = layer.amplitude * h;
  const thick   = layer.thickness * h;
  const [r, g, b] = layer.color;

  // Offset time by each layer's unique phase so they drift independently
  const t = time + layer.timeOffset;

  // Build the wave point array — one point every 3px horizontally for
  // smoothness without excess computation.
  const STEPS = Math.ceil(w / 3);
  const stepX = w / STEPS;
  const pts   = [];

  for (let i = 0; i <= STEPS; i++) {
    const x     = i * stepX;
    // phase maps x position to a full sine cycle count (waveFreq cycles per screen width)
    const phase = (x / w) * Math.PI * 2 * layer.waveFreq;

    // Primary sine wave + secondary wobble at a different frequency.
    // The 0.65 multiplier on the wobble speed gives it a slightly different
    // tempo to the primary, avoiding a mechanical-looking repeat.
    const y = centerY
      + Math.sin(phase + t * layer.waveSpeed) * amp
      + Math.sin(phase * layer.wobbleFreq + t * layer.waveSpeed * 0.65) * amp * layer.wobbleAmp;

    pts.push({ x, y });
  }

  ctx.save();
  // 'screen' blending: each layer adds light, never subtracts.
  // This is what makes color overlaps feel luminous rather than muddy.
  ctx.globalCompositeOperation = 'screen';

  // — Pass 1: Outer glow ribbon (wide, soft) —
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y - thick);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y - thick);
  // Trace back along the bottom edge to close the filled shape
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].y + thick);
  ctx.closePath();

  // Vertical gradient: transparent → full color at centre → transparent.
  // Using centerY (not pts[i].y) as the gradient anchor is an intentional
  // simplification — the gradient won't perfectly track the wave crest but
  // the result is visually indistinguishable and much cheaper to compute.
  const glowGrad = ctx.createLinearGradient(0, centerY - thick, 0, centerY + thick);
  glowGrad.addColorStop(0.00, `rgba(${r},${g},${b},0)`);
  glowGrad.addColorStop(0.25, `rgba(${r},${g},${b},${layer.opacity * 0.45})`);
  glowGrad.addColorStop(0.50, `rgba(${r},${g},${b},${layer.opacity})`);
  glowGrad.addColorStop(0.75, `rgba(${r},${g},${b},${layer.opacity * 0.45})`);
  glowGrad.addColorStop(1.00, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = glowGrad;
  ctx.fill();

  // — Pass 2: Bright core (narrow, near-white hot centre) —
  // 18% of the ribbon thickness gives a tight glowing spine.
  const coreThick = thick * 0.18;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y - coreThick);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y - coreThick);
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].y + coreThick);
  ctx.closePath();

  const coreGrad = ctx.createLinearGradient(0, centerY - coreThick, 0, centerY + coreThick);
  coreGrad.addColorStop(0.00, `rgba(255,255,255,0)`);
  coreGrad.addColorStop(0.50, `rgba(255,255,255,${layer.opacity * 0.55})`);
  coreGrad.addColorStop(1.00, `rgba(255,255,255,0)`);
  ctx.fillStyle = coreGrad;
  ctx.fill();

  ctx.restore();
}


// ================================
// AURORA — RENDER LOOP
// ================================

// `time` is a monotonically increasing counter used as the sine wave
// argument. It increments by ~0.016 per frame (≈ 1/60s), so one unit
// of time corresponds to roughly one second at 60fps.
let time = 0;

function drawFrame() {
  // Step 1: Pull fresh audio analysis data into the global audioData object.
  // In Milestone 2 this is wired up but the values don't yet affect visuals.
  updateAudioData();

  // Step 2: Clear the canvas with the background color each frame.
  ctx.fillStyle = '#060810';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Step 3: Draw all aurora layers back-to-front (array order = painter's order).
  AURORA_LAYERS.forEach(layer => drawAuroraLayer(layer, time));

  time += 0.016;
  requestAnimationFrame(drawFrame);
}


// =============================================================================
// AUDIO ANALYSIS (Milestone 2)
// =============================================================================
//
// Web Audio API pipeline:
//
//   <audio> element
//       ↓  createMediaElementSource()  — taps the decoded audio stream
//   MediaElementSourceNode
//       ↓  connect()
//   AnalyserNode                        — performs FFT analysis each frame
//       ↓  connect()
//   AudioContext.destination            — speakers / headphones
//
// Important: createMediaElementSource() can only be called ONCE per audio
// element. The source node persists across track changes — only the audio
// element's src changes. This is why initAudioContext() guards with a flag.
// =============================================================================


// ================================
// AUDIO ANALYSIS — CONSTANTS
// ================================

// --- Spectral Flux Onset Detection ---
//
// Spectral flux measures the total change in the frequency spectrum between
// consecutive frames. Unlike the previous delta method (which only watched bass
// energy for kick drums), spectral flux watches the entire spectrum simultaneously.
// A kick, snare, guitar strum, piano attack, or brass hit all produce a sudden
// increase across many frequency bins — that burst of change is the flux signal.
//
// Only positive changes are summed (Half-Wave Rectification / HWR). This makes
// the detector sensitive to onsets (energy suddenly appearing) and insensitive
// to releases (energy fading away), which is exactly what we want.
//
// A dynamic threshold — derived from the rolling median of recent flux values —
// adapts to the energy level of the track. A quiet classical passage and a loud
// electronic drop both get appropriate sensitivity without manual tuning per genre.

// Number of recent flux values kept in the rolling history buffer.
// 43 frames ≈ 700ms at 60fps — enough history to compute a stable local median
// without being so long that the threshold lags badly during abrupt energy shifts.
const FLUX_HISTORY_SIZE = 43;

// Onset fires when flux exceeds (median of recent flux values × this multiplier).
// 1.5 means an onset requires a flux spike 50% above the recent baseline.
// Tune upward to reduce false positives on sustained/legato music;
// tune downward to catch quieter or more subtle onsets.
const FLUX_THRESHOLD_MULTIPLIER = 1.5;

// Minimum milliseconds between two consecutive onset triggers.
// 100ms = max ~10 onsets/second, which covers fast 16th-note passages at 150bpm.
// Prevents a single loud transient from double-firing across adjacent frames.
const ONSET_COOLDOWN_MS = 100;

// Per-frame decay factor applied to beatIntensity after each onset.
// 0.88 means intensity halves in roughly 5 frames (~83ms at 60fps).
const ONSET_DECAY = 0.88;

// Idle fallback values used when no audio is playing.
// Non-zero so the aurora continues its ambient animation (not frozen).
const IDLE_AUDIO_DATA = {
  bass:          0.08,
  mid:           0.04,
  high:          0.02,
  amplitude:     0.04,
  isBeat:        false,
  beatIntensity: 0.0,
};


// ================================
// AUDIO ANALYSIS — STATE
// ================================

// AudioContext and related nodes — created once on first file load.
let audioCtx   = null;
let analyser   = null;
let sourceNode = null;   // MediaElementSourceNode wrapping the <audio> element

// Typed arrays for reading FFT output each frame.
// Allocated once after the analyser is configured (size depends on fftSize).
let freqData = null;   // Uint8Array[1024] — frequency magnitudes, 0–255 per bin
let timeData = null;   // Uint8Array[2048] — raw waveform samples, 0–255 (128 = silence)

// Snapshot of freqData from the previous frame — required by spectral flux.
// Flux is computed as the difference between this frame and the last.
// Allocated alongside freqData in initAudioContext() once fftSize is known.
let previousFreqData = null;   // Uint8Array[1024]

// Rolling buffer of recent flux values used to compute the dynamic threshold.
// Acts as a short-term memory of how much spectral change is "normal" for this
// passage of music, so the onset threshold adapts to the track's energy level.
const fluxHistory = [];

// Timestamp of the last triggered onset (ms, from performance.now()).
let lastOnsetTime = 0;

// Internal beat intensity value that persists and decays across frames.
// Exposed via audioData.beatIntensity each frame.
let beatIntensityInternal = 0;

// The global audioData object — written by updateAudioData() every frame,
// read by the aurora render loop (and in Milestone 3, by the color pipeline).
let audioData = { ...IDLE_AUDIO_DATA };


// ================================
// AUDIO ANALYSIS — INIT AUDIO CONTEXT
//
// Called the first time a file is loaded (a user gesture).
// Must be triggered by a user interaction — browsers block AudioContext
// creation on page load to prevent autoplaying audio without consent.
// ================================

function initAudioContext() {
  // Guard: only create once. createMediaElementSource() throws if called
  // twice on the same element, and AudioContext creation is expensive.
  if (audioCtx) return;

  // webkitAudioContext fallback covers Safari.
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // --- Configure the AnalyserNode ---
  analyser = audioCtx.createAnalyser();

  // fftSize must be a power of 2. 2048 gives 1024 frequency bins.
  // Bin resolution = sampleRate / fftSize ≈ 21.5 Hz per bin at 44100 Hz.
  // Higher fftSize → finer frequency detail but more CPU per frame.
  analyser.fftSize = 2048;

  // Smoothing blends each frame's FFT result with the previous frame.
  // Formula: output = (smoothing × previous) + ((1 - smoothing) × current)
  // 0.8 was too high for bass-heavy music — it prevented bass values from
  // dropping between kicks, keeping them near the ceiling (0.9+) and making
  // the beat threshold mathematically unreachable (0.9 × 1.15 > 1.0).
  // 0.3 lets transients come through clearly while still taking the edge
  // off single-frame noise. Can be raised toward 0.6 if visuals feel jittery
  // in Milestone 3.
  analyser.smoothingTimeConstant = 0.3;

  // --- Wire the audio pipeline ---
  // Tap the <audio> element's decoded output as a Web Audio source.
  sourceNode = audioCtx.createMediaElementSource(audioPlayer);
  sourceNode.connect(analyser);
  analyser.connect(audioCtx.destination);   // must reconnect to hear audio

  // --- Allocate analysis buffers ---
  // frequencyBinCount = fftSize / 2 = 1024
  freqData         = new Uint8Array(analyser.frequencyBinCount);
  // previousFreqData mirrors freqData — holds last frame's spectrum for flux calculation.
  // Initialised to all zeros; the first frame produces no onset (flux vs. silence).
  previousFreqData = new Uint8Array(analyser.frequencyBinCount);
  // timeDomainData length = fftSize = 2048
  timeData         = new Uint8Array(analyser.fftSize);
}


// ================================
// AUDIO ANALYSIS — BAND ENERGY
//
// Averages the FFT magnitude values across a range of frequency bins
// and normalises the result to 0.0–1.0.
//
// Bin-to-frequency mapping (44100 Hz sample rate, fftSize 2048):
//   frequency ≈ binIndex × (sampleRate / fftSize) ≈ binIndex × 21.5 Hz
//
//   Bass  bins  0– 10  ≈    0 –  215 Hz  (kick, bass guitar, low synth)
//   Mid   bins 11–100  ≈  215 – 2150 Hz  (vocals, guitar, piano, snare)
//   High  bins 101–512 ≈ 2150 – 11025 Hz (hi-hats, cymbals, air, sibilance)
//
// Note: the top of the High band (bin 512) reaches ~11 kHz, not 20 kHz.
// The upper half of the spectrum (11–22 kHz) is excluded — it carries
// very little musical energy and would dilute the high band average.
// ================================

function getBandEnergy(data, startBin, endBin) {
  let sum = 0;
  const count = endBin - startBin + 1;
  for (let i = startBin; i <= endBin; i++) {
    sum += data[i];
  }
  // data values are 0–255; divide by 255 to normalise to 0.0–1.0
  return sum / (count * 255);
}


// ================================
// AUDIO ANALYSIS — RMS AMPLITUDE
//
// Root Mean Square of the time-domain waveform — a perceptually accurate
// measure of loudness (correlates with how loud humans perceive the sound).
//
// Time-domain samples are 0–255 where 128 = silence (zero crossing).
// We re-centre each sample around 0 before squaring.
// ================================

function getRMSAmplitude(data) {
  let sumOfSquares = 0;
  for (let i = 0; i < data.length; i++) {
    // Re-centre: 128 → 0, 0 → -1, 255 → ~1
    const sample = (data[i] - 128) / 128;
    sumOfSquares += sample * sample;
  }
  return Math.sqrt(sumOfSquares / data.length);
}


// ================================
// AUDIO ANALYSIS — ONSET DETECTION (Spectral Flux)
//
// Spectral flux = the sum of positive bin-level increases across the full
// frequency spectrum between the current frame and the previous frame.
//
//   flux = Σ max(0, freqData[i] - previousFreqData[i])   for all bins i
//
// Summing only positive differences (Half-Wave Rectification) makes the
// detector onset-sensitive — it fires when energy suddenly appears across
// the spectrum — and ignores releases, where energy fades away.
//
// Why spectral flux instead of the previous delta/bass method:
//   The old approach watched only the bass band for upward spikes, which
//   effectively detected kick drums and little else. It failed entirely on
//   classical, jazz, acoustic, and ambient music where the rhythmic pulse
//   lives in mid or high frequencies, or where there is no sharp transient.
//   Spectral flux detects any musical onset — kick, snare, guitar strum,
//   piano attack, brass hit — regardless of which band carries the energy.
//
// Dynamic threshold:
//   Rather than a fixed flux threshold, we compare flux to the rolling median
//   of recent flux values. This adapts to the track's overall energy level:
//   a quiet piano passage and a dense electronic drop both trigger at the
//   right sensitivity without manual per-genre tuning.
// ================================

function detectOnset(currentFreqData) {
  const now = performance.now();

  // --- Step 1: Compute spectral flux ---
  // Sum the positive bin-level differences between this frame and the last.
  // Raw bin values are 0–255; dividing by (binCount × 255) normalises to 0.0–1.0.
  let rawFlux = 0;
  for (let i = 0; i < currentFreqData.length; i++) {
    rawFlux += Math.max(0, currentFreqData[i] - previousFreqData[i]);
  }
  const flux = rawFlux / (currentFreqData.length * 255);

  // Update previousFreqData for next frame.
  // set() copies the values — we can't just assign (both vars would point to
  // the same buffer and previousFreqData would always equal currentFreqData).
  previousFreqData.set(currentFreqData);

  // --- Step 2: Maintain rolling flux history ---
  // Keep only the most recent FLUX_HISTORY_SIZE values.
  fluxHistory.push(flux);
  if (fluxHistory.length > FLUX_HISTORY_SIZE) fluxHistory.shift();

  // --- Step 3: Compute dynamic threshold from rolling median ---
  // The median is more robust than the mean — a single loud transient won't
  // skew the baseline and suppress detection of the next onset.
  const sorted = [...fluxHistory].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const dynamicThreshold = median * FLUX_THRESHOLD_MULTIPLIER;

  // --- Step 4: Fire onset if flux exceeds threshold and cooldown has elapsed ---
  const isBeat =
    flux > dynamicThreshold &&
    (now - lastOnsetTime) > ONSET_COOLDOWN_MS;

  if (isBeat) {
    lastOnsetTime = now;
    // Intensity: how far above the threshold did flux land?
    // At threshold → 0; at 2× threshold → 0.5; at 3× threshold → ~0.67; clamped at 1.0.
    beatIntensityInternal = Math.min(1.0, (flux - dynamicThreshold) / dynamicThreshold);
  }

  // Decay intensity toward zero each frame regardless of onset state
  beatIntensityInternal *= ONSET_DECAY;

  return { isBeat, beatIntensity: beatIntensityInternal };
}


// ================================
// AUDIO ANALYSIS — UPDATE (called every frame from drawFrame)
//
// Reads the latest FFT and time-domain data from the AnalyserNode,
// extracts the three band energies, computes RMS amplitude, runs beat
// detection, and writes everything into the global `audioData` object.
//
// Falls back to IDLE_AUDIO_DATA when audio is paused or not yet set up,
// so the aurora continues its ambient animation rather than freezing.
// ================================

function updateAudioData() {
  // No analyser yet (first file not loaded), or audio is paused — use idle values.
  // Let beatIntensity continue to decay so a beat flash doesn't freeze on pause.
  if (!analyser || audioPlayer.paused) {
    beatIntensityInternal *= ONSET_DECAY;
    audioData = {
      ...IDLE_AUDIO_DATA,
      beatIntensity: beatIntensityInternal,
    };
    return;
  }

  // Read current FFT magnitudes into freqData (0–255 per bin)
  analyser.getByteFrequencyData(freqData);

  // Read current waveform samples into timeData (0–255, 128 = silence)
  analyser.getByteTimeDomainData(timeData);

  // Extract normalised (0.0–1.0) energy per frequency band
  const bass = getBandEnergy(freqData, 0,   10);
  const mid  = getBandEnergy(freqData, 11,  100);
  const high = getBandEnergy(freqData, 101, 512);

  // Overall loudness via RMS
  const amplitude = getRMSAmplitude(timeData);

  // Onset detection via spectral flux — passes the full frequency array,
  // not just a single band value, so all instrument attacks are captured.
  const { isBeat, beatIntensity } = detectOnset(freqData);

  // Write all values into the shared audioData object.
  // The aurora renderer reads this object next frame (Milestone 3 will act on it).
  audioData = { bass, mid, high, amplitude, isBeat, beatIntensity };
}


// =============================================================================
// UI / PLAYBACK
// =============================================================================


// ================================
// UI ELEMENTS
// ================================

const landingEl           = document.getElementById('landing');
const controlsEl          = document.getElementById('controls');
const trackNameEl         = document.getElementById('track-name');
const playPauseBtn        = document.getElementById('play-pause-btn');
const iconPlay            = document.getElementById('icon-play');
const iconPause           = document.getElementById('icon-pause');
const uploadInput         = document.getElementById('audio-upload');
const uploadControlsInput = document.getElementById('audio-upload-controls');
const audioPlayer         = document.getElementById('audio-player');


// ================================
// FILE LOADING
// ================================

function loadAudioFile(file) {
  if (!file) return;

  // Initialize the AudioContext pipeline on first file load.
  // Must happen here (inside a user-gesture handler) to satisfy browser
  // autoplay policy. Subsequent calls are no-ops due to the guard in initAudioContext().
  initAudioContext();

  // Resume the AudioContext in case the browser suspended it.
  // Browsers may auto-suspend an AudioContext that hasn't produced output yet.
  if (audioCtx.state === 'suspended') audioCtx.resume();

  // Free the previous blob URL to avoid memory leaks.
  // revokeObjectURL is safe to call here — the audio element will be
  // given a new src immediately below.
  if (audioPlayer.src) URL.revokeObjectURL(audioPlayer.src);

  const url = URL.createObjectURL(file);
  audioPlayer.src = url;
  audioPlayer.load();

  // Strip the file extension for a clean display name in the controls bar
  const displayName = file.name.replace(/\.[^/.]+$/, '');
  trackNameEl.textContent = displayName;

  // Transition from the landing overlay to the player UI
  landingEl.classList.add('hidden');
  controlsEl.classList.remove('hidden');
  playPauseBtn.disabled = false;

  // Auto-play immediately after load
  audioPlayer.play();
  setPlayState(true);
}

uploadInput.addEventListener('change', (e) => {
  loadAudioFile(e.target.files[0]);
  e.target.value = '';   // reset so the same file can be re-selected
});

uploadControlsInput.addEventListener('change', (e) => {
  loadAudioFile(e.target.files[0]);
  e.target.value = '';
});


// ================================
// PLAY / PAUSE
// ================================

// Swaps the play/pause SVG icons to reflect playback state.
function setPlayState(isPlaying) {
  if (isPlaying) {
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
  } else {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
  }
}

playPauseBtn.addEventListener('click', () => {
  // Resume AudioContext on play — browsers may suspend it during inactivity.
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

  if (audioPlayer.paused) {
    audioPlayer.play();
    setPlayState(true);
  } else {
    audioPlayer.pause();
    setPlayState(false);
  }
});

// Reset icon to play state when the track finishes naturally
audioPlayer.addEventListener('ended', () => setPlayState(false));


// Start the render loop — must be called after all `let` declarations above
// to avoid a temporal dead zone error on `analyser` and `audioData`.
drawFrame();
