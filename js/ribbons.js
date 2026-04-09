// =============================================================================
// SYNESTHESIA APP — ribbons.js
// =============================================================================
//
// Ribbon and glow stick pool management: spawn, lifecycle state machine,
// opacity animation, and horizontal positioning for both render modes.
//
// Two completely separate pools:
//   ribbons[]    — aurora mode. Max 3 (1 primary + up to 2 secondary).
//   glowsticks[] — glow stick mode. Max 9 (1 dominant + clusters + tertiaries).
//
// Switching modes leaves each pool's ribbons/sticks to fade out independently
// while the new mode's pool starts fresh. The pools never share state.
// =============================================================================

import { audioData, lerp } from './audio.js';
import { getProfileColor } from './profiles.js';
import { renderMode } from './ui.js';


// ================================
// RIBBON SYSTEM — CONSTANTS
// ================================

// Debounce for pitch transitions is now adaptive — computed per frame from the
// dominant pitch's chroma energy rather than a fixed constant. See the
// debounceMs calculation inside updateRibbonLifecycle() and updateGlowstickLifecycle().

// Hard cap on simultaneous live ribbons (1 primary + up to 2 secondary).
// Matches the research: one dominant color with 1–2 harmonic tints.
const MAX_RIBBONS = 3;

// Hard cap on simultaneous live glow sticks (separate pool from aurora ribbons).
// 9 = 1 dominant solo + up to 2 secondary clusters (3 sticks each) + 2 tertiary solos.
const MAX_GLOWSTICKS = 9;

// Glow stick opacity lerp rates — asymmetric timing is the defining character
// of the glow stick mode: fast snappy appearance vs gradual atmospheric fade.
//   rising: 0.15  — nearly instant (about 4–5 frames to 50%); energy arrives fast
//   fading: 0.045 — moderate fade (~15 frames to 50%); keeps up with faster pitch
//           transitions without leaving a screen full of ghost sticks. Previous
//           value 0.022 was tuned for rare transitions — too slow now that
//           debounce fires at 160ms for strong notes.
const GLOWSTICK_RISE_RATE = 0.15;
const GLOWSTICK_FADE_RATE = 0.045;


// ================================
// RIBBON SYSTEM — STATE
//
// The ribbon pool replaces the previous AURORA_LAYERS + visualState approach.
//
// Why the change:
//   The old system used a fixed array of 5 horizontal bands (AURORA_LAYERS),
//   each mapped to a static frequency zone (bass / mid / high). Colors were
//   hardcoded per layer. visualState lerped band energies to smooth motion,
//   but there was no connection between the actual musical pitch being played
//   and the colors shown — the same 5 fixed colors appeared regardless of note.
//
//   The ribbon pool replaces this with a dynamic system: ribbons are born,
//   promoted, demoted, and faded based on which pitch classes Meyda detects
//   as dominant. Each ribbon's color comes from the synesthete profile lookup
//   for its specific pitch class. The result is a visualization that genuinely
//   responds to harmony, not just energy levels.
// ================================

// Live ribbon pool — written by updateRibbonLifecycle(), read by drawRibbon().
// Maximum MAX_RIBBONS entries at any time.
export let ribbons = [];

// Debounce tracking — the candidate dominant pitch and when it first appeared.
// A ribbon transition only fires after RIBBON_DEBOUNCE_MS of stability.
let dominantPitchCandidate     = -1;
let dominantPitchDebounceStart = 0;

// ================================
// GLOW STICK POOL STATE
//
// Completely separate from the aurora ribbon pool. The two pools never mix —
// switching modes leaves each pool's ribbons to fade out independently while
// the new mode's pool starts fresh.
//
// Pool structure (max 9 simultaneous sticks):
//   1 dominant solo      — glowThickness 1.0, full intensity
//   up to 2 secondaries  — each spawns 3 sticks (center + 2 satellites)
//   up to 2 tertiaries   — glowThickness 0.38, present when chroma energy > 0.35
//
// Dominant is visually strongest (thickest, most opaque) because it represents
// the pitch class the synesthete perceives as primary. Secondaries form clusters
// because chord notes aren't isolated — they relate to each other harmonically.
// Tertiary sticks are thin and dim — ambient harmonic content, not the melody.
// ================================

// Live glow stick pool — written by updateGlowstickLifecycle().
export let glowsticks = [];

// Separate debounce state for glow stick mode — independent from aurora debounce
// so switching modes doesn't carry over stale timing state.
let glowstickPitchCandidate     = -1;
let glowstickPitchDebounceStart = 0;


// ================================
// RIBBON SYSTEM — HORIZONTAL POSITIONING
//
// Returns an x position (as a canvas fraction 0.0–1.0) for a new ribbon,
// spreading ribbons across three horizontal zones to prevent visual overlap.
//
// The algorithm prefers zones that aren't occupied by any live ribbon.
// Within the chosen zone a random position is selected with ±0.08 jitter.
// A minimum 0.18-fraction separation from every existing ribbon is enforced.
//
// Returns: number — x fraction 0.10–0.90
// ================================

function getAsymmetricX() {
  // Three horizontal zones. Left/right are narrower than centre, pushing
  // ribbons toward the visual "shoulders" of the screen for a more
  // interesting composition than evenly-spaced thirds.
  const zones = [
    { min: 0.15, max: 0.38 },  // left zone
    { min: 0.38, max: 0.62 },  // centre zone
    { min: 0.62, max: 0.85 },  // right zone
  ];

  // Determine which zone indices are already occupied by live ribbons.
  const occupiedZoneIndices = new Set();
  ribbons.forEach(r => {
    zones.forEach((z, i) => {
      if (r.xFraction >= z.min && r.xFraction < z.max) occupiedZoneIndices.add(i);
    });
  });

  // Prefer a free zone; fall back to any zone if all three are occupied.
  const freeZones = zones.filter((_, i) => !occupiedZoneIndices.has(i));
  const pool      = freeZones.length > 0 ? freeZones : zones;
  const zone      = pool[Math.floor(Math.random() * pool.length)];

  // Random position within zone + ±0.08 jitter for organic feel.
  let x = zone.min + Math.random() * (zone.max - zone.min);
  x += (Math.random() - 0.5) * 0.08;
  x  = Math.max(0.10, Math.min(0.90, x));

  // Enforce minimum 0.18 separation from every existing ribbon's base x.
  // If too close, try up to 12 random alternates before giving up.
  const tooClose = () => ribbons.some(r => Math.abs(r.xFraction - x) < 0.18);
  if (tooClose()) {
    for (let attempt = 0; attempt < 12; attempt++) {
      x = 0.10 + Math.random() * 0.80;
      if (!tooClose()) break;
    }
    x = Math.max(0.10, Math.min(0.90, x));
  }

  return x;
}


// ================================
// GLOW STICK POOL — BASE X PICKER
//
// Equivalent of getAsymmetricX() for the glow stick pool. Picks a horizontal
// position for a cluster center or solo stick by checking the glowsticks pool
// (not ribbons) for occupied zones. Satellite positions are then derived from
// this base by spawnGlowCluster() — they are not chosen independently.
//
// Returns: number — x fraction 0.12–0.88
// ================================

function getGlowstickBaseX() {
  const zones = [
    { min: 0.15, max: 0.38 },  // left
    { min: 0.38, max: 0.62 },  // centre
    { min: 0.62, max: 0.85 },  // right
  ];

  // Only cluster centers and solos occupy a zone — satellites don't count
  // because they're placed relative to their center, not independently.
  const anchors = glowsticks.filter(
    s => (s.clusterRole === 'center' || s.clusterRole === 'solo')
      && s.state !== 'fading' && s.state !== 'dead'
  );

  const occupiedZoneIndices = new Set();
  anchors.forEach(s => {
    zones.forEach((z, i) => {
      if (s.xFraction >= z.min && s.xFraction < z.max) occupiedZoneIndices.add(i);
    });
  });

  const freeZones = zones.filter((_, i) => !occupiedZoneIndices.has(i));
  const pool      = freeZones.length > 0 ? freeZones : zones;
  const zone      = pool[Math.floor(Math.random() * pool.length)];

  let x = zone.min + Math.random() * (zone.max - zone.min);
  x += (Math.random() - 0.5) * 0.06;
  return Math.max(0.12, Math.min(0.88, x));
}


// ================================
// RIBBON SYSTEM — SPAWN
//
// Creates and returns a new ribbon object for the given pitch class.
// The ribbon starts in state 'rising' with opacity 0 — updateRibbonOpacities()
// lerps it toward targetOpacity over subsequent frames.
//
// Parameters:
//   pitchClass — integer 0–11; the pitch class this ribbon represents
//   role       — 'primary' | 'secondary'; sets target opacity and draw order
//
// Returns: ribbon object (caller is responsible for pushing to ribbons array)
// ================================

function spawnRibbon(pitchClass, role) {
  return {
    pitchClass,
    role,
    state:         'rising',
    opacity:       0.0,

    // Primary ribbons are brighter and more dominant. Secondary ribbons are
    // translucent tints — present but not overwhelming.
    targetOpacity: role === 'primary' ? 0.88 : 0.52,

    xFraction:  getAsymmetricX(),

    // Per-ribbon thickness multiplier (0.9–1.2) — prevents all ribbons looking
    // identical in girth.
    thickness:  0.9 + Math.random() * 0.3,

    // Color computed at spawn; refreshed every frame by updateRibbonOpacities().
    hsl:        getProfileColor(pitchClass),

    // Phase offset shifts the sine waves so ribbons drift independently.
    // Without this, all ribbons would sway in unison and look mechanical.
    // Set to 0 in glow stick mode — straight tubes have no phase to offset.
    timeOffset: renderMode === 'glowstick' ? 0 : Math.random() * Math.PI * 2,

    // Per-ribbon shape parameters — randomized at spawn so no two ribbons
    // ever move or curve the same way. Read by drawRibbonAurora() each frame.
    // Not set in glow stick mode: straight tubes don't drift or curve, and
    // leaving these undefined prevents renderer code from silently using them.
    ...(renderMode !== 'glowstick' && {
      waveFreq1:   0.8 + Math.random() * 0.8,    // primary sine spatial frequency;  range 0.8–1.6
      waveFreq2:   0.5 + Math.random() * 0.9,    // secondary sine spatial frequency; range 0.5–1.4
      driftSpeed:  0.12 + Math.random() * 0.14,  // time-based lateral drift rate;    range 0.12–0.26
      wobbleRatio: 0.25 + Math.random() * 0.30,  // secondary wave amplitude fraction; range 0.25–0.55
    }),

    spawnTime:  performance.now(),

    // --- Glow stick mode properties ---
    // Set to neutral defaults here; overridden by spawnGlowCluster() when
    // creating sticks for glow stick mode. Aurora rendering ignores all five.

    // Whether this ribbon belongs to a cluster (secondary pitch group).
    // Solo sticks (dominant and tertiary) have isClusterMember: false.
    isClusterMember: false,

    // Position within its cluster: 'solo' | 'center' | 'satellite'.
    // 'solo'      — dominant or tertiary, no cluster relationship
    // 'center'    — the main stick of a secondary cluster
    // 'satellite' — offset sibling of a cluster center, always thinner
    clusterRole: 'solo',

    // Horizontal offset from cluster center, expressed as a fraction of
    // canvas width. 0 for solo and center; set to the actual offset distance
    // for satellites (tight: 0.028–0.055, loose: 0.07–0.13).
    clusterOffset: 0,

    // Width multiplier applied in drawRibbonGlowstick() to all three polygon
    // passes. Encodes musical role as visual weight:
    //   1.0  — dominant (thickest — the pitch you're hearing most clearly)
    //   0.68 — secondary cluster center
    //   0.45 — tight satellite
    //   0.35 — loose satellite
    //   0.38 — tertiary solo (thinnest — ambient harmonic content)
    glowThickness: 1.0,

    // Opacity multiplier driven by chroma energy of this pitch class.
    // Dominant is always 1.0 (full intensity). Secondary and tertiary scale
    // with their actual chroma energy so quieter pitch classes appear dimmer.
    glowIntensity: 1.0,
  };
}


// ================================
// GLOW STICK POOL — CLUSTER SPAWNER
//
// Spawns one or more glow sticks into the glowsticks pool for a given pitch
// class, based on that pitch class's musical role in the current harmony.
//
// Three roles produce different visual weight and cluster structure:
//
//   'dominant'  — 1 solo stick, glowThickness 1.0.
//                 Thickest and most opaque because it represents the note
//                 the listener perceives as the primary pitch.
//
//   'secondary' — 3 sticks: 1 center + 2 satellites.
//                 Cluster mimics how harmonic chord tones relate — one central
//                 note with surrounding tones at irregular intervals.
//                 Option C spacing: one satellite tight (2.8–5.5% canvas width),
//                 one loose (7–13%), randomised left/right so clusters look
//                 organic rather than mechanically mirrored.
//
//   'tertiary'  — 1 solo stick, glowThickness 0.38.
//                 Thinnest — ambient harmonic content detected in chroma but
//                 not musically prominent. Dim and background.
//
// Parameters:
//   pitchClass   — integer 0–11; the pitch class to represent
//   chromaEnergy — 0.0–1.0 chroma energy for this pitch class, drives opacity
//   role         — 'dominant' | 'secondary' | 'tertiary'
// ================================

function spawnGlowCluster(pitchClass, chromaEnergy, role) {
  if (role === 'dominant') {
    const stick           = spawnRibbon(pitchClass, 'primary');
    stick.xFraction       = getGlowstickBaseX();
    stick.isClusterMember = false;
    stick.clusterRole     = 'solo';
    stick.clusterOffset   = 0;
    stick.glowThickness   = 1.0;
    stick.glowIntensity   = 1.0;
    stick.targetOpacity   = 0.92;
    glowsticks.push(stick);

  } else if (role === 'secondary') {
    // Choose a base x for the cluster, then derive satellite positions from it.
    const centerX = getGlowstickBaseX();

    // Option C spacing: tight satellite close-in, loose satellite farther out.
    // Fractional offsets are proportional to canvas width — scale-independent.
    const tightOffset = 0.028 + Math.random() * (0.055 - 0.028);
    const looseOffset = 0.07  + Math.random() * (0.13  - 0.07);

    // Randomise which satellite is left vs right to avoid mirror symmetry.
    const tightSide = Math.random() < 0.5 ? -1 : 1;
    const looseSide = -tightSide;

    // Center stick — the harmonic root of this secondary pitch group.
    const center           = spawnRibbon(pitchClass, 'secondary');
    center.xFraction       = centerX;
    center.isClusterMember = true;
    center.clusterRole     = 'center';
    center.clusterOffset   = 0;
    center.glowThickness   = 0.68;
    center.glowIntensity   = chromaEnergy;
    center.targetOpacity   = 0.76 * chromaEnergy;
    glowsticks.push(center);

    // Satellite 1 — tight offset; represents a close harmonic interval.
    const sat1           = spawnRibbon(pitchClass, 'secondary');
    sat1.xFraction       = Math.max(0.05, Math.min(0.95, centerX + tightSide * tightOffset));
    sat1.isClusterMember = true;
    sat1.clusterRole     = 'satellite';
    sat1.clusterOffset   = tightOffset;
    sat1.glowThickness   = 0.45;
    sat1.glowIntensity   = chromaEnergy * 0.8;
    sat1.targetOpacity   = 0.58 * chromaEnergy;
    glowsticks.push(sat1);

    // Satellite 2 — loose offset; represents a wider harmonic interval.
    const sat2           = spawnRibbon(pitchClass, 'secondary');
    sat2.xFraction       = Math.max(0.05, Math.min(0.95, centerX + looseSide * looseOffset));
    sat2.isClusterMember = true;
    sat2.clusterRole     = 'satellite';
    sat2.clusterOffset   = looseOffset;
    sat2.glowThickness   = 0.35;
    sat2.glowIntensity   = chromaEnergy * 0.6;
    sat2.targetOpacity   = 0.44 * chromaEnergy;
    glowsticks.push(sat2);

  } else if (role === 'tertiary') {
    // Single thin solo — ambient harmonic content, not melodically prominent.
    const stick           = spawnRibbon(pitchClass, 'secondary');
    stick.xFraction       = getGlowstickBaseX();
    stick.isClusterMember = false;
    stick.clusterRole     = 'solo';
    stick.clusterOffset   = 0;
    stick.glowThickness   = 0.38;
    stick.glowIntensity   = chromaEnergy * 0.7;
    stick.targetOpacity   = 0.38 * chromaEnergy;
    glowsticks.push(stick);
  }
}


// ================================
// RIBBON SYSTEM — LIFECYCLE MANAGER
//
// Called every frame. Drives the ribbon pool state machine:
//   1. Removes 'dead' ribbons from the pool.
//   2. Reads audioData.dominantPitch to detect pitch changes.
//   3. Applies an adaptive debounce (80–180ms, or Infinity for weak pitches)
//      so vibrato / passing tones don't trigger spurious ribbon transitions.
//   4. On confirmed pitch change: demotes current primary to secondary,
//      fades excess secondaries, spawns a new primary.
//   5. First-ribbon fast-path: bypasses debounce on an empty pool so the
//      screen isn't blank for 500ms at track start.
// ================================

export function updateRibbonLifecycle() {
  const now         = performance.now();
  const newDominant = audioData.dominantPitch;

  // Remove fully faded ribbons — they contribute nothing to the render.
  ribbons = ribbons.filter(r => r.state !== 'dead');

  // --- First-ribbon fast-path ---
  // If there is no active primary, spawn immediately without debounce.
  const hasPrimary = ribbons.some(
    r => r.role === 'primary' && r.state !== 'fading' && r.state !== 'dead'
  );
  if (!hasPrimary && newDominant >= 0) {
    ribbons.push(spawnRibbon(newDominant, 'primary'));
    audioData.secondaryPitches.slice(0, 2).forEach(p => {
      if (ribbons.length < MAX_RIBBONS) ribbons.push(spawnRibbon(p, 'secondary'));
    });
    // Initialise debounce state so the normal path works correctly next frame.
    dominantPitchCandidate     = newDominant;
    dominantPitchDebounceStart = now;
    return;
  }

  // --- Adaptive debounce: response speed scales with pitch detection confidence ---
  // Strong clear notes (energy > 0.65) trigger almost instantly (80ms).
  // Moderate confidence (0.35–0.65) waits 180ms before committing.
  // Below 0.35 the pitch is noise — never trigger a transition.
  const dominantEnergy = audioData.chroma[audioData.dominantPitch];
  const debounceMs = dominantEnergy > 0.65 ? 160
                   : dominantEnergy > 0.35 ? 280
                   : Infinity;   // below threshold — ignore

  if (newDominant !== dominantPitchCandidate) {
    // Candidate shifted — restart the timer.
    dominantPitchCandidate     = newDominant;
    dominantPitchDebounceStart = now;
    return;
  }

  // Still inside the debounce window — hold off.
  if ((now - dominantPitchDebounceStart) < debounceMs) return;

  // --- Check whether the stabilised pitch differs from the current primary ---
  const currentPrimary = ribbons.find(
    r => r.role === 'primary' && r.state !== 'fading' && r.state !== 'dead'
  );
  if (currentPrimary && currentPrimary.pitchClass === newDominant) {
    // Same pitch as the active primary — nothing to do. Reset the debounce
    // so this check doesn't re-fire every frame after the window elapses.
    dominantPitchDebounceStart = now;
    return;
  }

  // --- Trigger ribbon transition ---

  // 1. Demote current primary to secondary — it dims but stays visible.
  if (currentPrimary) {
    currentPrimary.role          = 'secondary';
    currentPrimary.state         = 'demoting';
    currentPrimary.targetOpacity = 0.38;
  }

  // 2. Fade oldest excess secondaries to stay within MAX_RIBBONS when the
  //    new primary arrives. Reserve one slot for the incoming primary.
  const liveSecondaries = ribbons.filter(
    r => r.role === 'secondary' && r.state !== 'fading' && r.state !== 'dead'
  );
  const secondarySlots = MAX_RIBBONS - 1;   // slots left after the new primary
  liveSecondaries
    .sort((a, b) => a.spawnTime - b.spawnTime)          // oldest first
    .slice(0, Math.max(0, liveSecondaries.length - secondarySlots))
    .forEach(r => { r.state = 'fading'; r.targetOpacity = 0; });

  // 3. Spawn the new primary for the confirmed dominant pitch.
  if (newDominant >= 0) ribbons.push(spawnRibbon(newDominant, 'primary'));

  // 4. Add secondary pitches not already represented in the live pool.
  const livePitches = new Set(
    ribbons.filter(r => r.state !== 'fading' && r.state !== 'dead').map(r => r.pitchClass)
  );
  audioData.secondaryPitches.forEach(p => {
    const liveCount = ribbons.filter(r => r.state !== 'fading' && r.state !== 'dead').length;
    if (!livePitches.has(p) && liveCount < MAX_RIBBONS) {
      ribbons.push(spawnRibbon(p, 'secondary'));
      livePitches.add(p);
    }
  });

  // 5. Reset the debounce so we don't re-fire on the next frame.
  dominantPitchDebounceStart = now;
}


// ================================
// GLOW STICK POOL — LIFECYCLE MANAGER
//
// Called every frame when renderMode === 'glowstick'. Manages the glowsticks
// pool independently of the aurora ribbon pool — the two never share state.
//
// Pool state machine (mirrors aurora lifecycle but with different thresholds):
//   1. Prune dead sticks.
//   2. Fast-path: if pool is empty, spawn immediately without debounce.
//   3. Adaptive debounce (80–180ms) before acting on a pitch change.
//   4. On confirmed dominant pitch change: fade all current sticks,
//      spawn new clusters for dominant + secondary + tertiary pitches.
//   5. Retire oldest tertiary solo first when MAX_GLOWSTICKS would be exceeded.
// ================================

export function updateGlowstickLifecycle() {
  const now         = performance.now();
  const newDominant = audioData.dominantPitch;

  // Remove fully faded sticks — they no longer contribute to the render.
  glowsticks = glowsticks.filter(s => s.state !== 'dead');

  // --- Fast-path: empty pool spawns immediately without debounce ---
  // Prevents the screen being blank for 500ms at track start or mode switch.
  const hasDominantSolo = glowsticks.some(
    s => s.glowThickness === 1.0 && s.clusterRole === 'solo'
      && s.state !== 'fading' && s.state !== 'dead'
  );
  if (!hasDominantSolo && newDominant >= 0) {
    spawnGlowCluster(newDominant, 1.0, 'dominant');

    audioData.secondaryPitches.slice(0, 2).forEach(p => {
      const energy     = audioData.chroma[p] || 0;
      const liveCount  = glowsticks.filter(s => s.state !== 'dead').length;
      if (liveCount + 3 <= MAX_GLOWSTICKS) spawnGlowCluster(p, energy, 'secondary');
    });

    glowstickPitchCandidate     = newDominant;
    glowstickPitchDebounceStart = now;
    return;
  }

  // --- Adaptive debounce: mirrors the aurora lifecycle debounce logic ---
  // Same energy thresholds — strong notes respond at 80ms, moderate at 180ms,
  // below 0.35 energy the pitch is treated as noise and ignored.
  const dominantEnergy = audioData.chroma[audioData.dominantPitch];
  const debounceMs = dominantEnergy > 0.65 ? 160
                   : dominantEnergy > 0.35 ? 280
                   : Infinity;   // below threshold — ignore

  if (newDominant !== glowstickPitchCandidate) {
    glowstickPitchCandidate     = newDominant;
    glowstickPitchDebounceStart = now;
    return;
  }
  if ((now - glowstickPitchDebounceStart) < debounceMs) return;

  // --- Check if the stabilised dominant pitch is already represented ---
  const currentDominantStick = glowsticks.find(
    s => s.pitchClass === newDominant
      && s.glowThickness === 1.0 && s.clusterRole === 'solo'
      && s.state !== 'fading' && s.state !== 'dead'
  );
  if (currentDominantStick) {
    // Dominant is unchanged — reset debounce and hold.
    glowstickPitchDebounceStart = now;
    return;
  }

  // --- Dominant pitch changed: retire all current sticks, spawn fresh clusters ---

  // Fade out everything currently live (they linger visually via slow fade rate).
  glowsticks.forEach(s => {
    if (s.state !== 'fading' && s.state !== 'dead') {
      s.state         = 'fading';
      s.targetOpacity = 0;
    }
  });

  // Spawn dominant solo.
  if (newDominant >= 0) spawnGlowCluster(newDominant, 1.0, 'dominant');

  // Spawn secondary clusters (up to 2, each adds 3 sticks).
  audioData.secondaryPitches.slice(0, 2).forEach(p => {
    const energy    = audioData.chroma[p] || 0;
    const liveCount = glowsticks.filter(s => s.state !== 'fading' && s.state !== 'dead').length;
    if (liveCount + 3 <= MAX_GLOWSTICKS) spawnGlowCluster(p, energy, 'secondary');
  });

  // Spawn tertiary solos for any pitch class with energy > 0.35 not yet represented.
  // Retire the oldest tertiary if the pool limit would be exceeded.
  const livePitches = new Set(
    glowsticks.filter(s => s.state !== 'fading' && s.state !== 'dead').map(s => s.pitchClass)
  );
  audioData.chroma.forEach((energy, pc) => {
    if (energy <= 0.35 || livePitches.has(pc)) return;

    // Enforce cap — retire oldest tertiary solo to make room if needed.
    const liveCount = glowsticks.filter(s => s.state !== 'fading' && s.state !== 'dead').length;
    if (liveCount >= MAX_GLOWSTICKS) {
      const oldestTertiary = glowsticks
        .filter(s => s.glowThickness === 0.38 && s.clusterRole === 'solo'
                  && s.state !== 'fading' && s.state !== 'dead')
        .sort((a, b) => a.spawnTime - b.spawnTime)[0];
      if (oldestTertiary) {
        oldestTertiary.state         = 'fading';
        oldestTertiary.targetOpacity = 0;
      } else {
        return;   // no tertiary to retire — skip this pitch class
      }
    }

    const newLiveCount = glowsticks.filter(s => s.state !== 'fading' && s.state !== 'dead').length;
    if (newLiveCount < MAX_GLOWSTICKS) {
      spawnGlowCluster(pc, energy, 'tertiary');
      livePitches.add(pc);
    }
  });

  glowstickPitchDebounceStart = now;
}


// ================================
// RIBBON SYSTEM — OPACITY ANIMATION
//
// Called every frame after updateRibbonLifecycle(). Lerps each ribbon's
// opacity toward its targetOpacity and advances the state machine when
// the transition is complete. Also refreshes each ribbon's HSL color from
// the pipeline so live amplitude / brightness / beat changes are visible.
//
// Lerp rates:
//   rising          0.025 — slow fade-in; the aurora materialises gently
//   fading          0.018 — very slow fade-out; ghosting lingers as a visual echo
//   active/demoting 0.035 — moderate; tracks opacity changes without snapping
// ================================

export function updateRibbonOpacities() {
  ribbons.forEach(r => {
    const rate = r.state === 'rising'  ? 0.025
               : r.state === 'fading'  ? 0.018
               :                         0.035;   // 'active' | 'demoting'

    r.opacity = lerp(r.opacity, r.targetOpacity, rate);

    // Refresh color each frame so the ribbon responds to live audio changes.
    r.hsl = getProfileColor(r.pitchClass);

    // Advance the state machine once the opacity transition is complete.
    if (r.state === 'rising' && Math.abs(r.opacity - r.targetOpacity) < 0.01) {
      r.state   = 'active';
      r.opacity = r.targetOpacity;   // snap to exact value — prevent endless lerp
    }
    if (r.state === 'fading' && r.opacity < 0.005) {
      r.state   = 'dead';
      r.opacity = 0;
    }
  });
}


// ================================
// GLOW STICK POOL — OPACITY ANIMATION
//
// Mirrors updateRibbonOpacities() but operates on the glowsticks pool and uses
// the asymmetric lerp rates that define the glow stick character:
//   rising  0.15  — fast snappy appearance (energy arrives suddenly)
//   fading  0.022 — slow atmospheric fade (glow lingers well after core is gone)
//   active  0.06  — moderate tracking for active/demoting state changes
//
// Also refreshes each stick's HSL color each frame so live audio changes
// (beat flashes, amplitude swells) are reflected in the rendered color.
// ================================

// ================================
// VISUALIZATION RESET
//
// Clears all ribbon and glow stick state when a new track loads.
// Called by player.js via loadAudioFile() on every track change.
//
// Why both pools:
//   The aurora pool (ribbons) and glow stick pool (glowsticks) are
//   independent. Whichever mode is active when the track changes will
//   have live ribbons; the inactive pool may also have fading remnants.
//   Both must be cleared so no stale visual state carries into the new track.
//
// Why reset debounce state:
//   If a debounce timer is mid-countdown when the track changes, the lifecycle
//   manager may fire an immediate transition on the first frame of the new
//   track as if the old countdown had already elapsed. Resetting forces
//   full re-evaluation from a known-clean state.
// ================================

export function resetVisualization() {
  // Clear both pools immediately — skip the normal fade-out lifecycle.
  ribbons.length    = 0;
  glowsticks.length = 0;

  // Reset aurora debounce state.
  dominantPitchCandidate     = -1;
  dominantPitchDebounceStart = 0;

  // Reset glow stick debounce state.
  glowstickPitchCandidate     = -1;
  glowstickPitchDebounceStart = 0;
}


export function updateGlowstickOpacities() {
  glowsticks.forEach(s => {
    const rate = s.state === 'rising' ? GLOWSTICK_RISE_RATE
               : s.state === 'fading' ? GLOWSTICK_FADE_RATE
               :                        0.06;   // 'active' | 'demoting'

    s.opacity = lerp(s.opacity, s.targetOpacity, rate);

    // Refresh color so beat flashes and amplitude changes are visible in real-time.
    s.hsl = getProfileColor(s.pitchClass);

    if (s.state === 'rising' && Math.abs(s.opacity - s.targetOpacity) < 0.01) {
      s.state   = 'active';
      s.opacity = s.targetOpacity;
    }
    if (s.state === 'fading' && s.opacity < 0.005) {
      s.state   = 'dead';
      s.opacity = 0;
    }
  });
}
