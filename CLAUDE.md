# Synesthesia App — Claude Code Instructions

*Project-specific rules. Global rules in ~/.claude/CLAUDE.md also apply.*

---

## Project Context
See README.md for full context. Paste it at the start of any new session.

## Tech Stack
- Vanilla HTML / CSS / JavaScript — no frameworks, no build tools
- Web Audio API for audio analysis
- Canvas API for visualization
- No npm, no bundler

## Current Status
- Milestone 1 ✅ — Foundation, aurora canvas, audio upload/playback
- Milestone 2 ✅ — Web Audio API, frequency analysis, beat detection
- Milestone 3 🔲 — Connect audioData to aurora visuals

## Key Architecture Decisions
- AudioContext created on first user gesture only (autoplay policy)
- audioData object is the single source of truth between audio and visuals
- Color model: HSL throughout — never RGB for internal logic
- Beat detection: delta method (not rolling average) — see comments in main.js

## Files
- js/main.js — all JavaScript, single file for now
- css/style.css — all styles
- docs/visual-design.md — visual design decisions
- docs/research.md — synesthesia research notes