# 🎨 Synesthesia App

> A real-time music visualizer that translates sound into color — the way people with chromesthesia experience music.

[![Status](https://img.shields.io/badge/status-active%20development-blue)]()
[![Stack](https://img.shields.io/badge/stack-vanilla%20JS-yellow)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

---

## What It Is

The Synesthesia App listens to music in real-time and generates a dynamic visual display based on **chromesthesia** — the neurological phenomenon where sound involuntarily triggers color perception. Roughly 4% of the population experiences this, including musicians like Pharrell Williams, Rimsky-Korsakov, and Billy Joel.

The app extracts the dominant pitch from the music each frame, maps it to a color using a documented synesthete's color palette, and renders it as an animated full-screen visualization. The result is a window into how synesthetes literally experience music — not a generic equalizer or beat visualizer, but a scientifically grounded pitch-to-color translation.

**Built in collaboration with Claude (Anthropic)** as both a creative project and a learning exercise in LLM-assisted development.

---

## Two Visualization Modes

Switch between modes via the settings panel (gear icon, top right).

### 🌌 Aurora Mode

Vertical curtains of light rising from the bottom of the screen, inspired by the northern lights. Each ribbon represents an active pitch class. The dominant pitch spawns a primary ribbon. Secondary pitches spawn subordinate ribbons alongside it.

The aurora uses a **two-canvas bristle system**:
- Each ribbon is rendered as 9 individual bristles — think of how an aurora curtain is made of many individual magnetic field lines, each slightly different
- A blurred canvas handles the soft atmospheric glow (CSS `filter: blur`)
- A sharp canvas handles the bright hot cores on top
- Ribbon width breathes with amplitude — loud passages fan dramatically wide, quiet moments narrow to near-invisible threads

### ⚡ Glow Mode

Straight vertical neon tubes — think neon billboard lights. Each pitch class becomes a thin intensely bright line with a vivid color glow that radiates outward. The dominant pitch gets the thickest brightest tube. Secondary and tertiary pitches spawn as clusters with satellite tubes at irregular spacings, mirroring how chord tones relate harmonically.

---

## The Science Behind It

### Chromesthesia Research

The color system is grounded in documented synesthetic research, not arbitrary color choices:

- **Pitch drives hue** — every chromesthete maps pitch classes to colors. It's the universal foundation.
- **Chords blend** — a chord produces a dominant color from the root note, with secondary notes subtly tinting the surrounding glow. Not one color per note — a blend with a clear dominant.
- **Timbre modifies lightness and saturation** — not hue. The same note on a violin and a trumpet is the same color, just different brightness and vividness.
- **Dynamics drive intensity** — louder passages produce more vivid, more saturated color. Quiet passages produce pale, delicate color.

### How Pitch Detection Works

```
Audio file upload
    → Web Audio API → AnalyserNode
    → Meyda.js (parallel tap)
        → chroma[12]        — energy per pitch class (C through B)
        → rms               — overall amplitude
        → spectralCentroid  — timbre brightness proxy
    → Spectral flux onset detection (independent)
    → audioData object → visualization each frame
```

Meyda.js handles FFT windowing and overtone compensation — critical for accurate chroma extraction from polyphonic music. Hand-rolled chroma extraction was tried first and produced pitch class aliasing (one note always dominated regardless of the music). Meyda produces genuine chroma separation with 0.6+ spread on clear harmonic content.

---

## Synesthete Profiles

Users choose *whose* synesthetic experience they're exploring. The profile determines the pitch-to-color mapping.

### Currently Implemented

**Nikolai Rimsky-Korsakov (1844–1908)**
One of the most thoroughly documented synesthetic palettes in music history. The Russian composer mapped all 12 pitch classes to specific colors — C major as white, D major as golden yellow, E major as sapphire blue, and so on. His color associations directly influenced his orchestration choices.

**Pharrell Williams (b. 1973)**
The Grammy-winning producer maps the 7 musical notes to the 7 colors of the visible spectrum — red through violet — with sharps and flats interpolated between their neighbors. The most vivid and intuitive of the profiles.

### Planned

- Research theme presets (Warm Spectrum, Cool Spectrum, Classic/Neutral)
- Custom profile builder — pick 3 colors, app interpolates the full 12-note palette

---

## Tech Stack

- **HTML / CSS / JavaScript** — vanilla, no framework, no build tool
- **Web Audio API** — real-time audio pipeline
- **Meyda.js** — chroma feature extraction, RMS, spectral centroid
- **Canvas API** — two-canvas aurora rendering, glow stick rendering
- **ES Modules** — modular JS architecture, 6 focused files

### Project Structure

```
synesthesia-app/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── main.js         ← entry point, render loop
│   ├── audio.js        ← Web Audio API, Meyda, chroma, onset detection
│   ├── renderer.js     ← aurora bristles, glow sticks, background, labels
│   ├── ribbons.js      ← ribbon pool, lifecycle, cluster spawning, BPM
│   ├── profiles.js     ← profile system, color pipeline
│   ├── player.js       ← upload, playback, progress bar
│   └── ui.js           ← settings sidebar, render mode, note names toggle
├── profiles/
│   ├── rimsky-korsakov.js
│   └── pharrell-williams.js
└── docs/
    ├── decision-log.md     ← full history of decisions and rationale
    ├── visual-design.md    ← visual architecture documentation
    ├── audio-analysis.md   ← audio pipeline documentation
    └── research.md         ← synesthesia research notes
```

---

## Current Status

### ✅ Complete

**Milestone 1 — Foundation**
Audio file upload, playback controls, progress bar with scrubbing, time display, full-screen canvas, ambient aurora animation.

**Milestone 2 — Audio Analysis**
Meyda.js chroma extraction (12 pitch class energies per frame), RMS amplitude, spectral brightness, spectral flux onset detection (genre-agnostic — works on classical, jazz, electronic, acoustic), BPM estimation from onset density.

**Milestone 3 — Visualization**
Both render modes fully working. Dynamic ribbon lifecycle (pitch-driven, born/promoted/demoted/faded). Aurora two-canvas bristle system. Glow stick cluster system. Settings sidebar with mode switch and note names toggle. BPM-driven animation speed (faster music = faster transitions). Both Rimsky-Korsakov and Pharrell Williams profiles implemented.

### 🔄 In Progress

**Milestone 3b — Aurora Visual Refinement**
The two-canvas bristle system is working. Ongoing tuning of bristle count, glow falloff, and color vibrancy.

### 🔲 Planned

**Milestone 4 — Profile System UI**
Profile switcher in settings sidebar. Cross-fade between profiles. Research theme presets.

**Milestone 5 — Custom Profiles & Polish**
3-input mood-based profile builder. localStorage persistence. Responsive design. Reduced-motion accessibility.

**Milestone 6 — Deployment & Streaming**
Vercel deployment. Research into streaming service integration (SoundCloud API is the most promising candidate — Spotify's DRM blocks Web Audio API access to the audio stream).

### 🔭 Stretch Goals
- WebGL aurora rendering — Canvas 2D has a quality ceiling (~60% of photographic aurora quality). WebGL fragment shaders would produce genuine soft luminous diffusion.
- Spotify integration — technically constrained by DRM but metadata (BPM, key) could drive animation even without audio stream access.

---

## UI Features

- **Settings sidebar** — gear icon top right, slides in from right
- **Mode switch** — Aurora / Glow, switchable anytime during playback
- **Note names toggle** — shows pitch class label (C, C#, D...) on each ribbon/stick — useful for verifying pitch detection
- **Progress bar** — click to seek, drag to scrub
- **Time display** — elapsed / total in m:ss format
- **Track name display** — filename shown in controls bar

---

## Running Locally

No build step needed — just open `index.html` in a browser.

```bash
git clone https://github.com/Norbert-Specht/synesthesia-app.git
cd synesthesia-app
open index.html
```

Or serve it locally to avoid any ES module CORS issues:

```bash
npx serve .
# then open http://localhost:3000
```

---

## Development Notes

This project was built entirely through **LLM-assisted development** using Claude (Anthropic). The workflow:
- Planning, research, and architecture decisions in Claude.ai chat
- Implementation via Claude Code (terminal-based coding agent)
- All significant decisions documented in `docs/decision-log.md`

The decision log captures not just *what* was decided but *why* — including dead ends, mistakes, and the reasoning behind pivots. It's a useful read for anyone interested in how LLM-assisted development actually unfolds on a real project.

---

## References

- Cytowic, R.E. — *Synesthesia: A Union of the Senses* (2002)
- Ward, J. & Eagleman, D. — research on synesthetic color associations and pitch
- Niccolai et al. (2012) — timbre-color synesthesia prevalence (26% of chromesthetes)
- Frontiers in Psychology (2025) — timbre-color synesthesia with morphed instrument timbres
- The Synesthesia Tree — documented chord-color and tone-color synesthetic experiences
- [Wikipedia: Chromesthesia](https://en.wikipedia.org/wiki/Chromesthesia)

---

*Built in collaboration with Claude (Anthropic) · Vanilla JS · No framework · No build tool*
