'use strict';

const { spawnSync } = require('child_process');
const { collectEntries } = require('./collector');
const {
  activeSessionWindow,
  lastWeeklyReset,
  nextWeeklyReset,
  FIVE_HOURS_MS,
} = require('./windows');
const { matchesModels } = require('./limits');
const { loadState, saveState } = require('./config');

// Thresholds (percent of this machine's share) that trigger a warning.
const THRESHOLDS = [50, 80, 100];

// Extra look-back beyond the current 5h span, so the activity-anchored session
// window can still find its true start right after a weekly reset (when the
// weekly window itself begins only moments ago).
const SESSION_LOOKBACK_MS = FIVE_HOURS_MS + 60 * 60 * 1000; // 6h

function sumCost(entries) {
  let total = 0;
  for (const e of entries) total += e.cost;
  return total;
}

// Cost per model within a set of entries, largest first — for the breakdown
// shown in the detailed `status` report.
function costByModel(entries) {
  const byModel = new Map();
  for (const e of entries) {
    byModel.set(e.model, (byModel.get(e.model) || 0) + e.cost);
  }
  return Array.from(byModel.entries()).sort((a, b) => b[1] - a[1]);
}

// Resolve a limit's active window to { start, end, id }, or null when there is
// no active window (a session that has aged out). The id changes exactly when
// the window refreshes, which is what lets the warning state machine clear
// itself on reset. Session windows are activity-anchored (reconstructed from
// the logs); weekly windows use the exact configured anchor.
function resolveWindow(limit, sessionWin, weekStart, weekEnd) {
  if (limit.window === 'session') return sessionWin;
  return { start: weekStart, end: weekEnd, id: new Date(weekStart).toISOString() };
}

// Compute every gauge in one pass. The log scan starts at the earlier of the
// weekly reset and the session look-back, so both the weekly gauges and the
// activity-anchored 5h gauge see all the entries they need.
function buildReport(cfg, now = Date.now()) {
  const split = cfg.split;
  const weekStart = lastWeeklyReset(cfg.weeklyReset, now);
  const weekEnd = nextWeeklyReset(cfg.weeklyReset, now);

  const sinceMs = Math.min(weekStart, now - SESSION_LOOKBACK_MS);
  const entries = collectEntries(sinceMs);
  const sessionWin = activeSessionWindow(entries, now);

  const gauges = cfg.limits.map((limit) => {
    const win = resolveWindow(limit, sessionWin, weekStart, weekEnd);
    const share = limit.budget / split; // this machine's slice of the limit

    // No active window (session aged out): gauge is idle at 0%.
    if (!win) {
      return {
        id: limit.id, short: limit.short, label: limit.label,
        windowId: null, spend: 0, share, pct: 0, resetsAt: null, models: [],
      };
    }

    const inWindow = entries.filter(
      (e) => e.ts >= win.start && e.ts < win.end && matchesModels(e.model, limit.models)
    );
    const spend = sumCost(inWindow);

    return {
      id: limit.id,
      short: limit.short,
      label: limit.label,
      windowId: win.id,
      spend,
      share,
      pct: share > 0 ? (spend / share) * 100 : 0,
      resetsAt: win.end,
      models: costByModel(inWindow),
    };
  });

  return { now, split, gauges };
}

function sendDesktopNotification(title, body) {
  try {
    // Best-effort: absence of notify-send must not break the statusline.
    spawnSync('notify-send', ['-u', 'critical', title, body], { timeout: 3000 });
  } catch {
    /* notify-send unavailable — the statusline gauge still conveys the warning */
  }
}

// Advance the warning state machine and return, per gauge id, the thresholds
// newly crossed on this invocation. State is persisted only when it changes.
//
// The window id guards against two failure modes:
//   - re-spam: a threshold already in `fired` never fires again this window
//   - stale warnings: when the window refreshes the id changes, `fired` is
//     reset, and the gauge starts clean at 0% with no leftover warning
function fireWarnings(report, cfg) {
  const state = loadState();
  const crossed = {};
  let dirty = false;

  for (const gauge of report.gauges) {
    crossed[gauge.id] = [];
    let entry = state[gauge.id];

    if (!entry || entry.id !== gauge.windowId) {
      entry = { id: gauge.windowId, fired: [] };
      state[gauge.id] = entry;
      dirty = true;
    }

    for (const threshold of THRESHOLDS) {
      if (gauge.pct >= threshold && !entry.fired.includes(threshold)) {
        entry.fired.push(threshold);
        crossed[gauge.id].push(threshold);
        dirty = true;
      }
    }
  }

  if (dirty) saveState(state);

  if (cfg.notify) {
    for (const gauge of report.gauges) {
      for (const threshold of crossed[gauge.id]) {
        sendDesktopNotification(
          `SplitClaude: ${threshold}% of your 1/${report.split} share`,
          `${gauge.label}: $${gauge.spend.toFixed(2)} of $${gauge.share.toFixed(2)} used`
        );
      }
    }
  }

  return crossed;
}

module.exports = { buildReport, fireWarnings, THRESHOLDS };
