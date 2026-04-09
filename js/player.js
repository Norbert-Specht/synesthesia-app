// =============================================================================
// SYNESTHESIA APP — player.js
// =============================================================================
//
// Audio element playback controls: file loading, play/pause toggle,
// progress bar scrubbing, and time display.
//
// This module is a side-effect import — it sets up all event listeners when
// imported and exports nothing. main.js imports it as:
//   import './player.js';
// =============================================================================

import { audioCtx, meydaAnalyzer, initAudioContext, resetMeydaFeatures, resetAudioState } from './audio.js';
import { resetVisualization } from './ribbons.js';


// ================================
// UI ELEMENTS
// ================================

const landingEl           = document.getElementById('landing');
const controlsEl          = document.getElementById('controls');
const trackNameEl         = document.getElementById('track-name');
const timeDisplayEl       = document.getElementById('time-display');
const progressBarEl       = document.getElementById('progress-bar');
const progressFillEl      = document.getElementById('progress-fill');
const progressHandleEl    = document.getElementById('progress-handle');
const playPauseBtn        = document.getElementById('play-pause-btn');
const iconPlay            = document.getElementById('icon-play');
const iconPause           = document.getElementById('icon-pause');
const uploadInput         = document.getElementById('audio-upload');
const uploadControlsInput = document.getElementById('audio-upload-controls');
const audioPlayer         = document.getElementById('audio-player');


// ================================
// PROGRESS BAR — TIME FORMATTER
//
// Converts a raw seconds value into the m:ss display format used in the
// time display (e.g. 2:14, 0:09, 1:03).
//
// Why Math.floor instead of Math.round:
//   Rounding would make 2:59.6 display as 3:00 while the bar still shows
//   < 100%, creating a mismatch. Flooring keeps the display consistent
//   with the bar position.
//
// Parameters:
//   seconds — number; elapsed or total playback time in seconds
//
// Returns: string — 'm:ss' format, or '--:--' if seconds is not finite
//   (NaN and Infinity both trigger '--:--'; seen when duration is unknown
//    immediately after a new track src is set, before metadata loads)
// ================================

function formatTime(seconds) {
  if (!isFinite(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  // padStart ensures seconds always render as two digits: 2:04 not 2:4
  return `${m}:${s.toString().padStart(2, '0')}`;
}


// ================================
// PROGRESS BAR — UPDATE DISPLAY
//
// Synchronises the progress bar fill, handle position, and time display with
// the audio element's current playback position. Driven by timeupdate events
// (fires ≈4 times/second during playback) and also called directly after seeks
// and on loadedmetadata so the display updates immediately.
//
// Skips the update if isDragging is true — the drag handlers own the visual
// state during scrubbing and calling this would cause a snap-back to the
// last committed playback position.
// ================================

function updateProgressBar() {
  if (isDragging) return;

  const duration = audioPlayer.duration;
  const current  = audioPlayer.currentTime;
  const fraction = (isFinite(duration) && duration > 0) ? current / duration : 0;

  progressFillEl.style.width  = `${fraction * 100}%`;
  progressHandleEl.style.left = `${fraction * 100}%`;
  timeDisplayEl.textContent   = `${formatTime(current)} / ${formatTime(duration)}`;
}


// ================================
// PROGRESS BAR — DRAG SCRUBBING
//
// Three-event drag pattern: mousedown on the bar begins the drag; mousemove
// on the document updates the visual position while the button is held;
// mouseup on the document commits the seek and ends the drag.
//
// Why seek only on mouseup, not on every mousemove:
//   Setting audioPlayer.currentTime triggers a browser decode-and-seek
//   operation that is CPU-intensive and interrupts audio output briefly.
//   Seeking on every pixel of mouse movement (~60 events/second during a
//   fast drag) would produce choppy audio and stall the render loop.
//   Instead, the visual (fill width and handle left) updates instantly on
//   every mousemove, while exactly one seek fires when the user releases.
//
// getFractionFromEvent:
//   Converts a MouseEvent's clientX into a 0.0–1.0 fraction of the bar's
//   rendered width. getBoundingClientRect() is used rather than offsetX
//   because offsetX is relative to the event target element — during a drag
//   that may be any element under the cursor, not #progress-bar itself.
//   The result is clamped to [0, 1] so dragging past either end is safe.
// ================================

// True while the user is holding the mouse button down on the bar.
// updateProgressBar() checks this flag to suppress timeupdate visual updates
// during a drag, preventing a snap-back to the pre-drag playback position.
let isDragging = false;

// --- Helpers ---

// Converts a MouseEvent's clientX to a 0–1 progress fraction of the bar.
function getProgressFraction(e) {
  const rect = progressBarEl.getBoundingClientRect();
  return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
}

// Applies a 0–1 fraction to the fill width and handle position without
// touching audioPlayer.currentTime. Used by both drag and click handlers.
function setVisualProgress(fraction) {
  progressFillEl.style.width  = `${fraction * 100}%`;
  progressHandleEl.style.left = `${fraction * 100}%`;
}

// --- Event listeners ---

progressBarEl.addEventListener('mousedown', (e) => {
  isDragging = true;
  // Jump the handle to the click point immediately so it doesn't lag behind
  // the cursor between mousedown and the first mousemove.
  setVisualProgress(getProgressFraction(e));
  // Prevent the browser from initiating a text selection or image drag
  // while the user holds the button down and moves the mouse.
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const fraction = getProgressFraction(e);
  // Update the visual position each pixel of movement — instant feedback.
  setVisualProgress(fraction);
  // Also update the time display so the user can read what time they will
  // land on when they release (scrub preview).
  const duration = audioPlayer.duration;
  timeDisplayEl.textContent =
    `${formatTime(fraction * duration)} / ${formatTime(duration)}`;
});

document.addEventListener('mouseup', (e) => {
  if (!isDragging) return;
  isDragging = false;
  // Single seek at drag end — the one and only currentTime assignment for
  // the entire drag interaction. Also covers a plain click (mousedown +
  // immediate mouseup without movement).
  const fraction = getProgressFraction(e);
  const duration = audioPlayer.duration;
  if (isFinite(duration) && duration > 0) {
    audioPlayer.currentTime = fraction * duration;
  }
  // Sync the display to the seeked position immediately; the next timeupdate
  // may not fire until up to ~250ms later.
  updateProgressBar();
});


// ================================
// PROGRESS BAR — AUDIO ELEMENT EVENTS
//
// timeupdate    — fires ≈4 times/second during playback; keeps the bar moving
// loadedmetadata— fires once when duration becomes available after a new src
//                 is set; lets the total time render before playback starts
// ended         — fires when the track finishes; resets to full position
// ================================

audioPlayer.addEventListener('timeupdate',     updateProgressBar);
audioPlayer.addEventListener('loadedmetadata', updateProgressBar);
audioPlayer.addEventListener('ended',          updateProgressBar);


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
  // audioCtx is a live binding from audio.js — it reflects the value set by
  // initAudioContext() above.
  if (audioCtx.state === 'suspended') audioCtx.resume();

  // Free the previous blob URL to avoid memory leaks.
  // revokeObjectURL is safe to call here — the audio element will be
  // given a new src immediately below.
  if (audioPlayer.src) URL.revokeObjectURL(audioPlayer.src);

  // Reset Meyda's cached features so the previous track's values don't
  // persist into the new track's first frames. updateAudioData() will fall
  // back to neutral idle values until the new track's first Meyda callback fires.
  resetMeydaFeatures();

  // Reset transient audio analysis state — clears smoothed chroma, flux
  // history, and beat intensity so the previous track's values don't bleed
  // into the first frames of the new track.
  resetAudioState();

  // Clear all ribbons and glow sticks and reset debounce state so the
  // visualization starts clean. Without this, ribbons from the previous
  // track stay frozen on screen while the new track's audio plays.
  resetVisualization();

  // Reset the progress bar to zero. Duration is unknown at this point
  // (the audio element hasn't parsed the new file yet), so total time
  // shows '--:--' until the loadedmetadata event fires.
  setVisualProgress(0);
  timeDisplayEl.textContent = '0:00 / --:--';

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
    // Restart Meyda when resuming — it was stopped on pause to avoid processing
    // silence and populating latestMeydaFeatures with noise-floor chroma values.
    if (meydaAnalyzer) meydaAnalyzer.start();
    audioPlayer.play();
    setPlayState(true);
  } else {
    audioPlayer.pause();
    // Stop Meyda on pause — no audio to analyze, no need to run the callback.
    // latestMeydaFeatures retains its last value; updateAudioData() uses idle
    // fallback while paused regardless (the !audioPlayer.paused guard fires first).
    if (meydaAnalyzer) meydaAnalyzer.stop();
    setPlayState(false);
  }
});

// Reset icon to play state when the track finishes naturally
audioPlayer.addEventListener('ended', () => setPlayState(false));
