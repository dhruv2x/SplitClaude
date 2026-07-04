'use strict';

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Anthropic's 5h session window is activity-anchored: it opens at your first
// message and lasts 5 hours, then the next message after it closes opens a
// fresh window. We reconstruct that window from this machine's own logs by
// grouping entries into rolling 5h blocks and returning the one that contains
// `now`. Returns null once the last block has expired — the session has
// refreshed, so the gauge reads 0% with no leftover warning.
//
// `entries` must be sorted ascending by timestamp (collector guarantees this).
// The window start is the exact first-message time (not hour-floored), so
// start + 5h lines up with the reset time Claude Code's /usage reports.
function activeSessionWindow(entries, now) {
  let block = null;
  for (const e of entries) {
    if (!block || e.ts >= block.end) {
      block = { start: e.ts, end: e.ts + FIVE_HOURS_MS };
    }
  }
  if (block && now >= block.start && now < block.end) {
    return { start: block.start, end: block.end, id: new Date(block.start).toISOString() };
  }
  return null;
}

const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

// "thu 04:30" -> {dow: 4, hh: 4, mm: 30} (local time)
function parseWeeklyReset(text) {
  const m = /^(sun|mon|tue|wed|thu|fri|sat)\w*\s+(\d{1,2}):(\d{2})$/i.exec(
    String(text).trim()
  );
  if (!m) return null;
  const hh = Number(m[2]);
  const mm = Number(m[3]);
  if (hh > 23 || mm > 59) return null;
  return { dow: DOW[m[1].toLowerCase().slice(0, 3)], hh, mm };
}

// Most recent past occurrence of the weekly reset anchor (local time).
function lastWeeklyReset(anchor, now) {
  const d = new Date(now);
  d.setHours(anchor.hh, anchor.mm, 0, 0);
  const dayDiff = (d.getDay() - anchor.dow + 7) % 7;
  d.setDate(d.getDate() - dayDiff);
  let t = d.getTime();
  if (t > now) t -= WEEK_MS;
  return t;
}

function nextWeeklyReset(anchor, now) {
  return lastWeeklyReset(anchor, now) + WEEK_MS;
}

module.exports = {
  FIVE_HOURS_MS,
  WEEK_MS,
  activeSessionWindow,
  parseWeeklyReset,
  lastWeeklyReset,
  nextWeeklyReset,
};
