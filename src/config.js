'use strict';

const fs = require('fs');
const path = require('path');
const { configFile, stateFile } = require('./paths');
const { defaultLimits } = require('./limits');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

// config.json shape:
// {
//   split: 2,                             // machines sharing the account
//   weeklyReset: { dow: 1, hh: 9, mm: 30 },
//   weeklyResetText: "mon 09:30",         // echoed back in prompts
//   notify: true,                         // desktop notifications on/off
//   limits: [ <limit descriptor>, ... ]   // see limits.js
// }

// Older configs stored two flat budgets (budget5h, budgetWeekly) and no
// `limits` array. Upgrade them in place so existing installs keep working
// after the weekly split. The old `budgetWeekly` was calibrated against the
// premium cap, so it seeds `weeklyPremium`; `weeklyAll` reuses it as a
// placeholder until the user recalibrates.
function migrate(cfg) {
  if (!cfg || Array.isArray(cfg.limits)) return cfg;
  if (cfg.budget5h == null && cfg.budgetWeekly == null) return cfg;

  cfg.limits = defaultLimits({
    session5h: cfg.budget5h,
    weeklyAll: cfg.budgetWeekly,
    weeklyPremium: cfg.budgetWeekly,
  });
  delete cfg.budget5h;
  delete cfg.budgetWeekly;
  return cfg;
}

function loadConfig() {
  return migrate(readJson(configFile(), null));
}

function saveConfig(cfg) {
  writeJson(configFile(), cfg);
}

// state.json drives the "fire each warning once per window" logic. Keyed by
// limit id; each entry records the window id it last saw and which thresholds
// have fired within it:
//   { "<limitId>": { id: "<windowId>", fired: [50, 80] }, ... }
// When a window refreshes the id changes, the fired list is cleared, and
// warnings can fire again — so a reset quota never shows a stale warning.
function loadState() {
  return readJson(stateFile(), {});
}

function saveState(state) {
  writeJson(stateFile(), state);
}

module.exports = { loadConfig, saveConfig, loadState, saveState };
