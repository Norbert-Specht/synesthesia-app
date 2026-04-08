// =============================================================================
// SYNESTHESIA APP — profiles.js
// =============================================================================
//
// Active synesthete profile state and the color pipeline function that
// translates a pitch class index into a live-modulated HSL color.
//
// The active profile maps pitch class indices (0–11) to HSL colors.
// All color lookups go through getProfileColor(), which applies the full
// modulation pipeline on top of the base color.
//
// In Milestone 4 this will be swapped live via a profile switcher UI.
// =============================================================================

import { RIMSKY_KORSAKOV_PROFILE } from '../profiles/rimsky-korsakov.js';
import { audioData } from './audio.js';


// ================================
// ACTIVE PROFILE
//
// The active synesthete profile maps pitch class indices (0–11) to HSL colors.
// RIMSKY_KORSAKOV_PROFILE is imported directly from its ES module.
// All color lookups go through getProfileColor(), which applies the full
// modulation pipeline on top of the base color.
//
// In Milestone 4 this will be swapped live via a profile switcher UI.
// ================================

export let activeProfile = RIMSKY_KORSAKOV_PROFILE;


// ================================
// RIBBON SYSTEM — COLOR PIPELINE
//
// Translates a pitch class index (0–11) into a modulated HSL color by
// looking up the base hue from the active synesthete profile and then
// applying three live modulations:
//
//   1. Amplitude scales saturation (0.35–1.0 range).
//      Quiet → muted, desaturated colors. Loud → vivid, saturated colors.
//      Matches research: louder synesthetic experiences appear more vivid.
//
//   2. Spectral brightness shifts lightness ±4 points.
//      spectralBrightness raw range from Meyda is 0.001–0.010; multiply by
//      100 to map to 0.1–1.0 before the lightness offset calculation.
//
//   3. Beat intensity adds up to +18 lightness on onset — a brief color bloom
//      when a musical transient fires.
//
// Parameters:
//   pitchClass — integer 0–11 (0 = C, 11 = B)
//
// Returns: { h, s, l }
// ================================

export function getProfileColor(pitchClass) {
  const base = activeProfile.pitchColors[pitchClass];

  // The profile hue is chromesthetically meaningful — never override it.
  const h = base.h;

  // Force saturation into a range that produces visible glowing light.
  // Profile base values are too muted for screen-blend luminous rendering;
  // 78–95% ensures the color is always deeply saturated.
  const s = 78 + audioData.amplitude * 17;   // 78–95% range, louder = more vivid

  // Force lightness into a mid-high range. Dark colors cannot glow with screen
  // blending — they need to be bright enough to add visible light to the scene.
  // Beat intensity adds a +10% flash on musical onsets.
  const l = 48 + audioData.amplitude * 16    // 48–64% range, louder = brighter
            + audioData.beatIntensity * 10;   // brief onset bloom

  return {
    h,
    s: Math.min(95, s),
    l: Math.min(74, l),
  };
}
