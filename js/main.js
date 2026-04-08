// =============================================================================
// SYNESTHESIA APP — main.js
// =============================================================================
//
// Milestone 1: Canvas setup, aurora animation, audio upload, play/pause.
// Milestone 2: Web Audio API integration — real-time frequency extraction,
//              amplitude tracking, spectral flux onset detection. All values
//              collected into a single `audioData` object each frame.
// Milestone 3: Full rebuild — dynamic pitch-driven ribbon system.
//              Meyda chroma drives a live ribbon pool: ribbons are born,
//              promoted, demoted, and faded as the dominant pitch changes.
//              Each ribbon's color comes from the Rimsky-Korsakov profile.
//              Vertical aurora geometry replaces previous horizontal bands.
//
// Architecture overview:
//   loadAudioFile()
//     → initAudioContext()          (runs once; creates AudioContext pipeline)
//     → audioPlayer.play()
//
//   drawFrame()  [requestAnimationFrame loop]
//     → updateAudioData()           (Meyda + spectral flux → audioData)
//     → updateRibbonLifecycle()     (spawn / demote / fade ribbons)
//     → updateRibbonOpacities()     (animate opacity transitions, refresh colors)
//     → drawBackground()            (sky gradient + stars)
//     → drawRibbon() × N            (router: aurora → drawRibbonAurora()
//                                           glowstick → drawRibbonGlowstick())
// =============================================================================


// ================================
// CANVAS SETUP
// ================================

const canvas = document.getElementById('aurora-canvas');
const ctx    = canvas.getContext('2d');

// Match canvas pixel dimensions to the viewport on load and every resize.
// Without this, the canvas defaults to 300×150px and everything stretches.
function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);


// ================================
// ACTIVE PROFILE
//
// The active synesthete profile maps pitch class indices (0–11) to HSL colors.
// RIMSKY_KORSAKOV_PROFILE is defined in profiles/rimsky-korsakov.js, loaded via
// a script tag in index.html before main.js. All color lookups go through
// getProfileColor(), which applies the full modulation pipeline on top of the
// base color.
//
// In Milestone 4 this will be swapped live via a profile switcher UI.
// ================================

let activeProfile = RIMSKY_KORSAKOV_PROFILE;


// ================================
// RENDER MODE
//
// Controls which draw function is used for each ribbon each frame.
// Two modes exist as permanent user-facing features (switched via the pill UI
// in the top right corner — see index.html #mode-switch, style.css section 7):
//
//   'aurora'    — broad translucent ribbon curtains. drawRibbonAurora().
//                 Three polygon passes: wide haze, main glow body, bright core.
//                 source-over compositing. Sky visible between ribbons.
//
//   'glowstick' — thin neon sticks with a wide chasing blur. drawRibbonGlowstick().
//                 Three polygon passes: wide outer glow, inner intense glow, hot core.
//                 Asymmetric appear/fade timing — fast in, slow out.
//
// Both modes share the same audio analysis pipeline, ribbon lifecycle system,
// profile color lookup, and origin fade geometry. Only the draw function differs.
//
// To add a future mode: add a new value here, add a new drawRibbon<Name>() function,
// add a branch in drawRibbon(), and add a button to #mode-switch in index.html.
// ================================

// 'aurora' | 'glowstick' — read each frame by drawRibbon() to route to the
// correct rendering function. Default is aurora on page load.
let renderMode = 'aurora';

// Mode switch button event listeners.
// Clicking a button updates renderMode and swaps the .active class between
// the two buttons. The .active class provides the visual selected state
// (cyan tinted fill) — see style.css section 7 for the styling.
document.getElementById('mode-aurora').addEventListener('click', () => {
  renderMode = 'aurora';
  document.getElementById('mode-aurora').classList.add('active');
  document.getElementById('mode-glow').classList.remove('active');
});

document.getElementById('mode-glow').addEventListener('click', () => {
  renderMode = 'glowstick';
  document.getElementById('mode-glow').classList.add('active');
  document.getElementById('mode-aurora').classList.remove('active');
});


// ================================
// RIBBON SYSTEM — CONSTANTS
// ================================

// How long a new dominant pitch must remain stable before triggering a ribbon
// transition. 500ms smooths over passing tones, ornaments, and vibrato without
// making genuine harmonic changes feel sluggish.
const RIBBON_DEBOUNCE_MS = 500;

// Hard cap on simultaneous live ribbons (1 primary + up to 2 secondary).
// Matches the research: one dominant color with 1–2 harmonic tints.
const MAX_RIBBONS = 3;


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
let ribbons = [];

// Debounce tracking — the candidate dominant pitch and when it first appeared.
// A ribbon transition only fires after RIBBON_DEBOUNCE_MS of stability.
let dominantPitchCandidate     = -1;
let dominantPitchDebounceStart = 0;

// Sky background hue — lerps very slowly toward the weighted average of active
// ribbon hues. Starts at 220 (deep blue-teal) matching the night sky base color.
let skyHue = 220;

// Cached star positions — generated once on first background draw, stored as
// canvas fractions so they scale correctly on window resize.
let stars = null;


// ================================
// AURORA — LERP HELPER
//
// Linear interpolation: moves `current` toward `target` by `factor` each frame.
//
//   factor 0.0 → no movement (current never changes)
//   factor 1.0 → instant snap (current = target immediately)
//   factor 0.04–0.10 → smooth, organic transitions over many frames
//
// At factor 0.05, it takes ~14 frames (~230ms) to cover 50% of the distance
// to the target, which gives a natural, breathing quality to the motion.
// The exact perceptual feel depends on the target range — for 0.0–1.0 audio
// values the transitions are fast enough to feel responsive and slow enough
// to never feel mechanical.
// ================================

function lerp(current, target, factor) {
  return current + (target - current) * factor;
}


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

function getProfileColor(pitchClass) {
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
    timeOffset: Math.random() * Math.PI * 2,

    // Per-ribbon shape parameters — randomized at spawn so no two ribbons
    // ever move or curve the same way. Read by drawRibbon() each frame.
    waveFreq1:   0.8 + Math.random() * 0.8,    // primary sine spatial frequency;  range 0.8–1.6
    waveFreq2:   0.5 + Math.random() * 0.9,    // secondary sine spatial frequency; range 0.5–1.4
    driftSpeed:  0.12 + Math.random() * 0.14,  // time-based lateral drift rate;    range 0.12–0.26
    wobbleRatio: 0.25 + Math.random() * 0.30,  // secondary wave amplitude fraction; range 0.25–0.55

    spawnTime:  performance.now(),
  };
}


// ================================
// RIBBON SYSTEM — LIFECYCLE MANAGER
//
// Called every frame. Drives the ribbon pool state machine:
//   1. Removes 'dead' ribbons from the pool.
//   2. Reads audioData.dominantPitch to detect pitch changes.
//   3. Applies a 500ms debounce so vibrato / passing tones don't trigger
//      spurious ribbon transitions.
//   4. On confirmed pitch change: demotes current primary to secondary,
//      fades excess secondaries, spawns a new primary.
//   5. First-ribbon fast-path: bypasses debounce on an empty pool so the
//      screen isn't blank for 500ms at track start.
// ================================

function updateRibbonLifecycle() {
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

  // --- Debounce: pitch change only fires after 500ms of stability ---
  if (newDominant !== dominantPitchCandidate) {
    // Candidate shifted — restart the timer.
    dominantPitchCandidate     = newDominant;
    dominantPitchDebounceStart = now;
    return;
  }

  // Still inside the debounce window — hold off.
  if ((now - dominantPitchDebounceStart) < RIBBON_DEBOUNCE_MS) return;

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

function updateRibbonOpacities() {
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
// AURORA — RENDER LOOP
// ================================

// `time` is a monotonically increasing counter used as the sine wave
// argument for all animated geometry. Increments ~0.016 per frame (≈ 1/60s),
// so one unit of time ≈ one second of elapsed animation at 60fps.
let time = 0;


// ================================
// BACKGROUND — STAR GENERATION
//
// Generates an array of star descriptors using canvas-fraction coordinates
// so they scale correctly on window resize. Called once; result cached in `stars`.
//
// Parameters:
//   count — number of stars to generate
//
// Returns: Array of { xf, yf, radius, opacity, twinkle }
// ================================

function generateStars(count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push({
      xf:      Math.random(),          // horizontal fraction 0–1
      yf:      Math.random() * 0.65,   // upper 65% only — no stars near the horizon
      radius:  0.3 + Math.random() * 0.8,
      opacity: 0.2 + Math.random() * 0.6,
      // Per-star phase offset so each star twinkles at a different point in its cycle.
      twinkle: Math.random() * Math.PI * 2,
    });
  }
  return list;
}


// ================================
// BACKGROUND — DRAW STARS
//
// Renders cached stars with a slow sine twinkle oscillation on their opacity.
//
// Parameters:
//   time — the shared animation time counter
// ================================

function drawStars(time) {
  if (!stars) return;
  stars.forEach(s => {
    // Twinkle: ±30% opacity variation at 0.4 rad/time-unit.
    // At 60fps with time += 0.016 per frame, this is ~0.006 Hz —
    // roughly one full twinkle cycle every 160 seconds. Very slow, ambient drift.
    const twinkleOpacity = s.opacity * (0.7 + 0.3 * Math.sin(time * 0.4 + s.twinkle));
    ctx.beginPath();
    ctx.arc(s.xf * canvas.width, s.yf * canvas.height, s.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${twinkleOpacity})`;
    ctx.fill();
  });
}


// ================================
// BACKGROUND — SKY AND STARS
//
// Draws the full background each frame: sky gradient + stars.
// Generates and caches star positions on first call.
//
// skyHue lerps very slowly toward the weighted mean of active ribbon hues,
// giving the night sky a subtle harmonic tint that shifts over time.
//
// Parameters:
//   time — the shared animation time counter
// ================================

function drawBackground(time) {
  // Generate and cache star positions on first call.
  if (!stars) stars = generateStars(180);

  // Lerp sky hue toward the opacity-weighted average of active ribbon hues.
  // 0.002 per frame is nearly imperceptible but produces a clear hue shift
  // over 10–30 seconds, tinting the sky with the dominant harmony.
  const liveRibbons = ribbons.filter(r => r.state !== 'dead' && r.opacity > 0.05);
  if (liveRibbons.length > 0) {
    const totalOpacity = liveRibbons.reduce((sum, r) => sum + r.opacity, 0);
    const weightedHue  = liveRibbons.reduce((sum, r) => sum + r.hsl.h * r.opacity, 0)
                         / totalOpacity;
    // amplitude × 0.04 makes the sky color shift faster during loud passages —
    // more responsive to musical content than a fixed 0.002 rate.
    skyHue = lerp(skyHue, weightedHue, audioData.amplitude * 0.04);
  }

  // Sky gradient: dark zenith, near-black mid, subtle warm glow near the horizon
  // from the aurora light reflected below. Brighter than before so ribbons
  // read as glowing against a visible night sky (not a black void).
  const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  skyGrad.addColorStop(0.00, `hsl(215, 50%, 6%)`);   // DIAGNOSTIC: darkened zenith
  skyGrad.addColorStop(0.60, `hsl(${skyHue}, 42%, 3%)`);   // mid sky — darkest point
  skyGrad.addColorStop(0.75, `hsl(${skyHue}, 40%, 8%)`);   // near horizon — aurora glow
  skyGrad.addColorStop(1.00, `hsl(215, 50%, 3%)`);          // DIAGNOSTIC: darkened horizon
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Stars drawn above the sky gradient, below the ribbon layer.
  drawStars(time);
}


// ================================
// RIBBON SYSTEM — POLYGON PATH BUILDER
//
// Constructs a closed polygon path from two edge arrays, expanding each edge
// outward from the ribbon's centerline by widthMultiplier. Called by
// drawRibbon() once per render pass — same geometry, different scale.
//
// Parameters:
//   leftEdge        — array of {x, y} points; left core boundary, bottom→top
//   rightEdge       — array of {x, y} points; right core boundary, bottom→top
//   widthMultiplier — expansion factor beyond core half-width:
//                       10   = atmospheric bloom (wide diffuse halo)
//                       3.5  = main glow
//                       1.0  = bright solid core (exact polygon)
// ================================

function buildPolygonPath(leftEdge, rightEdge, widthMultiplier) {
  ctx.beginPath();

  // Trace left edge upward (index 0 = bottom, last index = top).
  // Each expanded point reflects outward from the centerline by the multiplier.
  for (let i = 0; i < leftEdge.length; i++) {
    const lx     = leftEdge[i].x;
    const rx     = rightEdge[i].x;
    const center = (lx + rx) / 2;
    const ax     = center - (center - lx) * widthMultiplier;
    if (i === 0) ctx.moveTo(ax, leftEdge[i].y);
    else         ctx.lineTo(ax, leftEdge[i].y);
  }

  // Trace right edge back downward to close the polygon outline.
  for (let i = rightEdge.length - 1; i >= 0; i--) {
    const lx     = leftEdge[i].x;
    const rx     = rightEdge[i].x;
    const center = (lx + rx) / 2;
    const ax     = center + (rx - center) * widthMultiplier;
    ctx.lineTo(ax, rightEdge[i].y);
  }

  ctx.closePath();
}


// ================================
// RIBBON SYSTEM — RENDER MODE ROUTER
//
// drawRibbon() is the single entry point called by drawFrame() for each ribbon.
// It routes to the correct mode-specific implementation based on renderMode,
// keeping the frame loop clean and mode-agnostic.
//
// To add a new render mode:
//   1. Add a new value for renderMode (e.g. 'plasma')
//   2. Write a drawRibbonPlasma(ribbon, time) function below
//   3. Add an else-if branch here
//   4. Add a button to #mode-switch in index.html
//
// Parameters:
//   ribbon — a ribbon object from the ribbons pool
//   time   — the shared animation time counter
// ================================

function drawRibbon(ribbon, time) {
  if (renderMode === 'aurora') {
    drawRibbonAurora(ribbon, time);
  } else {
    drawRibbonGlowstick(ribbon, time);
  }
}


// ================================
// RIBBON SYSTEM — AURORA RENDERER
//
// Renders one ribbon using polygon-based geometry: three filled polygon passes
// replace the previous ~250-slice fillRect loop. This reduces gradient object
// creation from O(canvas.height / 4) to O(1) per ribbon per frame — fixing
// the GC pressure and frame-time degradation that appeared after ~20 seconds.
//
// Three passes (back to front):
//   1. Atmospheric bloom   — widthMultiplier 6,   vertical gradient,    screen blend
//   2. Main ribbon glow    — widthMultiplier 3.5, horizontal gradient,  screen blend
//   3. Bright solid core   — widthMultiplier 1.0, horizontal gradient,  source-over
//
// Pass 3 uses source-over (not screen) so the vivid HSL core color renders
// fully opaque rather than being washed out by additive blending.
//
// Parameters:
//   ribbon — a ribbon object from the ribbons pool
//   time   — the shared animation time counter
// ================================

function drawRibbonAurora(ribbon, time) {
  if (ribbon.opacity < 0.005) return;

  const { h, s, l } = ribbon.hsl;

  // --- Build left and right edge arrays (bottom → top) ---
  // One point every 6 canvas pixels — sufficient resolution for smooth polygon
  // curvature; half the step count of the old fillRect approach.
  const STEPS = Math.ceil(canvas.height / 6);
  const leftEdge  = [];
  const rightEdge = [];

  // originFadeHeight: the vertical span of the transparent-to-opaque fade
  // at the base of the ribbon.
  //   amplitude 0 → fade spans 80% of canvas height (ribbon barely rises)
  //   amplitude 1 → fade spans 30% of canvas height (ribbon nearly full height)
  const originFadeHeight = canvas.height * (0.80 - audioData.amplitude * 0.50);

  for (let i = 0; i <= STEPS; i++) {
    const y        = canvas.height * (1 - i / STEPS);  // y=canvas.height at i=0 (bottom)
    const progress = i / STEPS;

    // Dual-frequency lateral drift. xAmplitude at 1.8% of canvas width keeps
    // ribbons reading as near-vertical curtains rather than diagonal sine strands.
    const phase1 = progress * Math.PI * 2 * ribbon.waveFreq1
                   + time * ribbon.driftSpeed + ribbon.timeOffset;
    const phase2 = progress * Math.PI * 2 * ribbon.waveFreq2
                   + time * ribbon.driftSpeed * 0.6 + ribbon.timeOffset * 0.7;
    const xAmplitude = canvas.width * 0.018;
    const cx = ribbon.xFraction * canvas.width
               + Math.sin(phase1) * xAmplitude
               + Math.sin(phase2) * xAmplitude * ribbon.wobbleRatio;

    // Thickness noise: 4.5 sine cycles along the height create organic pinch
    // points and swells in the ribbon's width. ±28% variation.
    const thickNoise = 1 + Math.sin(progress * Math.PI * 4.5
                       + time * 0.22 + ribbon.timeOffset) * 0.28;

    // coreHalfWidth: half the total core polygon width at this point.
    // Scales with per-ribbon thickness multiplier and live amplitude.
    const coreHalfWidth = canvas.width * 0.032 * thickNoise
                          * ribbon.thickness
                          * (0.7 + audioData.amplitude * 0.6);

    // Origin fade: transparent at the canvas bottom, reaching full opacity
    // at originFadeHeight above it.
    const distFromBottom = canvas.height - y;
    const originOpacity  = Math.min(1, distFromBottom / Math.max(1, originFadeHeight));
    const pointOpacity   = ribbon.opacity * originOpacity;

    leftEdge.push({ x: cx - coreHalfWidth, y, pointOpacity, coreHalfWidth });
    rightEdge.push({ x: cx + coreHalfWidth, y, pointOpacity, coreHalfWidth });
  }

  // --- Option D: glow edge color from the complementary ribbon ---
  // Primary ribbons: edges blend toward any active secondary ribbon's hue.
  // Secondary ribbons: edges blend toward the primary ribbon's hue.
  // Falls back to the ribbon's own color if no complement is live.
  let glowH = h, glowS = s, glowL = l;
  if (ribbon.role === 'primary') {
    const sec = ribbons.find(
      r => r.role === 'secondary' && r.state !== 'dead' && r.opacity > 0.05
    );
    if (sec) { glowH = sec.hsl.h; glowS = sec.hsl.s; glowL = sec.hsl.l; }
  } else {
    const pri = ribbons.find(
      r => r.role === 'primary' && r.state !== 'dead' && r.opacity > 0.05
    );
    if (pri) { glowH = pri.hsl.h; glowS = pri.hsl.s; glowL = pri.hsl.l; }
  }

  // originFadeFrac: gradient stop position where the origin fade reaches full
  // opacity (expressed as 0.0 = canvas bottom, 1.0 = canvas top).
  const originFadeFrac = Math.min(0.95, originFadeHeight / canvas.height);

  // Ribbon midpoint values — used to anchor horizontal gradients.
  // Horizontal gradients are straight bands; the polygon clip defines the shape.
  const midIdx  = Math.floor(leftEdge.length / 2);
  const midCx   = (leftEdge[midIdx].x + rightEdge[midIdx].x) / 2;
  const midHalf = leftEdge[midIdx].coreHalfWidth;

  // Global amplitude pulse — makes the aurora visibly swell and dim with the
  // music. Applied to passes 1 and 2 via globalAlpha; pass 3 uses its own
  // amplitude formula so the core can pulse independently and more intensely.
  const dynamicOpacity = 0.45 + audioData.amplitude * 0.75;

  ctx.save();

  // -----------------------------------------------------------------------
  // PASS 1 — Atmospheric bloom
  // Wide polygon (×6 core width). Vertical gradient encodes both the origin
  // fade and the secondary-pitch atmospheric color at 0.22 max opacity.
  // 'screen' blend adds an ambient tint to the sky behind the ribbon.
  // widthMultiplier reduced from 10→6 to keep the halo close to the ribbon.
  // -----------------------------------------------------------------------

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = dynamicOpacity * ribbon.opacity;

  // Vertical gradient: bottom→top. Opacity rises from 0 at the canvas floor
  // to 0.22 at originFadeFrac, then holds — matching the origin fade geometry.
  const bloomGrad = ctx.createLinearGradient(0, canvas.height, 0, 0);
  bloomGrad.addColorStop(0.0,            `hsla(${glowH},${glowS}%,${glowL}%,0)`);
  bloomGrad.addColorStop(originFadeFrac, `hsla(${glowH},${glowS}%,${glowL}%,0.22)`);
  bloomGrad.addColorStop(1.0,            `hsla(${glowH},${glowS}%,${glowL}%,0.22)`);
  ctx.fillStyle = bloomGrad;
  buildPolygonPath(leftEdge, rightEdge, 6);
  ctx.fill();

  // -----------------------------------------------------------------------
  // PASS 2 — Main ribbon glow
  // Moderate polygon (×3.5 core width). Horizontal gradient from secondary
  // color at the edges blending to primary color at the centre (Option D).
  // Centre opacity 0.82 (down from 0.85) lets the sky show through slightly,
  // reading as semi-transparent luminous gas rather than a solid painted shape.
  // 'screen' blend adds the glow luminosity on top of the bloom layer.
  // -----------------------------------------------------------------------

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = dynamicOpacity * ribbon.opacity;

  // Gradient span matches the expanded polygon half-width at the midpoint.
  const glowSpan = midHalf * 3.5;
  const glowGrad = ctx.createLinearGradient(midCx - glowSpan, 0, midCx + glowSpan, 0);
  glowGrad.addColorStop(0.00, `hsla(${glowH},${glowS}%,${glowL}%,0)`);
  glowGrad.addColorStop(0.25, `hsla(${glowH},${glowS}%,${glowL}%,0.4)`);
  glowGrad.addColorStop(0.50, `hsla(${h},${s}%,${l}%,0.82)`);
  glowGrad.addColorStop(0.75, `hsla(${glowH},${glowS}%,${glowL}%,0.4)`);
  glowGrad.addColorStop(1.00, `hsla(${glowH},${glowS}%,${glowL}%,0)`);
  ctx.fillStyle = glowGrad;
  buildPolygonPath(leftEdge, rightEdge, 3.5);
  ctx.fill();

  // -----------------------------------------------------------------------
  // PASS 3 — Bright solid core
  // Exact core polygon (×1.0). Horizontal gradient with a near-white centre:
  // the ribbon's hue with reduced saturation and raised lightness so the spine
  // reads as luminous. 'source-over' preserves the vivid HSL color rather than
  // washing it out with additive blending.
  //
  // globalAlpha is driven purely by amplitude here (0.5–1.2, clamped to 1.0)
  // so the core pulses visibly with musical dynamics independent of the ribbon's
  // lifecycle opacity. Edges use ribbon.opacity × 0.55 for a soft falloff.
  // -----------------------------------------------------------------------

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = Math.min(1.0, 0.5 + audioData.amplitude * 0.7);

  // Near-white: reduce saturation, push lightness toward 90. Hue is retained
  // so it reads as tinted-bright, not neutral-white.
  const coreS = Math.max(s - 15, 5);
  const coreL = Math.min(l + 25, 90);

  const coreSpan = midHalf * 1.0;
  const coreGrad = ctx.createLinearGradient(midCx - coreSpan, 0, midCx + coreSpan, 0);
  coreGrad.addColorStop(0.0, `hsla(${h},${coreS}%,${coreL}%,${(ribbon.opacity * 0.55).toFixed(3)})`);
  coreGrad.addColorStop(0.5, `hsla(${h},${coreS}%,${coreL}%,${(ribbon.opacity * 0.98).toFixed(3)})`);
  coreGrad.addColorStop(1.0, `hsla(${h},${coreS}%,${coreL}%,${(ribbon.opacity * 0.55).toFixed(3)})`);
  ctx.fillStyle = coreGrad;
  buildPolygonPath(leftEdge, rightEdge, 1.0);
  ctx.fill();

  ctx.globalAlpha = 1.0;
  ctx.restore();
}


// ================================
// RIBBON SYSTEM — GLOW STICK RENDERER (STUB)
//
// Renders one ribbon in Glow Stick mode — thin, intensely hot neon lines
// with a wide chasing blur. Implemented in the next prompt.
//
// Design spec (for implementation):
//   Pass 1 — Wide outer glow:  buildPolygonPath(edges, 18), opacity 0.06–0.10
//   Pass 2 — Inner glow:       buildPolygonPath(edges, 5),  opacity 0.32–0.58
//   Pass 3 — Hot core:         buildPolygonPath(edges, 1),  near-white centre
//   Timing: appear lerp 0.15 (fast/snappy), fade lerp 0.022 (slow linger)
//   Onset flare: beatIntensity > 0.5 → core surges toward pure white
//
// Parameters:
//   ribbon — a ribbon object from the ribbons pool
//   time   — the shared animation time counter
// ================================

function drawRibbonGlowstick(ribbon, time) {
  // Glow stick rendering — implemented in next prompt
}


// ================================
// DIAGNOSTIC ONLY — remove after visual confirmation
//
// Renders a single hardcoded aurora-green ribbon at canvas center using
// source-over blending throughout. Bypasses the profile system, ribbon pool,
// and audioData entirely so we can confirm the rendering pipeline itself can
// produce reference-quality vivid colors.
// ================================

function drawDiagnosticRibbon(time) {
  const STEPS = Math.ceil(canvas.height / 6);
  const leftEdge  = [];
  const rightEdge = [];

  for (let i = 0; i <= STEPS; i++) {
    const y        = canvas.height * (1 - i / STEPS);
    const progress = i / STEPS;

    const phase1 = progress * Math.PI * 2 * 1.2 + time * 0.15;
    const phase2 = progress * Math.PI * 2 * 0.7 + time * 0.09;

    const xAmplitude = canvas.width * 0.018;
    const cx = canvas.width * 0.5
               + Math.sin(phase1) * xAmplitude
               + Math.sin(phase2) * xAmplitude * 0.3;

    const thickNoise    = 1 + Math.sin(progress * Math.PI * 4.5 + time * 0.22) * 0.28;
    const coreHalfWidth = canvas.width * 0.034 * thickNoise;

    const originFadeHeight = canvas.height * 0.55;
    const distFromBottom   = canvas.height - y;
    const originOpacity    = Math.min(1, distFromBottom / Math.max(1, originFadeHeight));

    leftEdge.push({
      x: cx - coreHalfWidth,
      y,
      pointOpacity: originOpacity,
      coreHalfWidth,
    });
    rightEdge.push({
      x: cx + coreHalfWidth,
      y,
      pointOpacity: originOpacity,
      coreHalfWidth,
    });
  }

  // Midpoint half-width used to anchor all three horizontal gradients.
  // coreHalfWidth is scoped inside the loop so we read it back from the array.
  const midIdx           = Math.floor(leftEdge.length / 2);
  const coreHalfWidthApprox = leftEdge[midIdx].coreHalfWidth;

  ctx.save();

  // Pass 1 — Wide atmospheric haze
  // source-over with very low opacity — sky shows through
  buildPolygonPath(leftEdge, rightEdge, 7);
  const hazeGrad = ctx.createLinearGradient(
    canvas.width * 0.5 - coreHalfWidthApprox * 7, 0,
    canvas.width * 0.5 + coreHalfWidthApprox * 7, 0
  );
  hazeGrad.addColorStop(0.0,  'hsla(155, 100%, 58%, 0.00)');
  hazeGrad.addColorStop(0.35, 'hsla(155, 100%, 58%, 0.07)');
  hazeGrad.addColorStop(0.5,  'hsla(155, 100%, 62%, 0.11)');
  hazeGrad.addColorStop(0.65, 'hsla(155, 100%, 58%, 0.07)');
  hazeGrad.addColorStop(1.0,  'hsla(155, 100%, 58%, 0.00)');
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = hazeGrad;
  ctx.fill();

  // Pass 2 — Main glow body
  buildPolygonPath(leftEdge, rightEdge, 3);
  const glowGrad = ctx.createLinearGradient(
    canvas.width * 0.5 - coreHalfWidthApprox * 3, 0,
    canvas.width * 0.5 + coreHalfWidthApprox * 3, 0
  );
  glowGrad.addColorStop(0.0,  'hsla(155, 100%, 55%, 0.00)');
  glowGrad.addColorStop(0.25, 'hsla(155, 100%, 58%, 0.38)');
  glowGrad.addColorStop(0.5,  'hsla(160, 95%,  62%, 0.55)');
  glowGrad.addColorStop(0.75, 'hsla(155, 100%, 58%, 0.38)');
  glowGrad.addColorStop(1.0,  'hsla(155, 100%, 55%, 0.00)');
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = glowGrad;
  ctx.fill();

  // Pass 3 — Bright core
  buildPolygonPath(leftEdge, rightEdge, 1);
  const coreGrad = ctx.createLinearGradient(
    canvas.width * 0.5 - coreHalfWidthApprox, 0,
    canvas.width * 0.5 + coreHalfWidthApprox, 0
  );
  coreGrad.addColorStop(0.0,  'hsla(155, 90%,  60%, 0.45)');
  coreGrad.addColorStop(0.35, 'hsla(158, 80%,  72%, 0.82)');
  coreGrad.addColorStop(0.5,  'hsla(165, 40%,  90%, 0.96)');
  coreGrad.addColorStop(0.65, 'hsla(158, 80%,  72%, 0.82)');
  coreGrad.addColorStop(1.0,  'hsla(155, 90%,  60%, 0.45)');
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = coreGrad;
  ctx.fill();

  ctx.restore();
}


function drawFrame() {
  // Step 1: Read from Web Audio API / Meyda → writes into audioData.
  updateAudioData();

  // Step 2: Spawn, demote, and fade ribbons based on pitch analysis.
  updateRibbonLifecycle();

  // Step 3: Animate ribbon opacities and refresh colors from the pipeline.
  updateRibbonOpacities();

  // Step 4: Draw the night sky background (gradient + stars).
  drawBackground(time);

  // Step 5: Draw ribbons back-to-front.
  // Secondary ribbons go behind the primary so the primary always reads
  // as visually dominant — the bright top layer, not buried underneath.
  [...ribbons]
    .sort((a, b) => (a.role === 'primary' ? 1 : -1))
    .forEach(r => drawRibbon(r, time));

  // DIAGNOSTIC ONLY — remove after visual confirmation
  drawDiagnosticRibbon(time);

  time += 0.016;
  requestAnimationFrame(drawFrame);
}


// =============================================================================
// AUDIO ANALYSIS (Milestones 2–3)
// =============================================================================
//
// Web Audio API pipeline:
//
//   <audio> element
//       ↓  createMediaElementSource()  — taps the decoded audio stream
//   MediaElementSourceNode
//       ↓  connect()
//   AnalyserNode                        — performs FFT analysis each frame
//       ↓  connect()
//   AudioContext.destination            — speakers / headphones
//
//   Meyda analyzer                      — taps sourceNode directly;
//       runs on its own buffer schedule  provides chroma, rms, spectralCentroid
//
// Why Meyda for chroma instead of raw FFT bucketing:
//   Hand-rolling chroma by assigning FFT bins to pitch classes via the equal
//   temperament formula produces severe aliasing — C# dominated almost every
//   frame regardless of the music. The root cause is structural: linear Hz
//   bin spacing means higher pitch classes accumulate far more bins than lower
//   ones, and overtone bleed from every played note spreads energy across all
//   12 classes simultaneously. Perceptual weighting and a tighter frequency
//   ceiling improved this but couldn't fully solve it. Meyda uses a proper
//   constant-Q filterbank — logarithmically spaced filters that match the
//   equal temperament scale — giving each pitch class equal resolution and
//   suppressing overtone bleed at the source.
//
// Important: createMediaElementSource() can only be called ONCE per audio
// element. The source node persists across track changes — only the audio
// element's src changes. This is why initAudioContext() guards with a flag.
// =============================================================================


// ================================
// AUDIO ANALYSIS — CONSTANTS
// ================================

// --- Pitch class names ---
// Human-readable labels for the 12 pitch classes (index 0 = C, index 11 = B).
// Used for debug logging and future profile system display.
const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// --- Chroma Feature Extraction ---
//
// Chroma features represent the energy at each of the 12 musical pitch classes
// (C, C#, D ... B) regardless of which octave they appear in. A chroma vector
// tells us which notes are active in the music right now — without needing
// explicit chord or note detection. Every octave of C contributes to chroma[0],
// every octave of A contributes to chroma[9], and so on.
//
// This is the foundation of the pitch-to-color system. We measure which pitch
// classes are most energetically present, look them up in the active synesthete
// profile, and drive the ribbon colors from that. It works across all genres
// because it is agnostic to instrument, octave, and timbre.

// Minimum chroma energy for a pitch class to be considered "active".
// Pitch classes below this are filtered out as noise — they exist in the FFT
// but at such low levels that treating them as audible notes would produce
// spurious color changes.
// Raised from 0.15 → 0.25 after observing that all 12 pitch classes were
// exceeding 0.15 simultaneously on typical music, leaving no useful filtering.
// 0.25 forces the detector to respond only to genuinely dominant pitch classes.
const CHROMA_MIN_ENERGY = 0.25;

// Per-frame lerp rate for smoothing raw chroma toward the persistent
// smoothedChroma array. Slow enough (0.05) to prevent the dominant pitch from
// flickering between adjacent pitch classes during sustained chords or legato
// passages, while still responding to real harmonic changes within a second.
const CHROMA_LERP_RATE = 0.05;

// --- Spectral Flux Onset Detection ---
//
// Spectral flux measures the total change in the frequency spectrum between
// consecutive frames. Unlike the previous delta method (which only watched bass
// energy for kick drums), spectral flux watches the entire spectrum simultaneously.
// A kick, snare, guitar strum, piano attack, or brass hit all produce a sudden
// increase across many frequency bins — that burst of change is the flux signal.
//
// Only positive changes are summed (Half-Wave Rectification / HWR). This makes
// the detector sensitive to onsets (energy suddenly appearing) and insensitive
// to releases (energy fading away), which is exactly what we want.
//
// A dynamic threshold — derived from the rolling median of recent flux values —
// adapts to the energy level of the track. A quiet classical passage and a loud
// electronic drop both get appropriate sensitivity without manual tuning per genre.

// Number of recent flux values kept in the rolling history buffer.
// 43 frames ≈ 700ms at 60fps — enough history to compute a stable local median
// without being so long that the threshold lags badly during abrupt energy shifts.
const FLUX_HISTORY_SIZE = 43;

// Onset fires when flux exceeds (median of recent flux values × this multiplier).
// 1.5 means an onset requires a flux spike 50% above the recent baseline.
// Tune upward to reduce false positives on sustained/legato music;
// tune downward to catch quieter or more subtle onsets.
const FLUX_THRESHOLD_MULTIPLIER = 1.5;

// Minimum milliseconds between two consecutive onset triggers.
// 100ms = max ~10 onsets/second, which covers fast 16th-note passages at 150bpm.
// Prevents a single loud transient from double-firing across adjacent frames.
const ONSET_COOLDOWN_MS = 100;

// Per-frame decay factor applied to beatIntensity after each onset.
// 0.88 means intensity halves in roughly 5 frames (~83ms at 60fps).
const ONSET_DECAY = 0.88;

// Idle fallback values used when no audio is playing.
// Non-zero so the aurora continues its ambient animation (not frozen).
const IDLE_AUDIO_DATA = {
  // Idle chroma: equal low energy across all 12 pitch classes.
  // Non-zero gives the aurora a subtle ambient tint even when paused.
  chroma:             new Float32Array(12).fill(0.05),
  dominantPitch:      -1,    // -1 = no active pitch above threshold
  secondaryPitches:   [],
  amplitude:          0.04,
  spectralBrightness: 0.3,
  isBeat:             false,
  beatIntensity:      0.0,
};


// ================================
// AUDIO ANALYSIS — STATE
// ================================

// AudioContext and related nodes — created once on first file load.
let audioCtx   = null;
let analyser   = null;
let sourceNode = null;   // MediaElementSourceNode wrapping the <audio> element

// Typed arrays for reading FFT output each frame.
// Allocated once after the analyser is configured (size depends on fftSize).
let freqData = null;   // Uint8Array[1024] — frequency magnitudes, 0–255 per bin
let timeData = null;   // Uint8Array[2048] — raw waveform samples, 0–255 (128 = silence)

// Snapshot of freqData from the previous frame — required by spectral flux.
// Flux is computed as the difference between this frame and the last.
// Allocated alongside freqData in initAudioContext() once fftSize is known.
let previousFreqData = null;   // Uint8Array[1024]

// Rolling buffer of recent flux values used to compute the dynamic threshold.
// Acts as a short-term memory of how much spectral change is "normal" for this
// passage of music, so the onset threshold adapts to the track's energy level.
const fluxHistory = [];

// Timestamp of the last triggered onset (ms, from performance.now()).
let lastOnsetTime = 0;

// Internal beat intensity value that persists and decays across frames.
// Exposed via audioData.beatIntensity each frame.
let beatIntensityInternal = 0;

// The global audioData object — written by updateAudioData() every frame,
// read by the aurora render loop and (from M3) by the color pipeline.
let audioData = { ...IDLE_AUDIO_DATA };

// --- Chroma / Meyda state ---

// Meyda analyzer instance — created in initAudioContext() once the AudioContext
// and source node are ready. Meyda taps sourceNode directly and runs on its own
// internal buffer schedule (one callback per bufferSize samples, ≈46ms at
// 44100 Hz with bufferSize 2048). It is NOT polled from the render loop — it
// fires asynchronously and we read the most recent result each frame.
let meydaAnalyzer = null;

// The most recently received feature set from Meyda's callback.
// Null until the first callback fires (typically within one buffer length of
// playback starting — imperceptibly fast in practice). updateAudioData() uses
// idle fallback values if this is null.
let latestMeydaFeatures = null;

// Smoothed chroma vector — lerped toward Meyda's raw chroma each frame at
// CHROMA_LERP_RATE. Initialised to 0.05 (the idle level) so the aurora starts
// in its ambient state. Persistent across frames — never reallocated — so lerp
// continuity is preserved across Meyda callback intervals.
//
// Why lerp if Meyda already smooths internally?
//   Meyda's chroma reflects the energy in a single fixed-size buffer (2048
//   samples). Between buffers, the value is static — not interpolated. Our
//   lerp bridges the gaps between Meyda callbacks, giving the visual system a
//   continuously changing value to read each frame rather than a stepped one.
let smoothedChroma = new Float32Array(12).fill(0.05);

// Timestamp of the last debug log line — throttles console output to once/second.
let debugLastLogTime = 0;   // DEBUG — remove after testing


// ================================
// AUDIO ANALYSIS — INIT AUDIO CONTEXT
//
// Called the first time a file is loaded (a user gesture).
// Must be triggered by a user interaction — browsers block AudioContext
// creation on page load to prevent autoplaying audio without consent.
// ================================

function initAudioContext() {
  // Guard: only create once. createMediaElementSource() throws if called
  // twice on the same element, and AudioContext creation is expensive.
  if (audioCtx) return;

  // webkitAudioContext fallback covers Safari.
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // --- Configure the AnalyserNode ---
  analyser = audioCtx.createAnalyser();

  // fftSize must be a power of 2. 2048 gives 1024 frequency bins.
  // Bin resolution = sampleRate / fftSize ≈ 21.5 Hz per bin at 44100 Hz.
  // Higher fftSize → finer frequency detail but more CPU per frame.
  analyser.fftSize = 2048;

  // Smoothing blends each frame's FFT result with the previous frame.
  // Formula: output = (smoothing × previous) + ((1 - smoothing) × current)
  // 0.8 was too high for bass-heavy music — it prevented bass values from
  // dropping between kicks, keeping them near the ceiling (0.9+) and making
  // the beat threshold mathematically unreachable (0.9 × 1.15 > 1.0).
  // 0.3 lets transients come through clearly while still taking the edge
  // off single-frame noise. Can be raised toward 0.6 if visuals feel jittery
  // in Milestone 3.
  analyser.smoothingTimeConstant = 0.3;

  // --- Wire the audio pipeline ---
  // Tap the <audio> element's decoded output as a Web Audio source.
  sourceNode = audioCtx.createMediaElementSource(audioPlayer);
  sourceNode.connect(analyser);
  analyser.connect(audioCtx.destination);   // must reconnect to hear audio

  // --- Allocate analysis buffers ---
  // frequencyBinCount = fftSize / 2 = 1024
  freqData         = new Uint8Array(analyser.frequencyBinCount);
  // previousFreqData mirrors freqData — holds last frame's spectrum for flux calculation.
  // Initialised to all zeros; the first frame produces no onset (flux vs. silence).
  previousFreqData = new Uint8Array(analyser.frequencyBinCount);
  // timeDomainData length = fftSize = 2048
  timeData         = new Uint8Array(analyser.fftSize);

  // --- Create Meyda analyzer ---
  //
  // Meyda.createMeydaAnalyzer() attaches directly to sourceNode and runs its
  // own processing pipeline on a fixed buffer schedule — independent of the
  // render loop's requestAnimationFrame cadence. The callback fires once per
  // bufferSize samples (2048 / 44100 Hz ≈ 46ms). Between callbacks, the render
  // loop reads the most recent latestMeydaFeatures object, which may be up to
  // one buffer interval stale — imperceptible at ~46ms lag.
  //
  // Features requested:
  //   'chroma'          — 12-element array; energy per pitch class (0.0–1.0),
  //                       index 0 = C, index 11 = B. Normalized so the maximum
  //                       value across all 12 classes equals 1.0.
  //   'rms'             — root mean square amplitude of the buffer (0.0–1.0).
  //                       Replaces our hand-rolled getRMSAmplitude().
  //   'spectralCentroid'— weighted mean frequency in Hz. Divided by Nyquist
  //                       (sampleRate / 2) to normalize to 0.0–1.0 as a
  //                       timbre brightness proxy.
  //
  // Why we keep our own spectral flux onset detection instead of using Meyda:
  //   Onset detection requires comparing consecutive frame snapshots —
  //   previousFreqData vs currentFreqData — at the render loop's cadence.
  //   Meyda's callback fires asynchronously on a fixed buffer schedule, not
  //   per render frame, so it cannot reliably detect frame-to-frame transients
  //   the way the AnalyserNode + spectral flux approach does.
  meydaAnalyzer = Meyda.createMeydaAnalyzer({
    audioContext: audioCtx,
    source:       sourceNode,
    bufferSize:   2048,
    featureExtractors: ['chroma', 'rms', 'spectralCentroid'],
    callback: (features) => {
      // Guard: only store if chroma was successfully extracted.
      // Meyda may pass null features during initialization or on buffer errors.
      if (features && features.chroma) {
        latestMeydaFeatures = features;
      }
    },
  });
  meydaAnalyzer.start();
}



// ================================
// AUDIO ANALYSIS — DOMINANT PITCH DETECTION
//
// Finds the dominant and secondary pitch classes from the smoothed chroma
// vector. Only pitch classes above CHROMA_MIN_ENERGY are considered — those
// below the threshold are noise and should not drive color changes.
//
// Returns:
//   dominantPitch    — index (0–11) of highest energy pitch class, or -1
//   secondaryPitches — array of the next 1–2 qualifying pitch class indices
// ================================

function getDominantPitches(chroma) {
  // Build a list of candidates that meet the minimum energy threshold,
  // sorted by energy descending.
  const candidates = [];
  for (let i = 0; i < 12; i++) {
    if (chroma[i] >= CHROMA_MIN_ENERGY) {
      candidates.push({ pitch: i, energy: chroma[i] });
    }
  }
  candidates.sort((a, b) => b.energy - a.energy);

  // Dominant: top candidate, or -1 if nothing meets the threshold.
  // -1 signals the renderer to stay in idle/ambient color mode.
  const dominantPitch = candidates.length > 0 ? candidates[0].pitch : -1;

  // Secondary: next 1–2 qualifying pitch classes (up to 2 secondary ribbons).
  const secondaryPitches = candidates.slice(1, 3).map(c => c.pitch);

  return { dominantPitch, secondaryPitches };
}


// ================================
// AUDIO ANALYSIS — ONSET DETECTION (Spectral Flux)
//
// Spectral flux = the sum of positive bin-level increases across the full
// frequency spectrum between the current frame and the previous frame.
//
//   flux = Σ max(0, freqData[i] - previousFreqData[i])   for all bins i
//
// Summing only positive differences (Half-Wave Rectification) makes the
// detector onset-sensitive — it fires when energy suddenly appears across
// the spectrum — and ignores releases, where energy fades away.
//
// Why spectral flux instead of the previous delta/bass method:
//   The old approach watched only the bass band for upward spikes, which
//   effectively detected kick drums and little else. It failed entirely on
//   classical, jazz, acoustic, and ambient music where the rhythmic pulse
//   lives in mid or high frequencies, or where there is no sharp transient.
//   Spectral flux detects any musical onset — kick, snare, guitar strum,
//   piano attack, brass hit — regardless of which band carries the energy.
//
// Dynamic threshold:
//   Rather than a fixed flux threshold, we compare flux to the rolling median
//   of recent flux values. This adapts to the track's overall energy level:
//   a quiet piano passage and a dense electronic drop both trigger at the
//   right sensitivity without manual per-genre tuning.
// ================================

function detectOnset(currentFreqData) {
  const now = performance.now();

  // --- Step 1: Compute spectral flux ---
  // Sum the positive bin-level differences between this frame and the last.
  // Raw bin values are 0–255; dividing by (binCount × 255) normalises to 0.0–1.0.
  let rawFlux = 0;
  for (let i = 0; i < currentFreqData.length; i++) {
    rawFlux += Math.max(0, currentFreqData[i] - previousFreqData[i]);
  }
  const flux = rawFlux / (currentFreqData.length * 255);

  // Update previousFreqData for next frame.
  // set() copies the values — we can't just assign (both vars would point to
  // the same buffer and previousFreqData would always equal currentFreqData).
  previousFreqData.set(currentFreqData);

  // --- Step 2: Maintain rolling flux history ---
  // Keep only the most recent FLUX_HISTORY_SIZE values.
  fluxHistory.push(flux);
  if (fluxHistory.length > FLUX_HISTORY_SIZE) fluxHistory.shift();

  // --- Step 3: Compute dynamic threshold from rolling median ---
  // The median is more robust than the mean — a single loud transient won't
  // skew the baseline and suppress detection of the next onset.
  const sorted = [...fluxHistory].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const dynamicThreshold = median * FLUX_THRESHOLD_MULTIPLIER;

  // --- Step 4: Fire onset if flux exceeds threshold and cooldown has elapsed ---
  const isBeat =
    flux > dynamicThreshold &&
    (now - lastOnsetTime) > ONSET_COOLDOWN_MS;

  if (isBeat) {
    lastOnsetTime = now;
    // Intensity: how far above the threshold did flux land?
    // At threshold → 0; at 2× threshold → 0.5; at 3× threshold → ~0.67; clamped at 1.0.
    beatIntensityInternal = Math.min(1.0, (flux - dynamicThreshold) / dynamicThreshold);
  }

  // Decay intensity toward zero each frame regardless of onset state
  beatIntensityInternal *= ONSET_DECAY;

  return { isBeat, beatIntensity: beatIntensityInternal };
}


// ================================
// AUDIO ANALYSIS — UPDATE (called every frame from drawFrame)
//
// Each frame: reads the latest FFT data from the AnalyserNode for band
// energies and onset detection, reads the latest Meyda callback result for
// chroma, RMS, and spectral centroid, and writes everything into audioData.
//
// New in M3 (Meyda refactor): chroma, amplitude, and spectralBrightness now
// come from latestMeydaFeatures rather than manual FFT analysis.
// Kept from M2: spectral flux onset detection, band energies (legacy).
//
// Falls back to idle values when paused or not yet loaded, so the aurora
// continues its ambient animation rather than freezing.
// ================================

function updateAudioData() {
  // No analyser yet (first file not loaded), or audio is paused — use idle values.
  // Lerp smoothedChroma toward idle level so colors fade gracefully on pause.
  // Let beatIntensity continue to decay so a beat flash doesn't freeze on pause.
  if (!analyser || audioPlayer.paused) {
    beatIntensityInternal *= ONSET_DECAY;
    for (let i = 0; i < 12; i++) {
      smoothedChroma[i] = lerp(smoothedChroma[i], 0.05, CHROMA_LERP_RATE);
    }
    audioData = {
      chroma:             smoothedChroma,
      dominantPitch:      -1,
      secondaryPitches:   [],
      amplitude:          0.04,
      spectralBrightness: 0.3,
      isBeat:             false,
      beatIntensity:      beatIntensityInternal,
    };
    return;
  }

  // Read current FFT magnitudes into freqData (0–255 per bin).
  // Used for spectral flux onset detection. Chroma / amplitude / brightness
  // are sourced from Meyda — not from this buffer.
  analyser.getByteFrequencyData(freqData);

  // --- Chroma extraction (via Meyda) ---
  //
  // Meyda provides chroma as a 12-element array (index 0 = C, index 11 = B),
  // each value 0.0–1.0, normalized so the loudest pitch class in the buffer
  // equals 1.0. We lerp smoothedChroma toward the new raw values each frame
  // to bridge the gaps between Meyda's buffer-rate callbacks (~46ms intervals)
  // and the render loop's per-frame cadence (~16ms at 60fps).
  //
  // If latestMeydaFeatures is null (Meyda hasn't fired its first callback yet),
  // we hold smoothedChroma at its current values — no lerp step this frame.
  const rawChroma = latestMeydaFeatures ? latestMeydaFeatures.chroma : smoothedChroma;
  for (let i = 0; i < 12; i++) {
    smoothedChroma[i] = lerp(smoothedChroma[i], rawChroma[i], CHROMA_LERP_RATE);
  }

  // Detect dominant and secondary pitch classes from smoothed chroma.
  const { dominantPitch, secondaryPitches } = getDominantPitches(smoothedChroma);

  // --- Amplitude (via Meyda RMS) ---
  // Meyda's rms value is already 0.0–1.0 — no normalization needed.
  // Falls back to 0.04 (idle level) before the first Meyda callback fires.
  // isNaN guard: Meyda can return NaN for rms during the brief gap when a new
  // track starts decoding — treat NaN as absence of a valid reading.
  const rawRms  = latestMeydaFeatures ? latestMeydaFeatures.rms : NaN;
  const amplitude = (!isNaN(rawRms)) ? rawRms : 0.04;

  // --- Spectral brightness (via Meyda spectralCentroid) ---
  // spectralCentroid is the weighted mean frequency in Hz. Dividing by the
  // Nyquist frequency (sampleRate / 2) normalizes it to 0.0–1.0.
  // Higher values → brighter, more treble-heavy sound (strings, cymbals).
  // Lower values  → darker, bass-heavy sound (cello, bass guitar, kick drum).
  // Per the research, timbre modifies saturation + lightness, not hue.
  // Falls back to 0.3 (neutral) when Meyda hasn't fired or returns NaN.
  // Note: spectralCentroid != null passes for NaN (NaN !== null), so the
  // isNaN check is required in addition to the null guard.
  const rawCentroid = latestMeydaFeatures ? latestMeydaFeatures.spectralCentroid : NaN;
  const spectralBrightness = (rawCentroid != null && !isNaN(rawCentroid))
    ? rawCentroid / (audioCtx.sampleRate / 2)
    : 0.3;

  // --- Onset detection (spectral flux — unchanged from M2) ---
  // Still reads from freqData directly; Meyda cannot provide this because
  // onset detection requires per-render-frame snapshots, not buffer-rate callbacks.
  const { isBeat, beatIntensity } = detectOnset(freqData);

  // --- DEBUG: throttled console logging (once per second) ---
  // Remove this entire block before the next milestone.
  const debugNow = performance.now();   // DEBUG
  if (debugNow - debugLastLogTime >= 1000) {   // DEBUG
    debugLastLogTime = debugNow;   // DEBUG
    const meydaReady = latestMeydaFeatures ? 'yes' : 'no';   // DEBUG
    const rawStr     = Array.from(rawChroma).map(v => v.toFixed(3)).join(', ');   // DEBUG
    const smthStr    = Array.from(smoothedChroma).map(v => v.toFixed(3)).join(', ');   // DEBUG
    const domName    = dominantPitch >= 0 ? PITCH_CLASS_NAMES[dominantPitch] : '(none)';   // DEBUG
    const secNames   = secondaryPitches.length > 0   // DEBUG
      ? secondaryPitches.map(p => `${p}(${PITCH_CLASS_NAMES[p]})`).join(', ')   // DEBUG
      : '(none)';   // DEBUG
    const chromaMax    = Math.max(...smoothedChroma);   // DEBUG
    const chromaMin    = Math.min(...smoothedChroma);   // DEBUG
    const chromaSpread = (chromaMax - chromaMin).toFixed(3);   // DEBUG
    console.log(`[Meyda]           ready: ${meydaReady} | rms: ${amplitude.toFixed(3)} | centroid (norm): ${spectralBrightness.toFixed(3)}`);   // DEBUG
    console.log(`[Chroma raw]      ${rawStr}`);   // DEBUG
    console.log(`[Chroma smoothed] ${smthStr}`);   // DEBUG
    console.log(`[Chroma spread]   max: ${chromaMax.toFixed(3)} | min: ${chromaMin.toFixed(3)} | spread: ${chromaSpread}`);   // DEBUG
    console.log(`[Pitch]           dominant: ${dominantPitch} (${domName}) | secondary: ${secNames}`);   // DEBUG
  }   // DEBUG
  if (isBeat) {   // DEBUG
    console.log(`🎵 ONSET — beatIntensity: ${beatIntensity.toFixed(3)}`);   // DEBUG
  }   // DEBUG
  // END DEBUG

  // Write all values into the shared audioData object.
  audioData = {
    chroma:             smoothedChroma,
    dominantPitch,
    secondaryPitches,
    amplitude,
    spectralBrightness,
    isBeat,
    beatIntensity,
  };
}


// =============================================================================
// UI / PLAYBACK
// =============================================================================


// ================================
// UI ELEMENTS
// ================================

const landingEl           = document.getElementById('landing');
const controlsEl          = document.getElementById('controls');
const trackNameEl         = document.getElementById('track-name');
const timeDisplayEl       = document.getElementById('time-display');
const progressBarEl       = document.getElementById('progress-bar');
const progressFillEl      = document.getElementById('progress-fill');
const progressHandleEl    = document.getElementById('progress-handle');
const playPauseBtn        = document.getElementById('play-pause-btn');
const iconPlay            = document.getElementById('icon-play');
const iconPause           = document.getElementById('icon-pause');
const uploadInput         = document.getElementById('audio-upload');
const uploadControlsInput = document.getElementById('audio-upload-controls');
const audioPlayer         = document.getElementById('audio-player');


// ================================
// PROGRESS BAR — TIME FORMATTER
//
// Converts a raw seconds value into the m:ss display format used in the
// time display (e.g. 2:14, 0:09, 1:03).
//
// Why Math.floor instead of Math.round:
//   Rounding would make 2:59.6 display as 3:00 while the bar still shows
//   < 100%, creating a mismatch. Flooring keeps the display consistent
//   with the bar position.
//
// Parameters:
//   seconds — number; elapsed or total playback time in seconds
//
// Returns: string — 'm:ss' format, or '--:--' if seconds is not finite
//   (NaN and Infinity both trigger '--:--'; seen when duration is unknown
//    immediately after a new track src is set, before metadata loads)
// ================================

function formatTime(seconds) {
  if (!isFinite(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  // padStart ensures seconds always render as two digits: 2:04 not 2:4
  return `${m}:${s.toString().padStart(2, '0')}`;
}


// ================================
// PROGRESS BAR — UPDATE DISPLAY
//
// Synchronises the progress bar fill, handle position, and time display with
// the audio element's current playback position. Driven by timeupdate events
// (fires ≈4 times/second during playback) and also called directly after seeks
// and on loadedmetadata so the display updates immediately.
//
// Skips the update if isDragging is true — the drag handlers own the visual
// state during scrubbing and calling this would cause a snap-back to the
// last committed playback position.
// ================================

function updateProgressBar() {
  if (isDragging) return;

  const duration = audioPlayer.duration;
  const current  = audioPlayer.currentTime;
  const fraction = (isFinite(duration) && duration > 0) ? current / duration : 0;

  progressFillEl.style.width  = `${fraction * 100}%`;
  progressHandleEl.style.left = `${fraction * 100}%`;
  timeDisplayEl.textContent   = `${formatTime(current)} / ${formatTime(duration)}`;
}


// ================================
// PROGRESS BAR — DRAG SCRUBBING
//
// Three-event drag pattern: mousedown on the bar begins the drag; mousemove
// on the document updates the visual position while the button is held;
// mouseup on the document commits the seek and ends the drag.
//
// Why seek only on mouseup, not on every mousemove:
//   Setting audioPlayer.currentTime triggers a browser decode-and-seek
//   operation that is CPU-intensive and interrupts audio output briefly.
//   Seeking on every pixel of mouse movement (~60 events/second during a
//   fast drag) would produce choppy audio and stall the render loop.
//   Instead, the visual (fill width and handle left) updates instantly on
//   every mousemove, while exactly one seek fires when the user releases.
//
// getFractionFromEvent:
//   Converts a MouseEvent's clientX into a 0.0–1.0 fraction of the bar's
//   rendered width. getBoundingClientRect() is used rather than offsetX
//   because offsetX is relative to the event target element — during a drag
//   that may be any element under the cursor, not #progress-bar itself.
//   The result is clamped to [0, 1] so dragging past either end is safe.
// ================================

// True while the user is holding the mouse button down on the bar.
// updateProgressBar() checks this flag to suppress timeupdate visual updates
// during a drag, preventing a snap-back to the pre-drag playback position.
let isDragging = false;

// --- Helpers ---

// Converts a MouseEvent's clientX to a 0–1 progress fraction of the bar.
function getProgressFraction(e) {
  const rect = progressBarEl.getBoundingClientRect();
  return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
}

// Applies a 0–1 fraction to the fill width and handle position without
// touching audioPlayer.currentTime. Used by both drag and click handlers.
function setVisualProgress(fraction) {
  progressFillEl.style.width  = `${fraction * 100}%`;
  progressHandleEl.style.left = `${fraction * 100}%`;
}

// --- Event listeners ---

progressBarEl.addEventListener('mousedown', (e) => {
  isDragging = true;
  // Jump the handle to the click point immediately so it doesn't lag behind
  // the cursor between mousedown and the first mousemove.
  setVisualProgress(getProgressFraction(e));
  // Prevent the browser from initiating a text selection or image drag
  // while the user holds the button down and moves the mouse.
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const fraction = getProgressFraction(e);
  // Update the visual position each pixel of movement — instant feedback.
  setVisualProgress(fraction);
  // Also update the time display so the user can read what time they will
  // land on when they release (scrub preview).
  const duration = audioPlayer.duration;
  timeDisplayEl.textContent =
    `${formatTime(fraction * duration)} / ${formatTime(duration)}`;
});

document.addEventListener('mouseup', (e) => {
  if (!isDragging) return;
  isDragging = false;
  // Single seek at drag end — the one and only currentTime assignment for
  // the entire drag interaction. Also covers a plain click (mousedown +
  // immediate mouseup without movement).
  const fraction = getProgressFraction(e);
  const duration = audioPlayer.duration;
  if (isFinite(duration) && duration > 0) {
    audioPlayer.currentTime = fraction * duration;
  }
  // Sync the display to the seeked position immediately; the next timeupdate
  // may not fire until up to ~250ms later.
  updateProgressBar();
});


// ================================
// PROGRESS BAR — AUDIO ELEMENT EVENTS
//
// timeupdate    — fires ≈4 times/second during playback; keeps the bar moving
// loadedmetadata— fires once when duration becomes available after a new src
//                 is set; lets the total time render before playback starts
// ended         — fires when the track finishes; resets to full position
// ================================

audioPlayer.addEventListener('timeupdate',     updateProgressBar);
audioPlayer.addEventListener('loadedmetadata', updateProgressBar);
audioPlayer.addEventListener('ended',          updateProgressBar);


// ================================
// FILE LOADING
// ================================

function loadAudioFile(file) {
  if (!file) return;

  // Initialize the AudioContext pipeline on first file load.
  // Must happen here (inside a user-gesture handler) to satisfy browser
  // autoplay policy. Subsequent calls are no-ops due to the guard in initAudioContext().
  initAudioContext();

  // Resume the AudioContext in case the browser suspended it.
  // Browsers may auto-suspend an AudioContext that hasn't produced output yet.
  if (audioCtx.state === 'suspended') audioCtx.resume();

  // Free the previous blob URL to avoid memory leaks.
  // revokeObjectURL is safe to call here — the audio element will be
  // given a new src immediately below.
  if (audioPlayer.src) URL.revokeObjectURL(audioPlayer.src);

  // Reset Meyda's cached features so the previous track's values don't
  // persist into the new track's first frames. updateAudioData() will fall
  // back to neutral idle values until the new track's first Meyda callback fires.
  latestMeydaFeatures = null;

  // Reset the progress bar to zero. Duration is unknown at this point
  // (the audio element hasn't parsed the new file yet), so total time
  // shows '--:--' until the loadedmetadata event fires.
  setVisualProgress(0);
  timeDisplayEl.textContent = '0:00 / --:--';

  const url = URL.createObjectURL(file);
  audioPlayer.src = url;
  audioPlayer.load();

  // Strip the file extension for a clean display name in the controls bar
  const displayName = file.name.replace(/\.[^/.]+$/, '');
  trackNameEl.textContent = displayName;

  // Transition from the landing overlay to the player UI
  landingEl.classList.add('hidden');
  controlsEl.classList.remove('hidden');
  playPauseBtn.disabled = false;

  // Auto-play immediately after load
  audioPlayer.play();
  setPlayState(true);
}

uploadInput.addEventListener('change', (e) => {
  loadAudioFile(e.target.files[0]);
  e.target.value = '';   // reset so the same file can be re-selected
});

uploadControlsInput.addEventListener('change', (e) => {
  loadAudioFile(e.target.files[0]);
  e.target.value = '';
});


// ================================
// PLAY / PAUSE
// ================================

// Swaps the play/pause SVG icons to reflect playback state.
function setPlayState(isPlaying) {
  if (isPlaying) {
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
  } else {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
  }
}

playPauseBtn.addEventListener('click', () => {
  // Resume AudioContext on play — browsers may suspend it during inactivity.
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

  if (audioPlayer.paused) {
    // Restart Meyda when resuming — it was stopped on pause to avoid processing
    // silence and populating latestMeydaFeatures with noise-floor chroma values.
    if (meydaAnalyzer) meydaAnalyzer.start();
    audioPlayer.play();
    setPlayState(true);
  } else {
    audioPlayer.pause();
    // Stop Meyda on pause — no audio to analyze, no need to run the callback.
    // latestMeydaFeatures retains its last value; updateAudioData() uses idle
    // fallback while paused regardless (the !audioPlayer.paused guard fires first).
    if (meydaAnalyzer) meydaAnalyzer.stop();
    setPlayState(false);
  }
});

// Reset icon to play state when the track finishes naturally
audioPlayer.addEventListener('ended', () => setPlayState(false));


// Start the render loop — must be called after all `let` declarations above
// to avoid a temporal dead zone error on `analyser` and `audioData`.
drawFrame();
