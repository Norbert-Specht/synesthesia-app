# Visual Design — Synesthesia App

> Living document. Update whenever a visual design decision is made or revised.
> Last updated: Milestone 3 — dual render mode system (Aurora + Glow Sticks).

---

## Why Two Render Modes Exist

During Milestone 3 development, an honest technical assessment revealed that Canvas 2D has a fundamental ceiling for aurora-quality rendering. The soft, luminous, atmospheric diffusion of real aurora borealis photographs requires either:

- **WebGL fragment shaders** — correct tool, significant complexity increase
- **CSS blur filters** — simpler but inconsistent across browsers and carries performance cost

Rather than shipping a compromised aurora or blocking progress on a WebGL rewrite, a second render mode was developed that plays directly to Canvas 2D's strengths.

A diagnostic test (rendering one ribbon with hardcoded vivid colors and source-over transparency) proved the rendering pipeline could produce genuinely luminous, electric output — but it looked more like a neon glow stick than an aurora. This observation became the Glow Stick mode concept.

**Both modes are permanent features** — the mode switch is exposed to users as a UI element, not hidden as a developer tool. Users choose which experience they prefer.

---

## Shared Visual Foundation

Both modes share:
- Same pitch-to-color profile system (Rimsky-Korsakov HSL hues)
- Same dynamic ribbon lifecycle (born, promoted, demoted, faded)
- Same sky background and stars
- Same origin fade driven by amplitude dynamics
- Same `buildPolygonPath()` helper

What differs is only the rendering of each ribbon — its width, glow shape, opacity values, and timing.

---

## Mode A — Aurora

### Concept
Full-screen aurora borealis. Vertical ribbon curtains of light rising from the bottom edge of the screen. Ribbons are broad, soft, atmospheric.

### Target Visual
Real aurora borealis photographs — broad vivid curtains with a bright core and proportional ribbon-shaped glow. Sky visible between ribbons.

### Known Limitation
Canvas 2D maximum quality estimated at 50–60% of photographic reference. The missing quality is soft luminous edge diffusion, which requires WebGL. Planned as a future upgrade (see Open Design Questions).

### Ribbon Anatomy — Three Polygon Passes

```
Pass 1 — Wide atmospheric haze
  buildPolygonPath(edges, 7)
  Very low opacity (0.07–0.11 center)
  source-over compositing
  Creates the faint color cast around the ribbon

Pass 2 — Main glow body
  buildPolygonPath(edges, 3)
  Medium opacity (0.38–0.55)
  source-over compositing
  Dominant pitch color at center, secondary pitch color at edges
  This is Option D — harmonic complexity expressed as color gradient

Pass 3 — Bright solid core
  buildPolygonPath(edges, 1)
  High opacity (0.82–0.96)
  source-over compositing
  Near-white at hottest center point
  Pure pitch color at edges
```

### Why source-over Not screen

`screen` blending was tried first — it adds colors like light physics. However:
- Screen blending only adds visible light when source colors are both bright AND have meaningful opacity
- Medium-brightness colors on a dark background with screen produce muddy intermediate mixes
- Adjacent ribbons' overlapping screen glows merged into solid shapes that darkened rather than brightened areas
- `source-over` with genuine transparency (sky visible through ribbons) is more accurate to how aurora actually looks — it IS translucent gas, not additive light

### Geometry
- Vertical sine wave path from bottom to top
- Lateral sway amplitude: `canvas.width * 0.018` — nearly vertical, gentle drift
- Core half-width: `canvas.width * 0.032` × thickness noise
- Thickness noise along ribbon length creates organic pinching and swelling
- Dynamics-driven origin fade: quiet = higher start, loud = rises from horizon

### Ribbon Pool
- Maximum 3 ribbons simultaneously
- 1 primary (dominant pitch) + up to 2 secondary
- Lifecycle: rising → active → demoting → fading → dead
- 500ms debounce before pitch transition triggers new ribbon

### Color Pipeline
```
Dominant pitch class → profile hue (h)
Saturation: Math.max(base.s, 72) + amplitude * 18   clamped 95
Lightness:  Math.max(base.l, 48) + amplitude * 14   clamped 72
            + beatIntensity * 10 (onset flash)
```
Profile hue is preserved exactly (chromesthesia identity). Saturation and lightness are forced upward to ensure colors are vivid enough to glow on a dark background.

---

## Mode B — Glow Sticks

### Concept
Neon glow sticks — thin, intensely hot vertical lines with a wide vivid blur that "chases" the core. The core appears instantly with full energy. The glow follows more slowly, like it's catching up.

### Why This Works Better Than Aurora in Canvas 2D
The glow stick aesthetic is precisely what Canvas 2D polygon rendering does well:
- Sharp high-contrast thin core → narrow polygon with near-white center gradient
- Wide transparent outer glow → large polygon with very low opacity transparent gradient
- The contrast between a crisp core and a wide soft halo reads as luminosity without needing blur filters

### Ribbon Anatomy — Three Polygon Passes

```
Pass 1 — Wide outer glow (the "chasing" blur)
  buildPolygonPath(edges, 18)   ← much wider than aurora
  Very low opacity (0.06–0.10 center)
  source-over compositing
  Creates the wide atmospheric haze around the stick

Pass 2 — Inner intense glow
  buildPolygonPath(edges, 5)
  Medium opacity (0.32–0.58)
  source-over compositing
  The vivid colored glow immediately around the core

Pass 3 — Hot core (near-white)
  buildPolygonPath(edges, 1)
  High opacity (0.88–0.98)
  source-over compositing
  Pure white (hsl 0, 0%, 97%) at center — genuinely hot
  Pitch color at edges
  On onset: center surges to pure white, then settles back
```

### Timing — Asymmetric Appear/Fade

This is the key character of glow sticks vs aurora:
- **Appear:** lerp rate `0.15` — fast, almost instant. Energy arrives suddenly.
- **Fade:** lerp rate `0.022` — slow linger. The glow chases the fading core.
- **Onset flare:** `beatIntensity > 0.5` → core lightness surges +22%. The stick flares white on musical attacks.

### Cluster System — Option C

Each pitch class spawns a cluster based on its musical role:

**Dominant pitch → Solo individual**
- 1 ribbon, `glowThickness: 1.0`, full intensity
- Positioned in an unoccupied screen zone

**Secondary pitches → Option C cluster**
- 3 ribbons: 1 center + 2 satellites
- Center: `glowThickness: 0.68`
- Satellite 1 (tight): offset 2.8–5.5% of screen width, `glowThickness: 0.45`
- Satellite 2 (loose): offset 7–13% of screen width, `glowThickness: 0.35`
- One satellite left, one right (randomized)
- Together they read as one harmonic group but individual sticks are distinguishable

**Tertiary pitches (chroma > 0.35) → Solo individual**
- 1 ribbon, `glowThickness: 0.38`, reduced intensity
- These represent ambient harmonic content not in the top 2 pitch classes

**Why Option C spacing:**
Mimics how chord notes relate — a root with surrounding tones at irregular harmonic distances. Tight satellite = close harmonic interval. Loose satellite = wider harmonic interval. More organic than evenly spaced, more readable than random.

### Ribbon Pool
- Maximum 9 glow sticks simultaneously
- Separate lifecycle function `updateGlowstickLifecycle()` — does not share state with aurora pool
- Same 500ms debounce for pitch changes

### Color Pipeline
```
Hue from profile (pitch class identity — sacred, always preserved)
Saturation: 88 + amplitude * 10   (always high — neon quality)
Lightness:  55 + amplitude * 12 + beatIntensity * 8
```
Glow sticks are always vivid. The profile hue determines which color family. Saturation and lightness are fixed high for the neon aesthetic.

---

## Shared Systems

### Sky Background
- Base: deep near-black with blue-teal cast
- Top: `hsl(skyHue, 55%, 11%)`
- Mid (0.75): `hsl(skyHue, 40%, 8%)`
- Bottom: `hsl(215, 45%, 6%)`
- `skyHue` lerps toward weighted average of active pitch hues × amplitude at rate 0.04
- Stars: 180 randomly positioned points, cached, not music-reactive

### Dynamics-Driven Origin Fade
Ribbon/stick appears to rise from the bottom edge on loud passages, starts higher on quiet ones:
```
originFadeHeight = canvas.height * (0.80 - audioData.amplitude * 0.50)
originOpacity = clamp(distFromBottom / originFadeHeight, 0, 1)
```

### buildPolygonPath(leftEdge, rightEdge, widthMultiplier)
Helper used by both modes. Traces left edge top→bottom, right edge bottom→top, creating a closed polygon expanded outward from center by `widthMultiplier`. One `ctx.fill()` call — no arc() calls anywhere. This is what solved the original performance degradation (hundreds of arc() calls per frame caused stutter after ~20 seconds).

---

## UI — Mode Switch

Pill-shaped segmented control, top right corner, always visible and active.

- Position: `top: 24px`, `right: 28px`, `z-index: 30`
- Style: glass/blur treatment matching controls bar
- Two buttons: "Aurora" | "Glow"
- Active state: cyan accent background + glow
- Inactive state: transparent, secondary text color
- May be redesigned when landing page is reworked (Milestone 5)

---

## What to Avoid (Both Modes)

- Hard geometric shapes or sharp edges in the background
- Rapid strobing (epilepsy risk)
- Perfectly even ribbon spacing (mechanical)
- Horizontal bands or waves (previous mistake — now strictly vertical)
- `ctx.arc()` in the render loop (performance killer)
- `screen` compositing on dark colors (produces muddy mixes, not light addition)

---

## Future — WebGL Aurora Upgrade

The aurora mode is planned for a WebGL rewrite in a future milestone. A fragment shader would provide:
- Genuine soft edge diffusion (Gaussian blur per-ribbon, not per-canvas)
- Internal brightness variation along ribbon length
- True luminosity — light that feels like it's emitting, not painted
- Estimated result: 85–95% of photographic reference quality

The audio analysis, ribbon lifecycle, and profile system are all rendering-agnostic — the WebGL upgrade only touches the draw functions.

---

## Open Visual Design Questions

| Question | Status | Notes |
|---|---|---|
| WebGL aurora upgrade | 🔲 Open | Stretch goal after deployment |
| Mode switch permanent design | 🔲 Open | Pill UI for now, revisit M5 |
| Mobile layout | 🔲 Open | TBD M5 |
| Epilepsy / reduced-motion | 🔲 Open | Planned M5 |
| Landing page redesign | 🔲 Open | Not priority — after core features |
| Dynamics → origin tuning | 🔲 Open | Implemented, needs perceptual tuning |

---

*See also: `README.md`, `docs/audio-analysis.md`, `docs/research.md`, `docs/future-ideas.md`*
