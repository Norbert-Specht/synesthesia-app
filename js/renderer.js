// =============================================================================
// SYNESTHESIA APP — renderer.js
// =============================================================================
//
// Canvas setup, background drawing, and all ribbon rendering functions.
//
// Exports canvas and ctx so other modules can read canvas dimensions
// (e.g. for geometry calculations). All drawing is performed here.
// =============================================================================

import { audioData, lerp } from './audio.js';
import { getProfileColor, getAuroraColor, activeProfile } from './profiles.js';
import { renderMode, showNoteNames } from './ui.js';
import { ribbons } from './ribbons.js';


// ================================
// MODULE-LEVEL RENDERING CONSTANTS
//
// Computed once at module load. Avoids recreating strings or arrays
// inside per-frame, per-ribbon draw calls.
// ================================

// Pitch class names for the diagnostic note label in drawRibbonGlowstick().
// Index 0 = C, index 11 = B — matches Meyda's chroma vector order.
const PITCH_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// Font string for the diagnostic note label. Setting ctx.font is expensive
// (triggers a font lookup); declaring it once here avoids the cost per ribbon per frame.
const LABEL_FONT = `400 52px 'Plus Jakarta Sans', system-ui, sans-serif`;


// ================================
// CANVAS SETUP
// ================================

export const canvas = document.getElementById('aurora-canvas');
export const ctx    = canvas.getContext('2d');

// Match canvas pixel dimensions to the viewport on load and every resize.
// Without this, the canvas defaults to 300×150px and everything stretches.
export function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}


// ================================
// BACKGROUND — STATE
// ================================

// Sky background hue — lerps very slowly toward the weighted average of active
// ribbon hues. Starts at 220 (deep blue-teal) matching the night sky base color.
let skyHue = 220;

// Cached star positions — generated once on first background draw, stored as
// canvas fractions so they scale correctly on window resize.
let stars = null;


// ================================
// BACKGROUND — STAR GENERATION
//
// Generates an array of star descriptors using canvas-fraction coordinates
// so they scale correctly on window resize. Called once; result cached in `stars`.
//
// Parameters:
//   count — number of stars to generate
//
// Returns: Array of { xf, yf, radius, opacity, twinkle }
// ================================

function generateStars(count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push({
      xf:      Math.random(),          // horizontal fraction 0–1
      yf:      Math.random() * 0.65,   // upper 65% only — no stars near the horizon
      radius:  0.3 + Math.random() * 0.8,
      opacity: 0.2 + Math.random() * 0.6,
      // Per-star phase offset so each star twinkles at a different point in its cycle.
      twinkle: Math.random() * Math.PI * 2,
    });
  }
  return list;
}


// ================================
// BACKGROUND — DRAW STARS
//
// Renders cached stars with a slow sine twinkle oscillation on their opacity.
//
// Parameters:
//   time — the shared animation time counter
// ================================

function drawStars(time) {
  if (!stars) return;
  stars.forEach(s => {
    // Twinkle: ±30% opacity variation at 0.4 rad/time-unit.
    // At 60fps with time += 0.016 per frame, this is ~0.006 Hz —
    // roughly one full twinkle cycle every 160 seconds. Very slow, ambient drift.
    const twinkleOpacity = s.opacity * (0.7 + 0.3 * Math.sin(time * 0.4 + s.twinkle));
    ctx.beginPath();
    ctx.arc(s.xf * canvas.width, s.yf * canvas.height, s.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${twinkleOpacity})`;
    ctx.fill();
  });
}


// ================================
// BACKGROUND — SKY AND STARS
//
// Draws the full background each frame: sky gradient + stars.
// Generates and caches star positions on first call.
//
// skyHue lerps very slowly toward the weighted mean of active ribbon hues,
// giving the night sky a subtle harmonic tint that shifts over time.
//
// Parameters:
//   time — the shared animation time counter
// ================================

export function drawBackground(time) {
  // Generate and cache star positions on first call.
  if (!stars) stars = generateStars(180);

  // Lerp sky hue toward the opacity-weighted average of active ribbon hues.
  // 0.002 per frame is nearly imperceptible but produces a clear hue shift
  // over 10–30 seconds, tinting the sky with the dominant harmony.
  const liveRibbons = ribbons.filter(r => r.state !== 'dead' && r.opacity > 0.05);
  if (liveRibbons.length > 0) {
    const totalOpacity = liveRibbons.reduce((sum, r) => sum + r.opacity, 0);
    const weightedHue  = liveRibbons.reduce((sum, r) => sum + r.hsl.h * r.opacity, 0)
                         / totalOpacity;
    // amplitude × 0.04 makes the sky color shift faster during loud passages —
    // more responsive to musical content than a fixed 0.002 rate.
    skyHue = lerp(skyHue, weightedHue, audioData.amplitude * 0.04);
  }

  // Sky gradient: dark zenith, near-black mid, subtle warm glow near the horizon
  // from the aurora light reflected below. Brighter than before so ribbons
  // read as glowing against a visible night sky (not a black void).
  const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  skyGrad.addColorStop(0.00, `hsl(${skyHue}, 55%, 11%)`);
  skyGrad.addColorStop(0.60, `hsl(${skyHue}, 42%, 3%)`);   // mid sky — darkest point
  skyGrad.addColorStop(0.75, `hsl(${skyHue}, 40%, 8%)`);   // near horizon — aurora glow
  skyGrad.addColorStop(1.00, `hsl(215, 45%, 6%)`);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Stars drawn above the sky gradient, below the ribbon layer.
  drawStars(time);
}


// ================================
// RIBBON SYSTEM — POLYGON PATH BUILDER
//
// Constructs a closed polygon path from two edge arrays, expanding each edge
// outward from the ribbon's centerline by widthMultiplier. Called by
// drawRibbon() once per render pass — same geometry, different scale.
//
// Parameters:
//   leftEdge        — array of {x, y} points; left core boundary, bottom→top
//   rightEdge       — array of {x, y} points; right core boundary, bottom→top
//   widthMultiplier — expansion factor beyond core half-width:
//                       10   = atmospheric bloom (wide diffuse halo)
//                       3.5  = main glow
//                       1.0  = bright solid core (exact polygon)
// ================================

function buildPolygonPath(leftEdge, rightEdge, widthMultiplier) {
  ctx.beginPath();

  // Trace left edge upward (index 0 = bottom, last index = top).
  // Each expanded point reflects outward from the centerline by the multiplier.
  for (let i = 0; i < leftEdge.length; i++) {
    const lx     = leftEdge[i].x;
    const rx     = rightEdge[i].x;
    const center = (lx + rx) / 2;
    const ax     = center - (center - lx) * widthMultiplier;
    if (i === 0) ctx.moveTo(ax, leftEdge[i].y);
    else         ctx.lineTo(ax, leftEdge[i].y);
  }

  // Trace right edge back downward to close the polygon outline.
  for (let i = rightEdge.length - 1; i >= 0; i--) {
    const lx     = leftEdge[i].x;
    const rx     = rightEdge[i].x;
    const center = (lx + rx) / 2;
    const ax     = center + (rx - center) * widthMultiplier;
    ctx.lineTo(ax, rightEdge[i].y);
  }

  ctx.closePath();
}


// ================================
// RIBBON SYSTEM — RENDER MODE ROUTER
//
// drawRibbon() is the single entry point called by drawFrame() for each ribbon.
// It routes to the correct mode-specific implementation based on renderMode,
// keeping the frame loop clean and mode-agnostic.
//
// To add a new render mode:
//   1. Add a new value for renderMode (e.g. 'plasma')
//   2. Write a drawRibbonPlasma(ribbon, time) function below
//   3. Add an else-if branch here
//   4. Add a button to #mode-switch in index.html
//
// Parameters:
//   ribbon — a ribbon object from the ribbons pool
//   time   — the shared animation time counter
// ================================

export function drawRibbon(ribbon, time) {
  if (renderMode === 'aurora') {
    drawRibbonAurora(ribbon, time);
  } else {
    drawRibbonGlowstick(ribbon, time);
  }
}


// ================================
// RIBBON SYSTEM — AURORA RENDERER
//
// Renders one ribbon using polygon-based geometry: three filled polygon passes
// replace the previous ~250-slice fillRect loop. This reduces gradient object
// creation from O(canvas.height / 4) to O(1) per ribbon per frame — fixing
// the GC pressure and frame-time degradation that appeared after ~20 seconds.
//
// Three passes (back to front):
//   1. Atmospheric bloom   — widthMultiplier 6,   vertical gradient,    screen blend
//   2. Main ribbon glow    — widthMultiplier 3.5, horizontal gradient,  screen blend
//   3. Bright solid core   — widthMultiplier 1.0, horizontal gradient,  source-over
//
// Pass 3 uses source-over (not screen) so the vivid HSL core color renders
// fully opaque rather than being washed out by additive blending.
//
// Parameters:
//   ribbon — a ribbon object from the ribbons pool
//   time   — the shared animation time counter
// ================================


// ================================
// RIBBON SYSTEM — NOTE LABEL UTILITY
//
// Draws a pitch class name (C, C#, D …) at the bottom of a ribbon or glow
// stick, centered on ribbon.xFraction * canvas.width. Used by all render
// modes — call drawNoteLabel(ribbon) at the end of any draw function.
//
// Position is anchored to xFraction (the stable spawn x), not to the
// sway-adjusted cx used in aurora geometry, so labels don't oscillate.
//
// Early-returns when showNoteNames is false, so call sites need no guard.
//
// Parameters:
//   ribbon — any ribbon or glow stick object with pitchClass, xFraction,
//            and opacity properties
// ================================

function drawNoteLabel(ribbon) {
  if (!showNoteNames) return;

  const cx     = ribbon.xFraction * canvas.width;
  const label  = PITCH_NAMES[ribbon.pitchClass];
  const labelW = 52 + 10 * 2;   // labelSize + labelPad * 2
  const labelH = 52 + 10 * 2;
  const labelX = cx - labelW / 2;
  // 72px = controls bar height, 16px = gap above bar
  const labelY = canvas.height - labelH - 72 - 16;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  // Dark background square — contrast behind white text
  ctx.globalAlpha = ribbon.opacity * 0.82;
  ctx.fillStyle   = 'rgba(6, 8, 16, 0.88)';
  ctx.fillRect(labelX, labelY, labelW, labelH);

  // Note name text
  ctx.globalAlpha  = ribbon.opacity;
  ctx.fillStyle    = '#ffffff';
  ctx.font         = LABEL_FONT;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, labelY + labelH / 2);

  ctx.restore();
}


function drawRibbonAurora(ribbon, time) {
  if (ribbon.opacity < 0.005) return;

  // getAuroraColor forces vivid saturation/lightness regardless of profile values.
  // Profile hue is always preserved — it carries the chromesthesia identity.
  const { h, s, l } = getAuroraColor(ribbon.pitchClass);

  // --- Build left and right edge arrays (bottom → top) ---
  // One point every 4 canvas pixels — finer resolution than before to capture
  // the sharp width transitions of brush stroke geometry without polygon faceting.
  const STEPS = Math.ceil(canvas.height / 4);
  const leftEdge  = [];
  const rightEdge = [];

  for (let i = 0; i <= STEPS; i++) {
    const y        = canvas.height * (1 - i / STEPS);
    const progress = i / STEPS;   // 0 at bottom, 1 at top

    // ── Trajectory ──────────────────────────────────────────────────────────
    // Three components combine to give an organic, non-periodic path:
    //   phase1: primary lateral curl (medium frequency)
    //   phase2: secondary wobble (different frequency — avoids perfect repeat)
    //   drift:  slow overall lean — breaks left/right symmetry of pure sine

    const phase1 = progress * Math.PI * 2 * ribbon.waveFreq1
                   + time * ribbon.driftSpeed + ribbon.timeOffset;
    const phase2 = progress * Math.PI * 2 * ribbon.waveFreq2
                   + time * ribbon.driftSpeed * 0.55 + ribbon.timeOffset * 0.7;
    const drift  = Math.sin(
                     progress * Math.PI * 0.6
                     + time * 0.06
                     + ribbon.timeOffset * 2.1
                   ) * canvas.width * 0.032;

    const xAmplitude = canvas.width * 0.018;
    const cx = ribbon.xFraction * canvas.width
               + Math.sin(phase1) * xAmplitude
               + Math.sin(phase2) * xAmplitude * ribbon.wobbleRatio
               + drift;

    // ── Brush stroke width ──────────────────────────────────────────────────
    // Three layered noise frequencies combine into a single width multiplier:
    //   slow:   large-scale shape — 1–2 wide fans across full ribbon height
    //   medium: secondary billowing — adds internal variation to each fan
    //   fast:   local edge texture — prevents edges feeling too smooth
    //
    // Weighted sum: slow dominates (0.65) so the drama reads at large scale.
    // Combined ranges from -1 to +1:
    //   near -1 → ribbon almost disappears (thread moment)
    //   near +1 → ribbon fans dramatically wide

    const slow   = Math.sin(progress * Math.PI * 1.2
                   + time * 0.07 + ribbon.timeOffset);
    const medium = Math.sin(progress * Math.PI * 2.8
                   + time * 0.13 + ribbon.timeOffset * 1.3);
    const fast   = Math.sin(progress * Math.PI * 6.1
                   + time * 0.21 + ribbon.timeOffset * 0.7);

    const combined = slow * 0.65 + medium * 0.25 + fast * 0.10;

    // ── Amplitude modulation ────────────────────────────────────────────────
    // Loud music fans the ribbon wide. Quiet music narrows it to a thread.
    // amplitudeFan: 0.0 at silence → 1.0 at full volume
    // This is the primary musical connection for the aurora shape.
    //
    // amplitudeFan scales the RANGE of the brush stroke variation:
    //   At low amplitude: multiplier stays near 0.5–0.8 (always somewhat narrow)
    //   At high amplitude: multiplier can reach 0.05–2.6 (full dramatic range)

    const amplitudeFan = audioData.amplitude;
    const baseWidth    = canvas.width * 0.032 * ribbon.thickness;

    // thickMultiplier: minimum 0.05 so ribbon never fully disappears (Option A)
    // Maximum driven by amplitude — louder = wider possible fans
    const maxExpansion    = 0.8 + amplitudeFan * 1.6;   // 0.8→2.4 range with amplitude
    const thickMultiplier = Math.max(0.05, 1.0 + combined * maxExpansion);
    const coreHalfWidth   = baseWidth * thickMultiplier;

    // ── Opacity variation along ribbon length ───────────────────────────────
    // The ribbon is more opaque where it's wide, more transparent where thin.
    // This mirrors how a brush stroke behaves — more ink where pressure is high.
    // Opacity also modulated by the slow noise component only (large scale).

    const lengthOpacity  = Math.max(0.08, 0.6 + slow * 0.55);

    // Origin fade — ribbon appears to rise from horizon on loud passages
    const originFadeH    = canvas.height * (0.80 - audioData.amplitude * 0.50);
    const distFromBottom = canvas.height - y;
    const originOpacity  = Math.min(1, distFromBottom / Math.max(1, originFadeH));
    const pointOpacity   = ribbon.opacity * lengthOpacity * originOpacity;

    leftEdge.push({ x: cx - coreHalfWidth, y, pointOpacity, coreHalfWidth });
    rightEdge.push({ x: cx + coreHalfWidth, y, pointOpacity, coreHalfWidth });
  }

  // --- Option D: glow edge color from the complementary ribbon ---
  // Primary ribbons: edges blend toward any active secondary ribbon's hue.
  // Secondary ribbons: edges blend toward the primary ribbon's hue.
  // Falls back to the ribbon's own color if no complement is live.
  let glowH = h, glowS = s, glowL = l;
  if (ribbon.role === 'primary') {
    const sec = ribbons.find(
      r => r.role === 'secondary' && r.state !== 'dead' && r.opacity > 0.05
    );
    if (sec) { glowH = sec.hsl.h; glowS = sec.hsl.s; glowL = sec.hsl.l; }
  } else {
    const pri = ribbons.find(
      r => r.role === 'primary' && r.state !== 'dead' && r.opacity > 0.05
    );
    if (pri) { glowH = pri.hsl.h; glowS = pri.hsl.s; glowL = pri.hsl.l; }
  }

  // --- Gradient anchor ---
  // midCx: horizontal center at the ribbon midpoint, for gradient positioning.
  // avgThick: mean coreHalfWidth across all points — drives gradient sizing and
  //           the dynamic polygon multiplier calculation below.
  const midIdx  = Math.floor(leftEdge.length / 2);
  const midCx   = (leftEdge[midIdx].x + rightEdge[midIdx].x) / 2;
  const avgThick = leftEdge.reduce((sum, pt) => sum + pt.coreHalfWidth, 0) / leftEdge.length;

  // --- Thickness-responsive glow multipliers ---
  // thicknessFactor: 1.0 when avgThick equals base width; smaller when thin.
  // Thin ribbon → large multiplier (tight, intense glow relative to ribbon width).
  // Wide ribbon → smaller multiplier (soft, broad glow that doesn't overwhelm).
  const thicknessFactor = Math.max(0.3, Math.min(1.0,
    avgThick / (canvas.width * 0.032)   // normalize: 1.0 = base ribbon width
  ));

  const hazeMultiplier = 10 - thicknessFactor * 4;   // range 6–10
  const glowMultiplier =  5 - thicknessFactor * 2;   // range 3–5
  // Core multiplier stays 1.0 always — the core IS the ribbon width

  // --- Composite opacity ---
  // Baked into all gradient stop alphas so ctx.globalAlpha stays 1.0 per pass.
  // Includes: lifecycle fade × musical role intensity × amplitude pulse.
  // Clamped to 1.0 — dynamicOpacity can exceed 1.0 at high amplitudes.
  const dynamicOpacity = 0.45 + audioData.amplitude * 0.75;
  const opacity = Math.min(1.0, ribbon.opacity * (ribbon.glowIntensity ?? 1.0) * dynamicOpacity);

  ctx.save();

  // -----------------------------------------------------------------------
  // PASS 1 — Wide atmospheric haze
  // Wide polygon (hazeMultiplier, 6–10× core). Horizontal gradient, ribbon color.
  // Exponential falloff: dense luminous atmosphere tight to the core edge.
  // Thin ribbons get a proportionally wider haze; wide fans get a softer one.
  // Max stop alpha 0.07 × opacity — sky always visible through this layer.
  // 'screen' blend adds ambient tint to the sky behind the ribbon.
  // -----------------------------------------------------------------------

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 1.0;

  const hazeSpan = avgThick * hazeMultiplier;
  const hazeGrad = ctx.createLinearGradient(midCx - hazeSpan, 0, midCx + hazeSpan, 0);
  hazeGrad.addColorStop(0.0,  `hsla(${h}, ${s}%, ${l}%, 0.00)`);
  hazeGrad.addColorStop(0.12, `hsla(${h}, ${s}%, ${l}%, ${0.07  * opacity})`);
  hazeGrad.addColorStop(0.22, `hsla(${h}, ${s}%, ${l}%, ${0.04  * opacity})`);
  hazeGrad.addColorStop(0.38, `hsla(${h}, ${s}%, ${l}%, ${0.015 * opacity})`);
  hazeGrad.addColorStop(1.0,  `hsla(${h}, ${s}%, ${l}%, 0.00)`);
  ctx.fillStyle = hazeGrad;
  buildPolygonPath(leftEdge, rightEdge, hazeMultiplier);
  ctx.fill();

  // -----------------------------------------------------------------------
  // PASS 2 — Main glow body
  // Moderate polygon (glowMultiplier, 3–5× core). Horizontal gradient.
  // Exponential falloff: most energy packed in the innermost fraction of span.
  // l+6 / l+3 inner stops push brightness toward the white core.
  // Thin ribbons get a proportionally wider, more concentrated glow.
  // Max stop alpha 0.42 × opacity — sky visible through this layer.
  // 'screen' blend adds glow luminosity on top of the haze layer.
  // -----------------------------------------------------------------------

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 1.0;

  const glowSpan = avgThick * glowMultiplier;
  const glowGrad = ctx.createLinearGradient(midCx - glowSpan, 0, midCx + glowSpan, 0);
  glowGrad.addColorStop(0.0,  `hsla(${h}, ${s}%, ${l}%, 0.00)`);
  glowGrad.addColorStop(0.06, `hsla(${h}, ${s}%, ${l + 6}%, ${0.42 * opacity})`);
  glowGrad.addColorStop(0.15, `hsla(${h}, ${s}%, ${l + 3}%, ${0.24 * opacity})`);
  glowGrad.addColorStop(0.28, `hsla(${h}, ${s}%, ${l}%,     ${0.10 * opacity})`);
  glowGrad.addColorStop(0.45, `hsla(${h}, ${s}%, ${l}%,     ${0.03 * opacity})`);
  glowGrad.addColorStop(1.0,  `hsla(${h}, ${s}%, ${l}%, 0.00)`);
  ctx.fillStyle = glowGrad;
  buildPolygonPath(leftEdge, rightEdge, glowMultiplier);
  ctx.fill();

  // -----------------------------------------------------------------------
  // PASS 3 — Bright solid core
  // Exact core polygon (×1.0). Horizontal gradient with a near-white centre.
  // 'source-over' preserves vivid HSL color; all alpha baked in via opacity
  // so sky and stars remain visible even through the brightest core.
  // Max stop alpha 0.82 × opacity — center stop, hottest point.
  // -----------------------------------------------------------------------

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1.0;

  const coreSpan = avgThick * 1.0;
  const coreGrad = ctx.createLinearGradient(midCx - coreSpan, 0, midCx + coreSpan, 0);
  coreGrad.addColorStop(0.0, `hsla(${h}, ${s}%,      ${l}%,      ${0.35 * opacity})`);
  coreGrad.addColorStop(0.3, `hsla(${h}, ${s - 15}%, ${l + 14}%, ${0.65 * opacity})`);
  coreGrad.addColorStop(0.5, `hsla(0,    0%,          97%,        ${0.82 * opacity})`);
  coreGrad.addColorStop(0.7, `hsla(${h}, ${s - 15}%, ${l + 14}%, ${0.65 * opacity})`);
  coreGrad.addColorStop(1.0, `hsla(${h}, ${s}%,      ${l}%,      ${0.35 * opacity})`);
  ctx.fillStyle = coreGrad;
  buildPolygonPath(leftEdge, rightEdge, 1.0);
  ctx.fill();

  ctx.globalAlpha = 1.0;
  ctx.restore();

  drawNoteLabel(ribbon);
}


// ================================
// RIBBON SYSTEM — GLOW STICK RENDERER
//
// Renders one glow stick as a perfectly straight vertical neon tube.
// No curves, no sine drift, no thickness variation — pure neon billboard geometry.
//
// The neon tube model:
//   A real neon tube is a thin glass tube with a razor-bright core and a wide
//   atmospheric glow bleeding outward into the dark air. Without CSS blur or
//   WebGL, this is achieved by layering three horizontal fillRect passes with
//   increasing width and decreasing opacity — the extreme width contrast between
//   Pass 1 (×22 haze) and Pass 3 (×1 core) creates the perceived luminosity.
//
// Why fillRect instead of buildPolygonPath:
//   Straight vertical edges are rectangles — buildPolygonPath exists to handle
//   the curved, tapered polygons of the aurora ribbon. For straight lines,
//   fillRect is both simpler and slightly faster (no path construction).
//
// The "chasing glow" effect:
//   Glow sticks have asymmetric lerp rates — fast rise (0.15), slow fade
//   (0.022). When a stick fades, the outer haze (Pass 1) stays visible longer
//   than the core because its absolute alpha is much lower. The wide colored
//   haze "chases" the disappearing core outward.
//
// Onset flare:
//   beatIntensity drives l upward on spawn (via the color formula). The core
//   shoulder stops approach the near-white centre brightness on strong beats,
//   briefly making the whole core appear uniformly white-hot.
//
// Color source:
//   Profile hue is always preserved — it encodes chromesthetic pitch identity.
//   Saturation and lightness are forced to vivid neon ranges because the profile
//   values are calibrated for aurora (broad ambient) and would produce dim,
//   muddy glow sticks at their native values.
//
// Three passes (back to front), all source-over:
//   Pass 1 — Wide outer atmospheric haze  (×22 coreHW) — symmetric, peak at cx
//   Pass 2 — Inner vivid glow             (×7  coreHW) — symmetric, steep falloff from cx
//   Pass 3 — Hot core, near-white centre  (×1  coreHW) — symmetric, 0.60–0.98 alpha
//
// Gradient alignment rule: every gradient uses createLinearGradient(cx - W, 0, cx + W, 0)
// and every fillRect uses fillRect(cx - W, top, W * 2, bottom - top). The gradient
// position 0.5 therefore always coincides with cx — the visual brightness peak of
// all three passes lands exactly on the core center.
//
// Parameters:
//   ribbon — a glow stick object from the glowsticks pool
//   time   — the shared animation time counter (unused; kept for API consistency)
// ================================

function drawRibbonGlowstick(ribbon, time) {
  if (ribbon.opacity < 0.005) return;

  // Horizontal center of this stick — fixed at its spawn xFraction; never drifts.
  const cx = ribbon.xFraction * canvas.width;

  // Width variables — all half-widths from cx.
  // Every gradient and its matching fillRect use cx ± W so the gradient center
  // (position 0.5) always sits exactly on cx regardless of glowThickness.
  const coreHW = canvas.width * 0.004 * ribbon.glowThickness;  // core half-width
  const glowW  = coreHW * 7;    // inner glow half-width
  const hazeW  = coreHW * 22;   // outer haze half-width

  // Vertical span — full canvas height, no origin fade.
  // Straight tubes run floor to ceiling.
  const top    = 0;
  const bottom = canvas.height;

  // --- Color: profile hue + forced neon saturation and lightness ---
  // Profile hue is never overridden — it encodes the chromesthetic identity
  // of this pitch class. s and l are forced to vivid neon ranges.
  const h = activeProfile.pitchColors[ribbon.pitchClass].h;
  const s = 95 + audioData.amplitude * 5;    // near-maximum saturation — always vivid
  const l = 58 + audioData.amplitude * 10    // vivid mid-lightness baseline
            + audioData.beatIntensity * 12;   // brief flare on onset

  // Composite opacity: ribbon lifecycle fade × musical role intensity.
  // glowIntensity is 1.0 for dominant, down to 0.6 for loose satellites —
  // encoding musical weight without a separate alpha pass.
  const opacity = ribbon.opacity * ribbon.glowIntensity;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1.0;   // all alpha is baked into gradient stops below

  // -----------------------------------------------------------------------
  // PASS 1 — Wide outer atmospheric haze
  // Width: hazeW (coreHW × 22) each side.
  // Symmetric around cx (position 0.5). Gentle dome: peaks at 0.08 × opacity
  // at the centre, decays slowly outward over the full haze radius.
  // Provides the soft "light radiating into dark air" atmosphere. Low alpha
  // so it reads as ambience, not a colored body.
  // -----------------------------------------------------------------------

  const hazeGrad = ctx.createLinearGradient(cx - hazeW, 0, cx + hazeW, 0);
  hazeGrad.addColorStop(0.00, `hsla(${h}, ${s}%, ${l}%, 0.00)`);
  hazeGrad.addColorStop(0.10, `hsla(${h}, ${s}%, ${l}%, ${0.02 * opacity})`);
  hazeGrad.addColorStop(0.25, `hsla(${h}, ${s}%, ${l}%, ${0.04 * opacity})`);
  hazeGrad.addColorStop(0.40, `hsla(${h}, ${s}%, ${l}%, ${0.06 * opacity})`);
  hazeGrad.addColorStop(0.50, `hsla(${h}, ${s}%, ${l}%, ${0.08 * opacity})`);
  hazeGrad.addColorStop(0.60, `hsla(${h}, ${s}%, ${l}%, ${0.06 * opacity})`);
  hazeGrad.addColorStop(0.75, `hsla(${h}, ${s}%, ${l}%, ${0.04 * opacity})`);
  hazeGrad.addColorStop(0.90, `hsla(${h}, ${s}%, ${l}%, ${0.02 * opacity})`);
  hazeGrad.addColorStop(1.00, `hsla(${h}, ${s}%, ${l}%, 0.00)`);
  ctx.fillStyle = hazeGrad;
  ctx.fillRect(cx - hazeW, top, hazeW * 2, bottom - top);

  // -----------------------------------------------------------------------
  // PASS 2 — Inner vivid glow
  // Width: glowW (coreHW × 7) each side.
  // Symmetric around cx (position 0.5). Steep falloff: peaks at 0.75 × opacity
  // at the center (cx), drops to 0.06 at ±2.1× coreHW, nearly zero beyond that.
  // Most glow energy is concentrated within ±1.5× coreHW of the core, creating
  // the dense colored halo right against the tube that makes neon look hot.
  // l+8 at the center and l+4 at the inner shoulders step toward the white core.
  // -----------------------------------------------------------------------

  const glowGrad = ctx.createLinearGradient(cx - glowW, 0, cx + glowW, 0);
  glowGrad.addColorStop(0.00, `hsla(${h}, ${s}%, ${l}%, 0.00)`);
  glowGrad.addColorStop(0.30, `hsla(${h}, ${s}%, ${l}%, ${0.06 * opacity})`);
  glowGrad.addColorStop(0.40, `hsla(${h}, ${s}%, ${l}%, ${0.28 * opacity})`);
  glowGrad.addColorStop(0.46, `hsla(${h}, ${s}%, ${Math.min(99, Math.round(l + 4))}%, ${0.52 * opacity})`);
  glowGrad.addColorStop(0.50, `hsla(${h}, ${s}%, ${Math.min(99, Math.round(l + 8))}%, ${0.75 * opacity})`);
  glowGrad.addColorStop(0.54, `hsla(${h}, ${s}%, ${Math.min(99, Math.round(l + 4))}%, ${0.52 * opacity})`);
  glowGrad.addColorStop(0.60, `hsla(${h}, ${s}%, ${l}%, ${0.28 * opacity})`);
  glowGrad.addColorStop(0.70, `hsla(${h}, ${s}%, ${l}%, ${0.06 * opacity})`);
  glowGrad.addColorStop(1.00, `hsla(${h}, ${s}%, ${l}%, 0.00)`);
  ctx.fillStyle = glowGrad;
  ctx.fillRect(cx - glowW, top, glowW * 2, bottom - top);

  // -----------------------------------------------------------------------
  // PASS 3 — Hot core
  // Width: exactly coreHW × 1 — the razor-thin neon filament.
  // Symmetric around cx. Five stops build a heat gradient:
  //   Edges (0.0, 1.0): pitch color at full saturation — the tube wall color
  //   Shoulders (0.3, 0.7): desaturated + pushed toward white — heated zone.
  //     beatIntensity (already in l) drives these up on strong beats.
  //   Centre (0.5): pure near-white hsla(0,0%,97%) — the hottest point.
  //     Achromatic: the hottest plasma of any neon discharge is always colorless.
  // -----------------------------------------------------------------------

  const coreGrad = ctx.createLinearGradient(cx - coreHW, 0, cx + coreHW, 0);
  coreGrad.addColorStop(0.0, `hsla(${h}, ${s}%, ${l}%, ${(0.60 * opacity).toFixed(3)})`);
  coreGrad.addColorStop(0.3, `hsla(${h}, ${Math.round(s - 20)}%, ${Math.min(99, Math.round(l + 15))}%, ${(0.90 * opacity).toFixed(3)})`);
  coreGrad.addColorStop(0.5, `hsla(0, 0%, 97%, ${(0.98 * opacity).toFixed(3)})`);
  coreGrad.addColorStop(0.7, `hsla(${h}, ${Math.round(s - 20)}%, ${Math.min(99, Math.round(l + 15))}%, ${(0.90 * opacity).toFixed(3)})`);
  coreGrad.addColorStop(1.0, `hsla(${h}, ${s}%, ${l}%, ${(0.60 * opacity).toFixed(3)})`);
  ctx.fillStyle = coreGrad;
  ctx.fillRect(cx - coreHW, top, coreHW * 2, bottom - top);

  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  drawNoteLabel(ribbon);
}
