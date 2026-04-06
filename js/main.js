// ================================
// CANVAS SETUP
// ================================
const canvas = document.getElementById('aurora-canvas');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);


// ================================
// AURORA — LAYER DEFINITIONS
//
// Each layer is a sinusoidal ribbon rendered with:
//   - an outer glow  (wide, soft, semi-transparent)
//   - a bright core  (narrow, near-white hot centre)
//
// Layers use globalCompositeOperation: 'screen' so colors
// blend naturally — overlapping cyan + green reads as white,
// overlapping purple + green reads as teal, etc.
// ================================
const AURORA_LAYERS = [
  {
    yFraction:   0.15,   // vertical centre as fraction of canvas height
    amplitude:   0.07,   // wave height as fraction of canvas height
    waveFreq:    2.2,    // number of full wave cycles across the width
    waveSpeed:   0.20,   // horizontal drift speed multiplier
    wobbleFreq:  0.9,    // secondary low-freq wobble
    wobbleAmp:   0.5,    // secondary wobble amplitude relative to primary
    thickness:   0.20,   // ribbon half-thickness as fraction of canvas height
    color:       [0, 255, 128],    // vivid green
    opacity:     0.60,
    timeOffset:  0.0,
  },
  {
    yFraction:   0.28,
    amplitude:   0.06,
    waveFreq:    1.6,
    waveSpeed:   0.13,
    wobbleFreq:  1.2,
    wobbleAmp:   0.4,
    thickness:   0.17,
    color:       [0, 220, 255],    // cyan
    opacity:     0.52,
    timeOffset:  2.1,
  },
  {
    yFraction:   0.44,
    amplitude:   0.09,
    waveFreq:    2.7,
    waveSpeed:   0.24,
    wobbleFreq:  0.7,
    wobbleAmp:   0.6,
    thickness:   0.22,
    color:       [160, 80, 255],   // purple
    opacity:     0.46,
    timeOffset:  4.4,
  },
  {
    yFraction:   0.57,
    amplitude:   0.05,
    waveFreq:    1.4,
    waveSpeed:   0.11,
    wobbleFreq:  1.5,
    wobbleAmp:   0.3,
    thickness:   0.14,
    color:       [255, 30, 140],   // magenta
    opacity:     0.34,
    timeOffset:  1.6,
  },
  {
    yFraction:   0.67,
    amplitude:   0.07,
    waveFreq:    2.0,
    waveSpeed:   0.17,
    wobbleFreq:  0.8,
    wobbleAmp:   0.45,
    thickness:   0.22,
    color:       [0, 170, 220],    // deep teal/blue
    opacity:     0.38,
    timeOffset:  3.5,
  },
];


// ================================
// AURORA — DRAW SINGLE LAYER
// ================================
function drawAuroraLayer(layer, time) {
  const w = canvas.width;
  const h = canvas.height;

  const centerY = layer.yFraction * h;
  const amp     = layer.amplitude * h;
  const thick   = layer.thickness * h;
  const [r, g, b] = layer.color;
  const t = time + layer.timeOffset;

  // Sample wave points across full width
  const STEPS = Math.ceil(w / 3);
  const stepX = w / STEPS;
  const pts   = [];

  for (let i = 0; i <= STEPS; i++) {
    const x     = i * stepX;
    const phase = (x / w) * Math.PI * 2 * layer.waveFreq;

    const y = centerY
      + Math.sin(phase + t * layer.waveSpeed) * amp
      + Math.sin(phase * layer.wobbleFreq + t * layer.waveSpeed * 0.65) * amp * layer.wobbleAmp;

    pts.push({ x, y });
  }

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  // — Outer glow ribbon —
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y - thick);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y - thick);
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].y + thick);
  ctx.closePath();

  const glowGrad = ctx.createLinearGradient(0, centerY - thick, 0, centerY + thick);
  glowGrad.addColorStop(0.00, `rgba(${r},${g},${b},0)`);
  glowGrad.addColorStop(0.25, `rgba(${r},${g},${b},${layer.opacity * 0.45})`);
  glowGrad.addColorStop(0.50, `rgba(${r},${g},${b},${layer.opacity})`);
  glowGrad.addColorStop(0.75, `rgba(${r},${g},${b},${layer.opacity * 0.45})`);
  glowGrad.addColorStop(1.00, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = glowGrad;
  ctx.fill();

  // — Bright core (narrow hot centre) —
  const coreThick = thick * 0.18;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y - coreThick);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y - coreThick);
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].y + coreThick);
  ctx.closePath();

  const coreGrad = ctx.createLinearGradient(0, centerY - coreThick, 0, centerY + coreThick);
  coreGrad.addColorStop(0.00, `rgba(255,255,255,0)`);
  coreGrad.addColorStop(0.50, `rgba(255,255,255,${layer.opacity * 0.55})`);
  coreGrad.addColorStop(1.00, `rgba(255,255,255,0)`);
  ctx.fillStyle = coreGrad;
  ctx.fill();

  ctx.restore();
}


// ================================
// AURORA — RENDER LOOP
// ================================
let time = 0;

function drawFrame() {
  // Dark background
  ctx.fillStyle = '#060810';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw all aurora layers back-to-front
  AURORA_LAYERS.forEach(layer => drawAuroraLayer(layer, time));

  time += 0.016;
  requestAnimationFrame(drawFrame);
}

drawFrame();


// ================================
// UI ELEMENTS
// ================================
const landingEl            = document.getElementById('landing');
const controlsEl           = document.getElementById('controls');
const trackNameEl          = document.getElementById('track-name');
const playPauseBtn         = document.getElementById('play-pause-btn');
const iconPlay             = document.getElementById('icon-play');
const iconPause            = document.getElementById('icon-pause');
const uploadInput          = document.getElementById('audio-upload');
const uploadControlsInput  = document.getElementById('audio-upload-controls');
const audioPlayer          = document.getElementById('audio-player');


// ================================
// FILE LOADING
// ================================
function loadAudioFile(file) {
  if (!file) return;

  // Revoke any previous object URL to free memory
  if (audioPlayer.src) URL.revokeObjectURL(audioPlayer.src);

  const url = URL.createObjectURL(file);
  audioPlayer.src = url;
  audioPlayer.load();

  // Strip file extension for display
  const displayName = file.name.replace(/\.[^/.]+$/, '');
  trackNameEl.textContent = displayName;

  // Transition from landing to player
  landingEl.classList.add('hidden');
  controlsEl.classList.remove('hidden');
  playPauseBtn.disabled = false;

  // Auto-play
  audioPlayer.play();
  setPlayState(true);
}

uploadInput.addEventListener('change', (e) => {
  loadAudioFile(e.target.files[0]);
  e.target.value = ''; // allow re-selecting the same file
});

uploadControlsInput.addEventListener('change', (e) => {
  loadAudioFile(e.target.files[0]);
  e.target.value = '';
});


// ================================
// PLAY / PAUSE
// ================================
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
  if (audioPlayer.paused) {
    audioPlayer.play();
    setPlayState(true);
  } else {
    audioPlayer.pause();
    setPlayState(false);
  }
});

audioPlayer.addEventListener('ended', () => setPlayState(false));
