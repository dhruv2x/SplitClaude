'use strict';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';

function colorFor(pct) {
  if (pct >= 80) return RED;
  if (pct >= 50) return YELLOW;
  return GREEN;
}

function bar(pct, width = 5) {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function money(v) {
  return `$${v.toFixed(2)}`;
}

function duration(ms) {
  if (ms <= 0) return 'now';
  const mins = Math.ceil(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d${h}h`;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

module.exports = { RESET, GREEN, YELLOW, RED, DIM, colorFor, bar, money, duration };
