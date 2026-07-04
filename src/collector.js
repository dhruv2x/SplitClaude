'use strict';

const fs = require('fs');
const path = require('path');
const { projectsDir } = require('./paths');
const { entryCost } = require('./pricing');

function listJsonlFiles(dir, depth = 3, out = []) {
  let items;
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const it of items) {
    const full = path.join(dir, it.name);
    if (it.isDirectory() && depth > 0) {
      listJsonlFiles(full, depth - 1, out);
    } else if (it.isFile() && it.name.endsWith('.jsonl')) {
      out.push(full);
    }
  }
  return out;
}

// Collect billable assistant entries with timestamp >= sinceMs across all
// Claude Code session logs on this machine.
//
// Dedupe: the same message.id + requestId pair can be written more than once
// (streamed responses, resumed/branched sessions). Later lines carry the more
// complete usage object, so last-write-wins via a Map.
function collectEntries(sinceMs) {
  const files = listJsonlFiles(projectsDir());
  const byKey = new Map();
  let anon = 0;

  for (const file of files) {
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      continue;
    }
    // File not written since window start => every entry in it predates the
    // window. Skip without reading.
    if (st.mtimeMs < sinceMs) continue;

    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    for (const line of text.split('\n')) {
      if (!line.includes('"usage"')) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (obj.type !== 'assistant') continue;
      const msg = obj.message;
      if (!msg || !msg.usage) continue;
      const model = msg.model;
      if (!model || model === '<synthetic>') continue;
      const ts = Date.parse(obj.timestamp);
      if (!Number.isFinite(ts) || ts < sinceMs) continue;

      const key =
        msg.id || obj.requestId
          ? `${msg.id || ''}:${obj.requestId || ''}`
          : `anon:${anon++}`;

      byKey.set(key, {
        ts,
        model,
        cost: entryCost(model, msg.usage),
        usage: msg.usage,
      });
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.ts - b.ts);
}

module.exports = { collectEntries };
