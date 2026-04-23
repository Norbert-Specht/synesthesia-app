# Decision Log — Synesthesia App

> A chronological record of every significant decision, pivot, dead end, and breakthrough in the development of the Synesthesia App. Intended for retrospective reflection and learning extraction.
>
> **How to use this document:**
> - Read chronologically to understand *why* decisions were made, not just *what* was decided
> - Use the Learning Flags (🔵 PROMPT · 🟡 DECISION · 🔴 MISTAKE · 🟢 BREAKTHROUGH) to find specific types of moments quickly
> - The final section extracts actionable learnings from the full history

---

## Phase 0 — Project Conception

### What happened
The project started as two goals stated simultaneously:
1. Build a real-time music visualizer inspired by chromesthesia
2. Learn how to build and ship projects with Claude, including GitHub, deployment, and prompting effectively

The two-goal framing was important — it meant every technical decision also had a learning dimension.

### 🟡 DECISION — Project scope
Keep it vanilla HTML/CSS/JS with no framework. Reasoning: fewer reusable components needed, and learning the workflow matters more than framework sophistication at this stage.

### 🟡 DECISION — Tool roles defined early
- **Claude.ai chat** — planning, architecture, research, document generation
- **Claude Code** — actual file creation, code editing, terminal commands
- **VS Code** — reviewing what Claude Code produced, manual edits
- **GitHub** — version control

This distinction was established before a single line of code was written. It prevented confusion about which tool to reach for at each step.

### 🔵 PROMPT — Project folder setup
The user initially asked Claude.ai to set up the project folder. Claude correctly pointed out it cannot write to the user's filesystem and redirected to Claude Code. First lesson: Claude.ai produces downloadable artifacts, Claude Code creates files directly on disk.

---

## Phase 1 — Research Before Code

### What happened
Before any code was written, two sessions were spent researching chromesthesia and establishing the conceptual foundation. This was a deliberate choice that paid off significantly later.

### 🟢 BREAKTHROUGH — Aurora borealis as the visual metaphor
The user identified aurora borealis as the visual reference. This was the single most important creative decision of the entire project — it resolved multiple design problems simultaneously:
- How to show multiple simultaneous colors (spatial separation of ribbons)
- How to prevent visual mud (translucency and blending)
- What movement vocabulary to use (organic, fluid, non-mechanical)
- What the overall aesthetic should feel like (atmospheric, immersive)

### 🟡 DECISION — "Whose synesthesia?" resolved
Four options were considered:
- A: Research consensus average
- B: Famous synesthete profiles (Rimsky-Korsakov, Liszt, Pharrell Williams)
- C: User-defined custom profiles
- D: Hybrid

**Decision:** B + C + a few research-based presets. Famous profiles provide fun and credibility. Custom profiles provide personal connection. Research presets give easy starting points.

### 🟡 DECISION — Custom profile simplified
Rather than asking users to map all 24 keys (overwhelming), the app asks 3 questions and interpolates the rest:
1. Pick a color for major keys
2. Pick a color for minor keys
3. Pick a color for your favorite key

User makes 3 decisions, app makes 21. This was a significant UX insight reached during planning before any code existed.

### 🟡 DECISION — README.md as Claude's memory
Since Claude has no memory between conversations, the README was designed from the start to serve as Claude's briefing document. The prompt pattern established:

> *"Here's my project README for context: [paste]. We're on Milestone [X]. Last session we completed [Y]. Today I want to work on [Z]."*

This pattern was used consistently throughout the project.

---

## Phase 2 — Project Infrastructure

### What happened
Project folder created, GitHub repo initialized, README written, docs/ folder established with `research.md` and `visual-design.md`.

### 🟢 BREAKTHROUGH — Two-level CLAUDE.md system
The user asked about creating global coding standards that apply to all future projects without repeating them. This led to establishing:
- `~/.claude/CLAUDE.md` — global rules (commenting standards, commit style, workflow preferences)
- `./CLAUDE.md` — project-specific rules (tech stack, current milestone, architecture decisions)

Claude Code reads both automatically at the start of every session. This means commenting rules, commit message format, and "ask before assuming" habits became automatic across all future projects.

**This is one of the highest-value infrastructure decisions of the entire project.** The 20 minutes spent setting this up saves significant prompt overhead in every future Claude Code session.

### 🟡 DECISION — Detailed code commenting required
Established as a global rule: every JS function gets a header comment explaining what it does, what it takes, what it returns. Complex logic gets inline comments explaining *why*, not just *what*. CSS gets section headers and explanations for non-obvious values. HTML gets structural section comments.

**Rationale:** Comments are documentation for both the developer and for Claude in future sessions. Good comments mean Claude can instantly understand code structure without re-explanation.

### 🟡 DECISION — Conventional commit message format
Established globally:
- `feat(scope): description` — new feature
- `fix(scope): description` — bug fix
- `docs(scope): description` — documentation
- `refactor(scope): description` — restructuring
- `chore(scope): description` — maintenance

---

## Phase 3 — Milestone 1: Foundation

### What happened
Claude Code built `index.html`, `css/style.css`, and `js/main.js`. The result:
- Full-screen canvas with dark background
- Landing overlay with audio upload
- Play/pause controls bar
- 5 aurora layers with dual sine waves and `screen` compositing
- `requestAnimationFrame` render loop

### 🟢 BREAKTHROUGH — Claude Code chose good technical approaches unprompted
The implementation used `globalCompositeOperation: 'screen'` for color blending (correct for light simulation), two sine waves per layer for organic non-repeating movement, and `URL.revokeObjectURL` for memory cleanup. These were good decisions made by Claude Code within the constraints of the prompt.

### 🔵 PROMPT — First milestone prompt structure
The first substantial Claude Code prompt established a pattern used throughout:
1. Paste relevant README sections for context
2. State the milestone goal explicitly
3. List specific files to create/modify
4. State tech stack constraints
5. State design direction reference
6. End with: *"Ask me before making any assumptions"*

That final line proved important — it prevents Claude Code from inventing features not requested.

---

## Phase 4 — Milestone 2: Audio Analysis

### What happened
Web Audio API integrated. `AnalyserNode` configured. Three frequency bands extracted. RMS amplitude computed. Beat detection implemented.

### 🔴 MISTAKE — First beat detection was a kick drum detector
The initial beat detection used a delta method on bass energy — watching for sharp upward spikes in the bass frequency band (0–215Hz). This works for electronic and pop music but fails for classical, jazz, acoustic, and ambient music where rhythm lives in other frequency ranges.

**Discovered through:** User asked the right question — "is the beat currently determined by the kick drum?" This identified the problem before it was tested on diverse music.

### 🟡 DECISION — Switch to spectral flux onset detection
Four options were considered:
- A: Keep bass threshold detection, accept limitations
- B: Multi-band onset detection (separate events per band)
- C: Spectral flux (total change across full spectrum)
- D: No beat detection, just energy following

**Decision:** Option C — spectral flux. Measures total positive change across all 1024 frequency bins between consecutive frames. Any sudden increase anywhere triggers an onset. Genre-agnostic.

### 🔵 PROMPT — Debug logging as part of milestone
A pattern was established: add temporary console logging marked `// DEBUG — remove after testing` to verify the audio analysis works before building visuals on top of it. Remove logging in a dedicated cleanup step before the next milestone.

**This is a valuable pattern** — it separates verification from development and prevents debug code leaking into production commits.

### 🟡 DECISION — AnalyserNode smoothingTimeConstant: 0.3
Default is 0.8, which was too high — bass bins stayed near ceiling on dense music, making threshold-based detection unreachable. 0.3 lets transients through clearly.

---

## Phase 5 — Milestone 3 (First Attempt): Color Mapping

### What happened
The first attempt at Milestone 3 connected `audioData` to the aurora visuals using frequency band zones. Each layer was assigned `'high'`, `'mid'`, or `'low'` zone. The visualization responded to energy levels but not to pitch or color.

### 🔴 MISTAKE — Frequency zones instead of pitch
The initial design mapped frequency bands (bass/mid/high) to vertical zones and drove amplitude/thickness changes. This missed the entire point of chromesthesia — **pitch drives hue**. Energy drives intensity. The system was showing energy patterns, not color-coded pitch content.

### 🔴 MISTAKE — No research done before architecture
The layer system was designed without researching how synesthetes actually experience polyphonic music. Key questions not yet answered:
- When a chord plays, do synesthetes see one color or multiple?
- Does timbre (instrument) change the color?
- How many simultaneous colors can be displayed meaningfully?

### 🟢 BREAKTHROUGH — Research first, code second
User paused development to research these questions before continuing. This was the right call and changed the entire architecture:

**Finding 1:** Chords produce a dominant color from the root note, with secondary notes adding nuance and tint. Not one color per note — a blend with the dominant note winning.

**Finding 2:** Timbre-color synesthesia affects ~26% of chromesthetes. For those who experience it, timbre modifies *lightness and saturation* — not hue. Hue is always driven by pitch.

**Finding 3:** Pitch is the universal foundation of all chromesthesia. Every synesthete has pitch → color associations. Timbre and dynamics modify but pitch drives hue.

### 🟡 DECISION — Ribbon color model: Option B + Option D
Multiple options were considered for showing polyphonic color:
- A: Colored glow halos around dominant ribbon
- B: Separate subordinate ribbons for secondary pitches
- C: Color temperature shift within single ribbon
- D: Spatial gradient across ribbon width (core = dominant, glow edges = secondary)

**Decision:** B + D combined. Main ribbon has dominant pitch color at core. Glow gradient shifts toward secondary pitch colors at edges. 1-2 additional dimmer ribbons represent next most active pitches. This is both research-accurate and visually beautiful.

### 🟡 DECISION — Dynamic ribbon lifecycle
Rather than fixed static layers, ribbons are dynamic:
- New dominant pitch → new primary ribbon rises from bottom, blooms
- Previous primary demotes to secondary (dims, thins)
- Old secondaries fade out gracefully
- Maximum 3 ribbons alive simultaneously

New ribbons spawn at asymmetric horizontal positions — never evenly spaced, never too close to existing ribbons.

---

## Phase 6 — Chroma Extraction Crisis

### What happened
Building the pitch-to-color system required knowing which pitch classes are active in the music. The first approach was hand-rolled FFT bin bucketing.

### 🔴 MISTAKE — Hand-rolled chroma had pitch class aliasing
The custom chroma extraction showed C# as dominant on ~19 out of 21 readings regardless of musical content. All 12 pitch class values were similar (spread 0.15–0.28, target ≥ 0.6).

**Root cause:** Equal temperament mapping distributes FFT bins unevenly. At 44100Hz with fftSize 2048, some pitch classes receive more bins than others. C# happened to be over-represented. Multiple fixes were attempted:
1. Perceptual bin weighting — partial improvement
2. Frequency ceiling reduction (4200Hz → 2000Hz) — partial improvement
3. Raising CHROMA_MIN_ENERGY threshold — no effect (all values still above threshold)

None reached the 0.6 spread target reliably.

### 🟢 BREAKTHROUGH — Switch to Meyda.js
After recognizing that FFT-based chroma extraction from raw audio is a solved problem that professional audio engineers have spent years getting right, the decision was made to use Meyda.js — a dedicated audio feature extraction library.

**Result:** Immediate improvement. Chroma spread reached 0.6–0.9 on clear harmonic content. Dominant pitch changed meaningfully across sessions (9 different pitch classes vs C# locked previously).

**The lesson:** Don't hand-roll what specialized libraries solve correctly. The "no libraries" approach was never an explicit project rule — it was an assumption. When challenged, it was immediately abandoned for the right tool.

### 🔴 MISTAKE — Assumed "no libraries" rule existed
The decision to use Meyda.js revealed that "no libraries" had been treated as a constraint without ever being explicitly decided. The user correctly pointed this out. The rule didn't exist.

**Learning:** Distinguish between explicit decisions and unstated assumptions. Document both in CLAUDE.md.

---

## Phase 7 — Visual Rendering Crisis

### What happened
The ribbon geometry was working (vertical orientation, asymmetric positioning, lifecycle management) but the visual quality was far below the aurora reference images. Multiple rendering approaches were attempted.

### 🔴 MISTAKE — Circle-based glow rendering
The first rendering approach drew hundreds of gradient circles along each ribbon path per frame. This caused:
- Performance degradation after ~20 seconds (stutter/slowdown)
- Pixelated/dotted core appearance (circles had gaps)
- Blobby circular glow that didn't follow ribbon shape
- Muddy colors from overlapping semi-transparent circles

**Root cause:** `ctx.arc()` is expensive. Hundreds of calls per frame overwhelmed the GPU.

### 🟡 DECISION — Switch to polygon-based rendering
Replace all `ctx.arc()` calls with filled polygon paths. Three passes per ribbon:
- Pass 1: wide atmospheric haze polygon
- Pass 2: main glow body polygon
- Pass 3: bright solid core polygon

`buildPolygonPath()` helper traces left and right edge arrays. One `ctx.fill()` per pass. Zero arc() calls. Performance restored.

### 🔴 MISTAKE — screen compositing produced muddy colors
`screen` blending was used because it simulates additive light (how real aurora works physically). But it only adds visible light when source colors are both bright AND have meaningful opacity. Our medium-brightness profile colors on a dark background produced muddy intermediate mixes — olive-green from golden-yellow + teal overlapping.

**Fix:** Switch to `source-over` with genuine transparency. This is actually more accurate to aurora — it IS translucent gas, not additive light. The sky shows through.

### 🔴 MISTAKE — Rimsky-Korsakov HSL values too dark for luminous rendering
His documented colors include steel-grey (B), dark gloomy grey-blue (Eb), brownish-gold (G). Artistically accurate but lightness 33–48% and saturation 22–28% cannot glow on a dark background regardless of blending mode.

**Fix:** Force saturation to 72–95% and lightness to 48–72% for rendering. Profile hue is preserved (chromesthesia identity). Saturation and lightness are forced upward. The profile tells us *which color family* — the rendering makes it vivid.

### 🟢 BREAKTHROUGH — Diagnostic ribbon test
Rather than writing more large prompts and hoping for improvement, a diagnostic approach was used: render one ribbon with hardcoded vivid colors (`hsl(155, 100%, 58%)`) to verify the rendering pipeline could produce aurora quality at all.

**Result:** The diagnostic ribbon looked genuinely luminous — bright green core, soft atmospheric halo, sky visible through it. This proved the pipeline worked and the problem was purely the color values coming from the profile system.

**The lesson:** When iteration isn't converging, isolate the variable. One diagnostic prompt answered a question that multiple large fix prompts hadn't resolved.

---

## Phase 8 — The Aurora Feasibility Question

### What happened
After multiple rendering iterations, the aurora visual still didn't match the reference images. The user asked an important honest question: *"Is this even feasible? Right now I feel like we are at 25%."*

### 🟡 DECISION — Honest assessment over reassurance
The honest answer: Canvas 2D has a fundamental ceiling for aurora-quality rendering. The soft luminous edge diffusion of real aurora requires either WebGL fragment shaders or CSS blur filters. Maximum Canvas 2D quality estimated at 50–60% of photographic reference.

**This was the right moment to be direct.** Continuing to iterate on Canvas 2D aurora would produce diminishing returns.

### 🟢 BREAKTHROUGH — Glow stick concept
The user proposed an alternative: neon glow sticks. The diagnostic ribbon (which already existed as a test) was already ~80% of the glow stick concept:
- Thin, intensely hot vertical line
- Wide vivid blur chasing the core
- Snappy appearance, slow lingering fade

**Key insight:** Canvas 2D excels at exactly this — sharp high-contrast thin core with wide transparent gradient. This plays to the tool's strengths rather than fighting its limitations.

### 🟡 DECISION — Build both modes, let users choose
Rather than replacing aurora with glow sticks:
- Keep both as permanent render modes
- Build a UI switch (pill control, top right corner)
- Users choose which experience they prefer
- Future: WebGL upgrade for aurora mode

**This turned a limitation into a feature.** Two distinct aesthetic experiences, both scientifically grounded, both user-accessible.

### 🟡 DECISION — Glow stick cluster system
For glow sticks, the ribbon pool is expanded:
- Dominant pitch → 1 thick individual stick
- Secondary pitches → Option C clusters (center + tight satellite + loose satellite)
- Tertiary pitches (chroma > 0.35) → thin individual sticks
- Maximum 9 glow sticks simultaneously

Option C spacing mimics harmonic relationships — tight satellite = close interval, loose satellite = wider interval. More organic than even spacing.

### 🟡 DECISION — Asymmetric appear/fade timing
Glow sticks have asymmetric timing that creates their character:
- Appear: lerp rate 0.15 — fast, snappy, energetic
- Fade: lerp rate 0.022 — slow linger, glow chases the fading core

This asymmetry is what makes them feel alive rather than mechanical.

---

## Phase 9 — UI Features

### What happened
Progress bar with scrubbing and time display added to the player controls.

### 🟡 DECISION — Drag scrubbing approach
During drag: update visual position continuously (smooth UX). Only seek `audioPlayer.currentTime` on `mouseup` — seeking on every pixel would be expensive and create audio artifacts.

### 🔴 MISTAKE — Mode switch as keyboard shortcut initially
The mode switch was first designed as a keyboard shortcut (`M` key). The user correctly identified that if this is a permanent user-facing feature (not a developer tool), it needs a visible UI element that users can discover.

**Fix:** Pill-shaped segmented control in the top right corner, always visible and active.

---

## Phase 10 — Documentation System

### What happened
At the end of Milestone 3, a comprehensive documentation system exists:

- `README.md` — project briefing document, Claude's memory
- `docs/visual-design.md` — visual decisions and rationale
- `docs/audio-analysis.md` — audio pipeline decisions and rationale
- `docs/research.md` — synesthesia research notes
- `docs/future-ideas.md` — ideas set aside for later
- `docs/decision-log.md` — this document

### 🟢 BREAKTHROUGH — Documentation as architecture
The most valuable insight about the documentation system: **docs are not just records of decisions — they are the architecture of future Claude sessions**. A well-structured README pasted at the start of a new chat immediately gives Claude the context needed to be useful without re-explanation. The better the docs, the better the AI assistance.

---

## Extracted Learnings

### On Using Claude.ai Chat Effectively

**L1 — Research before architecture**
The most expensive mistakes in this project came from writing code before answering fundamental questions. The chromesthesia research session prevented months of wrong-direction development. The polyphonic color research changed the entire ribbon architecture. Spending time in chat researching before writing prompts is always worth it.

**L2 — The diagnostic prompt pattern**
When iteration isn't converging, isolate the variable. Write a minimal diagnostic that tests one specific thing rather than another large fix prompt. The diagnostic ribbon test (one prompt, ~30 lines of code) answered a question that multiple complex rendering prompts hadn't resolved.

**L3 — Ask for honest feasibility assessment**
The question "is this even feasible or are we only getting 30-40% of it?" was one of the most valuable prompts in the entire project. It unlocked an honest conversation that led to the dual-mode concept. Don't let iteration inertia prevent stepping back and questioning the approach.

**L4 — Name open questions explicitly**
Every time a decision was deferred, it was captured in the "Open Design Questions" table in the README. This prevented the same question from being re-discussed unnecessarily and made it easy to know what needed deciding at any point.

**L5 — Update docs immediately after decisions**
Docs updated while decisions are fresh capture the *rationale* not just the *outcome*. Rationale is what makes the docs valuable for future sessions. "We use Meyda.js" is less useful than "We use Meyda.js because hand-rolled chroma had pitch class aliasing — C# dominated 19/21 readings."

---

### On Using Claude Code Effectively

**L6 — Claude Code reads files directly — don't paste unless necessary**
The "prompt too long" problem with main.js revealed an important workflow: Claude Code has direct access to your filesystem. Use "Read `js/main.js` directly" rather than pasting file contents. This keeps prompts short and ensures Claude Code has the latest version, not a potentially stale pasted copy.

**L7 — The CLAUDE.md system is high-value infrastructure**
The 20 minutes spent setting up `~/.claude/CLAUDE.md` and `./CLAUDE.md` pays dividends on every future Claude Code session. Commenting standards, commit format, and "ask before assuming" habits become automatic without taking up prompt space. This should be one of the first things done on any new project.

**L8 — Separate milestones cleanly**
The pattern of completing and committing one milestone before starting the next made debugging dramatically easier. When something broke, the scope of "what changed" was limited to the current milestone's work. Mixed-milestone commits create confusion about what caused a problem.

**L9 — Debug logging as a milestone step**
Add temporary debug logging at the end of each analysis/logic milestone, verify it works, remove the logging in a dedicated cleanup step before the next milestone. This pattern:
- Forces explicit verification before building on top
- Prevents debug code leaking into production
- Creates a natural checkpoint between milestones

**L10 — "Ask before making assumptions" is the single most important prompt instruction**
This line at the end of every Claude Code prompt prevented the most common failure mode: Claude generating unrequested features that then need to be removed. It's short, non-negotiable, and should be in every substantive prompt.

**L11 — Split large prompts by concern, not by size**
When a prompt is too large, the instinct is to cut content. The better approach is to split by architectural concern — audio analysis, visual rendering, UI — so each prompt is cohesive and Claude Code doesn't need to context-switch mid-prompt. Each split prompt should be independently committable.

**L12 — Name variables, constants, and functions descriptively in prompts**
When specifying code in prompts, use the exact variable names and function signatures that should appear in the code. `FLUX_THRESHOLD_MULTIPLIER = 1.5` in a prompt produces cleaner code than "a threshold multiplier of about one and a half." It also makes the code match the docs more precisely.

---

### On Project Architecture

**L13 — The README is Claude's memory — treat it that way**
Every significant decision should be in the README. Not just what was decided but why. The README is re-pasted at the start of every new Claude session — it IS the project's working memory. Sparse READMEs produce generic Claude responses. Detailed READMEs produce precise, project-aware responses.

**L14 — Distinguish explicit decisions from unstated assumptions**
The "no libraries" assumption was treated as a decision without ever being explicitly made. When Meyda.js was proposed, it turned out there was no such rule. Document both decisions AND assumptions in CLAUDE.md so they can be challenged explicitly.

**L15 — Capture dead ends with rationale**
The decision log entries marked 🔴 MISTAKE are as valuable as the 🟢 BREAKTHROUGH entries. Knowing that circle-based rendering caused performance degradation and why prevents revisiting that approach. Knowing that screen blending on dark colors produces muddy results prevents repeating that mistake.

**L16 — Creative constraints can become features**
The aurora Canvas 2D limitation led to the glow stick concept, which led to a dual-mode user choice. The constraint produced a better product than the original plan. When hitting a technical ceiling, ask: "does this limitation suggest a different creative direction?" before trying to break through it.

**L17 — Future ideas deserve a document, not just a conversation**
The music transcription app idea came up mid-session and could easily have been lost. A `future-ideas.md` with the full context, tools, architecture, and open questions means it's ready to act on when the time comes, not reconstructed from memory.

---

### On the Synesthesia App Specifically

**L18 — Research the phenomenon deeply before designing features**
The synesthesia research sessions directly determined:
- The profile system (multiple synesthete profiles, not one consensus)
- The ribbon color model (dominant pitch + secondary pitch tinting)
- The cluster system (dominant individual + secondary clusters)
- The color pipeline (hue from pitch, saturation from amplitude, lightness from octave)

Each of these would have been designed wrong without the research.

**L19 — The "whose synesthesia?" question is the product's core**
Every other design decision flows from this. Getting it right early (famous profiles + custom + research presets) established a clear product concept that guided development consistently.

**L20 — Separate what science says from what looks good**
Rimsky-Korsakov's documented colors are accurate to his experience. They are not optimized for luminous canvas rendering on a dark background. These are different problems. The hue is sacred (chromesthesia identity). The saturation and lightness are rendering parameters that can be adjusted without compromising scientific accuracy.

---

## Prompt Templates Developed During This Project

These prompt patterns were developed through experience and proved reliable:

### New Claude Session Briefing
```
Here's my project README for context: [paste README]
We're currently on Milestone [X].
Last session we completed [Y].
Today I want to work on [Z].
Ask me before making any assumptions.
```

### Claude Code — Read Before Acting
```
Read [filename] directly from the project.
Then make the following targeted changes.
Do not touch [list of off-limits areas].
[Specific instructions]
Ask me before making any assumptions.
Commit with: "[conventional commit message]"
```

### Claude Code — Diagnostic Prompt
```
Add a temporary diagnostic [function/component] that tests [specific thing] in isolation.
Hardcode [known-good values] to verify [the pipeline/the rendering/the detection] works independently of [the variable in question].
Mark all diagnostic code with // DIAGNOSTIC — remove after testing.
Do not commit — this is a temporary test.
```

### Claude Code — Large File (Option 2)
```
Read [filename] directly. Then [instructions without pasting file content].
```

### Feasibility Check
```
Before we continue iterating, I need an honest assessment.
[Describe current state].
[Describe target state].
Is [approach] feasible? What percentage of [target] can we realistically achieve?
If not fully feasible, what would actually get us there?
Be honest — don't try to please.
```

---

## Milestone Completion Status at Time of Writing

| Milestone | Status | Key Output |
|---|---|---|
| 1 — Foundation | ✅ Complete | Canvas, audio upload, playback, ambient aurora |
| 2 — Audio Analysis | ✅ Complete | Meyda.js chroma, spectral flux onset, audioData |
| 3 — Visualization | 🔄 In Progress | Aurora mode working, Glow mode prompts written |
| 4 — Profile System UI | 🔲 Not started | Profile switcher, Liszt + Pharrell profiles |
| 5 — Custom Profiles | 🔲 Not started | 3-input mood picker, localStorage |
| 6 — Deployment | 🔲 Not started | Vercel/Netlify, optional Spotify |

---

*Created at end of Milestone 3 development session.*
*Next session: run Glow Stick prompts 1–3, then visual tuning pass on both modes.*

---

## Session 2 — Milestone 3 Completion + Visual Refinement

*Covers: Glow stick implementation, modularization, visual tuning, settings sidebar, BPM animation.*

---

### Phase 11 — Glow Stick Implementation

#### What happened
The three glow stick prompts were run in sequence: A/B switch infrastructure, glow stick ribbon pool, glow stick rendering.

### 🟢 BREAKTHROUGH — Diagnostic ribbon proved the rendering approach
Before building the full glow stick system, a single diagnostic ribbon with hardcoded vivid colors was rendered to test whether Canvas 2D could produce the target neon quality. It could — and the diagnostic ribbon itself looked closer to a neon glow stick than an aurora. This observation directly inspired the glow stick concept.

**Learning:** A small focused diagnostic test answered a question that multiple large rendering prompts hadn't resolved. Isolate the variable before iterating.

### 🟡 DECISION — Glow stick visual design
Straight vertical lines (no sine wave lateral movement), thin near-white hot core, wide vivid color glow with exponential falloff. `ctx.fillRect()` instead of `buildPolygonPath()` for the straight geometry — simpler and faster for rectangles.

### 🔴 MISTAKE — Glow offset from core
The initial glow stick rendering had the glow displaced to one side of the core. Root cause: mismatch between `createLinearGradient` x coordinates and `fillRect` x coordinates. Fixed by ensuring every pass computes width from `cx` consistently and both gradient and fillRect use identical x values.

### 🟡 DECISION — Exponential glow falloff
The initial glow used roughly linear falloff — similar brightness across a wide area. Changed to exponential — most energy concentrated in the first 18% of gradient width, dropping rapidly outward. This mimics real neon tubes and makes sticks feel like they're genuinely radiating light rather than sitting inside a flat color band.

---

### Phase 12 — JS Modularization

#### What happened
`main.js` grew too large for Claude Code to read in a single session due to token limits. The file was split into ES modules.

### 🟡 DECISION — ES Modules, no build tool
Native browser ES modules (`type="module"`) — no webpack, no bundler, no build step. Keeps the project vanilla and simple.

### Module split:
| File | Responsibility |
|---|---|
| `main.js` | Entry point only — imports, starts render loop |
| `audio.js` | Web Audio API, Meyda, spectral flux, audioData |
| `profiles.js` | Profile data, getProfileColor(), active profile state |
| `renderer.js` | All drawing — background, ribbons, labels |
| `ribbons.js` | Ribbon pool, lifecycle, spawn/demote/fade |
| `player.js` | Audio element, upload, play/pause, progress bar |
| `ui.js` | renderMode, showNoteNames, sidebar, all UI state |

### 🟢 BREAKTHROUGH — Modularization resolves token limit permanently
After splitting, each file is 25–200 lines. Claude Code can read any individual file comfortably. The prompt pattern becomes: *"Read `js/audio.js` and `js/ribbons.js` directly"* — only the files relevant to the task. This is the correct long-term workflow for growing projects.

### 🔴 MISTAKE — Assumed "no libraries" rule, again
During modularization planning, the instinct was to avoid any tooling. Correctly pushed back — ES modules are a browser standard, not a library. The distinction matters: standards are free, libraries are dependencies.

---

### Phase 13 — Visual Tuning

#### What happened
Multiple rounds of visual tuning on both modes after the initial implementation.

### 🔴 MISTAKE — Circle-based rendering caused performance degradation
The first glow stick implementation drew hundreds of gradient circles per frame using `ctx.arc()`. After ~20 seconds the animation stuttered noticeably. Replaced with `ctx.fillRect()` which uses zero arc calls. Performance immediately restored.

### 🔴 MISTAKE — Slideshow effect from asymmetric timing
Raising `CHROMA_LERP_RATE` to 0.22 caused the dominant pitch to change so rapidly that ribbon lifecycle transitions fired constantly. Old ribbons hadn't faded before new ones spawned. The screen never settled — read as a slideshow.

**Fix:** Reduced lerp rate to 0.10. Increased fading lerp rate from 0.022 to 0.045 so fades keep pace with pitch changes. Rebalanced debounce from 80ms to 160ms minimum.

**Learning:** Appear speed and fade speed must be matched to the pitch change rate. If pitch changes faster than fades complete, you get churn. If fades are slower than the eye expects given the music tempo, you get slideshow.

### 🟡 DECISION — Adaptive pitch debounce
Rather than a fixed debounce timer, an adaptive approach based on chroma energy of the dominant pitch:
- Energy > 0.65 → 160ms (strong clear note, respond quickly)
- Energy 0.35–0.65 → 280ms (moderate confidence, wait a little)
- Energy < 0.35 → ignore (noise, not a real note)

This makes the visualization more responsive to clear melodic content while remaining stable on ambiguous harmonic material.

---

### Phase 14 — Track Change Bug

### 🔴 MISTAKE — Animation froze on track change
Switching tracks mid-playback left the ribbon pool frozen in its previous state. The new track played correctly but the animation never restarted. No console error — a silent state management failure.

**Root cause:** `loadAudioFile()` reset the audio pipeline but not the visual state. The ribbon pool, debounce timer, and last stable pitch were all inherited from the previous track.

**Fix:** Added `resetVisualization()` to `ribbons.js` and `resetAudioState()` to `audio.js`. Both called from `loadAudioFile()` in `player.js` on every track change.

**Learning:** Any stateful system that depends on audio must be reset when audio resets. Visual state and audio state are separate and must both be explicitly reset.

---

### Phase 11b — Missing Commits from Milestone 3 Build

These commits happened between the Milestone 3 architecture decisions and the modularization phase. They were not in the original log.

#### `288711f` — Dynamic pitch-driven ribbon system built
The actual build of Prompt 3 — `drawRibbon()`, `drawBackground()`, `buildPolygonPath()`, `updateRibbonLifecycle()`, `spawnRibbon()`, vertical geometry, asymmetric x-positioning, star cache, sky gradient. The largest single Claude Code session of the project.

#### `dd0303b` — Meyda CDN URL wrong
### 🔴 MISTAKE — Meyda referenced via cdnjs which doesn't host it
Initial prompt used `cdnjs.cloudflare.com` for Meyda. The CDN doesn't host Meyda — the script silently failed to load. Fixed by switching to `jsDelivr`.

**Learning:** Always verify CDN availability before using it in a prompt. `cdnjs` is not exhaustive — `jsdelivr.net` is often a better fallback for less common libraries.

#### `47eadba` — Guard against Meyda NaN values on track switch
### 🔴 MISTAKE — Library returned NaN during state transitions
When switching tracks rapidly, Meyda occasionally returned `NaN` chroma values before the new audio stream was established. Added defensive guards in `updateAudioData()` — fall back to idle values on any `NaN` frame.

**Learning:** Third-party library callbacks can return invalid values during state transitions. Always validate library output before using it in downstream calculations.

#### `9e920d6` — Wider ribbons, extended glow, randomized shape variation
Visual tuning pass on aurora ribbons after initial build:
- Core half-width increased, glow radius extended
- Each ribbon given unique `waveFreq1`, `waveFreq2`, `driftSpeed`, `wobbleRatio` at spawn
- The extended glow (`thick × 18`) caused the performance degradation that later led to the polygon rewrite

#### `cbfa56c` — Progress bar with scrubbing and time display
### 🟡 DECISION — Drag scrubbing approach
Update visual position continuously during drag. Only call `audioPlayer.currentTime` on `mouseup`. Seeking on every pixel creates audio artifacts and is expensive.

Added: full-width progress bar, click-to-seek, drag scrubbing, `m:ss` time display, `NaN` duration handling.

#### `051f36a` — Polygon-based ribbon rendering replaces circle-based
### 🔴 MISTAKE — ctx.arc() caused performance degradation after ~20 seconds
Hundreds of gradient circles per frame overwhelmed the GPU. Replaced with `buildPolygonPath()` filled polygons — three passes, zero arc() calls, one `ctx.fill()` per pass. Performance immediately restored.

### 🔴 MISTAKE — screen compositing produced muddy colors
`screen` blending on medium-brightness colors produces muddy intermediate mixes, not luminosity. Switched to `source-over` with genuine HSL transparency — more accurate to how aurora looks (translucent gas, not additive light).

#### `f219bff` — Force vivid colors, amplitude pulse
### 🟡 DECISION — Profile hue is sacred, saturation/lightness are rendering parameters
The chromesthesia identity lives in the hue. Saturation and lightness are visual rendering parameters adjustable without compromising scientific accuracy.

Saturation forced to `Math.max(base.s, 72) + amplitude * 18`. Lightness forced to `Math.max(base.l, 48) + amplitude * 14`. Sky brightened. Amplitude pulse added to core pass opacity.

#### `41e3ba4` — Remove diagnostic ribbon, restore sky gradient
Diagnostic ribbon removed after confirming rendering pipeline quality. Sky gradient values restored from diagnostic-darkened state.

### 🟢 BREAKTHROUGH — Diagnostic test pattern confirmed as valuable
The one-ribbon diagnostic (hardcoded vivid colors, temporary) proved the pipeline could produce neon-quality output. This isolated the color problem from the rendering problem and directly led to the forced saturation/lightness approach.

---

### Phase 15 — Note Names Diagnostic Feature

#### What happened
Note name labels (C, C#, D etc.) were added to each glow stick to verify pitch detection accuracy. User observed that a clear piano melody showed only one glow stick with the same color throughout — suggesting pitch detection was too slow.

### 🟡 DECISION — Note names as a permanent toggleable feature
Rather than removing the diagnostic after testing, note names became a permanent user-facing feature with an on/off toggle. Off by default — the visualization is the primary attraction.

### 🟢 BREAKTHROUGH — `drawNoteLabel()` as shared utility
Instead of duplicating label code in each render mode, a single `drawNoteLabel(ribbon)` function was extracted to `renderer.js`. Any render mode calls it in one line at the end of its draw function. The toggle (`showNoteNames`) is checked inside the function — render modes don't need to know about it.

**This is the correct pattern for all future shared visual features.** New render modes automatically inherit note names (and any future shared features) for free.

---

### Phase 16 — Settings Sidebar

#### What happened
With two UI controls (mode switch and note names toggle) and more expected in future, a settings sidebar was introduced to replace ad-hoc top-right controls.

### 🟡 DECISION — Settings sidebar replaces pill switch
- Gear icon in top right replaces the Aurora/Glow pill
- Clicking gear slides a 360px sidebar in from the right
- Sidebar holds all settings — current and future
- Closes only via gear button or explicit X button (not click-outside)
- Glass/blur aesthetic matching controls bar

### 🟡 DECISION — `ui.js` owns all settings state
All exported state variables that affect rendering live in `ui.js`:
- `renderMode` — which visual mode is active
- `showNoteNames` — whether labels are shown
- Future settings added here

**This is the correct architecture for extensibility.** Adding a new setting means: add exported state to `ui.js`, add UI control to sidebar HTML, wire up listener in `ui.js`. Nothing else changes.

### 🟡 DECISION — Settings sidebar structure
```
⚙ Settings                    ✕
─────────────────────────────
SELECT VISUALIZATION STYLE
  [ Aurora ]  [ Glow ]

TOGGLE NOTE NAMES
  ○ Show note names
```
Section label text is descriptive, not generic. Future sections follow the same pattern.

### 🔴 MISTAKE — Mode switch initially designed as keyboard shortcut
The mode switch was first prototyped as an `M` key keyboard shortcut. User correctly identified that a permanent user-facing feature needs a discoverable UI element, not a hidden keyboard shortcut.

**Learning:** Developer convenience (keyboard shortcut) ≠ user discoverability (visible UI). If a feature is for users, it needs visible UI from the start.

---

### Phase 17 — BPM-Driven Animation Speed

#### What happened
The animation looked fluid but felt disconnected from the music's tempo. BPM estimation from onset density was added to drive fade-in/fade-out lerp rates.

### 🟡 DECISION — Onset density as tempo proxy
Rather than full beat tracking, inter-onset intervals from the existing spectral flux detector are averaged to estimate tempo. Simpler, already available, and musically appropriate — onset density reflects musical activity, not just metronome beats. Dense passages animate faster; sparse ones slower.

### 🟡 DECISION — Exponential BPM curve for lerp scaling
Linear BPM → lerp rate mapping feels wrong — small changes at low BPM feel more significant than the same changes at high BPM. A power curve (`normalized ^ 0.7`) compresses the high end and expands the low end, matching human tempo perception.

Speed factor range: ~0.5 (60 BPM) → ~1.14 (180 BPM), clamped 0.4–1.3.

### 🟡 DECISION — Separate lerp rate sets per mode
Aurora and glow stick have different base lerp rates — aurora is more atmospheric (slower), glow stick is more energetic (faster). BPM scaling is applied proportionally to each mode's base rates independently.

### 🟡 DECISION — `getBPM()` getter function
`estimatedBPM` is a module-level `let` variable in `audio.js`. ES module live bindings don't export primitive `let` values in a way that updates across modules. Exported as a getter function `getBPM()` that always returns the current value.

---

## Updated Milestone Status

| Milestone | Status | Key Output |
|---|---|---|
| 1 — Foundation | ✅ Complete | Canvas, audio upload, playback, ambient aurora |
| 2 — Audio Analysis | ✅ Complete | Meyda.js chroma, spectral flux onset, audioData |
| 3 — Visualization | ✅ Complete | Aurora + Glow modes, settings sidebar, BPM animation |
| 3b — Aurora Visual Overhaul | 🔄 In Progress | Two-canvas bristle system — prompt written, not yet run |
| 4 — Profile System UI | 🔲 Not started | Profile switcher, Liszt + Pharrell profiles |
| 5 — Custom Profiles | 🔲 Not started | 3-input mood picker, localStorage |
| 6 — Deployment | 🔲 Not started | Vercel/Netlify, optional Spotify |

---

## Phase 18 — Aurora Visual Overhaul: Two-Canvas Bristle System

*This is the most significant architectural decision since switching to Meyda.js.*

---

### The chain of realizations

After multiple aurora rendering iterations (polygon rewrite, opacity reduction, exponential glow falloff, forced vivid colors), the aurora still looked like flat opaque shapes. A screenshot comparison against brush stroke reference images made four remaining problems undeniable:

**Problem 1 — Shapes opaque, not translucent**
Polygon opacity too high. Sky not visible through ribbons. Reducing opacity just made colors disappear rather than becoming translucent.

**Problem 2 — No internal texture**
Smooth uniform color inside each shape. No variation, no depth, no bristle quality.

**Problem 3 — Colors still dark and muddy**
Rimsky-Korsakov profile values for detected pitches (G#, Bb) have inherently low saturation/lightness. Even after forced boosting, transparent gradients make the colors read as dark on a dark background. The fundamental contradiction: you cannot have vivid color AND transparent edges using rgba gradient fills alone.

**Problem 4 — Core was always a straight vertical line**
`createLinearGradient` is defined once with fixed x coordinates. For a curved ribbon the gradient always aligns to the registered ribbon center — a straight vertical line — regardless of how much the ribbon curves. This is a fundamental Canvas 2D limitation that no parameter tuning can fix.

**Problems 1 and 4 are architectural, not parametric.** No gradient tuning resolves them.

---

### The key insight — CSS blur as the glow

### 🟢 BREAKTHROUGH — Solid color + CSS blur > transparent gradients

The correct approach for soft glowing edges in Canvas 2D:
- Render shapes as **solid vivid color** (not transparent gradients)
- Apply **CSS `filter: blur()`** to the canvas element to create soft atmospheric edges
- The blur IS the gradient — it diffuses edges naturally in all directions following the actual shape boundary

**Why this works where gradients failed:**
- Colors can be fully saturated because translucency comes from blur falloff, not rgba opacity
- Edges diffuse per-pixel following actual shape boundaries, not a fixed linear direction
- The core can be rendered sharp on a second unblurred canvas — curved paths produce curved cores correctly

---

### The bristle insight — texture from individual elements

### 🟢 BREAKTHROUGH — Creative framing led to technical solution

User observation: both brush strokes and aurora have texture that comes from many individual elements (bristle hairs, magnetic field lines) moving in the same overall direction with slight individual variations. Gaps between elements create depth and irregularity.

This is the same physical process in both cases. The creative "brush stroke" framing directly translated to a precise technical implementation.

**Each ribbon spawns 5 bristles at creation time, each with:**
- `xOffset` — lateral offset from ribbon center (creates inter-bristle gaps)
- `opacityScale` — individual brightness (0.55–1.0)
- `thicknessScale` — individual width (0.5–1.05)
- `heightScale` — how far up the screen this bristle reaches (0.88–1.0)
- `phaseOffset` — small sine wave phase variation (prevents perfect sync)
- `isBright` — first 2 bristles render as sharp cores, remaining 3 as blurred glow

The texture emerges from the combination of these variations — not any single parameter.

---

### 🟡 DECISION — Three-canvas architecture

```
z-index 0: #aurora-canvas        — background (sky gradient + stars)
z-index 1: #aurora-glow-canvas   — blurred bristle shapes (CSS filter: blur(20px))
z-index 2: #aurora-core-canvas   — sharp bright bristle cores (no blur)
```

All three canvases fixed-position, full-viewport, stacked identically. Glow and core canvases hidden in glow stick mode, shown in aurora mode — toggled by `ui.js`.

### 🟡 DECISION — Solid fills on glow canvas, not gradients
Glow bristles use `fillStyle = hsla(h, s%, l%, opacity)` — solid color. CSS blur handles edges.

### 🟡 DECISION — Core bristles at 22% of glow bristle width
Core bristles (`isBright: true`) are the hot spine through each glow bristle. Near-white at center, pure pitch color at edges. Sharp, no blur. 22% width creates a clearly visible but not dominant hot line.

### 🟡 DECISION — `buildPolygonPathOnCtx()` added alongside existing function
Rather than modifying `buildPolygonPath()` (which glow stick mode depends on), a context-accepting variant was added. Glow stick mode unaffected.

### 🟡 DECISION — Bristle definitions stored at spawn time
Bristle randomness generated once at `spawnRibbon()` and stored as `ribbon.bristles`. Generated-per-frame randomness produces noise, not texture. Spawn-time randomness produces stable, consistent character per ribbon.

---

### Why previous approaches failed

| Approach | Why it failed |
|---|---|
| Wide polygon + gradient opacity | Gradients produce flat color bands. Opacity reduction makes colors invisible not translucent. |
| `screen` compositing | Only adds light when source colors are bright AND opaque. Medium-brightness transparent colors produce muddy mixes. |
| `source-over` + low opacity | Colors become too faint. Vivid color AND transparent edges simultaneously impossible. |
| Forced saturation/lightness | Helps but gradient transparency still makes colors appear dark. |
| Linear gradient for core | Fixed coordinates produce straight-line gradient regardless of ribbon curvature. |

---

### Learnings from Phase 18

**L25 — CSS blur is the right tool for soft glowing edges in Canvas 2D**
`ctx.filter = 'blur()'` is expensive per-call. CSS `filter: blur()` on the canvas element is applied by the browser compositor — essentially free. Correct approach for persistent atmospheric glow.

**L26 — Solid color + blur > transparent gradient**
When you need soft glowing shapes: render solid, let blur create edges. This is a fundamental Canvas 2D rendering principle.

**L27 — Creative framing can lead directly to technical solutions**
The "brush stroke" framing was not just aesthetic language — it was a precise technical description (individual elements with variation) that translated directly to the bristle architecture. Translating creative descriptions into technical implementations is a core skill.

**L28 — Multiple canvas elements are cheap**
Three full-screen canvases with different CSS filters is not a performance concern on modern hardware. Don't avoid multiple canvases out of premature optimization.

**L29 — Store randomness at spawn time, not render time**
Random variation that should feel stable must be generated once and stored. Per-frame randomness = noise. Spawn-time randomness = character.

---

## Additional Learnings from Session 2

**L21 — Update the decision log at the end of every session**
The decision log was created and then not updated for an entire session. Make updating the log the last step of every session, like a git commit.

**L22 — Create a skill file for this project's Claude Code workflow**
Prompt patterns developed in this project should be captured in `CLAUDE.md` so they're available to Claude Code automatically.

**L23 — Test track switching early**
State management bugs on track change only appear after switching tracks. Add it to the test checklist for every milestone touching ribbon or audio state.

**L24 — Shared visual utilities belong in renderer.js**
Any visual feature working across all render modes belongs in `renderer.js` as a shared function. Render modes call it in one line. The toggle lives inside the shared function.

---

*Session 2 + Phase 18 added. Last updated: April 2026.*
*Next: Run two-canvas bristle prompt, then tune blur amount and bristle parameters.*
