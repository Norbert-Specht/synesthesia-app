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

  // -----------------------------------------------------------------------
  // NOTE NAME LABEL — diagnostic display for pitch verification
  // Shows pitch class name (C, C#, D etc.) at the bottom of each glow stick.
  // Remove this block once pitch detection is verified against known recordings.
  // -----------------------------------------------------------------------

  const PITCH_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const label = PITCH_NAMES[ribbon.pitchClass];

  const labelSize = 52;
  const labelPad  = 10;
  const labelW    = labelSize + labelPad * 2;
  const labelH    = labelSize + labelPad * 2;
  const labelX    = cx - labelW / 2;
  // 72px = controls bar height, 16px = gap above bar, 12px = internal padding
  const labelY    = canvas.height - labelH - 72 - 16;

  // Dark background square — gives the white text contrast against the canvas.
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = ribbon.opacity * 0.82;
  ctx.fillStyle   = 'rgba(6, 8, 16, 0.88)';
  ctx.fillRect(labelX, labelY, labelW, labelH);

  // Note name text.
  ctx.globalAlpha  = ribbon.opacity;
  ctx.fillStyle    = '#ffffff';
  ctx.font         = `400 ${labelSize}px 'Plus Jakarta Sans', system-ui, sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, labelY + labelH / 2);

  // Reset text and composite state.
  ctx.globalAlpha  = 1.0;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}
