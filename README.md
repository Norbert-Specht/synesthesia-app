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
- **Web Audio API** — real-time audio analysis (frequency, amplitude, beat detection)
- **Canvas API** — animated color visualizations
- **GitHub** — version control and collaboration
- **Vercel or Netlify** — deployment (TBD)

---

## Synesthesia Research Foundation

This section is the conceptual core of the project. Design and feature decisions are grounded in it.

### What is Chromesthesia?

Chromesthesia (also called sound-to-color synesthesia) is a form of synesthesia where auditory stimuli — notes, chords, keys, timbres, rhythms — automatically and involuntarily trigger color perception. It affects roughly 4% of the population. For chromesthetes:

- Colors are **consistent over time** — middle C is always the same color for a given person
- The experience is **involuntary** — they cannot switch it off
- Colors may appear **projected in space** ("projectors") or in the mind's eye ("associators")

### Key Perceptual Mappings (Research-Informed)

These are the audio dimensions we analyze and map to visual properties:

| Audio Feature | Visual Property | Research Basis |
|---|---|---|
| **Pitch / Frequency** | Brightness / Lightness | Higher notes → lighter colors; lower notes → darker |
| **Timbre** | Hue | Instrument character drives color family |
| **Amplitude / Volume** | Saturation / Intensity | Louder = more vivid, more saturated |
| **Tempo / Rhythm** | Animation speed, pulse rate | Faster tempo → faster color transitions |
| **Musical Key** | Base color palette | Keys have strong cross-synesthete color associations |
| **Chord quality** | Color temperature | Major = warm; Minor = cool/dark |

### Notable Key-Color Associations (Cross-Synesthete Patterns)

These are recurring patterns observed across multiple synesthetes in research:

- **C major** — white, pure, bright
- **D major** — golden yellow, triumphant
- **E major** — bright yellow, luminous
- **F major** — red, earthy
- **G major** — warm orange-gold
- **A major** — bright, clear
- **B minor** — dark, cold, steel blue
- **D minor** — grey, melancholic

---

## Profile System

The core UX concept of the app. Users choose *whose* synesthetic experience they want to explore.

### Profile Types

#### 🎼 Famous Synesthete Profiles
Documented color mappings from known chromesthetes. Profiles to implement:

- **Nikolai Rimsky-Korsakov** (1844–1908) — Russian composer; one of the most thoroughly documented synesthetic palettes in music history
- **Franz Liszt** (1811–1886) — reportedly instructed his orchestra by color ("more pink here", "not so violet")
- **Pharrell Williams** (b. 1973) — contemporary musician with documented chromesthesia
- *(More to be researched and added — see `docs/research.md`)*

#### 🔬 Research Themes
Curated presets based on aggregate scientific data. Easy starting points for non-synesthetes:

- **Warm Spectrum** — based on majority warm-tone associations from Ward & Eagleman studies
- **Cool Spectrum** — cooler, darker palette common in minor-key associations
- **Classic / Neutral** — balanced palette derived from Cytowic's research

#### ✏️ Custom Profiles
Users build their own profiles via a **mood-based color picker** — not a music theory exercise. The app asks 3 simple questions:
1. Pick a color for major keys
2. Pick a color for minor keys
3. Pick a color for your favorite key

From those 3 inputs the app interpolates the full 24-key palette. The user makes 3 decisions, the app makes 21. Profiles are stored in localStorage and will be exportable/shareable in a future milestone.


---

## Feature Roadmap

### Milestone 1 — Foundation
- [ ] Project structure and file setup
- [ ] GitHub repo initialized
- [ ] Audio file upload and basic playback
- [ ] README and docs in place

### Milestone 2 — Audio Analysis
- [ ] Web Audio API integration
- [ ] Real-time frequency extraction
- [ ] Amplitude tracking
- [ ] Basic beat detection

### Milestone 3 — Color Mapping
- [ ] Profile data structure defined
- [ ] Rimsky-Korsakov profile implemented
- [ ] Research theme presets implemented
- [ ] Color mapping logic (audio features → color values)

### Milestone 4 — Visualization
- [ ] Canvas-based animated color display
- [ ] Reacts to live audio in real-time
- [ ] Profile switcher UI
- [ ] Visual polish

### Milestone 5 — Custom Profiles & Polish
- [ ] Custom profile builder UI
- [ ] localStorage persistence
- [ ] Pharrell Williams + Liszt profiles added
- [ ] Responsive design

### Milestone 6 — Deployment
- [ ] Vercel or Netlify deployment
- [ ] Custom domain (optional)
- [ ] Spotify API integration (stretch goal)

---

## Visual Design Direction

The visualization is a **full-screen aurora borealis experience**. This metaphor resolves the core complexity challenge of chromesthesia (multiple simultaneous colors) elegantly and beautifully.

### Core Principles
- **Full-screen immersive** — no chrome, no distractions while music plays
- **Fluid spatial zones** — frequency bands occupy vertical zones on screen, like aurora ribbons. Not rigid bands — breathing, overlapping, organic
- **Translucency and blending** — colors overlap with transparency, preventing visual mud
- **Organic movement** — Perlin noise or sine wave functions drive movement, never mechanical or abrupt
- **Pulse on beat** — rhythm drives pulse intensity across all zones simultaneously

### Frequency Band → Spatial Zone Mapping
```
Top of screen     ← melody / high frequencies  (bright, fast, arcing)
Middle of screen  ← midrange / harmony          (warm, medium drift)
Bottom of screen  ← bass / low frequencies      (deep, slow, pulsing)
```

### Color as a Pipeline
Color is never a fixed value — it is the output of a sequential pipeline:
```
Base hue (from musical key / profile)
  → shifted by timbre (instrument character)
  → saturated/desaturated by amplitude (dynamics)
  → brightened/darkened by pitch (frequency)
  = final rendered color
```

See `docs/visual-design.md` for full detail.

---

## Open Design Questions

| Question | Status | Decision |
|---|---|---|
| Whose synesthesia do we visualize? | ✅ Decided | Famous profiles + Research themes + Custom profiles |
| Visualization style | ✅ Decided | Full-screen aurora borealis, fluid frequency zones |
| Custom profile complexity | ✅ Decided | 3 user inputs, app interpolates remaining 21 keys |
| Color rendering approach | ✅ Decided | Pipeline model: key → timbre → amplitude → pitch |
| Spotify integration scope | 🔲 Open | Stretch goal for now |
| Mobile support priority | 🔲 Open | TBD |
| WebGL vs Canvas | 🔲 Open | TBD in Milestone 4 — WebGL preferred for performance |

---

## Project Structure

```
synesthesia-app/
├── README.md               ← You are here. Also Claude's briefing document.
├── index.html
├── css/
│   └── style.css
├── js/
│   └── main.js
├── assets/
│   └── audio/              ← Test audio files
└── docs/
    └── research.md         ← Extended synesthesia research notes
```

---

## How to Use This README When Working with Claude

Paste the relevant sections of this README at the start of any new Claude session. Suggested prompt structure:

> *"Here's my project README for context: [paste README or relevant sections]. We're currently on Milestone [X]. Last session we completed [Y]. Today I want to work on [Z]."*

This gives Claude full project context immediately, since Claude has no memory between conversations.

---

## References & Further Reading

- Cytowic, R.E. — *Synesthesia: A Union of the Senses* (2002)
- Ward, J. & Eagleman, D. — Research on synesthetic color associations and pitch
- Rimsky-Korsakov documented key-color table — see `docs/research.md`
- [Wikipedia: Chromesthesia](https://en.wikipedia.org/wiki/Chromesthesia)

---

*This project is built in collaboration with Claude (Anthropic) as both a creative and educational endeavor.*
