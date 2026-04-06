# Visual Design — Synesthesia App

> Living document. Update whenever a visual design decision is made or revised.
> Last updated: Milestone 3 rebuild — pitch-driven dynamic ribbon system.

---

## The Core Metaphor: Aurora Borealis

The visualization is modeled after the **aurora borealis** (northern lights). This metaphor solves the central design challenge of chromesthesia visualization — multiple simultaneous colors — elegantly and naturally.

**Why aurora works:**
- Natural **vertical ribbon structure** — curtains of light rising from the horizon, not horizontal bands
- **Asymmetric** by nature — ribbons appear at irregular horizontal positions
- **Translucency and blending** — ribbons overlap without canceling each other
- **Organic movement** — fluid, wave-like, never mechanical
- **Irregular thickness** — ribbons pinch, swell, and vary along their length
- **Atmospheric depth** — the sky behind the ribbons has color and life, not flat black

---

## Screen Layout

Full-screen. No UI chrome during playback. Controls appear on hover at the bottom.

### Layer Stack (back to front)

```
1. Sky background    — dynamic deep blue-teal gradient, music-responsive
2. Stars             — subtle static points, not music-reactive
3. Background glow   — very wide, soft blend of all active pitch colors
4. Secondary ribbons — 1–2 dimmer ribbons, subordinate pitch classes
5. Primary ribbon    — dominant pitch class, brightest, most defined
6. UI controls       — hover-reveal bar at bottom (z-index above canvas)
```

---

## Ribbon System

### Orientation

Ribbons are **vertical** — they rise from the bottom edge of the screen upward. This matches real aurora photographs and avoids the "stacked horizontal stripes" problem of the previous implementation.

Each ribbon is rendered as a sine wave path that sweeps **vertically** across the canvas height, with lateral drift along the x-axis creating the characteristic ribbon curl and movement.

### Ribbon Anatomy

Each ribbon is rendered in two passes:

**Pass 1 — Outer glow** (wide, soft, translucent)
A wide gradient field around the ribbon center. This is where secondary pitch colors live. The gradient runs from the dominant pitch color at the inner edge outward toward the secondary pitch colors at the outer edge, then fades to transparent.

```
Transparent → Secondary pitch color → Dominant pitch color → Core →
Dominant pitch color → Secondary pitch color → Transparent
```

**Pass 2 — Bright core** (narrow, near-neon, hot center)
A tight bright line at the ribbon center. Near-white at the very hottest point, becoming the pure dominant pitch hue as it moves outward a few pixels. This is the "neon" quality seen in aurora photographs.

### Ribbon Roles

| Role | Count | Opacity | Thickness | Color |
|---|---|---|---|---|
| **Primary** | 1 | 0.85–1.0 | Full | Dominant pitch class → profile |
| **Secondary** | 1–2 | 0.35–0.55 | 55–70% of primary | 2nd and 3rd most active pitch classes |
| **Background glow** | 1 | 0.08–0.18 | Full screen width | Weighted blend of all active pitches |

### Ribbon Lifecycle States

Each ribbon object carries a lifecycle state that determines how it renders and whether it persists:

```javascript
// Lifecycle states
'rising'   — newly spawned, opacity animating from 0 to target
'active'   — fully visible, responding to music
'demoting' — was primary, now becoming secondary (dims and thins)
'fading'   — being retired, opacity animating to 0
'dead'     — opacity reached 0, removed from pool
```

**Transitions:**
- New dominant pitch detected → spawn new primary ribbon in `rising` state
- Previous primary → `demoting` → becomes secondary when transition completes
- Displaced secondary → `fading` → removed when opacity reaches 0
- Maximum 3 ribbons alive at once (1 primary + 2 secondary)

### Horizontal Positioning

Ribbons are positioned asymmetrically across the screen width. When a new ribbon spawns, its x-position is chosen with controlled randomness:

- The screen is divided into loose thirds (left, center, right)
- New ribbon spawns in a third that isn't already occupied by the primary
- Within that third, position has ±15% random variation
- This ensures ribbons never stack on top of each other and never feel mechanically distributed

### Irregular Thickness

Ribbon thickness is not uniform along its length. A secondary noise function modulates the thickness at each point along the ribbon, creating pinching and swelling — matching the natural irregularity of real aurora curtains.

```
thickness(y) = baseThickness × (1 + noiseFunction(y, time) × 0.4)
```

### Dynamics and Ribbon Origin

The point where a ribbon appears to "begin" (its lowest visible point) is modulated by amplitude:

- **Quiet passages** — ribbon origin appears higher up the screen (shorter, less imposing ribbon)
- **Loud passages** — ribbon origin drops toward the bottom edge (ribbon appears to rise from the horizon)

This connects musical dynamics directly to the visual sense of scale and atmosphere.

*Implementation detail: the ribbon is always rendered from the bottom edge; the "origin" effect is achieved by fading the ribbon's opacity from zero at the bottom up to full opacity at a variable height threshold driven by amplitude.*

---

## Color System

### The Color Pipeline

Every rendered color is the output of a sequential pipeline running in real-time:

```
1. DOMINANT PITCH CLASS
   Source: chroma analysis → highest energy pitch class (C, C#, D ... B)
   Output: pitch class index (0–11)

        ↓

2. PROFILE LOOKUP
   Source: active synesthete profile (e.g. Rimsky-Korsakov)
   Output: base HSL hue (0–360°) for this pitch class

        ↓

3. OCTAVE REGISTER
   Source: dominant frequency of the pitch class
   Output: lightness modifier — higher octave = +lightness

        ↓

4. TIMBRE MODULATION
   Source: spectral brightness (ratio of high-frequency energy)
   Output: saturation shift ±15% based on instrument brightness

        ↓

5. AMPLITUDE MODULATION
   Source: RMS amplitude
   Output: saturation scaled 30%–100% with overall loudness

        ↓

6. ONSET FLASH
   Source: beatIntensity (decaying value from spectral flux detector)
   Output: lightness boost up to +20% on onset, decaying quickly

        ↓

7. FINAL COLOR
   Rendered as HSL with opacity per ribbon role
   (translucency enables natural blending between ribbons)
```

### Why HSL

- **Hue** maps to pitch class (the synesthetic color)
- **Saturation** maps to dynamics (loud = vivid, quiet = pale)
- **Lightness** maps to octave register and onset intensity

RGB and hex are output formats only. All internal color logic uses HSL.

### Secondary Pitch Colors in the Glow

The glow gradient of the primary ribbon incorporates secondary pitch colors. The blend is weighted by chroma energy:

```
glowColor = weightedBlend(
    dominantPitchColor   × 0.65,
    secondaryPitch1Color × 0.25,
    secondaryPitch2Color × 0.10
)
```

This creates a natural, research-accurate representation of how synesthetes experience chords — one dominant color with harmonic nuance in the atmosphere around it.

---

## Movement and Animation

### Principles

- **No hard cuts** — all transitions interpolated via lerp
- **Organic, not mechanical** — dual sine waves with different frequencies and offsets
- **Always moving** — even during silence, ribbons breathe gently
- **Music-responsive** — every visual parameter has an audio driver

### Animation Layers

| Layer | Driver | Behavior |
|---|---|---|
| **Ribbon drift** | Time + sine functions | Slow lateral sway of ribbon body |
| **Thickness pulse** | Zone energy + onset | Ribbon swells on loud moments |
| **Origin fade** | Amplitude | Bottom fade point rises/falls with dynamics |
| **Onset flash** | beatIntensity | All ribbons brighten briefly on onset |
| **Color transition** | Pitch class change | Hue lerps when dominant pitch shifts |
| **Sky gradient** | Amplitude + pitch blend | Background hue shifts with musical energy |
| **Star twinkle** | Optional slow noise | Very subtle, not music-reactive |

### Lerp Rates

| Parameter | Rate | Perceptual character |
|---|---|---|
| Ribbon opacity (rising) | 0.03 | Slow bloom — ~2 seconds to full |
| Ribbon opacity (fading) | 0.02 | Slower fade — graceful exit |
| Color hue transition | 0.04 | Smooth, not snapping |
| Thickness | 0.08 | Medium response |
| Onset intensity | 0.20 | Fast attack, handled by decay in audio |
| Sky gradient | 0.02 | Very slow, atmospheric |

---

## Sky Background

### Base Color

Deep near-black with a blue-teal cast: `hsl(220, 45%, 6%)` as the base. Not pure black — it has the atmospheric quality of a real night sky.

### Dynamic Shift

Each frame, the sky gradient target hue is pulled slightly toward the weighted average of all active pitch class hues, scaled by amplitude. At low amplitude the sky barely shifts. At high amplitude it picks up more color from the music.

```
skyHue = lerp(skyHue, weightedActiveHueAverage, amplitude × 0.015)
```

### Stars

Randomly positioned points, rendered once and cached. Very low opacity (0.3–0.7). Optional slow twinkle via a noise function on opacity. Not reactive to music — they provide a stable sense of depth and distance.

---

## Visual Mood Reference

Target aesthetic:
- **Scientific accuracy** — grounded in chromesthesia research
- **Natural beauty** — aurora borealis as visual template
- **Emotional resonance** — colors feel consistent with the music
- **Restraint** — visualization accompanies music, never competes

### What to Avoid
- Hard geometric shapes or sharp edges
- Rapid strobing (epilepsy risk)
- Oversaturated neon that reads as a club visualizer
- Static elements that don't breathe
- Perfectly even ribbon spacing (mechanical)
- Horizontal bands (previous mistake)

---

## Technical Approach

### Canvas 2D
Starting with Canvas 2D. Sufficient for the ribbon system at 60fps on modern hardware. Revisit WebGL if performance becomes a constraint after M3.

### Rendering Strategy
- Sky background rendered first each frame (fillRect with gradient)
- Stars rendered second (cached point positions)
- Background glow ribbon rendered third (very wide, low opacity)
- Secondary ribbons rendered fourth
- Primary ribbon rendered last (on top)
- UI controls overlay via CSS z-index (not canvas)

---

## Open Visual Design Questions

| Question | Status | Notes |
|---|---|---|
| Canvas 2D vs WebGL | 🔲 Open | Revisit after M3 |
| Dynamics → ribbon origin exact implementation | 🔲 Open | Bottom-fade approach described above, needs tuning |
| Star twinkle — music-reactive or not | ✅ Decided | Not reactive — provides stable depth reference |
| Mobile layout (vertical screen) | 🔲 Open | TBD M5 |
| Epilepsy / reduced-motion mode | 🔲 Open | Planned M5 |

---

*See also: `README.md`, `docs/audio-analysis.md`, `docs/research.md`*
