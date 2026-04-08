# 🎨 Synesthesia App

> A real-time music visualizer that translates sound into color — the way synesthetes experience it.

---

## What This Project Is

The Synesthesia App analyzes music in real-time while it plays and generates a dynamic color display inspired by **chromesthesia** — the neurological phenomenon where sound involuntarily triggers color perception.

Built as a learning project in collaboration with Claude (Anthropic), exploring both the science of synesthesia and professional web development workflows.

---

## The Two Goals

1. **Build a beautiful, science-informed music-to-color visualizer** that lets anyone experience what it might feel like to "see" music the way synesthetes do.
2. **Learn to build and ship real projects** using LLM-assisted development, GitHub, and modern deployment pipelines.

---

## Tech Stack

- **HTML / CSS / JavaScript** — vanilla, no framework
- **Web Audio API** — real-time audio pipeline
- **Meyda.js** — chroma feature extraction, RMS amplitude, spectral centroid
- **Canvas API** — animated visualization (two render modes)
- **GitHub** — version control
- **Vercel or Netlify** — deployment (TBD)

---

## Synesthesia Research Foundation

### What is Chromesthesia?

Chromesthesia is a form of synesthesia where auditory stimuli — notes, chords, keys, timbres, rhythms — automatically and involuntarily trigger color perception. It affects roughly 4% of the population.

- Colors are **consistent over time** for each individual
- The experience is **involuntary** — cannot be switched off
- Colors appear **projected in space** ("projectors") or in the mind's eye ("associators")

### Key Research Findings

**On polyphonic music and chords:**
Chords produce a dominant color from the root/most prominent note, with secondary notes adding nuance and tint. The experience blends — dominant pitch wins the hue, secondary pitches subtly shift it.

**On timbre:**
Timbre-color synesthesia affects roughly 26% of chromesthetes. For those who experience it, timbre modifies lightness and saturation — not hue. Higher pitch registers produce lighter, less saturated colors.

**On pitch as the universal foundation:**
Every form of chromesthesia involves pitch → color. Pitch drives hue universally. Timbre and dynamics modify it.

### Key Perceptual Mappings

| Audio Feature | Visual Property | Notes |
|---|---|---|
| **Dominant pitch class** | Hue | Primary driver — profile lookup |
| **Secondary pitch classes** | Hue blend in glow | Nuance without overriding dominant |
| **Timbre** | Lightness + saturation shift | How the color looks, not which color |
| **Amplitude / dynamics** | Saturation + ribbon intensity | Louder = more vivid |
| **Pitch register (octave)** | Lightness | Higher = lighter shade |
| **Onset** | Brightness pulse / flare | Sharp spike, decays quickly |

---

## Visualization — Two Render Modes

The app offers two distinct visualization modes switchable via a pill UI in the top right corner. Both modes share the same audio analysis pipeline and pitch-to-color profile system.

### Why Two Modes Exist

During Milestone 3 development, Canvas 2D aurora rendering was found to have a fundamental ceiling — achieving the luminous, soft, atmospheric quality of real aurora photography requires either WebGL shaders or CSS blur filters, both of which carry significant complexity or performance trade-offs. Rather than compromise the visual quality of the aurora concept, a second mode was developed that plays to Canvas 2D's strengths.

---

### Mode A — Aurora

**Concept:** Full-screen aurora borealis. Vertical ribbon curtains of light rising from the bottom edge of the screen, driven by pitch content.

**Visual anatomy:**
- Wide atmospheric haze polygon (outermost layer)
- Main glow body polygon (mid layer)
- Bright solid core polygon (innermost)
- All rendered with `source-over` compositing and transparent HSL fills

**Known limitation:** Canvas 2D cannot fully replicate the soft luminous diffusion of real aurora. Maximum achievable quality is estimated at 50–60% of photographic reference. Full quality requires WebGL fragment shaders — planned as a future upgrade.

**Ribbon lifecycle:**
- Ribbons are born, promoted, demoted, and retired as pitch content changes
- New dominant pitch → new primary ribbon rises from bottom
- Previous primary demotes to secondary, old secondaries fade out
- Maximum 3 ribbons simultaneously

---

### Mode B — Glow Sticks

**Concept:** Neon glow sticks — thin, intensely hot vertical lines with a wide vivid blur chasing the core. Inspired by the diagnostic ribbon test that revealed Canvas 2D excels at this style of rendering.

**Why this works better in Canvas 2D:**
The glow stick aesthetic plays directly to Canvas 2D polygon rendering strengths — a sharp high-contrast core with wide transparent gradients produces genuine luminosity without needing blur filters or WebGL.

**Visual anatomy:**
- Wide outer glow polygon (wide chasing blur — the "catch up" effect)
- Inner intense glow polygon
- Near-white hot core polygon (pure white at hottest point)
- Onset flare: core briefly surges toward pure white on musical attacks

**Ribbon pool — cluster system:**

| Pitch role | Visual type | Count | Thickness |
|---|---|---|---|
| Dominant pitch | Solo individual | 1 | Thickest (1.0×) |
| Secondary pitches | Option C cluster | 2–3 each | Medium (0.68× center, 0.45×/0.35× satellites |
| Tertiary pitches (chroma > 0.35) | Solo individual | 1–2 | Thinnest (0.38×) |
| **Total maximum** | | **9** | |

**Option C cluster spacing:**
Each secondary pitch spawns one center stick + two satellites. One satellite is tight (2.8–5.5% screen width offset), one is loose (7–13% offset). This makes clusters feel organic rather than mechanical, and mirrors how chord notes have a root with surrounding tones at irregular harmonic distances.

**Timing:**
- Appear: lerp rate `0.15` — fast, snappy, energetic
- Fade: lerp rate `0.022` — slow linger, glow chases the fading core

---

## Profile System

Users choose *whose* synesthetic experience to explore.

### 🎼 Famous Synesthete Profiles
- **Nikolai Rimsky-Korsakov** — first profile implemented. Most documented synesthetic palette in music history. 12 pitch classes mapped to HSL colors.
- **Franz Liszt** — planned Milestone 4
- **Pharrell Williams** — planned Milestone 4

### 🔬 Research Themes
Warm Spectrum, Cool Spectrum, Classic/Neutral — planned Milestone 4

### ✏️ Custom Profiles
3-input mood picker interpolates full 12 pitch class palette — planned Milestone 5

---

## Audio Analysis

### Why Meyda.js

Hand-rolled FFT chroma extraction produced pitch class aliasing — C# dominated almost every frame regardless of musical content, because some pitch classes receive more FFT bins than others at common sample rates. Meyda.js handles FFT windowing, normalization, and overtone compensation correctly, producing genuine chroma separation (spread 0.6+ on clear harmonic content vs 0.2 previously).

### Pipeline

```
<audio> element
    → MediaElementSourceNode
    → AnalyserNode (fftSize 2048, smoothing 0.3)
    → AudioContext.destination

Meyda analyzer (parallel tap on sourceNode):
    → chroma[12]          — pitch class energies, smoothed via lerp
    → rms                 — amplitude
    → spectralCentroid    — timbre brightness proxy

AnalyserNode (direct):
    → spectral flux onset detection (kept independent of Meyda)

Combined → audioData object → visualization each frame
```

See `docs/audio-analysis.md` for full detail.

---

## Feature Roadmap

### Milestone 1 — Foundation ✅
- [x] Project structure, GitHub, audio upload, playback
- [x] Canvas aurora with ambient animation

### Milestone 2 — Audio Analysis ✅
- [x] Web Audio API, Meyda.js chroma extraction
- [x] RMS amplitude, spectral brightness
- [x] Spectral flux onset detection
- [x] `audioData` object each frame

### Milestone 3 — Pitch-to-Color + Visualization 🔲
- [x] Rimsky-Korsakov profile (`profiles/rimsky-korsakov.js`)
- [x] Dynamic ribbon pool — born, promoted, demoted, faded
- [x] Polygon-based rendering (replaced circle-based)
- [x] Vertical ribbon geometry
- [x] Progress bar with scrubbing and time display
- [x] Aurora / Glow mode switch UI (pill, top right)
- [ ] Glow stick cluster pool (`updateGlowstickLifecycle()`)
- [ ] Glow stick rendering (`drawRibbonGlowstick()`)
- [ ] Visual tuning pass — both modes

### Milestone 4 — Profile System UI 🔲
- [ ] Profile switcher UI, cross-fade between profiles
- [ ] Liszt and Pharrell Williams profiles
- [ ] Research theme presets

### Milestone 5 — Custom Profiles & Polish 🔲
- [ ] Custom profile builder (3-input mood picker)
- [ ] localStorage persistence
- [ ] Responsive design, reduced-motion accessibility

### Milestone 6 — Deployment 🔲
- [ ] Vercel or Netlify
- [ ] Spotify API integration (stretch goal)
- [ ] WebGL aurora rendering upgrade (stretch goal)

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
    ├── audio-analysis.md
    └── future-ideas.md
```

---

## Open Design Questions

| Question | Status | Decision |
|---|---|---|
| Whose synesthesia? | ✅ Decided | Famous profiles + Research themes + Custom |
| Visualization modes | ✅ Decided | Aurora + Glow Sticks, user-switchable pill UI |
| Aurora rendering approach | ✅ Decided | Canvas 2D polygons now, WebGL upgrade planned |
| Glow stick cluster spacing | ✅ Decided | Option C — center + tight satellite + loose satellite |
| Ribbon color model | ✅ Decided | Option B + Option D |
| Ribbon lifecycle | ✅ Decided | Dynamic — born, promoted, demoted, faded |
| Onset detection | ✅ Decided | Spectral flux via Meyda + independent AnalyserNode |
| Chroma extraction | ✅ Decided | Meyda.js — hand-rolled had pitch class aliasing |
| Polyphonic color | ✅ Decided | Dominant pitch wins hue, secondary pitches tint glow |
| Timbre role | ✅ Decided | Lightness + saturation only, not hue |
| Custom profile complexity | ✅ Decided | 3 inputs, app interpolates rest |
| WebGL aurora upgrade | 🔲 Open | Stretch goal — after deployment |
| Dynamics → ribbon origin | 🔲 Open | Implemented, needs tuning |
| Mobile layout | 🔲 Open | TBD Milestone 5 |
| Epilepsy / reduced-motion | 🔲 Open | Planned Milestone 5 |
| Spotify integration | 🔲 Open | Stretch goal |
| Mode switch as permanent feature | 🔲 Open | Pill UI for now, may redesign |

---

## How to Use This README With Claude

> *"Here's my project README: [paste]. We're on Milestone [X]. Last session we completed [Y]. Today I want to work on [Z]."*

Claude has no memory between conversations — this README is Claude's briefing document.

---

## References

- Cytowic, R.E. — *Synesthesia: A Union of the Senses* (2002)
- Ward, J. & Eagleman, D. — synesthetic color associations and pitch
- Niccolai et al. (2012) — Timbre-color synesthesia prevalence (26%)
- Frontiers in Psychology (2025) — Timbre-color with morphed instrument timbres
- The Synesthesia Tree — chord-color and tone-color documentation
- [Wikipedia: Chromesthesia](https://en.wikipedia.org/wiki/Chromesthesia)

---

*Built in collaboration with Claude (Anthropic) as both a creative and educational endeavor.*
