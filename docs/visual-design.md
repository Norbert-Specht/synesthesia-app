# Visual Design — Synesthesia App

> This document captures all visual design decisions for the Synesthesia App. It is a living document — update it whenever a design decision is made or revised.

---

## The Core Metaphor: Aurora Borealis

The visualization is modeled after the **aurora borealis** (northern lights). This metaphor was chosen deliberately because it solves the central design challenge of chromesthesia visualization:

**The problem:** Chromesthesia is layered — multiple simultaneous colors from melody, harmony, bass, timbre, rhythm, and dynamics all happening at once. Naive rendering becomes visual mud.

**Why aurora works:**
- Aurora has natural **spatial separation** — distinct ribbons of light occupying different zones
- Aurora uses **translucency and blending** — ribbons overlap without canceling each other out
- Aurora moves **organically** — fluid, wave-like, never mechanical
- Aurora has **scale and atmosphere** — it feels immersive and vast, not like a data visualization
- Aurora **pulses** — it breathes and responds, which maps naturally to rhythm and dynamics

The aurora metaphor transforms a complex multi-layer data problem into something that feels natural and emotionally resonant.

---

## Screen Layout

The visualizer is **full-screen** with no UI chrome visible during playback. Controls appear on hover or are tucked into a minimal overlay.

### Frequency Zone Mapping

The screen is divided into three fluid, overlapping vertical zones:

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   ≋≋≋  HIGH ZONE — melody / high frequencies  ≋≋≋  │
│         bright · fast-moving · arcing               │
│   ░░░░░░░░░░░░░░ blend zone ░░░░░░░░░░░░░░░░░░░░░  │
│                                                     │
│   ≈≈≈  MID ZONE — harmony / midrange  ≈≈≈≈≈≈≈≈≈≈  │
│         warm · medium drift · chord-driven          │
│   ░░░░░░░░░░░░░░ blend zone ░░░░░░░░░░░░░░░░░░░░░  │
│                                                     │
│   ▓▓▓  LOW ZONE — bass / low frequencies  ▓▓▓▓▓▓  │
│         deep · slow · rhythmic pulse                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Important:** These are not rigid bands with hard edges. They are **gradient fields** that bleed into each other. The blend zones between them are where the most interesting color interactions happen.

### Zone Behavior

| Zone | Frequency Range | Movement | Color Character |
|---|---|---|---|
| **High** | 2kHz–20kHz | Fast, arcing, flickering | Bright, high saturation, lighter hues |
| **Mid** | 250Hz–2kHz | Medium drift, flowing | Warm, mid-saturation, key-driven |
| **Low** | 20Hz–250Hz | Slow, rolling, pulsing on beat | Deep, dark, high saturation on peaks |

---

## Color System

### The Color Pipeline

Color is never a static value. Every rendered color is the **output of a sequential pipeline** that runs in real-time:

```
1. BASE HUE
   Source: musical key + active synesthesia profile
   Output: a hue value (0–360°) representing the tonal center

        ↓

2. TIMBRE SHIFT
   Source: dominant instrument / frequency band character
   Output: hue rotated ±30° based on timbre brightness/warmth

        ↓

3. AMPLITUDE MODULATION
   Source: volume / dynamics at this moment
   Output: saturation scaled 20%–100% with amplitude

        ↓

4. PITCH BRIGHTNESS
   Source: dominant frequency in this zone
   Output: lightness scaled — higher pitch = lighter, lower pitch = darker

        ↓

5. FINAL COLOR
   Rendered as HSL to canvas layer with opacity 0.6–0.85
   (translucency enables natural blending between zones)
```

### Why HSL, Not RGB or Hex

HSL (Hue, Saturation, Lightness) is the right color model for this project because:
- **Hue** maps directly to the musical/synesthetic concept of a note's "color"
- **Saturation** maps directly to dynamics (loud = vivid, quiet = pale)
- **Lightness** maps directly to pitch (high = bright, low = dark)

RGB and hex are output formats, not design tools. All internal color logic uses HSL.

---

## Movement & Animation

### Principles

- **No hard cuts** — all color transitions are interpolated over time
- **Organic, not mechanical** — movement uses Perlin noise or layered sine waves, not linear functions
- **Responsive to music** — the music drives every visual parameter. Nothing animates on a fixed timer independent of the audio
- **Breath and pulse** — even during sustained notes, the visualization breathes gently. Nothing is ever fully static.

### Animation Layers

| Layer | Driver | Behavior |
|---|---|---|
| **Slow drift** | Continuous, Perlin noise | Gentle horizontal/vertical movement of color fields. Always active. |
| **Harmonic pulse** | Chord changes | Gradual bloom and fade as harmony shifts |
| **Beat pulse** | Beat detection | Sharp but smooth intensity spike on each detected beat, fades quickly |
| **Dynamic swell** | Amplitude envelope | Overall brightness/saturation swells with volume |
| **Transient flash** | Attack transients | Brief brightness spike on sharp note attacks (percussive sounds) |

### Timing Parameters (Starting Points, to be tuned)

- Slow drift cycle: 8–20 seconds per full movement
- Beat pulse decay: ~300ms
- Harmonic transition: 500ms–2s depending on tempo
- Transient flash: ~80ms

---

## Interaction Design

### During Playback (Full-Screen Mode)
- No visible UI
- Mouse movement reveals a minimal translucent control bar at bottom
- Controls: pause/play, profile switcher, volume, exit full-screen
- Escape key exits full-screen

### Profile Switcher
- Accessible during playback via hover
- Switching profiles cross-fades the color palette over ~2 seconds — no jarring jump
- Active profile name shown briefly as a subtle text overlay, then fades

### Custom Profile Builder (Separate View)
A dedicated screen (not shown during playback) with:
1. **Major key color picker** — sets the warm/bright palette anchor
2. **Minor key color picker** — sets the cool/dark palette anchor
3. **Favorite key selector + color picker** — personal accent color
4. **Live preview** — a small aurora preview that responds to a short audio sample
5. **Save / Name profile** button

---

## Visual Mood Reference

The target aesthetic sits at the intersection of:

- **Scientific accuracy** — grounded in real chromesthesia research, not arbitrary color choices
- **Natural beauty** — aurora borealis as the visual template: vast, fluid, atmospheric
- **Emotional resonance** — colors that feel emotionally consistent with the music
- **Restraint** — the visualization should never compete with the music. It accompanies and illuminates.

### What to Avoid
- Hard geometric shapes or sharp edges
- Rapid strobing or epilepsy-risk patterns
- Oversaturated neon that feels like a club visualizer
- Static color blocks that don't breathe or move
- UI chrome visible during the core experience

---

## Technical Approach (To Be Finalized in Milestone 4)

### Canvas vs. WebGL
- **Canvas 2D** — simpler to implement, sufficient for 3-zone aurora at 60fps on modern hardware
- **WebGL** — better performance for complex layering, more control over blending modes, higher ceiling for visual quality

**Current preference:** Start with Canvas 2D for Milestone 4. Migrate to WebGL if performance becomes a constraint or if we want more advanced visual effects later.

### Rendering Strategy
- Each frequency zone rendered as a separate canvas layer or composited draw call
- Perlin noise library (e.g. `simplex-noise`) for organic movement
- `requestAnimationFrame` loop synced to Web Audio API analysis
- Color values computed each frame from live audio data

---

## Open Visual Design Questions

| Question | Status | Notes |
|---|---|---|
| Canvas 2D vs WebGL | 🔲 Open | Revisit in Milestone 4 |
| Perlin noise library choice | 🔲 Open | simplex-noise is leading candidate |
| Mobile layout (vertical screen) | 🔲 Open | Zone mapping may need to rotate or adapt |
| Epilepsy/accessibility considerations | 🔲 Open | Need a reduced-motion mode |
| Background color during silence | 🔲 Open | Deep near-black? Slow idle animation? |

---

*Last updated: Milestone 1 planning phase*
*See also: `README.md`, `docs/research.md`*
