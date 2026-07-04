'use strict';

const { loadConfig } = require('../config');
const { buildReport, fireWarnings } = require('../report');
const { RESET, DIM, colorFor, bar, duration } = require('../format');

// Render one gauge as a compact colored segment, e.g. "wk ███░░ 79% ⚠ ↻2d7h".
// A gauge with no active window (an aged-out session) renders as "5h fresh".
function segment(gauge, now) {
  if (gauge.resetsAt == null) return `${DIM}${gauge.short} fresh${RESET}`;
  const color = colorFor(gauge.pct);
  const marker = gauge.pct >= 100 ? ' ⛔' : gauge.pct >= 80 ? ' ⚠' : '';
  const reset = `${DIM} ↻${duration(gauge.resetsAt - now)}${RESET}`;
  return `${color}${gauge.short} ${bar(gauge.pct)} ${Math.round(gauge.pct)}%${marker}${RESET}${reset}`;
}

// Claude Code invokes this on every statusline render, passing session JSON on
// stdin. We ignore stdin — the gauge is machine-wide, not per-session.
function run() {
  const cfg = loadConfig();
  if (!cfg) {
    process.stdout.write('splitclaude: not configured — run `splitclaude init`');
    return;
  }

  const report = buildReport(cfg);
  fireWarnings(report, cfg); // side effect: warnings; render is unaffected

  const parts = report.gauges.map((g) => segment(g, report.now));
  parts.push(`${DIM}1/${report.split} share${RESET}`);
  process.stdout.write(parts.join(' │ '));
}

module.exports = { run };
