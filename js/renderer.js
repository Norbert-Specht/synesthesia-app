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
import { getProfileColor, activeProfile } from './profiles.js';
import { renderMode } from './ui.js';
import { ribbons } from './ribbons.js';


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

function drawRibbonAurora(ribbon, time) {
  if (ribbon.opacity < 0.005) return;

  const { h, s, l } = ribbon.hsl;

  // --- Build left and right edge arrays (bottom → top) ---
  // One point every 6 canvas pixels — sufficient resolution for smooth polygon
  // curvature; half the step count of the old fillRect approach.
  const STEPS = Math.ceil(canvas.height / 6);
  const leftEdge  = [];
  const rightEdge = [];

  // originFadeHeight: the vertical span of the transparent-to-opaque fade
  // at the base of the ribbon.
  //   amplitude 0 → fade spans 80% of canvas height (ribbon barely rises)
  //   amplitude 1 → fade spans 30% of canvas height (ribbon nearly full height)
  const originFadeHeight = canvas.height * (0.80 - audioData.amplitude * 0.50);

  for (let i = 0; i <= STEPS; i++) {
    const y        = canvas.height * (1 - i / STEPS);  // y=canvas.height at i=0 (bottom)
    const progress = i / STEPS;

    // Dual-frequency lateral drift. xAmplitude at 1.8% of canvas width keeps
    // ribbons reading as near-vertical curtains rather than diagonal sine strands.
    const phase1 = progress * Math.PI * 2 * ribbon.waveFreq1
                   + time * ribbon.driftSpeed + ribbon.timeOffset;
    const phase2 = progress * Math.PI * 2 * ribbon.waveFreq2
                   + time * ribbon.driftSpeed * 0.6 + ribbon.timeOffset * 0.7;
    const xAmplitude = canvas.width * 0.018;
    const cx = ribbon.xFraction * canvas.width
               + Math.sin(phase1) * xAmplitude
               + Math.sin(phase2) * xAmplitude * ribbon.wobbleRatio;

    // Thickness noise: 4.5 sine cycles along the height create organic pinch
    // points and swells in the ribbon's width. ±28% variation.
    const thickNoise = 1 + Math.sin(progress * Math.PI * 4.5
                       + time * 0.22 + ribbon.timeOffset) * 0.28;

    // coreHalfWidth: half the total core polygon width at this point.
    // Scales with per-ribbon thickness multiplier and live amplitude.
    const coreHalfWidth = canvas.width * 0.032 * thickNoise
                          * ribbon.thickness
                          * (0.7 + audioData.amplitude * 0.6);

    // Origin fade: transparent at the canvas bottom, reaching full opacity
    // at originFadeHeight above it.
    const distFromBottom = canvas.height - y;
    const originOpacity  = Math.min(1, distFromBottom / Math.max(1, originFadeHeight));
    const pointOpacity   = ribbon.opacity * originOpacity;

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

  // originFadeFrac: gradient stop position where the origin fade reaches full
  // opacity (expressed as 0.0 = canvas bottom, 1.0 = canvas top).
  const originFadeFrac = Math.min(0.95, originFadeHeight / canvas.height);

  // Ribbon midpoint values — used to anchor horizontal gradients.
  // Horizontal gradients are straight bands; the polygon clip defines the shape.
  const midIdx  = Math.floor(leftEdge.length / 2);
  const midCx   = (leftEdge[midIdx].x + rightEdge[midIdx].x) / 2;
  const midHalf = leftEdge[midIdx].coreHalfWidth;

  // Global amplitude pulse — makes the aurora visibly swell and dim with the
  // music. Applied to passes 1 and 2 via globalAlpha; pass 3 uses its own
  // amplitude formula so the core can pulse independently and more intensely.
  const dynamicOpacity = 0.45 + audioData.amplitude * 0.75;

  ctx.save();

  // -----------------------------------------------------------------------
  // PASS 1 — Atmospheric bloom
  // Wide polygon (×6 core width). Vertical gradient encodes both the origin
  // fade and the secondary-pitch atmospheric color at 0.22 max opacity.
  // 'screen' blend adds an ambient tint to the sky behind the ribbon.
  // widthMultiplier reduced from 10→6 to keep the halo close to the ribbon.
  // -----------------------------------------------------------------------

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = dynamicOpacity * ribbon.opacity;

  // Vertical gradient: bottom→top. Opacity rises from 0 at the canvas floor
  // to 0.22 at originFadeFrac, then holds — matching the origin fade geometry.
  const bloomGrad = ctx.createLinearGradient(0, canvas.height, 0, 0);
  bloomGrad.addColorStop(0.0,            `hsla(${glowH},${glowS}%,${glowL}%,0)`);
  bloomGrad.addColorStop(originFadeFrac, `hsla(${glowH},${glowS}%,${glowL}%,0.22)`);
  bloomGrad.addColorStop(1.0,            `hsla(${glowH},${glowS}%,${glowL}%,0.22)`);
  ctx.fillStyle = bloomGrad;
  buildPolygonPath(leftEdge, rightEdge, 6);
  ctx.fill();

  // -----------------------------------------------------------------------
  // PASS 2 — Main ribbon glow
  // Moderate polygon (×3.5 core width). Horizontal gradient from secondary
  // color at the edges blending to primary color at the centre (Option D).
  // Centre opacity 0.82 (down from 0.85) lets the sky show through slightly,
  // reading as semi-transparent luminous gas rather than a solid painted shape.
  // 'screen' blend adds the glow luminosity on top of the bloom layer.
  // -----------------------------------------------------------------------

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = dynamicOpacity * ribbon.opacity;

  // Gradient span matches the expanded polygon half-width at the midpoint.
  const glowSpan = midHalf * 3.5;
  const glowGrad = ctx.createLinearGradient(midCx - glowSpan, 0, midCx + glowSpan, 0);
  glowGrad.addColorStop(0.00, `hsla(${glowH},${glowS}%,${glowL}%,0)`);
  glowGrad.addColorStop(0.25, `hsla(${glowH},${glowS}%,${glowL}%,0.4)`);
  glowGrad.addColorStop(0.50, `hsla(${h},${s}%,${l}%,0.82)`);
  glowGrad.addColorStop(0.75, `hsla(${glowH},${glowS}%,${glowL}%,0.4)`);
  glowGrad.addColorStop(1.00, `hsla(${glowH},${glowS}%,${glowL}%,0)`);
  ctx.fillStyle = glowGrad;
  buildPolygonPath(leftEdge, rightEdge, 3.5);
  ctx.fill();

  // -----------------------------------------------------------------------
  // PASS 3 — Bright solid core
  // Exact core polygon (×1.0). Horizontal gradient with a near-white centre:
  // the ribbon's hue with reduced saturation and raised lightness so the spine
  // reads as luminous. 'source-over' preserves the vivid HSL color rather than
  // washing it out with additive blending.
  //
  // globalAlpha is driven purely by amplitude here (0.5–1.2, clamped to 1.0)
  // so the core pulses visibly with musical dynamics independent of the ribbon's
  // lifecycle opacity. Edges use ribbon.opacity × 0.55 for a soft falloff.
  // -----------------------------------------------------------------------

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = Math.min(1.0, 0.5 + audioData.amplitude * 0.7);

  // Near-white: reduce saturation, push lightness toward 90. Hue is retained
  // so it reads as tinted-bright, not neutral-white.
  const coreS = Math.max(s - 15, 5);
  const coreL = Math.min(l + 25, 90);

  const coreSpan = midHalf * 1.0;
  const coreGrad = ctx.createLinearGradient(midCx - coreSpan, 0, midCx + coreSpan, 0);
  coreGrad.addColorStop(0.0, `hsla(${h},${coreS}%,${coreL}%,${(ribbon.opacity * 0.55).toFixed(3)})`);
  coreGrad.addColorStop(0.5, `hsla(${h},${coreS}%,${coreL}%,${(ribbon.opacity * 0.98).toFixed(3)})`);
  coreGrad.addColorStop(1.0, `hsla(${h},${coreS}%,${coreL}%,${(ribbon.opacity * 0.55).toFixed(3)})`);
  ctx.fillStyle = coreGrad;
  buildPolygonPath(leftEdge, rightEdge, 1.0);
  ctx.fill();

  ctx.globalAlpha = 1.0;
  ctx.restore();
}


// ================================
// RIBBON SYSTEM — GLOW STICK RENDERER
//
// Renders one glow stick: a thin, intensely hot vertical neon line with a
// wide atmospheric blur that radiates outward. Three polygon passes, all
// source-over, build up from diffuse haze to a near-white hot core.
//
// Why the outer glow is so much wider than the core:
//   The ×18 outer polygon against a ×1 core polygon creates the extreme
//   core/halo contrast ratio that makes neon feel luminous. If you look at a
//   real neon tube in darkness, the glass itself is thin but the glow bleeds
//   far into the surrounding air. Without CSS blur filters or WebGL, this
//   contrast ratio is the only way to fake that effect on Canvas 2D.
//
// The "chasing glow" effect:
//   Glow sticks have asymmetric lerp rates — fast rise (0.15), slow fade
//   (0.022). When a stick fades out, the outer glow (Pass 1 and 2) stays
//   visible longer than the core, because all three passes are tied to the
//   same ribbon.opacity but the outer passes have lower absolute alpha values
//   that take longer to drop below visible threshold. The result: the wide
//   colored haze "chases" the disappearing core.
//
// Onset flare:
//   beatIntensity drives the core shoulder lightness upward (l → l+22 max).
//   The centre stop is always pure near-white (hsla 0,0%,97%) — on strong
//   beats, the shoulder catches up to that brightness and the entire core
//   briefly appears as a white-hot line before settling back to pitch color.
//
// Color source:
//   Uses the profile hue directly but forces vivid neon s/l values — the
//   profile values are calibrated for aurora (broad ambient light) and are
//   too dark for the high-contrast neon aesthetic. Hue is always preserved.
//
// Three passes (back to front):
//   Pass 1 — Wide outer glow  (×18) — horizontal gradient, 0.06–0.10 max alpha
//   Pass 2 — Inner glow       (×5)  — horizontal gradient, 0.32–0.58 alpha
//   Pass 3 — Hot core         (×1)  — near-white centre, onset-driven flare
//
// Parameters:
//   ribbon — a glow stick object from the glowsticks pool
//   time   — the shared animation time counter
// ================================

function drawRibbonGlowstick(ribbon, time) {
  if (ribbon.opacity < 0.005) return;

  // --- Color: profile hue + forced vivid neon s/l ---
  // Profile hue encodes the chromesthetic pitch identity — never override it.
  // Saturation and lightness are forced into neon ranges: the profile values
  // are calibrated for soft aurora light and would produce dim, muddy glow sticks.
  const { h } = activeProfile.pitchColors[ribbon.pitchClass];
  const s = 88 + audioData.amplitude * 10;   // always high saturation — neon quality
  const l = 55 + audioData.amplitude * 12    // mid-high lightness — readable on dark sky
            + audioData.beatIntensity * 8;    // brief lightness lift on onset

  // --- Build left and right edge arrays (bottom → top) ---
  // Same dual-sine lateral drift as aurora, but with a much thinner core.
  // coreHalfWidth × glowThickness means dominant sticks (1.0) are physically
  // wider than cluster satellites (0.35–0.45), encoding musical weight visually.
  const STEPS     = Math.ceil(canvas.height / 6);
  const leftEdge  = [];
  const rightEdge = [];

  // Glow sticks rise more decisively from the bottom than aurora ribbons —
  // amplitude shortens the fade height more aggressively (0.48 vs 0.50).
  const originFadeHeight = canvas.height * (0.72 - audioData.amplitude * 0.48);

  for (let i = 0; i <= STEPS; i++) {
    const y        = canvas.height * (1 - i / STEPS);
    const progress = i / STEPS;

    const phase1 = progress * Math.PI * 2 * ribbon.waveFreq1
                   + time * ribbon.driftSpeed + ribbon.timeOffset;
    const phase2 = progress * Math.PI * 2 * ribbon.waveFreq2
                   + time * ribbon.driftSpeed * 0.6 + ribbon.timeOffset * 0.7;
    const xAmplitude = canvas.width * 0.018;
    const cx = ribbon.xFraction * canvas.width
               + Math.sin(phase1) * xAmplitude
               + Math.sin(phase2) * xAmplitude * ribbon.wobbleRatio;

    // Thickness noise: 6 cycles at ±42% variation — more pronounced pinching
    // than aurora's 4.5 cycles / ±28%. Creates clearly visible waist points
    // along the stick that reinforce the "electric filament" quality.
    const thickNoise      = 1 + Math.sin(progress * Math.PI * 6 + time * 0.35
                            + ribbon.timeOffset) * 0.42;
    const coreHalfWidth   = canvas.width * 0.006 * ribbon.glowThickness
                            * (0.8 + audioData.amplitude * 0.4);
    const actualHalfWidth = coreHalfWidth * thickNoise;

    // Origin fade with surge: on beat, beatIntensity expands the origin upward
    // so the stick appears to jolt taller momentarily on musical attacks.
    const distFromBottom = canvas.height - y;
    const originOpacity  = Math.min(1, distFromBottom / Math.max(1, originFadeHeight));
    const surgeOpacity   = originOpacity * (0.7 + audioData.beatIntensity * 0.5);
    const pointOpacity   = ribbon.opacity * ribbon.glowIntensity * surgeOpacity;

    leftEdge.push({ x: cx - actualHalfWidth, y, pointOpacity, coreHalfWidth: actualHalfWidth });
    rightEdge.push({ x: cx + actualHalfWidth, y, pointOpacity, coreHalfWidth: actualHalfWidth });
  }

  // Midpoint values — anchor horizontal gradients at ribbon's mid-height.
  const midIdx  = Math.floor(leftEdge.length / 2);
  const midCx   = (leftEdge[midIdx].x + rightEdge[midIdx].x) / 2;
  const midHalf = leftEdge[midIdx].coreHalfWidth;

  // Onset flare: beatIntensity lifts the shoulder lightness so the core glows
  // hotter on musical attacks. 0 beatIntensity → shoulder at l+18.
  // Full beatIntensity → shoulder at l+22 (catches up to the near-white centre).
  const flareL = l + audioData.beatIntensity * 22;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1.0;   // all opacity is baked into gradient stop alphas below

  // -----------------------------------------------------------------------
  // PASS 1 — Wide outer glow (the "chasing" blur)
  // Very wide polygon (×18 core width). Low alpha (0.06–0.10) — this is the
  // diffuse atmosphere around the stick, not the colored body. The ×18 spread
  // means the visible haze radius is ~18× the core half-width, which is what
  // creates the impression of a glowing hot source radiating into dark space.
  // Opacity baked into the gradient: ribbon.opacity × ribbon.glowIntensity so
  // fainter pitch classes (satellites, tertiaries) produce proportionally
  // fainter halos without separate alpha calculations.
  // -----------------------------------------------------------------------

  const p1Span = midHalf * 18;
  const p1Grad = ctx.createLinearGradient(midCx - p1Span, 0, midCx + p1Span, 0);
  p1Grad.addColorStop(0.0, `hsla(${h},${s}%,${l}%,0.00)`);
  p1Grad.addColorStop(0.3, `hsla(${h},${s}%,${l}%,${(0.06 * ribbon.opacity * ribbon.glowIntensity).toFixed(3)})`);
  p1Grad.addColorStop(0.5, `hsla(${h},${s}%,${l}%,${(0.10 * ribbon.opacity * ribbon.glowIntensity).toFixed(3)})`);
  p1Grad.addColorStop(0.7, `hsla(${h},${s}%,${l}%,${(0.06 * ribbon.opacity * ribbon.glowIntensity).toFixed(3)})`);
  p1Grad.addColorStop(1.0, `hsla(${h},${s}%,${l}%,0.00)`);
  ctx.fillStyle = p1Grad;
  buildPolygonPath(leftEdge, rightEdge, 18);
  ctx.fill();

  // -----------------------------------------------------------------------
  // PASS 2 — Inner intense glow
  // Moderate polygon (×5 core width). This is the vivid colored body of the
  // neon tube — bright enough to clearly read as the pitch color but still
  // transparent (0.32–0.58) so the sky shows through and overlapping sticks
  // produce additive color mixing rather than opaque blobs.
  // l+8 at the centre gives the inner glow a slightly lighter, more saturated
  // core, transitioning toward the near-white hot centre in Pass 3.
  // -----------------------------------------------------------------------

  const p2Span = midHalf * 5;
  const p2Grad = ctx.createLinearGradient(midCx - p2Span, 0, midCx + p2Span, 0);
  p2Grad.addColorStop(0.00, `hsla(${h},${s}%,${l}%,0.00)`);
  p2Grad.addColorStop(0.25, `hsla(${h},${s}%,${l}%,${(0.32 * ribbon.opacity * ribbon.glowIntensity).toFixed(3)})`);
  p2Grad.addColorStop(0.50, `hsla(${h},${s}%,${Math.min(99, Math.round(l + 8))}%,${(0.58 * ribbon.opacity * ribbon.glowIntensity).toFixed(3)})`);
  p2Grad.addColorStop(0.75, `hsla(${h},${s}%,${l}%,${(0.32 * ribbon.opacity * ribbon.glowIntensity).toFixed(3)})`);
  p2Grad.addColorStop(1.00, `hsla(${h},${s}%,${l}%,0.00)`);
  ctx.fillStyle = p2Grad;
  buildPolygonPath(leftEdge, rightEdge, 5);
  ctx.fill();

  // -----------------------------------------------------------------------
  // PASS 3 — Hot core
  // Exact core polygon (×1). Five stops build the temperature gradient:
  //   Edges (0.0, 1.0): pitch color, slightly desaturated — where the stick
  //     meets the Pass 2 glow
  //   Shoulders (0.3, 0.7): lighter and more desaturated — the heated zone.
  //     flareL drives these toward the centre brightness on onset so the
  //     whole core briefly appears uniformly white-hot on strong beats.
  //   Centre (0.5): pure near-white hsla(0,0%,97%) — the hottest point.
  //     Achromatic so it reads as emitted white light rather than a color.
  //     This stop is always near-white regardless of pitch class, because
  //     the hottest part of any neon plasma is always colorless.
  // -----------------------------------------------------------------------

  const p3Span = midHalf * 1.0;
  const p3Grad = ctx.createLinearGradient(midCx - p3Span, 0, midCx + p3Span, 0);
  p3Grad.addColorStop(0.0, `hsla(${h},${Math.round(s - 10)}%,${Math.round(l)}%,${(0.55 * ribbon.opacity).toFixed(3)})`);
  p3Grad.addColorStop(0.3, `hsla(${h},${Math.round(s - 30)}%,${Math.min(99, Math.round(flareL + 18))}%,${(0.88 * ribbon.opacity).toFixed(3)})`);
  p3Grad.addColorStop(0.5, `hsla(0,0%,97%,${(0.98 * ribbon.opacity).toFixed(3)})`);
  p3Grad.addColorStop(0.7, `hsla(${h},${Math.round(s - 30)}%,${Math.min(99, Math.round(flareL + 18))}%,${(0.88 * ribbon.opacity).toFixed(3)})`);
  p3Grad.addColorStop(1.0, `hsla(${h},${Math.round(s - 10)}%,${Math.round(l)}%,${(0.55 * ribbon.opacity).toFixed(3)})`);
  ctx.fillStyle = p3Grad;
  buildPolygonPath(leftEdge, rightEdge, 1);
  ctx.fill();

  ctx.globalAlpha = 1.0;
  ctx.restore();
}
