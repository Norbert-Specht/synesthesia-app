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
//
// Three-canvas aurora stack — all fixed full-viewport, stacked by z-index.
//
// Why three canvases instead of one:
//   CSS filter:blur applied to a canvas element blurs everything already
//   drawn on it as a composited layer. This is the most efficient way to
//   create a soft atmospheric glow — the GPU composites the blur after all
//   bristle polygons are written, so separate bristles merge into one
//   continuous glowing shape. ctx.filter would blur each bristle separately,
//   producing individually blurred strands that never blend together.
//
//   The core canvas has no blur — those bristles must stay razor-sharp
//   to create the hot bright filaments inside the glow mass.
//
//   The background canvas (sky + stars) is separate from the aurora stack
//   so clearing it each frame doesn't disturb the other two, and so
//   glow stick mode can hide both aurora canvases cleanly.
// ================================

// Background canvas — sky gradient and stars only (z-index 0 in CSS)
export const canvas = document.getElementById('aurora-canvas');
export const ctx    = canvas.getContext('2d');

// Glow canvas — solid vivid bristle shapes; CSS blur(20px) applied via stylesheet
// All glow bristles draw here each frame; the element-level blur composites them.
const glowCanvas = document.getElementById('aurora-glow-canvas');
const glowCtx    = glowCanvas.getContext('2d');

// Core canvas — thin bright bristle lines; no blur (z-index 2 in CSS)
// These bristles render sharp on top of the diffused glow layer.
const coreCanvas = document.getElementById('aurora-core-canvas');
const coreCtx    = coreCanvas.getContext('2d');

// Match all three canvas pixel dimensions to the viewport on load and every resize.
// Without this, canvases default to 300×150px and everything stretches.
export function resizeCanvas() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width      = w;  canvas.height      = h;
  glowCanvas.width  = w;  glowCanvas.height  = h;
  coreCanvas.width  = w;  coreCanvas.height  = h;
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

  // Clear the aurora bristle canvases at the start of each frame.
  // The background canvas is cleared implicitly by the sky gradient fillRect below.
  // glowCtx and coreCtx must be cleared explicitly — they don't fill their entire
  // area each frame (bristles only cover part of each canvas).
  glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
  coreCtx.clearRect(0, 0, coreCanvas.width, coreCanvas.height);

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
// RIBBON SYSTEM — CONTEXT-TARGETED POLYGON PATH BUILDER
//
// Identical to buildPolygonPath() but targets a caller-supplied context
// instead of always drawing on the main ctx. Used by aurora bristle rendering
// so individual bristles can be routed to glowCtx or coreCtx independently.
//
// The original buildPolygonPath() remains in place and unchanged — it is
// still used by drawRibbonGlowstick() which always draws on the main ctx.
//
// Parameters:
//   targetCtx       — CanvasRenderingContext2D to draw on (glowCtx or coreCtx)
//   leftEdge        — array of {x, y} points; left core boundary, bottom→top
//   rightEdge       — array of {x, y} points; right core boundary, bottom→top
//   widthMultiplier — expansion factor beyond core half-width (1.0 = exact polygon)
// ================================

function buildPolygonPathOnCtx(targetCtx, leftEdge, rightEdge, widthMultiplier) {
  targetCtx.beginPath();

  const n = leftEdge.length;

  // Trace left edge upward; each point expanded outward from the centerline.
  for (let i = 0; i < n; i++) {
    const lx = leftEdge[i].x;
    const rx = rightEdge[i].x;
    const cx = (lx + rx) / 2;
    const ax = cx - (cx - lx) * widthMultiplier;
    if (i === 0) targetCtx.moveTo(ax, leftEdge[i].y);
    else         targetCtx.lineTo(ax, leftEdge[i].y);
  }

  // Trace right edge back downward to close the polygon.
  for (let i = n - 1; i >= 0; i--) {
    const lx = leftEdge[i].x;
    const rx = rightEdge[i].x;
    const cx = (lx + rx) / 2;
    const ax = cx + (rx - cx) * widthMultiplier;
    targetCtx.lineTo(ax, leftEdge[i].y);
  }

  targetCtx.closePath();
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


// ================================
// RIBBON SYSTEM — AURORA RENDERER (BRISTLE-BASED, TWO-CANVAS)
//
// Why bristles instead of one polygon:
//   A single solid polygon reads as a flat painted shape — no internal texture,
//   no sense of depth. Real aurora has visible vertical striations: individual
//   luminous rays with slightly different paths, widths, and brightnesses.
//   Five bristle polygons sharing the same overall path but with per-bristle
//   x-offsets and thickness scales produce these striations naturally. The gaps
//   between them emerge from geometry, not explicit gap drawing.
//
// Why two canvases:
//   Glow bristles (3 of 5) render on glowCtx, which receives CSS blur(20px)
//   as a DOM-level filter. This means all bristles composite first, then the
//   entire layer blurs as a single image — creating a wide, soft atmospheric
//   glow that correctly bleeds between adjacent strands. ctx.filter would blur
//   each bristle independently before compositing, preventing the merging.
//
//   Core bristles (2 of 5, isBright=true) render on coreCtx with no blur.
//   These stay razor-sharp — thin hot filaments sitting on top of the glow.
//
// Why glow bristles use solid color fills (not gradients):
//   The blur IS the gradient. A solid-color polygon blurred by 20px becomes
//   a soft glow shape with natural falloff at all edges. Using a gradient
//   inside a blurred polygon would double-apply the falloff, making edges
//   too weak. The vivid solid fill + CSS blur produces the intended effect.
//
// Why core bristles are 22% of glow bristle width:
//   At 22%, core bristles are thin enough to read as individual filaments
//   rather than competing with the glow mass. Too thick and they look like
//   solid painted bars; too thin and they disappear below the blur.
//
// How bristle gap texture emerges:
//   Each bristle has a random xOffset (±0.7 × half-width) and thicknessScale
//   (0.5–1.05). The combination means some bristles are shifted left, some
//   right; some wide, some narrow. Where two bristles don't overlap, the
//   sky/stars show through. The result is an organic fibrous texture across
//   the full ribbon height without any explicit gap-drawing code.
//
// Why heightScale creates slightly different bristle lengths:
//   Real aurora rays don't all reach the same altitude. heightScale (0.88–1.0)
//   means 1–2 bristles terminate slightly below the top of the ribbon, adding
//   a ragged-top appearance that looks more atmospheric than a flat ceiling.
// ================================

function drawRibbonAurora(ribbon, time) {
  if (ribbon.opacity < 0.005) return;

  // getAuroraColor forces vivid saturation/lightness regardless of profile values.
  // Profile hue is always preserved — it carries the chromesthesia identity.
  const { h, s, l } = getAuroraColor(ribbon.pitchClass);

  // Composite ribbon opacity: lifecycle × musical role intensity.
  // Individual bristles multiply this by their own opacityScale.
  const ribbonOpacity = ribbon.opacity * (ribbon.glowIntensity ?? 1.0);

  // Base half-width for the ribbon — bristles offset and scale from this.
  // Amplitude scaling makes the ribbon fan wider on loud passages.
  const baseHalfWidth = canvas.width * 0.028 * ribbon.thickness
                        * (0.7 + audioData.amplitude * 0.6);

  // Draw all 5 bristles — each routes to glowCtx or coreCtx via isBright.
  ribbon.bristles.forEach(bristle => {
    drawBristle(ribbon, bristle, time, h, s, l, ribbonOpacity, baseHalfWidth);
  });

  // Note label draws on the main ctx (always sharp, always on top of the aurora stack).
  drawNoteLabel(ribbon);
}


// ================================
// AURORA RENDERER — SINGLE BRISTLE
//
// Renders one bristle of an aurora ribbon onto glowCtx or coreCtx.
//
// Bright bristles (bristle.isBright === true) → coreCtx — sharp, thin, no blur.
// Glow bristles → glowCtx — receives CSS blur(20px) at the element level.
//
// The bristle follows the same underlying sine wave path as the ribbon but with
// a per-bristle xOffset and phaseOffset. Width varies along the bristle's height
// using the same three-frequency noise as before, scaled by bristle.thicknessScale.
//
// Glow bristles use a solid color fill — the CSS blur on glowCtx IS the soft
// edge falloff. A gradient fill inside a blurred polygon would double-apply
// the alpha falloff and make edges too weak.
//
// Core bristles use a horizontal gradient (vivid color → near-white at center)
// to create the hot filament appearance on the sharp canvas.
//
// Parameters:
//   ribbon        — ribbon object (xFraction, waveFreq1/2, driftSpeed, etc.)
//   bristle       — bristle descriptor from ribbon.bristles[]
//   time          — shared animation time counter
//   h, s, l       — aurora-specific HSL color from getAuroraColor()
//   ribbonOpacity — ribbon.opacity × glowIntensity composite
//   baseHalfWidth — base ribbon half-width at current amplitude
// ================================

function drawBristle(ribbon, bristle, time, h, s, l, ribbonOpacity, baseHalfWidth) {
  // Route to the correct canvas: bright bristles → sharp core canvas,
  // glow bristles → blurred atmospheric canvas.
  const targetCtx  = bristle.isBright ? coreCtx : glowCtx;
  const w          = canvas.width;
  const h_canvas   = canvas.height;

  // One point every 5 canvas pixels — slightly coarser than the old geometry
  // loop (4px) to reduce work since we now run this loop 5× per ribbon.
  const STEPS    = Math.ceil(h_canvas / 5);
  const leftEdge  = [];
  const rightEdge = [];

  for (let i = 0; i <= STEPS; i++) {
    // heightScale — some bristles are slightly shorter than the full ribbon
    // height, creating a ragged top edge that reads as atmospheric.
    const maxProgress = bristle.heightScale;
    const progress    = (i / STEPS) * maxProgress;
    const y           = h_canvas * (1 - progress);

    // ── Trajectory — same three-component path as the ribbon ──────────────
    // phaseOffset is added to both phases so the bristle's path diverges
    // slightly from the ribbon center — this is what creates the visible
    // striations between bristles.
    const phase1 = progress * Math.PI * 2 * ribbon.waveFreq1
                   + time * ribbon.driftSpeed
                   + ribbon.timeOffset
                   + bristle.phaseOffset;
    const phase2 = progress * Math.PI * 2 * ribbon.waveFreq2
                   + time * ribbon.driftSpeed * 0.55
                   + ribbon.timeOffset * 0.7
                   + bristle.phaseOffset * 0.6;
    const drift  = Math.sin(
                     progress * Math.PI * 0.6
                     + time * 0.06
                     + ribbon.timeOffset * 2.1
                   ) * w * 0.032;

    const xAmplitude = w * 0.018;
    // Bristle center x: ribbon path + bristle lateral offset.
    // xOffset is a fraction of baseHalfWidth * 2 (full ribbon width) so it
    // scales proportionally with ribbon size — narrow ribbons get tighter gaps.
    const cx = ribbon.xFraction * w
               + Math.sin(phase1) * xAmplitude
               + Math.sin(phase2) * xAmplitude * ribbon.wobbleRatio
               + drift
               + bristle.xOffset * baseHalfWidth * 2;

    // ── Brush stroke width variation — same three-frequency noise ──────────
    const slow   = Math.sin(progress * Math.PI * 1.2 + time * 0.07 + ribbon.timeOffset);
    const medium = Math.sin(progress * Math.PI * 2.8 + time * 0.13 + ribbon.timeOffset * 1.3);
    const fast   = Math.sin(progress * Math.PI * 6.1 + time * 0.21 + ribbon.timeOffset * 0.7);
    const combined = slow * 0.65 + medium * 0.25 + fast * 0.10;

    const amplitudeFan    = audioData.amplitude;
    const maxExpansion    = 0.8 + amplitudeFan * 1.6;
    const thickMultiplier = Math.max(0.05, 1.0 + combined * maxExpansion);

    // Bristle half-width: ribbon base × brush noise × bristle's own thicknessScale.
    // Core bristles (isBright) are 22% as wide as glow bristles —
    // thin enough to read as individual filaments inside the glow mass.
    const bristleHalfWidth = baseHalfWidth
                             * thickMultiplier
                             * bristle.thicknessScale
                             * (bristle.isBright ? 0.22 : 1.0);

    // ── Opacity along the bristle length ──────────────────────────────────
    // Origin fade: transparent at the canvas bottom, opaque above originFadeH.
    // lengthOpacity: more opaque where the bristle is wide (brush pressure model).
    const originFadeH    = h_canvas * (0.80 - audioData.amplitude * 0.50);
    const distFromBottom = h_canvas - y;
    const originOpacity  = Math.min(1, distFromBottom / Math.max(1, originFadeH));
    const lengthOpacity  = Math.max(0.08, 0.6 + slow * 0.55);
    const pointOpacity   = ribbonOpacity
                           * bristle.opacityScale
                           * lengthOpacity
                           * originOpacity;

    leftEdge.push({ x: cx - bristleHalfWidth, y, pointOpacity, bristleHalfWidth });
    rightEdge.push({ x: cx + bristleHalfWidth, y, pointOpacity, bristleHalfWidth });
  }

  // ── Render onto target canvas ─────────────────────────────────────────────
  targetCtx.save();
  targetCtx.globalCompositeOperation = 'source-over';
  targetCtx.globalAlpha = 1.0;

  const midI   = Math.floor(leftEdge.length / 2);
  const avgOpacity = leftEdge.reduce((sum, p) => sum + p.pointOpacity, 0) / leftEdge.length;
  const avgX   = (leftEdge[midI].x + rightEdge[midI].x) / 2;
  const avgHW  = leftEdge[midI].bristleHalfWidth;

  if (bristle.isBright) {
    // ── Core bristle — thin, near-white filament, drawn sharp on coreCtx ──
    // Horizontal gradient: vivid color at edges → near-white at center.
    // The gradient on the sharp canvas creates the "hot filament" look.
    buildPolygonPathOnCtx(targetCtx, leftEdge, rightEdge, 1.0);
    const coreGrad = targetCtx.createLinearGradient(
      avgX - avgHW, 0, avgX + avgHW, 0
    );
    coreGrad.addColorStop(0.0, `hsla(${h}, ${s}%,      ${l}%,      ${0.50 * avgOpacity})`);
    coreGrad.addColorStop(0.3, `hsla(${h}, ${s - 15}%, ${l + 15}%, ${0.85 * avgOpacity})`);
    coreGrad.addColorStop(0.5, `hsla(0,    0%,          97%,        ${0.95 * avgOpacity})`);
    coreGrad.addColorStop(0.7, `hsla(${h}, ${s - 15}%, ${l + 15}%, ${0.85 * avgOpacity})`);
    coreGrad.addColorStop(1.0, `hsla(${h}, ${s}%,      ${l}%,      ${0.50 * avgOpacity})`);
    targetCtx.fillStyle = coreGrad;
    targetCtx.fill();

  } else {
    // ── Glow bristle — solid vivid color, drawn on glowCtx ──────────────
    // Solid color fill (not gradient) because the CSS blur IS the soft edge.
    // A gradient inside a blurred polygon would double-apply falloff,
    // making the glow edges too weak and the body too dim.
    buildPolygonPathOnCtx(targetCtx, leftEdge, rightEdge, 1.0);
    // Removed the 0.85 reduction — CSS blur provides edge transparency naturally.
    // Full opacity at the bristle center gives the vivid core needed for luminosity.
    targetCtx.fillStyle = `hsla(${h}, ${s}%, ${l}%, ${avgOpacity})`;
    targetCtx.fill();
  }

  targetCtx.restore();
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
