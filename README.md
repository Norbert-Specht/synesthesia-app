# 🎨 Synesthesia App

> A real-time music visualizer that translates sound into color — the way synesthetes experience it.

---

## What This Project Is

The Synesthesia App analyzes music in real-time while it plays and generates a dynamic color display inspired by **chromesthesia** — the neurological phenomenon where sound involuntarily triggers color perception.

The app is built as a learning project in collaboration with Claude (Anthropic), exploring both the science of synesthesia and professional web development workflows.

---

## The Two Goals

1. **Build a beautiful, science-informed music-to-color visualizer** that lets anyone experience what it might feel like to "see" music the way synesthetes do.
2. **Learn to build and ship real projects** using LLM-assisted development, GitHub, and modern deployment pipelines.

---

## Tech Stack

- **HTML / CSS / JavaScript** — vanilla, no framework
- **Web Audio API** — real-time audio analysis (chroma extraction, amplitude, spectral flux onset detection)
- **Canvas API** — animated aurora borealis visualization
- **GitHub** — version control and collaboration
- **Vercel or Netlify** — deployment (TBD)

---

## Synesthesia Research Foundation

This section is the conceptual core of the project. All design and feature decisions are grounded in it.

### What is Chromesthesia?

Chromesthesia (also called sound-to-color synesthesia) is a form of synesthesia where auditory stimuli — notes, chords, keys, timbres, rhythms — automatically and involuntarily trigger color perception. It affects roughly 4% of the population. For chromesthetes:

- Colors are **consistent over time** — middle C is always the same color for a given person
- The experience is **involuntary** — they cannot switch it off
- Colors may appear **projected in space** ("projectors") or in the mind's eye ("associators")

### Key Research Findings (Informing Architecture)

**On polyphonic music and chords:**
Chords produce a dominant color from the root/most prominent note, with secondary notes adding nuance and tint. The experience does not fragment into one color per note — it blends, with the dominant pitch winning the primary hue and other notes subtly shifting it.

**On timbre:**
Timbre-color synesthesia is real but affects roughly 26% of chromesthetes — it is a subtype, not universal. For those who experience it, timbre modifies *lightness and saturation* of the color rather than the hue itself. Higher pitch registers produce lighter, less saturated colors; lower registers produce darker, more saturated ones.

**On pitch as the universal foundation:**
Every form of chromesthesia involves pitch → color. It is the one consistent, universal mapping across all synesthetes. Timbre and dynamics modify it, but pitch drives hue.

### Key Perceptual Mappings

| Audio Feature | Visual Property | Notes |
|---|---|---|
| **Dominant pitch class** | Hue | Primary driver — profile lookup (e.g. Rimsky-Korsakov) |
| **Secondary pitch classes** | Hue blend in glow | Nuance the dominant color without overriding it |
| **Timbre** | Lightness + saturation shift | Affects how the color looks, not which color |
| **Amplitude / dynamics** | Saturation + ribbon height | Louder = more vivid, taller ribbons |
| **Pitch register (octave)** | Lightness | Higher octave = lighter shade of same hue |
| **Onset** | Brightness pulse | Sharp spike that decays quickly |

### Notable Key-Color Associations

- **C major** — white, pure, bright
- **D major** — golden yellow, triumphant
- **E major** — bright yellow, luminous
- **F major** — red, earthy
- **G major** — warm orange-gold
- **A major** — bright, clear
- **B minor** — dark, cold, steel blue
- **D minor** — grey, melancholic

See `docs/research.md` for the full Rimsky-Korsakov palette.

---

## Visual Design Direction

The visualization is a **full-screen aurora borealis experience**.

### Core Principles

- **Full-screen immersive** — no UI chrome visible during playback
- **Vertical ribbon orientation** — ribbons rise from bottom edge, like real aurora curtains
- **Asymmetric distribution** — ribbons positioned unevenly, never evenly spaced
- **Dynamic ribbon lifecycle** — ribbons born, promoted, demoted, faded as pitch changes
- **Translucency and blending** — ribbons overlap with transparency
- **Living sky background** — dynamic deep blue-teal gradient + stars

### Ribbon Anatomy (Option B + Option D)

**The core** — tight, bright, near-neon center line. Pure dominant pitch hue.

**The glow** — wide, soft, translucent halo. Gradient shifts from dominant pitch color (inner edge) toward secondary pitch colors (outer edge). Harmonic complexity expressed as color complexity within a single ribbon.

### Ribbon Lifecycle

```
New dominant pitch detected
    → New PRIMARY ribbon rises from bottom, blooms to full brightness
    → Previous primary DEMOTES → dims, thins, becomes secondary
    → Old secondaries FADE OUT gracefully

Harmony stable
    → Ribbons hold position, breathing with dynamics and onsets
    → Glow gradient shifts subtly as chord voicing changes

Music quiet / stopped
    → All ribbons slowly fade into idle ambient state
```

### Ribbon Roles

| Role | Count | Character | Color Source |
|---|---|---|---|
| **Primary** | 1 | Brightest, tallest, most defined | Dominant pitch class → profile |
| **Secondary** | 1–2 | Dimmer, thinner, softer | Next most active pitch classes |
| **Background glow** | 1 | Wide, very soft, fills sky | Blend of all active pitch colors |

### Color Pipeline

```
Dominant pitch class (chroma analysis)
    → Profile lookup → Base HSL hue
        → Octave register → Lightness modifier
            → Timbre → Saturation modifier
                → Amplitude → Global saturation swell
                    → Onset → Brightness pulse
                        = Final rendered color
```

See `docs/visual-design.md` for full detail.

---

## Profile System

### 🎼 Famous Synesthete Profiles
- **Nikolai Rimsky-Korsakov** — first profile implemented
- **Franz Liszt** — planned Milestone 4
- **Pharrell Williams** — planned Milestone 4

### 🔬 Research Themes
- Warm Spectrum, Cool Spectrum, Classic/Neutral — planned Milestone 4

### ✏️ Custom Profiles
3-input mood picker interpolates full 12 pitch class palette. Planned Milestone 5.

---

## Feature Roadmap

### Milestone 1 — Foundation ✅
- [x] Project structure, GitHub repo, audio upload and playback
- [x] Aurora canvas with ambient animation, README and docs

### Milestone 2 — Audio Analysis ✅
- [x] Web Audio API, frequency extraction, RMS amplitude
- [x] Spectral flux onset detection
- [x] `audioData` object exposed to render loop each frame

### Milestone 3 — Pitch-to-Color + Aurora Rebuild 🔲
- [ ] Chroma feature extraction (12 pitch class energies from FFT)
- [ ] `profiles/` folder and profile data structure defined
- [ ] Rimsky-Korsakov profile as first profile (`profiles/rimsky-korsakov.js`)
- [ ] Dominant + secondary pitch class detection each frame
- [ ] Dynamic ribbon pool — born, promoted, demoted, faded
- [ ] Vertical ribbon geometry (replacing horizontal sine waves)
- [ ] Option D color gradient within ribbons (core → glow → secondary pitch colors)
- [ ] Asymmetric horizontal positioning with controlled randomness
- [ ] Dynamic sky background (music-responsive gradient + stars)
- [ ] Dynamics-driven ribbon origin point

### Milestone 4 — Profile System UI 🔲
- [ ] Profile switcher UI, cross-fade between profiles
- [ ] Liszt and Pharrell Williams profiles
- [ ] Research theme presets

### Milestone 5 — Custom Profiles & Polish 🔲
- [ ] Custom profile builder (3-input mood picker)
- [ ] localStorage persistence
- [ ] Responsive design, reduced-motion accessibility mode

### Milestone 6 — Deployment 🔲
- [ ] Vercel or Netlify, custom domain (optional)
- [ ] Spotify API integration (stretch goal)

---

## Project Structure

```
synesthesia-app/
├── README.md
├── CLAUDE.md
├── index.html
├── css/
│   └── style.css
├── js/
│   └── main.js
├── profiles/
│   └── rimsky-korsakov.js
├── assets/
│   └── audio/
└── docs/
    ├── research.md
    ├── visual-design.md
    └── audio-analysis.md
```

---

## Open Design Questions

| Question | Status | Decision |
|---|---|---|
| Whose synesthesia? | ✅ Decided | Famous profiles + Research themes + Custom |
| Visualization style | ✅ Decided | Full-screen aurora, vertical ribbons, asymmetric |
| Ribbon color model | ✅ Decided | Option B + Option D |
| Ribbon lifecycle | ✅ Decided | Dynamic — born, promoted, demoted, faded |
| Custom profile complexity | ✅ Decided | 3 inputs, app interpolates rest |
| Color pipeline | ✅ Decided | Pitch → profile → octave → timbre → amplitude → onset |
| Onset detection | ✅ Decided | Spectral flux |
| Polyphonic color | ✅ Decided | Dominant pitch wins hue, secondary pitches tint glow |
| Timbre role | ✅ Decided | Modifies lightness + saturation only |
| Dynamics → ribbon origin | 🔲 Open | Idea captured, needs implementation design |
| Canvas 2D vs WebGL | 🔲 Open | Revisit after M3 if performance is a concern |
| Mobile layout | 🔲 Open | TBD M5 |
| Epilepsy / reduced-motion | 🔲 Open | Planned M5 |
| Spotify integration | 🔲 Open | Stretch goal |

---

## How to Use This README When Working with Claude

> *"Here's my project README: [paste]. We're on Milestone [X]. Last session we completed [Y]. Today I want to work on [Z]."*

Claude has no memory between conversations — this README is Claude's briefing document.

---

## References & Further Reading

- Cytowic, R.E. — *Synesthesia: A Union of the Senses* (2002)
- Ward, J. & Eagleman, D. — synesthetic color associations and pitch
- Niccolai et al. (2012) — Timbre-color synesthesia prevalence
- Frontiers in Psychology (2025) — Timbre-color with morphed instrument timbres
- The Synesthesia Tree — chord-color and tone-color documentation
- [Wikipedia: Chromesthesia](https://en.wikipedia.org/wiki/Chromesthesia)

---

*This project is built in collaboration with Claude (Anthropic) as both a creative and educational endeavor.*
