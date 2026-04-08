// =============================================================================
// SYNESTHESIA APP — main.js
// =============================================================================
//
// Entry point only. Imports all modules and starts the render loop.
// All logic lives in the imported modules.
//
// Milestone 1: Canvas setup, aurora animation, audio upload, play/pause.
// Milestone 2: Web Audio API integration — real-time frequency extraction,
//              amplitude tracking, spectral flux onset detection. All values
//              collected into a single `audioData` object each frame.
// Milestone 3: Full rebuild — dynamic pitch-driven ribbon system.
//              Meyda chroma drives a live ribbon pool: ribbons are born,
//              promoted, demoted, and faded as the dominant pitch changes.
//              Each ribbon's color comes from the Rimsky-Korsakov profile.
//              Vertical aurora geometry replaces previous horizontal bands.
//
// Architecture overview:
//   loadAudioFile()   [player.js]
//     → initAudioContext()          (runs once; creates AudioContext pipeline)
//     → audioPlayer.play()
//
//   drawFrame()  [requestAnimationFrame loop]
//     → updateAudioData()              (Meyda + spectral flux → audioData)
//     → updateRibbonLifecycle()        (aurora: spawn / demote / fade ribbons)
//       OR updateGlowstickLifecycle()  (glowstick: spawn clusters, retire old)
//     → updateRibbonOpacities()        (aurora pool — always runs)
//       + updateGlowstickOpacities()   (glowstick pool — only in glowstick mode)
//     → drawBackground()               (sky gradient + stars)
//     → drawRibbon() × N               (router: aurora → drawRibbonAurora()
//                                               glowstick → drawRibbonGlowstick())
// =============================================================================

import { updateAudioData }                                        from './audio.js';
import { updateRibbonLifecycle, updateGlowstickLifecycle,
         updateRibbonOpacities, updateGlowstickOpacities,
         ribbons, glowsticks }                                    from './ribbons.js';
import { drawBackground, drawRibbon, resizeCanvas }               from './renderer.js';
import { renderMode }                                             from './ui.js';
import './player.js';   // side-effect import — sets up player listeners


// ================================
// AURORA — RENDER LOOP
// ================================

// `time` is a monotonically increasing counter used as the sine wave
// argument for all animated geometry. Increments ~0.016 per frame (≈ 1/60s),
// so one unit of time ≈ one second of elapsed animation at 60fps.
let time = 0;


function drawFrame() {
  // Step 1: Read from Web Audio API / Meyda → writes into audioData.
  updateAudioData();

  // Step 2: Advance the active mode's ribbon pool — spawn, demote, and fade.
  // Each mode manages its own separate pool (ribbons vs glowsticks) and uses
  // its own debounce state, so switching modes never corrupts the other pool.
  if (renderMode === 'aurora') {
    updateRibbonLifecycle();
  } else {
    updateGlowstickLifecycle();
  }

  // Step 3: Animate opacities and refresh colors for the active pool.
  // updateRibbonOpacities() always runs — it harmlessly processes an empty
  // or fading ribbons pool when in glowstick mode.
  // updateGlowstickOpacities() only runs in glowstick mode — it uses the
  // asymmetric rates (0.15 rise / 0.022 fade) that define the glow stick feel.
  updateRibbonOpacities();
  if (renderMode === 'glowstick') updateGlowstickOpacities();

  // Step 4: Draw the night sky background (gradient + stars).
  drawBackground(time);

  // Step 5: Draw the active pool back-to-front.
  // Aurora mode: secondary ribbons behind the primary (role-based sort).
  // Glow stick mode: thinner sticks behind thicker so dominant is always on top.
  if (renderMode === 'aurora') {
    [...ribbons]
      .sort((a, b) => (a.role === 'primary' ? 1 : -1))
      .forEach(r => drawRibbon(r, time));
  } else {
    [...glowsticks]
      .sort((a, b) => a.glowThickness - b.glowThickness)   // thinnest drawn first (behind)
      .forEach(s => drawRibbon(s, time));
  }

  time += 0.016;
  requestAnimationFrame(drawFrame);
}


// Start the render loop — must be called after all module imports resolve
// to avoid accessing uninitialised state.
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
drawFrame();
