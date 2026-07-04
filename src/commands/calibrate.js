'use strict';

const { loadConfig, saveConfig } = require('../config');
const { buildReport } = require('../report');

const IDS = ['session', 'weeklyAll', 'weeklyPremium'];

function getFlag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function usage() {
  console.error('usage: splitclaude calibrate <session|weeklyAll|weeklyPremium> [--pct N]');
  console.error('  --pct N   set budget from the account % shown in /usage (recommended)');
  console.error('  (no flag) set budget from current spend × n, for use at the moment the cap hits');
}

// Turn observed spend into a full-account budget estimate. Two methods:
//
//   --pct N   You read "N% used" for this limit off /usage. Since this
//             machine's spend equals the account spend when only this machine
//             is active, budget = spend / (N/100). Most accurate.
//
//   (default) Run this the instant the account actually blocks you (100%).
//             This machine's spend is then its whole share, so the account
//             budget is spend × n. Assumes the other machines were idle in
//             this window; recalibrate on a solo day if not.
function run(args) {
  const cfg = loadConfig();
  if (!cfg) {
    console.error('splitclaude: not configured — run `splitclaude init`');
    process.exitCode = 1;
    return;
  }

  const id = args.find((a) => IDS.includes(a));
  if (!id) {
    usage();
    process.exitCode = 1;
    return;
  }

  const gauge = buildReport(cfg).gauges.find((g) => g.id === id);
  const limit = cfg.limits.find((l) => l.id === id);
  if (!gauge || !limit) {
    console.error(`splitclaude: no such limit "${id}"`);
    process.exitCode = 1;
    return;
  }
  if (gauge.spend <= 0) {
    console.error(`splitclaude: current spend for "${id}" is $0 — nothing to calibrate from`);
    process.exitCode = 1;
    return;
  }

  const pctRaw = getFlag(args, '--pct');
  let budget;
  let how;
  if (pctRaw !== undefined) {
    const pct = Number(pctRaw);
    if (!(pct > 0) || pct > 100) {
      console.error(`splitclaude: invalid --pct "${pctRaw}" (expected 1..100)`);
      process.exitCode = 1;
      return;
    }
    budget = gauge.spend / (pct / 100);
    how = `spend $${gauge.spend.toFixed(2)} ÷ ${pct}% from /usage`;
  } else {
    budget = gauge.spend * cfg.split;
    how = `spend $${gauge.spend.toFixed(2)} × n=${cfg.split} (cap-hit assumption)`;
  }

  limit.budget = budget;
  saveConfig(cfg);

  console.log(
    `Set "${id}" account budget to $${budget.toFixed(2)} (${how}). ` +
      `Your share: $${(budget / cfg.split).toFixed(2)}.`
  );
}

module.exports = { run };
