#!/usr/bin/env node
'use strict';

const [, , cmd, ...args] = process.argv;

const HELP = `splitclaude — per-machine Claude Code spend gauge for shared accounts

Usage:
  splitclaude init [--n 2 --weekly 500 --weekly-fable 192 --five-hour 57
                    --reset "mon 09:30" --notify|--no-notify]
  splitclaude status                     detailed report (all gauges, per-model)
  splitclaude statusline                 one-line ANSI gauges for Claude Code
  splitclaude calibrate <id> [--pct N]   set a budget from /usage % (or × n)
  splitclaude help

Gauges (one per account limit, matching /usage):
  5h      fixed 5h grid slot, anchored to the weekly reset
  wk      weekly, all models
  fable   weekly, premium models only (Fable/Mythos)

Calibrate ids: session | weeklyAll | weeklyPremium

Budgets are USD-equivalents of the FULL account limit; each machine is
allowed budget/n. Warnings fire once per window at 50/80/100% and clear
automatically when a window refreshes.`;

async function main() {
  switch (cmd) {
    case 'init':
      await require('../src/commands/init').run(args);
      break;
    case 'status':
      require('../src/commands/status').run(args);
      break;
    case 'statusline':
      require('../src/commands/statusline').run(args);
      break;
    case 'calibrate':
      require('../src/commands/calibrate').run(args);
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      console.log(HELP);
      break;
    default:
      console.error(`splitclaude: unknown command "${cmd}"\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`splitclaude: ${err.message}`);
  process.exitCode = 1;
});
