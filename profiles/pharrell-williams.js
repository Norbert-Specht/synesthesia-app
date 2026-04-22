 // =============================================================================
// PROFILE: Pharrell Williams (b. 1973)
// =============================================================================
//
// Pharrell Williams is a Grammy-winning musician, producer, and songwriter
// who has openly discussed his chromesthesia in multiple interviews. Unlike
// most documented synesthetes whose color associations are idiosyncratic,
// Pharrell describes a system that maps directly onto the visible light
// spectrum — the seven musical notes correspond to the seven rainbow colors.
//
// His documented system (from NPR interview, December 2013, and other sources):
//   "There are seven basic colors: red, orange, yellow, green, blue, indigo
//   and violet. And those also correspond with musical notes. White, believe
//   it or not, which gives you an octave, is the blending of all the colors."
//
// Natural note → color mapping (documented):
//   C → Red
//   D → Orange
//   E → Yellow
//   F → Green
//   G → Blue
//   A → Indigo
//   B → Violet
//
// Sharps/flats (5 undocumented pitch classes) → interpolated between neighbors:
//   Pharrell describes additive color mixing (white = all colors blended),
//   suggesting a spectrum-continuous model. Sharps/flats are therefore
//   assigned the midpoint hue between their two natural neighbors.
//   This is musically logical (C# is between C and D → between red and orange)
//   and consistent with his described color philosophy.
//
// Sources:
//   - NPR: "Pharrell Williams on Juxtaposition and Seeing Sounds" (Dec 2013)
//   - Various interviews where Pharrell describes his rainbow-note system
//   - Popdust: "15 Iconic Musicians with Synesthesia"
//
// Profile structure matches rimsky-korsakov.js for compatibility with
// the profile switching system in profiles.js.
// =============================================================================

export const PHARRELL_WILLIAMS_PROFILE = {

  name: 'Pharrell Williams',

  description: 'Grammy-winning musician & producer (b. 1973). ' +
               'Maps the 7 musical notes directly to the 7 colors of the ' +
               'visible spectrum — red through violet.',

  // ---------------------------------------------------------------------------
  // Pitch class color mappings (index 0 = C, 1 = C#, 2 = D ... 11 = B)
  //
  // Natural notes use Pharrell's documented rainbow system.
  // Sharps/flats interpolated as midpoint hues between adjacent naturals.
  //
  // HSL values tuned for aurora/glow rendering on dark background:
  //   - Saturation: 90–100% (vivid, spectrum quality)
  //   - Lightness: 55–65% (luminous without washing out on dark canvas)
  //
  // The spectrum hues used:
  //   Red    ≈ hue 0–5°
  //   Orange ≈ hue 28–32°
  //   Yellow ≈ hue 55–60°
  //   Green  ≈ hue 130–140°
  //   Blue   ≈ hue 210–220°
  //   Indigo ≈ hue 245–255°
  //   Violet ≈ hue 270–280°
  // ---------------------------------------------------------------------------

  pitchColors: [

    // Index 0 — C
    // Pharrell: Red
    { h: 4,   s: 95,  l: 58 },

    // Index 1 — C# / Db
    // Interpolated: midpoint between C (red, h:4) and D (orange, h:30)
    // → red-orange, hue ~17°
    { h: 17,  s: 92,  l: 58 },

    // Index 2 — D
    // Pharrell: Orange
    { h: 30,  s: 95,  l: 60 },

    // Index 3 — D# / Eb
    // Interpolated: midpoint between D (orange, h:30) and E (yellow, h:58)
    // → yellow-orange, hue ~44°
    { h: 44,  s: 92,  l: 60 },

    // Index 4 — E
    // Pharrell: Yellow
    // Lightness raised to 65% — yellow needs higher lightness to read as
    // vivid rather than olive on a dark background
    { h: 58,  s: 90,  l: 65 },

    // Index 5 — F
    // Pharrell: Green
    { h: 135, s: 90,  l: 55 },

    // Index 6 — F# / Gb
    // Interpolated: midpoint between F (green, h:135) and G (blue, h:215)
    // → cyan/teal, hue ~175°
    { h: 175, s: 88,  l: 57 },

    // Index 7 — G
    // Pharrell: Blue
    { h: 215, s: 90,  l: 60 },

    // Index 8 — G# / Ab
    // Interpolated: midpoint between G (blue, h:215) and A (indigo, h:250)
    // → blue-indigo, hue ~232°
    { h: 232, s: 88,  l: 58 },

    // Index 9 — A
    // Pharrell: Indigo
    // Lightness slightly raised — indigo at low lightness reads as near-black
    { h: 250, s: 88,  l: 62 },

    // Index 10 — A# / Bb
    // Interpolated: midpoint between A (indigo, h:250) and B (violet, h:278)
    // → indigo-violet, hue ~264°
    { h: 264, s: 88,  l: 60 },

    // Index 11 — B
    // Pharrell: Violet
    { h: 278, s: 90,  l: 60 },

  ],

};
