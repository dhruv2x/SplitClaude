'use strict';

// Self-contained test suite. Runs against a throwaway XDG_CONFIG_HOME so it
// never touches your real ~/.config/splitclaude state. Run: npm test
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'splitclaude-test-'));
process.env.XDG_CONFIG_HOME = tmp;

const {
  activeSessionWindow,
  parseWeeklyReset,
  lastWeeklyReset,
  nextWeeklyReset,
  FIVE_HOURS_MS,
  WEEK_MS,
} = require('../src/windows');
const { entryCost } = require('../src/pricing');
const { fireWarnings } = require('../src/report');
const { saveState, loadState } = require('../src/config');

const H = 3600000;
let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error('  ✗ ' + msg);
  }
}

// ---------------------------------------------------------------- pricing
(() => {
  // fable output: 1M tokens * $50/1M = $50
  const c = entryCost('claude-fable-5', { output_tokens: 1e6 });
  ok(Math.abs(c - 50) < 1e-9, `fable 1M output = $50 (got ${c})`);
  // cache read weighted 0.1x input: 1M * $10 * 0.1 = $1
  const cr = entryCost('claude-fable-5', { cache_read_input_tokens: 1e6 });
  ok(Math.abs(cr - 1) < 1e-9, `fable 1M cache-read = $1 (got ${cr})`);
  // 1h cache write 2x: 1M * $10 * 2 = $20
  const cw = entryCost('claude-fable-5', {
    cache_creation: { ephemeral_1h_input_tokens: 1e6 },
  });
  ok(Math.abs(cw - 20) < 1e-9, `fable 1M 1h-write = $20 (got ${cw})`);
  // per-model: opus input cheaper than fable
  ok(
    entryCost('claude-opus-4-8', { input_tokens: 1e6 }) === 5,
    'opus 1M input = $5'
  );
  ok(
    entryCost('claude-haiku-4-5-20251001', { input_tokens: 1e6 }) === 1,
    'date-suffixed haiku resolves to $1'
  );
})();

// ---------------------------------------------- activity-anchored 5h session
(() => {
  const t0 = Date.parse('2026-07-04T11:50:00Z'); // first message
  const mk = (offH) => ({ ts: t0 + offH * H, cost: 1 });

  // window opens at the exact first-message time, ends 5h later
  let w = activeSessionWindow([mk(0), mk(1), mk(3)], t0 + 3 * H);
  ok(w && w.start === t0 && w.end === t0 + 5 * H, 'window = [first msg, +5h)');
  ok(w.id === new Date(t0).toISOString(), 'window id is the start timestamp');

  // now past the window end => session aged out => null (gauge fresh)
  ok(activeSessionWindow([mk(0)], t0 + 5 * H + 1) === null, 'expired session => null');

  // exactly at end is expired (half-open interval)
  ok(activeSessionWindow([mk(0)], t0 + 5 * H) === null, 'end boundary is expired');

  // an idle gap >= 5h opens a fresh window anchored at the later message
  w = activeSessionWindow([mk(0), mk(6)], t0 + 6 * H + H);
  ok(w && w.start === t0 + 6 * H, 'gap >= 5h re-anchors the window');

  // a message before the 5h boundary stays in the same window (no re-anchor)
  w = activeSessionWindow([mk(0), mk(4)], t0 + 4 * H);
  ok(w && w.start === t0, 'message within 5h keeps the same window');

  // no entries at all => no active session
  ok(activeSessionWindow([], Date.now()) === null, 'no entries => null');
})();

// ------------------------------------------------------------ weekly anchor
(() => {
  const a = parseWeeklyReset('mon 09:30');
  ok(a && a.dow === 1 && a.hh === 9 && a.mm === 30, 'parse "mon 09:30"');
  ok(parseWeeklyReset('garbage') === null, 'reject bad anchor');
  ok(parseWeeklyReset('mon 25:00') === null, 'reject hour > 23');
  const now = Date.now();
  const last = lastWeeklyReset(a, now);
  ok(last <= now, 'last weekly reset is in the past');
  ok(new Date(last).getDay() === 1, 'last reset lands on Monday');
  ok(
    nextWeeklyReset(a, now) - last === WEEK_MS,
    'next reset is exactly 1 week after last'
  );
})();

// ------------------------------------------ warning state machine (the fix)
(() => {
  const cfg = { split: 2, notify: false };
  // Report shape: { gauges: [{ id, windowId, pct, spend, share, label }] }.
  const mkReport = (sessionId, sessionPct, weeklyId, weeklyPct) => ({
    now: 0,
    split: 2,
    gauges: [
      { id: 'session', label: '5h', windowId: sessionId, pct: sessionPct, spend: 0, share: 10 },
      { id: 'weeklyAll', label: 'wk', windowId: weeklyId, pct: weeklyPct, spend: 0, share: 100 },
    ],
  });

  saveState({}); // clean slate

  // cross 50 and 80 in one window
  let c = fireWarnings(mkReport('slot-A', 82, 'wk-1', 10), cfg);
  ok(
    c.session.includes(50) && c.session.includes(80) && !c.session.includes(100),
    'first eval fires 50 & 80, not 100'
  );

  // same window again, no new crossings -> fires nothing (no re-spam)
  c = fireWarnings(mkReport('slot-A', 85, 'wk-1', 10), cfg);
  ok(c.session.length === 0, 'same window, already-fired thresholds stay silent');

  // push to 100 in same window -> only 100 fires
  c = fireWarnings(mkReport('slot-A', 101, 'wk-1', 10), cfg);
  ok(c.session.length === 1 && c.session[0] === 100, 'crossing 100 fires exactly once');

  // WINDOW REFRESH: slot id changes, usage back to 5% -> nothing fires, and
  // the fired list is wiped so a future 50% will fire fresh
  c = fireWarnings(mkReport('slot-B', 5, 'wk-1', 10), cfg);
  ok(c.session.length === 0, 'refreshed slot at 5% fires no stale warning');
  const st = loadState();
  ok(
    st.session.id === 'slot-B' && st.session.fired.length === 0,
    'refreshed slot has clean fired list (stale-warning bug fixed)'
  );

  // now cross 50 in the NEW window -> fires again
  c = fireWarnings(mkReport('slot-B', 55, 'wk-1', 10), cfg);
  ok(c.session.includes(50), 'new window re-fires 50% independently');

  // weekly tracked independently of the session gauge
  c = fireWarnings(mkReport('slot-B', 55, 'wk-1', 60), cfg);
  ok(c.weeklyAll.includes(50) && c.session.length === 0, 'weekly fires on its own axis');
})();

// --------------------------------------- per-limit model matching + gauges
(() => {
  const { matchesModels, defaultLimits } = require('../src/limits');
  ok(matchesModels('claude-fable-5', '*'), 'wildcard matches any model');
  ok(matchesModels('claude-fable-5', ['claude-fable']), 'premium spec matches fable');
  ok(!matchesModels('claude-opus-4-8', ['claude-fable']), 'premium spec excludes opus');

  const limits = defaultLimits({ session5h: 57, weeklyAll: 500, weeklyPremium: 192 });
  ok(limits.length === 3, 'three default limits');
  const premium = limits.find((l) => l.id === 'weeklyPremium');
  ok(premium.models !== '*' && premium.window === 'weekly', 'premium limit is a weekly model-scoped gauge');
})();

// ---------------------------------------------------------------- results
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
