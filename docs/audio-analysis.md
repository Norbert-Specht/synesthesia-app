# Audio Analysis Architecture — Synesthesia App

> Living document. Update whenever the audio analysis pipeline changes.
> Last updated: Milestone 3 — chroma feature extraction added.

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

Every frame:
AnalyserNode
    → getByteFrequencyData()    → chroma extraction (12 pitch class energies)
                                → spectral brightness (timbre proxy)
    → getByteTimeDomainData()   → RMS amplitude
                                → spectral flux onset detection
    → audioData {
        chroma[12],          — energy per pitch class C through B (0.0–1.0 each)
        dominantPitch,       — index of highest energy pitch class (0–11)
        secondaryPitches[],  — indices of next 1–2 most active pitch classes
        amplitude,           — RMS amplitude (0.0–1.0)
        spectralBrightness,  — proxy for timbre brightness (0.0–1.0)
        isBeat,              — true only on onset detection frame
        beatIntensity,       — decaying intensity value post-onset
      }
```

---

## AnalyserNode Configuration

### fftSize: 2048
1024 frequency bins. Bin resolution ≈ 21.5 Hz per bin at 44100 Hz. Chosen for good frequency resolution without excessive CPU cost.

### smoothingTimeConstant: 0.3
Low enough to let transients through clearly — important for onset detection. May be raised to 0.5 in M3 tuning if visuals feel jittery.

---

## Chroma Feature Extraction

### What Chroma Is

Chroma features represent the energy present at each of the 12 musical pitch classes (C, C#, D, D#, E, F, F#, G, G#, A, A#, B) regardless of octave. A chroma vector tells us *which notes* are active in the music at any moment, without caring about which octave they're in.

This is the foundation of the pitch-to-color system. It is what makes the visualization work across all musical genres — we don't need to detect specific notes or chords explicitly, we simply measure which pitch classes are most energetically present each frame.

### Mapping FFT Bins to Pitch Classes

Each FFT frequency bin maps to a musical pitch class using the equal temperament formula:

```
frequency = binIndex × (sampleRate / fftSize)
            ≈ binIndex × 21.5 Hz  (at 44100 Hz)

pitchClass = round(12 × log2(frequency / referenceFrequency)) mod 12
             where referenceFrequency = 440 Hz (A4)
```

This mapping is computed once at initialization and stored as a lookup table — not recalculated every frame.

### Chroma Vector

The output is an array of 12 normalized values (0.0–1.0), one per pitch class:

```javascript
chroma = [
  C_energy,   // index 0
  Cs_energy,  // index 1  (C#)
  D_energy,   // index 2
  Ds_energy,  // index 3  (D#)
  E_energy,   // index 4
  F_energy,   // index 5
  Fs_energy,  // index 6  (F#)
  G_energy,   // index 7
  Gs_energy,  // index 8  (G#)
  A_energy,   // index 9
  As_energy,  // index 10 (A#)
  B_energy,   // index 11
]
```

### Dominant and Secondary Pitch Detection

Each frame, the chroma vector is sorted to find the most active pitch classes:

```javascript
dominantPitch     = argmax(chroma)           // index of highest energy
secondaryPitch1   = argmax(chroma, exclude: dominantPitch)
secondaryPitch2   = argmax(chroma, exclude: [dominantPitch, secondaryPitch1])
```

A minimum energy threshold (e.g. 0.15) filters out noise — pitch classes below this threshold are ignored even if they are the highest available.

### Smoothing

Raw chroma values can jump sharply frame-to-frame. Each pitch class energy is lerped toward its raw value at a slow rate (0.05) to prevent the dominant pitch from flickering between adjacent pitch classes during sustained chords.

---

## Spectral Brightness (Timbre Proxy)

Timbre-color synesthesia affects saturation and lightness rather than hue. We approximate timbre brightness using the ratio of high-frequency energy to total energy:

```
spectralBrightness = sum(freqData[200..512]) / sum(freqData[0..512])
```

Higher values → brighter, more treble-heavy sound (strings, bright synths, cymbals)
Lower values → darker, more bass-heavy sound (bass guitar, cello, kick drum)

This is used in the color pipeline to modulate saturation of the rendered ribbon color.

---

## RMS Amplitude

Root Mean Square of time-domain waveform samples. Measures perceived loudness. Used to drive ribbon height, saturation swell, and the dynamics-driven ribbon origin point.

```
amplitude = √( Σ((sample - 128)² / 128²) / N )
```

---

## Spectral Flux Onset Detection

### Why Spectral Flux

The original Milestone 2 delta method watched for bass energy spikes — essentially a kick drum detector. This fails on classical, jazz, acoustic, and ambient music.

Spectral flux measures the total positive change in the entire frequency spectrum between consecutive frames. Any sudden increase anywhere — kick drum, piano attack, guitar strum, brass hit — contributes to the flux value.

### How It Works

```
flux = Σ max(0, freqData[i] - previousFreqData[i])   for all bins i
```

An onset fires when flux exceeds a dynamic threshold (rolling median × multiplier) and a minimum cooldown has elapsed.

### Parameters

| Parameter | Value | Notes |
|---|---|---|
| `FLUX_HISTORY_SIZE` | 43 frames | ~700ms of history |
| `FLUX_THRESHOLD_MULTIPLIER` | 1.5 | Tune up for fewer triggers, down for more |
| `ONSET_COOLDOWN_MS` | 100ms | Max ~10 onsets/second |
| `ONSET_DECAY` | 0.88 | beatIntensity halves in ~5 frames |

---

## The audioData Object

Written every frame by `updateAudioData()`, read by the ribbon system and render loop.

```javascript
audioData = {
  chroma:             Float32Array(12),  // pitch class energies, 0.0–1.0
  dominantPitch:      0–11,              // pitch class index with most energy
  secondaryPitches:   [0–11, 0–11],      // next 1–2 most active pitch classes
  amplitude:          0.0–1.0,           // RMS loudness
  spectralBrightness: 0.0–1.0,           // timbre brightness proxy
  isBeat:             boolean,           // true on onset detection frame only
  beatIntensity:      0.0–1.0,           // decaying post-onset intensity
}
```

### Idle Fallback

When paused or not yet loaded, audioData uses safe idle values so the aurora continues ambient animation rather than freezing. Chroma defaults to a gentle equal distribution across all pitch classes at low energy.

---

## How audioData Maps to Visuals

| audioData field | Visual behavior |
|---|---|
| `dominantPitch` | Primary ribbon hue via profile lookup |
| `secondaryPitches` | Secondary ribbon hues + glow gradient tint |
| `chroma` | Weighted blend for background glow color |
| `amplitude` | Ribbon height, saturation swell, origin fade point |
| `spectralBrightness` | Saturation modifier in color pipeline |
| `beatIntensity` | Brightness pulse across all ribbons |
| `isBeat` | Triggers onset flash event |

---

## Open Questions

| Question | Status | Notes |
|---|---|---|
| smoothingTimeConstant tuning | 🔲 Revisit M3 | May raise to 0.5 if chroma flickers |
| Chroma smoothing lerp rate | 🔲 Tune in M3 | Start at 0.05 — adjust based on dominant pitch stability |
| Minimum chroma threshold | 🔲 Tune in M3 | Start at 0.15 — prevents noise from driving color |
| Per-band onset detection | 🔲 Future | Could fire separate events per frequency zone |
| Tempo estimation | 🔲 Future | Inter-onset intervals could estimate BPM |

---

*See also: `README.md`, `docs/visual-design.md`, `docs/research.md`*
