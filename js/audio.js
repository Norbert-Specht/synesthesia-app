// =============================================================================
// SYNESTHESIA APP — audio.js
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
//   Meyda analyzer                      — taps sourceNode directly;
//       runs on its own buffer schedule  provides chroma, rms, spectralCentroid
//
// Why Meyda for chroma instead of raw FFT bucketing:
//   Hand-rolling chroma by assigning FFT bins to pitch classes via the equal
//   temperament formula produces severe aliasing — C# dominated almost every
//   frame regardless of the music. The root cause is structural: linear Hz
//   bin spacing means higher pitch classes accumulate far more bins than lower
//   ones, and overtone bleed from every played note spreads energy across all
//   12 classes simultaneously. Perceptual weighting and a tighter frequency
//   ceiling improved this but couldn't fully solve it. Meyda uses a proper
//   constant-Q filterbank — logarithmically spaced filters that match the
//   equal temperament scale — giving each pitch class equal resolution and
//   suppressing overtone bleed at the source.
//
// Important: createMediaElementSource() can only be called ONCE per audio
// element. The source node persists across track changes — only the audio
// element's src changes. This is why initAudioContext() guards with a flag.
// =============================================================================


// ================================
// LERP HELPER
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

export function lerp(current, target, factor) {
  return current + (target - current) * factor;
}


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
// spurious color changes.
// Raised from 0.15 → 0.25 after observing that all 12 pitch classes were
// exceeding 0.15 simultaneously on typical music, leaving no useful filtering.
// 0.25 forces the detector to respond only to genuinely dominant pitch classes.
const CHROMA_MIN_ENERGY = 0.25;

// Per-frame lerp rate for smoothing raw chroma toward the persistent
// smoothedChroma array. 0.10 covers ~50% of the distance to target in ~7 frames
// (~115ms at 60fps) — responsive to clear melodic notes while avoiding rapid
// churn that makes the ribbon lifecycle fire too frequently. At 0.22 the dominant
// pitch changed fast enough to trigger constant ribbon transitions, causing a
// slideshow effect. 0.10 is the balance point: tracks melody without churning.
const CHROMA_LERP_RATE = 0.10;

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
const ONSET_COOLDOWN_MS = 150;

// Per-frame decay factor applied to beatIntensity after each onset.
// 0.88 means intensity halves in roughly 5 frames (~83ms at 60fps).
const ONSET_DECAY = 0.88;

// ─── BPM Estimation ───────────────────────────────────────────────────────
// Estimates tempo from onset density using a rolling buffer of onset
// timestamps. Inter-onset interval average → BPM estimate.
// Smoothed with a slow lerp to prevent jumpy tempo readings.

const ONSET_TIMESTAMP_BUFFER_SIZE = 8;   // last N onsets used for averaging
const BPM_LERP_RATE  = 0.04;             // slow lerp — tempo feels stable
const BPM_MIN        = 60;               // clamp floor — handles silence
const BPM_MAX        = 180;              // clamp ceiling — handles very fast music
const BPM_DEFAULT    = 100;              // starting value before enough onsets

let onsetTimestamps = [];                // rolling buffer of onset times (ms)
let estimatedBPM    = BPM_DEFAULT;       // current smoothed BPM estimate
let rawBPM          = BPM_DEFAULT;       // unsmoothed BPM before lerp

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
};


// ================================
// AUDIO ANALYSIS — STATE
// ================================

// AudioContext and related nodes — created once on first file load.
export let audioCtx   = null;
export let analyser   = null;
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
export let audioData = { ...IDLE_AUDIO_DATA };

// --- Chroma / Meyda state ---

// Meyda analyzer instance — created in initAudioContext() once the AudioContext
// and source node are ready. Meyda taps sourceNode directly and runs on its own
// internal buffer schedule (one callback per bufferSize samples, ≈46ms at
// 44100 Hz with bufferSize 2048). It is NOT polled from the render loop — it
// fires asynchronously and we read the most recent result each frame.
export let meydaAnalyzer = null;

// The most recently received feature set from Meyda's callback.
// Null until the first callback fires (typically within one buffer length of
// playback starting — imperceptibly fast in practice). updateAudioData() uses
// idle fallback values if this is null.
let latestMeydaFeatures = null;

// Smoothed chroma vector — lerped toward Meyda's raw chroma each frame at
// CHROMA_LERP_RATE. Initialised to 0.05 (the idle level) so the aurora starts
// in its ambient state. Persistent across frames — never reallocated — so lerp
// continuity is preserved across Meyda callback intervals.
//
// Why lerp if Meyda already smooths internally?
//   Meyda's chroma reflects the energy in a single fixed-size buffer (2048
//   samples). Between buffers, the value is static — not interpolated. Our
//   lerp bridges the gaps between Meyda callbacks, giving the visual system a
//   continuously changing value to read each frame rather than a stepped one.
let smoothedChroma = new Float32Array(12).fill(0.05);

// Timestamp of the last debug log line — throttles console output to once/second.
let debugLastLogTime = 0;   // DEBUG — remove after testing


// ================================
// AUDIO ANALYSIS — INIT AUDIO CONTEXT
//
// Called the first time a file is loaded (a user gesture).
// Must be triggered by a user interaction — browsers block AudioContext
// creation on page load to prevent autoplaying audio without consent.
// ================================

export function initAudioContext() {
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
  const audioPlayer = document.getElementById('audio-player');
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

  // --- Create Meyda analyzer ---
  //
  // Meyda.createMeydaAnalyzer() attaches directly to sourceNode and runs its
  // own processing pipeline on a fixed buffer schedule — independent of the
  // render loop's requestAnimationFrame cadence. The callback fires once per
  // bufferSize samples (2048 / 44100 Hz ≈ 46ms). Between callbacks, the render
  // loop reads the most recent latestMeydaFeatures object, which may be up to
  // one buffer interval stale — imperceptible at ~46ms lag.
  //
  // Features requested:
  //   'chroma'          — 12-element array; energy per pitch class (0.0–1.0),
  //                       index 0 = C, index 11 = B. Normalized so the maximum
  //                       value across all 12 classes equals 1.0.
  //   'rms'             — root mean square amplitude of the buffer (0.0–1.0).
  //                       Replaces our hand-rolled getRMSAmplitude().
  //   'spectralCentroid'— weighted mean frequency in Hz. Divided by Nyquist
  //                       (sampleRate / 2) to normalize to 0.0–1.0 as a
  //                       timbre brightness proxy.
  //
  // Why we keep our own spectral flux onset detection instead of using Meyda:
  //   Onset detection requires comparing consecutive frame snapshots —
  //   previousFreqData vs currentFreqData — at the render loop's cadence.
  //   Meyda's callback fires asynchronously on a fixed buffer schedule, not
  //   per render frame, so it cannot reliably detect frame-to-frame transients
  //   the way the AnalyserNode + spectral flux approach does.
  meydaAnalyzer = Meyda.createMeydaAnalyzer({
    audioContext: audioCtx,
    source:       sourceNode,
    bufferSize:   2048,
    featureExtractors: ['chroma', 'rms', 'spectralCentroid'],
    callback: (features) => {
      // Guard: only store if chroma was successfully extracted.
      // Meyda may pass null features during initialization or on buffer errors.
      if (features && features.chroma) {
        latestMeydaFeatures = features;
      }
    },
  });
  meydaAnalyzer.start();
}


// ================================
// AUDIO ANALYSIS — RESET MEYDA FEATURES
//
// Clears the cached Meyda feature set. Called by player.js when a new track
// is loaded so the previous track's values don't persist into the new track's
// first frames. updateAudioData() will fall back to neutral idle values until
// the new track's first Meyda callback fires.
// ================================

export function resetMeydaFeatures() {
  latestMeydaFeatures = null;
}


// ================================
// AUDIO ANALYSIS — RESET TRANSIENT STATE
//
// Resets per-track transient analysis state on track change.
// Prevents chroma and onset values from the previous track bleeding into
// the first frames of the new track.
//
// Called by player.js inside loadAudioFile(), alongside resetMeydaFeatures().
//
// Guards on previousFreqData and fluxHistory because this may be called before
// initAudioContext() on hypothetical first-load edge cases, though in practice
// loadAudioFile() always calls initAudioContext() first.
// ================================

export function resetAudioState() {
  smoothedChroma.fill(0.05);         // idle equal distribution — no pitch bias
  if (previousFreqData) previousFreqData.fill(0);   // zero flux baseline
  fluxHistory.length = 0;            // clear rolling flux history
  beatIntensityInternal = 0;         // no beat intensity carried over
  onsetTimestamps.length = 0;        // clear BPM onset history
  estimatedBPM = BPM_DEFAULT;        // reset to neutral starting BPM
  rawBPM       = BPM_DEFAULT;
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


// ─── updateBPMEstimate ────────────────────────────────────────────────────
// Called on every detected onset. Pushes the onset timestamp into a rolling
// buffer, computes the average inter-onset interval, converts to BPM, and
// lerps the result smoothly.
//
// Uses onset density rather than strict beat tracking — this means the BPM
// reflects musical activity density, which feels natural for visualization:
// dense passages animate faster, sparse ones slower.
// ─────────────────────────────────────────────────────────────────────────

function updateBPMEstimate() {
  const now = performance.now();
  onsetTimestamps.push(now);

  // Keep buffer at max size — discard oldest.
  if (onsetTimestamps.length > ONSET_TIMESTAMP_BUFFER_SIZE) {
    onsetTimestamps.shift();
  }

  // Need at least 2 timestamps to compute an interval.
  if (onsetTimestamps.length < 2) return;

  // Average gap between consecutive onsets.
  let totalGap = 0;
  for (let i = 1; i < onsetTimestamps.length; i++) {
    totalGap += onsetTimestamps[i] - onsetTimestamps[i - 1];
  }
  const avgGapMs = totalGap / (onsetTimestamps.length - 1);

  // Convert to BPM and clamp to musical range.
  rawBPM = Math.min(BPM_MAX, Math.max(BPM_MIN, 60000 / avgGapMs));

  // Lerp toward raw estimate — prevents jumpy tempo readings.
  estimatedBPM = estimatedBPM + (rawBPM - estimatedBPM) * BPM_LERP_RATE;
}


// ─── getBPM ───────────────────────────────────────────────────────────────
// Getter for the current smoothed BPM estimate.
// estimatedBPM is a module-level let — exporting via a getter function
// ensures callers always read the latest value.
// ─────────────────────────────────────────────────────────────────────────

export function getBPM() { return estimatedBPM; }


// ================================
// AUDIO ANALYSIS — UPDATE (called every frame from drawFrame)
//
// Each frame: reads the latest FFT data from the AnalyserNode for band
// energies and onset detection, reads the latest Meyda callback result for
// chroma, RMS, and spectral centroid, and writes everything into audioData.
//
// New in M3 (Meyda refactor): chroma, amplitude, and spectralBrightness now
// come from latestMeydaFeatures rather than manual FFT analysis.
// Kept from M2: spectral flux onset detection, band energies (legacy).
//
// Falls back to idle values when paused or not yet loaded, so the aurora
// continues its ambient animation rather than freezing.
// ================================

export function updateAudioData() {
  const audioPlayer = document.getElementById('audio-player');

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
    };
    return;
  }

  // Read current FFT magnitudes into freqData (0–255 per bin).
  // Used for spectral flux onset detection. Chroma / amplitude / brightness
  // are sourced from Meyda — not from this buffer.
  analyser.getByteFrequencyData(freqData);

  // --- Chroma extraction (via Meyda) ---
  //
  // Meyda provides chroma as a 12-element array (index 0 = C, index 11 = B),
  // each value 0.0–1.0, normalized so the loudest pitch class in the buffer
  // equals 1.0. We lerp smoothedChroma toward the new raw values each frame
  // to bridge the gaps between Meyda's buffer-rate callbacks (~46ms intervals)
  // and the render loop's per-frame cadence (~16ms at 60fps).
  //
  // If latestMeydaFeatures is null (Meyda hasn't fired its first callback yet),
  // we hold smoothedChroma at its current values — no lerp step this frame.
  const rawChroma = latestMeydaFeatures ? latestMeydaFeatures.chroma : smoothedChroma;
  for (let i = 0; i < 12; i++) {
    smoothedChroma[i] = lerp(smoothedChroma[i], rawChroma[i], CHROMA_LERP_RATE);
  }

  // Detect dominant and secondary pitch classes from smoothed chroma.
  const { dominantPitch, secondaryPitches } = getDominantPitches(smoothedChroma);

  // --- Amplitude (via Meyda RMS) ---
  // Meyda's rms value is already 0.0–1.0 — no normalization needed.
  // Falls back to 0.04 (idle level) before the first Meyda callback fires.
  // isNaN guard: Meyda can return NaN for rms during the brief gap when a new
  // track starts decoding — treat NaN as absence of a valid reading.
  const rawRms  = latestMeydaFeatures ? latestMeydaFeatures.rms : NaN;
  const amplitude = (!isNaN(rawRms)) ? rawRms : 0.04;

  // --- Spectral brightness (via Meyda spectralCentroid) ---
  // spectralCentroid is the weighted mean frequency in Hz. Dividing by the
  // Nyquist frequency (sampleRate / 2) normalizes it to 0.0–1.0.
  // Higher values → brighter, more treble-heavy sound (strings, cymbals).
  // Lower values  → darker, bass-heavy sound (cello, bass guitar, kick drum).
  // Per the research, timbre modifies saturation + lightness, not hue.
  // Falls back to 0.3 (neutral) when Meyda hasn't fired or returns NaN.
  // Note: spectralCentroid != null passes for NaN (NaN !== null), so the
  // isNaN check is required in addition to the null guard.
  const rawCentroid = latestMeydaFeatures ? latestMeydaFeatures.spectralCentroid : NaN;
  const spectralBrightness = (rawCentroid != null && !isNaN(rawCentroid))
    ? rawCentroid / (audioCtx.sampleRate / 2)
    : 0.3;

  // --- Onset detection (spectral flux — unchanged from M2) ---
  // Still reads from freqData directly; Meyda cannot provide this because
  // onset detection requires per-render-frame snapshots, not buffer-rate callbacks.
  const { isBeat, beatIntensity } = detectOnset(freqData);

  // Update BPM estimate on every detected onset.
  if (isBeat) updateBPMEstimate();

  // --- DEBUG: throttled console logging (once per second) ---
  // Remove this entire block before the next milestone.
  const debugNow = performance.now();   // DEBUG
  if (debugNow - debugLastLogTime >= 1000) {   // DEBUG
    debugLastLogTime = debugNow;   // DEBUG
    const meydaReady = latestMeydaFeatures ? 'yes' : 'no';   // DEBUG
    const rawStr     = Array.from(rawChroma).map(v => v.toFixed(3)).join(', ');   // DEBUG
    const smthStr    = Array.from(smoothedChroma).map(v => v.toFixed(3)).join(', ');   // DEBUG
    const domName    = dominantPitch >= 0 ? PITCH_CLASS_NAMES[dominantPitch] : '(none)';   // DEBUG
    const secNames   = secondaryPitches.length > 0   // DEBUG
      ? secondaryPitches.map(p => `${p}(${PITCH_CLASS_NAMES[p]})`).join(', ')   // DEBUG
      : '(none)';   // DEBUG
    const chromaMax    = Math.max(...smoothedChroma);   // DEBUG
    const chromaMin    = Math.min(...smoothedChroma);   // DEBUG
    const chromaSpread = (chromaMax - chromaMin).toFixed(3);   // DEBUG
    console.log(`[Meyda]           ready: ${meydaReady} | rms: ${amplitude.toFixed(3)} | centroid (norm): ${spectralBrightness.toFixed(3)}`);   // DEBUG
    console.log(`[Chroma raw]      ${rawStr}`);   // DEBUG
    console.log(`[Chroma smoothed] ${smthStr}`);   // DEBUG
    console.log(`[Chroma spread]   max: ${chromaMax.toFixed(3)} | min: ${chromaMin.toFixed(3)} | spread: ${chromaSpread}`);   // DEBUG
    console.log(`[Pitch]           dominant: ${dominantPitch} (${domName}) | secondary: ${secNames}`);   // DEBUG
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
  };
}
