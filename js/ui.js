// =============================================================================
// SYNESTHESIA APP — ui.js
// =============================================================================
//
// Render mode state and the mode switch button event listeners.
//
// renderMode is exported as a live binding — any module that imports it will
// always read the current value when the variable is accessed, so no getter
// function is needed.
// =============================================================================


// ================================
// RENDER MODE
//
// Controls which draw function is used for each ribbon each frame.
// Two modes exist as permanent user-facing features (switched via the pill UI
// in the top right corner — see index.html #mode-switch, style.css section 7):
//
//   'aurora'    — broad translucent ribbon curtains. drawRibbonAurora().
//                 Three polygon passes: wide haze, main glow body, bright core.
//                 source-over compositing. Sky visible between ribbons.
//
//   'glowstick' — thin neon sticks with a wide chasing blur. drawRibbonGlowstick().
//                 Three polygon passes: wide outer glow, inner intense glow, hot core.
//                 Asymmetric appear/fade timing — fast in, slow out.
//
// Both modes share the same audio analysis pipeline, ribbon lifecycle system,
// profile color lookup, and origin fade geometry. Only the draw function differs.
//
// To add a future mode: add a new value here, add a new drawRibbon<Name>() function,
// add a branch in drawRibbon(), and add a button to #mode-switch in index.html.
// ================================

// 'aurora' | 'glowstick' — read each frame by drawRibbon() to route to the
// correct rendering function. Default is aurora on page load.
export let renderMode = 'aurora';

// Mode switch button event listeners.
// Clicking a button updates renderMode and swaps the .active class between
// the two buttons. The .active class provides the visual selected state
// (cyan tinted fill) — see style.css section 7 for the styling.
document.getElementById('mode-aurora').addEventListener('click', () => {
  renderMode = 'aurora';
  document.getElementById('mode-aurora').classList.add('active');
  document.getElementById('mode-glow').classList.remove('active');
});

document.getElementById('mode-glow').addEventListener('click', () => {
  renderMode = 'glowstick';
  document.getElementById('mode-glow').classList.add('active');
  document.getElementById('mode-aurora').classList.remove('active');
});
