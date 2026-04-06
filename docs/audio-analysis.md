# Audio Analysis Architecture — Synesthesia App

> This document explains the audio analysis decisions made in Milestone 2, including why spectral flux was chosen for onset detection over simpler beat detection methods. Update this document whenever the analysis pipeline changes.

---

## Overview

The audio analysis pipeline reads the music in real-time every animation frame (~60 times per second) and produces a single `audioData` object that the aurora visualization reads. All visual responses to music flow through this object.

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
    → getByteFrequencyData()   → band energy extraction (bass / mid / high)
    → getByteTimeDomainData()  → RMS amplitude + spectral flux onset detection
    → audioData { bass, mid, high, amplitude, isBeat, beatIntensity }
```

---

## AnalyserNode Configuration

### fftSize: 2048
- Produces **1024 frequency bins**
- Bin resolution ≈ 21.5 Hz per bin (at 44100 Hz sample rate)
- Chosen for good frequency resolution without excessive CPU cost
- Higher values (4096, 8192) give finer detail but at a performance cost not justified at this stage

### smoothingTimeConstant: 0.3
- Blends each frame's FFT result with the previous frame
- Formula: `output = (smoothing × previous) + ((1 - smoothing) × current)`
- **Why 0.3 and not the default 0.8:**
  - 0.8 was too high for dense/compressed music — bass bins stay near ceiling (~0.9+) and never drop far enough between kicks for threshold-based detection to work
  - 0.3 lets transients come through clearly while still smoothing single-frame noise
  - Can be raised toward 0.5–0.6 in Milestone 3 if visuals feel jittery

---

## Frequency Band Extraction

`getByteFrequencyData()` fills a `Uint8Array[1024]` with magnitude values (0–255) per bin every frame. We divide the spectrum into three bands:

| Band | Bins | Approx. Frequency Range | Musical Content |
|---|---|---|---|
| **Bass** | 0–10 | 0–215 Hz | Kick drum, bass guitar, low synth, double bass |
| **Mid** | 11–100 | 215–2150 Hz | Vocals, guitar, piano, snare, most melody |
| **High** | 101–512 | 2150–11025 Hz | Hi-hats, cymbals, air, sibilance, high harmonics |

Each band is normalized to **0.0–1.0** by averaging bin values and dividing by 255.

**Note:** The top of the high band (bin 512) reaches ~11kHz, not 20kHz. Bins 513–1023 (11–22kHz) are excluded — they carry very little musical energy and would dilute the high band average without adding useful information.

---

## RMS Amplitude

Computed from `getByteTimeDomainData()` — the raw waveform samples (0–255, where 128 = silence).

```
sample = (rawValue - 128) / 128   ← re-centres around 0
RMS = √( Σ(sample²) / N )         ← root mean square
```

RMS correlates with perceived loudness more accurately than peak amplitude. It captures the overall energy of the signal rather than just its highest point in a given frame.

---

## Onset Detection — Spectral Flux

### Why Not Simple Bass Threshold (Kick Detection)?

The original Milestone 2 implementation used a **delta method** on bass energy — detecting sharp upward spikes in the bass frequency band. This works well for music where the kick drum is the rhythmic anchor (pop, electronic, hip-hop) but fails for:

- **Classical** — no kick drum; bass energy is sustained, not spiked
- **Jazz** — rhythm lives in hi-hat and ride cymbal (high frequencies)
- **Acoustic / folk** — guitar strums create mid-frequency pulses
- **Ambient / drone** — no clear transient events at all
- **Orchestral** — rhythmic pulse may be in strings, brass, or timpani

A kick-drum detector is not a beat detector — it is a bass-transient detector. For a chromesthesia visualizer that aims to work across all genres, this is too narrow.

### Spectral Flux — How It Works

**Spectral flux** measures the total change in the frequency spectrum between consecutive frames. Instead of watching one band, it watches everything simultaneously.

```
flux = Σ max(0, freqData[i] - previousFreqData[i])   for all bins i
```

- Only **positive** changes are counted (HWR — Half-Wave Rectification)
- A sudden increase anywhere in the spectrum contributes to the flux value
- A kick drum, a piano attack, a guitar strum, a brass hit — all produce spectral flux

**Onset fires when:**
1. `flux > dynamicThreshold` — flux exceeds a locally-computed threshold
2. A minimum cooldown period has elapsed (prevents double-triggering)

**Dynamic threshold:**
Rather than a fixed threshold, we maintain a **rolling median** of recent flux values and set the threshold as a multiple of that median. This adapts to the overall energy level of the track — a quiet classical passage and a loud electronic drop both get appropriate sensitivity.

```
dynamicThreshold = rollingMedian(recentFluxValues) × THRESHOLD_MULTIPLIER
```

### Parameters

| Parameter | Value | Notes |
|---|---|---|
| `FLUX_HISTORY_SIZE` | 43 frames | ~700ms of history at 60fps — enough to establish local median |
| `FLUX_THRESHOLD_MULTIPLIER` | 1.5 | Onset fires when flux is 1.5× the recent median. Tune up to reduce false positives, down to catch quieter onsets |
| `ONSET_COOLDOWN_MS` | 100ms | Minimum gap between onsets. 100ms = max ~10 onsets/second, sufficient for fast passages |
| `ONSET_DECAY` | 0.88 | Per-frame decay of `beatIntensity`. Halves in ~5 frames (~83ms at 60fps) |

### Compared to the Previous Delta Method

| | Delta Method (removed) | Spectral Flux (current) |
|---|---|---|
| **Works on** | Bass-heavy, uncompressed music | All genres |
| **Detects** | Bass transients (kick drums) | Any musical onset |
| **Fails on** | Classical, jazz, acoustic, ambient | Extremely gradual swells (by design — no onset = no onset event) |
| **Complexity** | Low | Medium |
| **Tuning** | Single threshold | Threshold multiplier + history window |

---

## The audioData Object

Written every frame by `updateAudioData()`, read by the aurora render loop.

```javascript
audioData = {
  bass:          0.0–1.0,   // normalized bass band energy
  mid:           0.0–1.0,   // normalized mid band energy
  high:          0.0–1.0,   // normalized high band energy
  amplitude:     0.0–1.0,   // RMS amplitude (overall loudness)
  isBeat:        boolean,   // true only on the frame an onset is detected
  beatIntensity: 0.0–1.0,   // decaying intensity value — 1.0 on onset, fades to 0
}
```

**Idle fallback** (when paused or not yet loaded):
```javascript
{ bass: 0.08, mid: 0.04, high: 0.02, amplitude: 0.04, isBeat: false, beatIntensity: 0.0 }
```
Non-zero idle values keep the aurora in slow ambient animation rather than freezing.

---

## How audioData Maps to Visuals (Milestone 3)

| audioData field | Aurora behavior |
|---|---|
| `bass` | Low zone brightness + size |
| `mid` | Mid zone color saturation |
| `high` | High zone movement speed |
| `amplitude` | Global saturation swell |
| `beatIntensity` | Pulse flash intensity across all zones |
| `isBeat` | Triggers onset flash event |

---

## Open Questions

| Question | Status | Notes |
|---|---|---|
| smoothingTimeConstant tuning | 🔲 Revisit in M3 | May raise to 0.5 if visuals feel jittery |
| Flux threshold multiplier tuning | 🔲 Revisit in M3 | Test across genres — classical especially |
| Per-band onset detection | 🔲 Future | Could fire separate onset events per band for richer visual response |
| Tempo estimation | 🔲 Future | Inter-onset interval could estimate BPM for animation speed |

---

*Last updated: Milestone 2 revision — spectral flux replaces delta beat detection*
*See also: `README.md`, `docs/visual-design.md`*
