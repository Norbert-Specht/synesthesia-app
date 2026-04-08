# Audio Analysis Architecture — Synesthesia App

> Living document. Update whenever the audio analysis pipeline changes.
> Last updated: Milestone 3 — Meyda.js replaces hand-rolled chroma extraction.

---

## Why Meyda.js

The original hand-rolled chroma extraction used raw FFT bin bucketing with a bin-to-pitch-class lookup table. Despite multiple iterations (bin weighting, frequency ceiling reduction, threshold raising), it produced a fundamental problem called **pitch class aliasing** — C# dominated almost every frame regardless of musical content.

**Root cause:** The equal temperament mapping distributes FFT bins unevenly across pitch classes. At 44100Hz with fftSize 2048, some pitch classes receive more bins than others, and those pitch classes appear artificially stronger. Additionally, overtone bleed from higher frequencies distributed energy across all pitch classes simultaneously, keeping the spread between max and min chroma values at 0.15–0.28 (target was ≥ 0.6).

**Why Meyda.js fixes this:** Meyda handles FFT windowing, normalization, and overtone compensation correctly. After switching, the chroma spread reached 0.6–0.9 on clear harmonic content, and the dominant pitch changed meaningfully across the session (9 different pitch classes observed vs C# locked for ~19/21 readings previously).

---

## Pipeline Overview

```
<audio> element
    ↓ createMediaElementSource()
MediaElementSourceNode
    ↓ connect()
AnalyserNode  (fftSize: 2048, smoothingTimeConstant: 0.3)
    ↓ connect()
AudioContext.destination  (speakers)

Meyda analyzer (parallel tap on sourceNode):
    bufferSize: 2048
    features: ['chroma', 'rms', 'spectralCentroid']
    callback: stores result in latestMeydaFeatures

AnalyserNode (direct, independent):
    getByteFrequencyData() → spectral flux onset detection
    (kept independent — Meyda has no onset detector)

Every frame → updateAudioData() assembles audioData object
```

---

## AnalyserNode Configuration

### fftSize: 2048
1024 frequency bins. ~21.5 Hz per bin at 44100Hz. Good frequency resolution without excessive CPU cost.

### smoothingTimeConstant: 0.3
Low enough to let transients through for onset detection. The default 0.8 prevented bass values from dropping between kicks, making onset detection mathematically unreachable on dense/compressed music.

---

## Meyda Features

### chroma
12-element array (Float32Array) representing energy at each pitch class:
```
index: 0=C, 1=C#, 2=D, 3=D#, 4=E, 5=F, 6=F#, 7=G, 8=G#, 9=A, 10=A#, 11=B
```
Normalized 0.0–1.0. Meyda handles windowing and overtone compensation internally.

**Smoothing:** Raw Meyda chroma is lerped at rate `0.05` into `smoothedChroma` each frame. This prevents the dominant pitch from flickering between adjacent pitch classes during sustained chords.

### rms
Root Mean Square amplitude. Perceptually accurate loudness measure. Used for:
- Ribbon height and thickness modulation
- Color saturation scaling
- Dynamics-driven origin fade point

### spectralCentroid
Perceptually weighted center of the frequency spectrum. Proxy for timbre brightness.

**Normalization issue:** Raw spectralCentroid from Meyda at 44100Hz is in the range ~0.001–0.010 when divided by `sampleRate / 2`. Multiply by 100 before using as `spectralBrightness` to get a 0.0–1.0 range. This is a known quirk of how Meyda reports this value.

---

## Dominant Pitch Detection

```javascript
getDominantPitches(smoothedChroma):
  → filter: pitch classes below CHROMA_MIN_ENERGY (0.25) are ignored
  → sort remaining by energy descending
  → return {
      dominantPitch:    index of highest energy pitch class
      secondaryPitches: array of next 1-2 most active
    }
```

**Minimum energy threshold (0.25):** Prevents low-energy ambient FFT noise from driving color changes. A pitch class must have at least 25% of maximum possible energy to be considered active.

**Chroma smoothing rate (0.05):** Slow enough to prevent flicker on fast harmonic changes, fast enough to respond to genuine key changes within 1–2 seconds.

---

## Spectral Flux Onset Detection

Kept independent of Meyda — runs directly on `getByteFrequencyData()` output each frame.

### Why spectral flux instead of bass threshold

The original delta-method bass detector was essentially a kick drum detector — it watched for sharp upward spikes in bass energy only. It failed on classical, jazz, acoustic, and ambient music where rhythm lives in other frequency ranges.

Spectral flux measures total positive change across the entire frequency spectrum between consecutive frames:
```
flux = Σ max(0, freqData[i] - previousFreqData[i])   for all bins i
```
Any sudden increase anywhere — kick drum, piano attack, guitar strum, brass hit — contributes. Works across all genres.

### Parameters

| Parameter | Value | Rationale |
|---|---|---|
| `FLUX_HISTORY_SIZE` | 43 frames | ~700ms history for rolling median |
| `FLUX_THRESHOLD_MULTIPLIER` | 1.5 | Onset fires when flux is 1.5× recent median |
| `ONSET_COOLDOWN_MS` | 100ms | Max ~10 onsets/second |
| `ONSET_DECAY` | 0.88 | beatIntensity halves in ~5 frames |

---

## The audioData Object

Written every frame by `updateAudioData()`. Read by both render modes and ribbon lifecycle systems.

```javascript
audioData = {
  chroma:             Float32Array(12),  // smoothed pitch class energies 0.0–1.0
  dominantPitch:      0–11,              // pitch class with most energy
  secondaryPitches:   [0–11, 0–11],      // next 1–2 most active pitch classes
  amplitude:          0.0–1.0,           // RMS from Meyda
  spectralBrightness: 0.0–1.0,           // spectralCentroid × 100, clamped
  isBeat:             boolean,           // true on onset detection frame only
  beatIntensity:      0.0–1.0,           // decaying post-onset intensity
}
```

### Idle Fallback
When paused or not yet loaded:
```javascript
{
  chroma: Float32Array(12).fill(0.05),  // equal low energy — ambient animation
  dominantPitch: 0,
  secondaryPitches: [7, 4],             // C, G, E — a stable idle chord
  amplitude: 0.04,
  spectralBrightness: 0.3,
  isBeat: false,
  beatIntensity: beatIntensityInternal * ONSET_DECAY,  // continues decaying
}
```

---

## How audioData Maps to Visuals

### Aurora Mode
| Field | Visual effect |
|---|---|
| `dominantPitch` | Primary ribbon hue via profile lookup |
| `secondaryPitches` | Secondary ribbon hues + glow gradient tint |
| `amplitude` | Ribbon thickness, saturation, origin fade point |
| `spectralBrightness` | Lightness modifier in color pipeline |
| `beatIntensity` | Global brightness pulse on all ribbons |

### Glow Stick Mode
| Field | Visual effect |
|---|---|
| `dominantPitch` | Solo individual stick, thickest |
| `secondaryPitches` | Cluster spawning, center + satellites |
| `chroma` | Tertiary pitch detection (energy > 0.35) |
| `amplitude` | Stick thickness, color saturation |
| `beatIntensity` | Core flare — surges toward pure white on onset |

---

## Open Questions

| Question | Status | Notes |
|---|---|---|
| smoothingTimeConstant tuning | 🔲 Revisit after M3 visual tuning | May raise to 0.5 if pitch flickers visually |
| Chroma lerp rate (0.05) | 🔲 Revisit after M3 | May raise to 0.07–0.08 if pitch changes feel sluggish |
| CHROMA_MIN_ENERGY (0.25) | 🔲 Revisit after M3 | Test on classical and ambient music |
| Per-band onset events | 🔲 Future | Separate onset per frequency zone for richer response |
| Tempo estimation | 🔲 Future | Inter-onset intervals → BPM for animation speed sync |

---

*See also: `README.md`, `docs/visual-design.md`, `docs/research.md`*
