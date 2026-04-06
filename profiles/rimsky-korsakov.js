// =============================================================================
// PROFILE: Nikolai Rimsky-Korsakov (1844–1908)
// =============================================================================
//
// Rimsky-Korsakov was a Russian composer with one of the most thoroughly
// documented synesthetic palettes in music history. He mapped musical keys
// to specific colors — a practice that directly influenced his orchestration
// and instrumentation choices.
//
// This profile maps the 12 pitch classes (C through B) to HSL colors
// derived from his documented key-color associations. Where Rimsky-Korsakov
// described a major key color, that hue is used for the pitch class.
// Lightness and saturation are tuned for the aurora visualization context
// (rendered on a near-black background, blended with 'screen' compositing).
//
// Sources:
//   - Rimsky-Korsakov, N. — My Musical Life (autobiography)
//   - Brown, S. — "The 'Musilanguage' Model of Music Evolution" (2000)
//   - The Synesthesia Tree — documented key-color associations
//   - Myers, C.S. — "Two Cases of Synaesthesia" (1914)
//
// Profile data structure:
//   pitchColors[i] = { h, s, l }   where i = pitch class index (0=C, 1=C#...)
//   name           = display name shown in profile switcher UI
//   description    = short description shown in profile switcher UI
// =============================================================================

const RIMSKY_KORSAKOV_PROFILE = {

  name: 'Rimsky-Korsakov',

  description: 'Russian composer (1844–1908). One of the most documented ' +
               'synesthetic palettes in music history.',

  // ---------------------------------------------------------------------------
  // Pitch class color mappings (index 0 = C, 1 = C#, 2 = D ... 11 = B)
  //
  // Each color is defined as HSL:
  //   h — hue (0–360)
  //   s — saturation (0–100%)
  //   l — lightness (0–100%)
  //
  // Lightness values are tuned for aurora rendering — bright enough to glow
  // on a dark background but not so high they wash out with screen blending.
  // ---------------------------------------------------------------------------

  pitchColors: [

    // Index 0 — C
    // Rimsky-Korsakov: "White" — pure, clear, bright
    { h: 0,   s: 0,   l: 92 },

    // Index 1 — C# / Db
    // Rimsky-Korsakov: "Bright blue, icy" — F# major association applied
    // to the enharmonic pitch class. Clear, cold, crystalline.
    { h: 195, s: 80,  l: 62 },

    // Index 2 — D
    // Rimsky-Korsakov: "Golden, sunny, triumphant"
    { h: 45,  s: 90,  l: 58 },

    // Index 3 — D# / Eb
    // Rimsky-Korsakov: "Dark, gloomy, grey-blue" — one of his most
    // distinctive associations. Steel-like, cold, heavy.
    { h: 220, s: 28,  l: 38 },

    // Index 4 — E
    // Rimsky-Korsakov: "Sapphire blue, sparkling, bright"
    { h: 210, s: 85,  l: 58 },

    // Index 5 — F
    // Rimsky-Korsakov: "Green, pastoral, forest"
    { h: 130, s: 60,  l: 45 },

    // Index 6 — F# / Gb
    // Rimsky-Korsakov: "Greyish-green, bright, clear"
    // Described as bright and somewhat glassy — sea-green quality.
    { h: 160, s: 50,  l: 55 },

    // Index 7 — G
    // Rimsky-Korsakov: "Brownish-gold, rich" — warm, earthy brightness.
    { h: 38,  s: 72,  l: 48 },

    // Index 8 — G# / Ab
    // Rimsky-Korsakov: "Greyish-violet" — muted, hazy purple-grey.
    { h: 270, s: 28,  l: 48 },

    // Index 9 — A
    // Rimsky-Korsakov: "Clear, rosy, tender"
    { h: 348, s: 68,  l: 65 },

    // Index 10 — A# / Bb
    // Rimsky-Korsakov: "Dark, somewhat wild, somber"
    // Warm but heavy — a dark amber-orange.
    { h: 22,  s: 58,  l: 35 },

    // Index 11 — B
    // Rimsky-Korsakov: "Dark, steel-grey, gloomy" — cold and heavy.
    { h: 215, s: 22,  l: 33 },

  ],

};

// Export for use in main.js
// When the profile system expands (Milestone 4), all profiles will follow
// this same structure and be loaded dynamically via a profile manager.
if (typeof module !== 'undefined') {
  module.exports = RIMSKY_KORSAKOV_PROFILE;
}
