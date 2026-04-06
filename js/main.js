// =============================================================================
// SYNESTHESIA APP — main.js
// =============================================================================
//
// Milestone 1: Canvas setup, aurora animation, audio upload, play/pause.
// Milestone 2: Web Audio API integration — real-time frequency extraction,
//              amplitude tracking, spectral flux onset detection. All values
//              collected into a single `audioData` object each frame.
// Milestone 3: Full rebuild — chroma feature extraction (12 pitch class
//              energies per frame), dominant/secondary pitch detection,
//              spectral brightness. audioData expanded with pitch-driven
//              fields. Aurora rendering rebuild follows in next steps.
//
// Architecture overview:
//   loadAudioFile()
//     → initAudioContext()          (runs once; creates AudioContext pipeline)
//     → audioPlayer.play()
//
//   drawFrame()  [requestAnimationFrame loop]
//     → updateAudioData()           (reads analyser → writes audioData)
//     → updateVisualState()         (lerps audioData → visualState, smoothed)
//     → drawAuroraLayer() × 5      (reads visualState — live visual response)
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
//
// `zone` assigns each layer to a frequency region ('high', 'mid', 'low').
// drawAuroraLayer() reads the matching visualState energy value to modulate
// that layer's thickness, speed, opacity, and wave height in real-time.
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
    zone:        'high', // driven by visualState.high — reacts to treble energy
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
    zone:        'high', // second high-zone layer — adds depth to treble response
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
    zone:        'mid',  // driven by visualState.mid — reacts to vocal/harmonic energy
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
    zone:        'mid',  // second mid-zone layer — accent layer for harmonic movement
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
    zone:        'low',  // driven by visualState.bass — reacts to kick/bass energy
  },
];


// ================================
// AURORA — VISUAL STATE
//
// visualState holds the smoothed rendering values that drawAuroraLayer()
// reads each frame. It is NOT the same as audioData.
//
// Why a separate visualState instead of reading audioData directly:
//   audioData updates every frame with raw values that can jump sharply —
//   a sudden loud onset snaps amplitude from 0.1 to 0.9 in one frame.
//   Reading that directly produces mechanical, twitchy visuals.
//   visualState lerps toward audioData each frame at a controlled rate,
//   so the aurora moves fluidly and organically rather than snapping.
//   The lerp speed differs per field — bass is slow and weighty, high
//   is fast and reactive — matching the perceptual character of each band.
//
// Initialised to the same values as IDLE_AUDIO_DATA so the aurora starts
// in its ambient state rather than at zero (which would make it invisible).
// ================================

const visualState = {
  bass:          0.08,   // smoothed bass energy — slow, weighty response
  mid:           0.04,   // smoothed mid energy — medium response
  high:          0.02,   // smoothed high energy — fast, bright response
  amplitude:     0.04,   // smoothed overall amplitude — global swell
  beatIntensity: 0.0,    // smoothed beat/onset intensity — fast attack, handled by decay in audio
};


// ================================
// AURORA — LERP HELPER
//
// Linear interpolation: moves `current` toward `target` by `factor` each frame.
//
//   factor 0.0 → no movement (current never changes)
//   factor 1.0 → instant snap (current = target immediately)
//   factor 0.04–0.10 → smooth, organic transitions over many frames
//
// At factor 0.05, it takes ~14 frames (~230ms) to cover 50% of the distance
// to the target, which gives a natural, breathing quality to the motion.
// The exact perceptual feel depends on the target range — for 0.0–1.0 audio
// values the transitions are fast enough to feel responsive and slow enough
// to never feel mechanical.
// ================================

function lerp(current, target, factor) {
  return current + (target - current) * factor;
}


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

  const centerY   = layer.yFraction * h;
  const [r, g, b] = layer.color;

  // Offset time by each layer's unique phase so they drift independently
  const t = time + layer.timeOffset;

  // --- Resolve zone energy ---
  // Each layer belongs to a frequency zone ('high', 'mid', or 'low').
  // zoneEnergy is the smoothed value from visualState that corresponds
  // to this layer's zone — it drives all the per-layer modulations below.
  // The ?? fallback to visualState.amplitude covers any hypothetical layer
  // without a zone property, so no layer is ever left undriven.
  const zoneEnergy = {
    high: visualState.high,
    mid:  visualState.mid,
    low:  visualState.bass,
  }[layer.zone] ?? visualState.amplitude;

  // --- Compute modulated visual properties from visualState ---

  // Thickness: zone energy expands the ribbon — more energy = thicker aurora band.
  // 0.6 sets a minimum size of 60% of the design value so the ribbon is always
  // visible. Adding zoneEnergy × 0.8 means full energy (1.0) brings it to 140%
  // of design thickness — a noticeable but not extreme swell.
  const thick = layer.thickness * h * (0.6 + zoneEnergy * 0.8);

  // Wave speed: higher zone energy drives faster, more agitated movement.
  // Multiplier ranges from 1.0× (silence) to 2.5× (full energy).
  // High-zone layers already have higher base waveSpeed values, so their
  // treble response is naturally more frenetic than the slow bass layers.
  const speed = layer.waveSpeed * (1.0 + zoneEnergy * 1.5);

  // Opacity: three additive contributions —
  //   1. Base layer opacity — the layer's design presence, always visible
  //   2. Zone energy adds up to +0.25 — louder/busier frequency band = more visible
  //   3. Beat intensity adds up to +0.35 — the whole aurora flashes on any musical
  //      onset regardless of which zone triggered it, giving a global pulse feel
  const opacity = Math.min(1.0,
    layer.opacity
    + zoneEnergy * 0.25
    + visualState.beatIntensity * 0.35
  );

  // Wave amplitude: zone energy increases ribbon height — loud passages make the
  // aurora swell taller. Ranges from 1.0× (silence) to 1.6× (full energy).
  const amp = layer.amplitude * h * (1.0 + zoneEnergy * 0.6);

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
    // `speed` replaces the static layer.waveSpeed — faster when zone is active.
    const y = centerY
      + Math.sin(phase + t * speed) * amp
      + Math.sin(phase * layer.wobbleFreq + t * speed * 0.65) * amp * layer.wobbleAmp;

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
  glowGrad.addColorStop(0.25, `rgba(${r},${g},${b},${opacity * 0.45})`);
  glowGrad.addColorStop(0.50, `rgba(${r},${g},${b},${opacity})`);
  glowGrad.addColorStop(0.75, `rgba(${r},${g},${b},${opacity * 0.45})`);
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
  coreGrad.addColorStop(0.50, `rgba(255,255,255,${opacity * 0.55})`);
  coreGrad.addColorStop(1.00, `rgba(255,255,255,0)`);
  ctx.fillStyle = coreGrad;
  ctx.fill();

  ctx.restore();
}


// ================================
// AURORA — UPDATE VISUAL STATE
//
// Runs every frame after updateAudioData() and before drawing.
// Lerps each visualState field toward the corresponding audioData value
// at a rate tuned to the perceptual character of that frequency band.
//
// Why different lerp rates per band:
//   Bass is slow and physical — a kick drum felt in the chest, a bass
//   note that sustains. A slow lerp (0.04) gives it weight and momentum.
//
//   High frequencies are fast and airy — hi-hats, cymbal shimmers, sibilance.
//   A faster lerp (0.10) lets the high zone flicker and react quickly.
//
//   Mid sits between them — vocals, piano, guitar. Medium lerp (0.06).
//
//   Amplitude is the overall loudness envelope — a medium-slow lerp (0.05)
//   gives the global swell a breath-like quality rather than a hard pump.
//
//   beatIntensity gets the fastest lerp (0.20) because onsets need to feel
//   sharp and immediate. The gradual fade is already handled by ONSET_DECAY
//   in the audio layer — the visual layer just needs to track it quickly.
// ================================

function updateVisualState() {
  // Lerp speed constants — tuned to the perceptual weight of each band.
  const LERP_BASS = 0.04;   // slow, weighty — bass energy moves like a heavy ribbon
  const LERP_MID  = 0.06;   // medium — harmonic content drifts fluidly
  const LERP_HIGH = 0.10;   // fast — treble flickers and responds quickly
  const LERP_AMP  = 0.05;   // medium-slow — global brightness swells and breathes
  const LERP_BEAT = 0.20;   // fast attack — onset flash must feel immediate

  visualState.bass          = lerp(visualState.bass,          audioData.bass,          LERP_BASS);
  visualState.mid           = lerp(visualState.mid,           audioData.mid,           LERP_MID);
  visualState.high          = lerp(visualState.high,          audioData.high,          LERP_HIGH);
  visualState.amplitude     = lerp(visualState.amplitude,     audioData.amplitude,     LERP_AMP);
  visualState.beatIntensity = lerp(visualState.beatIntensity, audioData.beatIntensity, LERP_BEAT);
}


// ================================
// AURORA — RENDER LOOP
// ================================

// `time` is a monotonically increasing counter used as the sine wave
// argument. It increments by ~0.016 per frame (≈ 1/60s), so one unit
// of time corresponds to roughly one second at 60fps.
let time = 0;

function drawFrame() {
  // Step 1: Read from Web Audio API → writes raw values into audioData.
  updateAudioData();

  // Step 2: Smooth audioData → visualState via per-band lerp.
  // This is what the renderer reads — never audioData directly.
  updateVisualState();

  // Step 3: Clear the canvas with the background color each frame.
  ctx.fillStyle = '#060810';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Step 4: Draw all aurora layers back-to-front (array order = painter's order).
  // Each layer reads visualState internally to modulate its appearance.
  AURORA_LAYERS.forEach(layer => drawAuroraLayer(layer, time));

  time += 0.016;
  requestAnimationFrame(drawFrame);
}


// =============================================================================
// AUDIO ANALYSIS (Milestones 2–3)
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

// --- Pitch class names ---
// Human-readable labels for the 12 pitch classes (index 0 = C, index 11 = B).
// Used for debug logging and future profile system display.
const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// --- Chroma Feature Extraction ---
//
// Chroma features represent the energy at each of the 12 musical pitch classes
// (C, C#, D ... B) regardless of which octave they appear in. A chroma vector
// tells us which notes are active in the music right now — without needing
// explicit chord or note detection. Every octave of C contributes to chroma[0],
// every octave of A contributes to chroma[9], and so on.
//
// This is the foundation of the pitch-to-color system. We measure which pitch
// classes are most energetically present, look them up in the active synesthete
// profile, and drive the ribbon colors from that. It works across all genres
// because it is agnostic to instrument, octave, and timbre.

// Minimum chroma energy for a pitch class to be considered "active".
// Pitch classes below this are filtered out as noise — they exist in the FFT
// but at such low levels that treating them as audible notes would produce
// spurious color changes. 0.15 = 15% average fractional FFT energy per bin.
const CHROMA_MIN_ENERGY = 0.15;

// Per-frame lerp rate for smoothing raw chroma toward the persistent
// smoothedChroma array. Slow enough (0.05) to prevent the dominant pitch from
// flickering between adjacent pitch classes during sustained chords or legato
// passages, while still responding to real harmonic changes within a second.
const CHROMA_LERP_RATE = 0.05;

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
  // Idle chroma: equal low energy across all 12 pitch classes.
  // Non-zero gives the aurora a subtle ambient tint even when paused.
  chroma:             new Float32Array(12).fill(0.05),
  dominantPitch:      -1,    // -1 = no active pitch above threshold
  secondaryPitches:   [],
  amplitude:          0.04,
  spectralBrightness: 0.3,
  isBeat:             false,
  beatIntensity:      0.0,
  // --- Legacy band energies (backward compatibility) ---
  // updateVisualState() still reads bass/mid/high from audioData.
  // These will be removed when the rendering section is rebuilt in the
  // next step of the M3 rebuild.
  bass:  0.08,
  mid:   0.04,
  high:  0.02,
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
// read by the aurora render loop and (from M3) by the color pipeline.
let audioData = { ...IDLE_AUDIO_DATA };

// --- Chroma state ---

// Bin-to-pitch-class lookup table — maps each FFT bin index to a pitch class
// index (0–11) or -1 if the bin falls outside the useful musical frequency
// range (~60–4200 Hz). Built once in initAudioContext() because it requires
// the AudioContext's actual sampleRate, which varies by browser and device.
let binToPitchClass = null;   // Int8Array[1024], allocated in initAudioContext()

// Smoothed chroma vector — lerped toward raw chroma each frame at CHROMA_LERP_RATE.
// Initialised to 0.05 (the idle level) so the aurora starts in its ambient state.
// Persistent across frames — never reallocated — so lerp continuity is preserved.
const smoothedChroma = new Float32Array(12).fill(0.05);

// Scratch arrays for computeChroma() — pre-allocated at module load to avoid
// creating new typed arrays on every frame, which would trigger garbage collection
// 60 times per second and cause stuttering.
const chromaSums   = new Float32Array(12);   // accumulated magnitude sum per pitch class
const chromaCounts = new Int32Array(12);     // number of contributing FFT bins per pitch class

// Timestamp of the last debug log line — throttles console output to once/second.
let debugLastLogTime = 0;   // DEBUG — remove after testing


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

  // --- Build bin-to-pitch-class lookup table ---
  //
  // Maps each FFT bin index to a pitch class (0–11) using equal temperament,
  // or -1 if the bin is outside the musically useful frequency range.
  //
  // Formula (equal temperament, A4 = 440 Hz as reference):
  //   semitones = 12 × log2(frequency / 440)
  //   pitchClass = ((round(semitones) + 9) mod 12 + 12) mod 12
  //
  //   The +9 offset adjusts from A-relative (semitones=0 → A) to
  //   C-relative (index 0 → C). The double-mod-and-add-12 ensures the
  //   result is always positive — JavaScript's % can return negatives.
  //
  // Built here (not at module load) because sampleRate is only known after
  // AudioContext creation — browsers may use 44100 or 48000 Hz.
  //
  // Excluded frequency ranges:
  //   < 60 Hz   — sub-bass rumble; fundamental pitch too ambiguous for chroma
  //   > 4200 Hz — above this, overtone harmonics dominate over fundamentals,
  //               making chroma detection unreliable for pitch-class assignment
  binToPitchClass = new Int8Array(analyser.frequencyBinCount).fill(-1);
  const binHz = audioCtx.sampleRate / analyser.fftSize;   // Hz per FFT bin

  for (let i = 0; i < analyser.frequencyBinCount; i++) {
    const freq = i * binHz;
    if (freq < 60 || freq > 4200) continue;   // outside useful musical pitch range

    // log2(freq/440) gives distance in octaves from A4.
    // × 12 converts to semitones. Round to nearest semitone.
    const semitones = 12 * Math.log2(freq / 440);
    binToPitchClass[i] = ((Math.round(semitones) + 9) % 12 + 12) % 12;
  }
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
// AUDIO ANALYSIS — CHROMA FEATURE EXTRACTION
//
// Computes a 12-element chroma vector from the current FFT frame.
// Each element is the normalized average energy present at one pitch class
// (C, C#, D ... B) across all contributing FFT bins in the valid range.
//
// The bin-to-pitch-class lookup table (binToPitchClass) was built in
// initAudioContext() and does the heavy mapping work. This function simply
// accumulates magnitudes into 12 buckets and normalizes.
//
// Normalization: each pitch class sum is divided by (binCount × 255), giving
// average fractional magnitude per bin — comparable across pitch classes and
// meaningful as an absolute energy measure (0.0 = silence, 1.0 = all bins
// in that pitch class at maximum FFT magnitude).
//
// Uses pre-allocated scratch arrays (chromaSums, chromaCounts) to avoid
// any heap allocation on the hot path.
// ================================

function computeChroma(data) {
  // Clear scratch arrays — these are reused every frame.
  chromaSums.fill(0);
  chromaCounts.fill(0);

  // Accumulate raw FFT magnitudes (0–255) per pitch class.
  for (let i = 0; i < data.length; i++) {
    const pc = binToPitchClass[i];
    if (pc < 0) continue;   // bin outside valid musical range
    chromaSums[pc]   += data[i];
    chromaCounts[pc] += 1;
  }

  // Normalize each pitch class to 0.0–1.0.
  // Dividing by (count × 255) gives average fractional magnitude per bin,
  // so a pitch class with few bins and a pitch class with many bins are
  // directly comparable.
  const chroma = new Float32Array(12);
  for (let pc = 0; pc < 12; pc++) {
    chroma[pc] = chromaCounts[pc] > 0
      ? chromaSums[pc] / (chromaCounts[pc] * 255)
      : 0;
  }
  return chroma;
}


// ================================
// AUDIO ANALYSIS — DOMINANT PITCH DETECTION
//
// Finds the dominant and secondary pitch classes from the smoothed chroma
// vector. Only pitch classes above CHROMA_MIN_ENERGY are considered — those
// below the threshold are noise and should not drive color changes.
//
// Returns:
//   dominantPitch    — index (0–11) of highest energy pitch class, or -1
//   secondaryPitches — array of the next 1–2 qualifying pitch class indices
// ================================

function getDominantPitches(chroma) {
  // Build a list of candidates that meet the minimum energy threshold,
  // sorted by energy descending.
  const candidates = [];
  for (let i = 0; i < 12; i++) {
    if (chroma[i] >= CHROMA_MIN_ENERGY) {
      candidates.push({ pitch: i, energy: chroma[i] });
    }
  }
  candidates.sort((a, b) => b.energy - a.energy);

  // Dominant: top candidate, or -1 if nothing meets the threshold.
  // -1 signals the renderer to stay in idle/ambient color mode.
  const dominantPitch = candidates.length > 0 ? candidates[0].pitch : -1;

  // Secondary: next 1–2 qualifying pitch classes (up to 2 secondary ribbons).
  const secondaryPitches = candidates.slice(1, 3).map(c => c.pitch);

  return { dominantPitch, secondaryPitches };
}


// ================================
// AUDIO ANALYSIS — SPECTRAL BRIGHTNESS
//
// A simple proxy for timbre brightness — how "bright" or "dark" the current
// sound is. Computed as the ratio of high-frequency energy (bins 200–512,
// ≈4300–11000 Hz) to total energy (bins 0–512).
//
// Higher values → bright, treble-heavy sounds (bright strings, cymbals,
//                                               bright synth pads, sibilance)
// Lower values  → dark, bass-heavy sounds (cello, bass guitar, kick drum,
//                                          muted piano, warm pads)
//
// Per the research, timbre modifies *saturation and lightness* of a synesthete's
// color — not the hue itself. This value feeds the saturation modifier in
// the color pipeline (Milestone 3 visual rebuild).
// ================================

function computeSpectralBrightness(data) {
  let totalEnergy = 0;
  let highEnergy  = 0;

  for (let i = 0; i <= 512; i++) {
    totalEnergy += data[i];
    if (i >= 200) highEnergy += data[i];   // upper bins only
  }

  // Guard against division by zero during silence.
  return totalEnergy > 0 ? highEnergy / totalEnergy : 0;
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
// Reads the latest FFT and time-domain data from the AnalyserNode, runs
// all analysis functions, and writes results into the global audioData object.
//
// New in M3: chroma extraction, dominant pitch detection, spectral brightness.
// Kept from M2: RMS amplitude, spectral flux onset detection, band energies.
//
// Falls back to idle values when paused or not yet loaded, so the aurora
// continues its ambient animation rather than freezing.
// ================================

function updateAudioData() {
  // No analyser yet (first file not loaded), or audio is paused — use idle values.
  // Lerp smoothedChroma toward idle level so colors fade gracefully on pause.
  // Let beatIntensity continue to decay so a beat flash doesn't freeze on pause.
  if (!analyser || audioPlayer.paused) {
    beatIntensityInternal *= ONSET_DECAY;
    for (let i = 0; i < 12; i++) {
      smoothedChroma[i] = lerp(smoothedChroma[i], 0.05, CHROMA_LERP_RATE);
    }
    audioData = {
      chroma:             smoothedChroma,
      dominantPitch:      -1,
      secondaryPitches:   [],
      amplitude:          0.04,
      spectralBrightness: 0.3,
      isBeat:             false,
      beatIntensity:      beatIntensityInternal,
      // Legacy band energies — kept for updateVisualState() backward compat.
      bass:  0.08,
      mid:   0.04,
      high:  0.02,
    };
    return;
  }

  // Read current FFT magnitudes into freqData (0–255 per bin)
  analyser.getByteFrequencyData(freqData);

  // Read current waveform samples into timeData (0–255, 128 = silence)
  analyser.getByteTimeDomainData(timeData);

  // --- Chroma extraction ---
  // Compute raw chroma from this frame's FFT data, then lerp smoothedChroma
  // toward the raw values. The renderer always reads smoothedChroma — never
  // raw — to prevent flickering on rapid harmonic changes.
  const rawChroma = computeChroma(freqData);
  for (let i = 0; i < 12; i++) {
    smoothedChroma[i] = lerp(smoothedChroma[i], rawChroma[i], CHROMA_LERP_RATE);
  }

  // Detect dominant and secondary pitch classes from smoothed chroma.
  const { dominantPitch, secondaryPitches } = getDominantPitches(smoothedChroma);

  // --- Spectral brightness (timbre proxy) ---
  // Ratio of high-frequency energy to total energy. Feeds the saturation
  // modifier in the color pipeline (brighter sound → more saturated color).
  const spectralBrightness = computeSpectralBrightness(freqData);

  // --- Legacy band energies (backward compat with updateVisualState) ---
  const bass = getBandEnergy(freqData, 0,   10);
  const mid  = getBandEnergy(freqData, 11,  100);
  const high = getBandEnergy(freqData, 101, 512);

  // --- RMS amplitude ---
  const amplitude = getRMSAmplitude(timeData);

  // --- Onset detection ---
  const { isBeat, beatIntensity } = detectOnset(freqData);

  // --- DEBUG: throttled console logging (once per second) ---
  // Remove this entire block before the next milestone.
  const debugNow = performance.now();   // DEBUG
  if (debugNow - debugLastLogTime >= 1000) {   // DEBUG
    debugLastLogTime = debugNow;   // DEBUG
    const rawStr  = Array.from(rawChroma).map(v => v.toFixed(3)).join(', ');   // DEBUG
    const smthStr = Array.from(smoothedChroma).map(v => v.toFixed(3)).join(', ');   // DEBUG
    const domName = dominantPitch >= 0 ? PITCH_CLASS_NAMES[dominantPitch] : '(none)';   // DEBUG
    const secNames = secondaryPitches.length > 0   // DEBUG
      ? secondaryPitches.map(p => `${p}(${PITCH_CLASS_NAMES[p]})`).join(', ')   // DEBUG
      : '(none)';   // DEBUG
    console.log(`[Chroma raw]      ${rawStr}`);   // DEBUG
    console.log(`[Chroma smoothed] ${smthStr}`);   // DEBUG
    console.log(`[Pitch]           dominant: ${dominantPitch} (${domName}) | secondary: ${secNames}`);   // DEBUG
    console.log(`[Brightness]      spectralBrightness: ${spectralBrightness.toFixed(3)}`);   // DEBUG
  }   // DEBUG
  if (isBeat) {   // DEBUG
    console.log(`🎵 ONSET — beatIntensity: ${beatIntensity.toFixed(3)}`);   // DEBUG
  }   // DEBUG
  // END DEBUG

  // Write all values into the shared audioData object.
  audioData = {
    chroma:             smoothedChroma,
    dominantPitch,
    secondaryPitches,
    amplitude,
    spectralBrightness,
    isBeat,
    beatIntensity,
    // Legacy band energies — kept for updateVisualState() backward compat.
    // Will be removed when the rendering section is rebuilt.
    bass,
    mid,
    high,
  };
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
