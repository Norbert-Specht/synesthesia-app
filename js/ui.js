// =============================================================================
// SYNESTHESIA APP — ui.js
// =============================================================================
//
// Settings sidebar, render mode state, and display toggles.
//
// Owns:
//   renderMode    — 'aurora' | 'glowstick' — which renderer drawRibbon() uses
//   showNoteNames — boolean — whether note name labels are drawn each frame
//   sidebar open/close state and all settings event listeners
//
// All future settings should be added here as exported state variables
// with corresponding UI controls wired up below.
//
// renderMode and showNoteNames are exported as live bindings — any module
// that imports them always reads the current value without needing a getter.
// =============================================================================


// ================================
// EXPORTED STATE
// ================================

// Which renderer drawRibbon() routes to each frame.
// 'aurora' — broad translucent curtains. 'glowstick' — thin neon sticks.
export let renderMode    = 'aurora';

// Whether note name labels (C, C#, D …) are drawn at the bottom of each
// ribbon/stick. Off by default — the visualization is primary.
export let showNoteNames = false;


// ================================
// DOM REFERENCES
// ================================

const settingsBtn     = document.getElementById('settings-btn');
const settingsSidebar = document.getElementById('settings-sidebar');
const settingsClose   = document.getElementById('settings-close');
const noteNamesToggle = document.getElementById('note-names-toggle');
const pillBtns        = document.querySelectorAll('.settings-pill');


// ================================
// SIDEBAR — OPEN / CLOSE
//
// openSidebar / closeSidebar manage both the visual state (.open class
// drives the CSS slide transition) and the accessibility attributes
// (aria-hidden on the sidebar, aria-expanded on the trigger button).
// ================================

function openSidebar() {
  settingsSidebar.classList.add('open');
  settingsSidebar.setAttribute('aria-hidden', 'false');
  settingsBtn.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  settingsSidebar.classList.remove('open');
  settingsSidebar.setAttribute('aria-hidden', 'true');
  settingsBtn.setAttribute('aria-expanded', 'false');
}

// Settings button toggles the sidebar.
settingsBtn.addEventListener('click', () => {
  settingsSidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});

// Close button always closes.
settingsClose.addEventListener('click', closeSidebar);


// ================================
// VISUALIZATION MODE — PILL BUTTONS
//
// Clicking a pill updates renderMode and transfers the .active class to
// the clicked button. data-mode attribute maps directly to renderMode values.
// ================================

pillBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    renderMode = btn.dataset.mode;
    pillBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});


// ================================
// NOTE NAMES TOGGLE
//
// Syncs showNoteNames with the checkbox state. renderer.js reads
// showNoteNames in drawNoteLabel() each frame — no additional wiring needed.
// ================================

noteNamesToggle.addEventListener('change', () => {
  showNoteNames = noteNamesToggle.checked;
});
