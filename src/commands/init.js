'use strict';

const readline = require('readline');
const { loadConfig, saveConfig } = require('../config');
const { parseWeeklyReset } = require('../windows');
const { defaultLimits } = require('../limits');

function ask(rl, question, fallback) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim() || fallback));
  });
}

function getFlag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

// Read the current budget for a limit id out of an existing config, so
// re-running `init` can offer sensible defaults.
function existingBudget(cfg, id, fallback) {
  const limit = cfg && cfg.limits && cfg.limits.find((l) => l.id === id);
  return limit ? limit.budget : fallback;
}

async function run(args) {
  const prev = loadConfig() || {};

  let split = getFlag(args, '--n');
  let weeklyAll = getFlag(args, '--weekly');
  let weeklyFable = getFlag(args, '--weekly-fable');
  let session5h = getFlag(args, '--five-hour');
  let reset = getFlag(args, '--reset');
  let notify = args.includes('--notify')
    ? true
    : args.includes('--no-notify')
      ? false
      : undefined;

  const needsPrompt =
    split === undefined ||
    weeklyAll === undefined ||
    weeklyFable === undefined ||
    session5h === undefined ||
    reset === undefined;

  if (needsPrompt) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('SplitClaude setup — budgets are FULL-account estimates; the tool divides by n.');
    console.log('Read the account-wide numbers off `/usage` in Claude Code (see README calibration).\n');

    const dSplit = String(prev.split ?? 2);
    const dAll = String(existingBudget(prev, 'weeklyAll', 500));
    const dFable = String(existingBudget(prev, 'weeklyPremium', 192));
    const d5h = String(existingBudget(prev, 'session', 57));
    const dReset = prev.weeklyResetText ?? 'mon 09:30';

    split = split ?? (await ask(rl, `Machines sharing this account (n) [${dSplit}]: `, dSplit));
    weeklyAll = weeklyAll ?? (await ask(rl, `Weekly ALL-models account budget, USD-equiv [${dAll}]: `, dAll));
    weeklyFable = weeklyFable ?? (await ask(rl, `Weekly PREMIUM (Fable/Mythos) account budget, USD-equiv [${dFable}]: `, dFable));
    session5h = session5h ?? (await ask(rl, `5-hour-window account budget, USD-equiv [${d5h}]: `, d5h));
    reset = reset ?? (await ask(rl, `Weekly reset anchor, e.g. "mon 09:30" (from /usage) [${dReset}]: `, dReset));
    if (notify === undefined) {
      const a = await ask(rl, `Desktop notifications at 50/80/100%? (y/n) [${prev.notify === false ? 'n' : 'y'}]: `, prev.notify === false ? 'n' : 'y');
      notify = a.toLowerCase().startsWith('y');
    }
    rl.close();
  }

  const n = Number(split);
  const budgets = {
    session5h: Number(session5h),
    weeklyAll: Number(weeklyAll),
    weeklyPremium: Number(weeklyFable),
  };
  const weeklyReset = parseWeeklyReset(reset);

  const errors = [];
  if (!Number.isInteger(n) || n < 1) errors.push(`invalid --n "${split}" (positive integer)`);
  if (!(budgets.weeklyAll > 0)) errors.push(`invalid --weekly "${weeklyAll}" (positive number)`);
  if (!(budgets.weeklyPremium > 0)) errors.push(`invalid --weekly-fable "${weeklyFable}" (positive number)`);
  if (!(budgets.session5h > 0)) errors.push(`invalid --five-hour "${session5h}" (positive number)`);
  if (!weeklyReset) errors.push(`invalid --reset "${reset}" (expected e.g. "mon 09:30")`);
  if (errors.length) {
    for (const e of errors) console.error(`splitclaude: ${e}`);
    process.exitCode = 1;
    return;
  }

  saveConfig({
    split: n,
    weeklyReset,
    weeklyResetText: String(reset).trim(),
    notify: notify !== false,
    limits: defaultLimits(budgets),
  });

  console.log(`\nSaved. This machine's share (1/${n}):`);
  console.log(`  5h window        $${(budgets.session5h / n).toFixed(2)}`);
  console.log(`  weekly all       $${(budgets.weeklyAll / n).toFixed(2)}`);
  console.log(`  weekly premium   $${(budgets.weeklyPremium / n).toFixed(2)}`);
  console.log('\nAdd to ~/.claude/settings.json to show the gauges in Claude Code:\n');
  console.log('  "statusLine": {');
  console.log('    "type": "command",');
  console.log('    "command": "splitclaude statusline"');
  console.log('  }');
  console.log('\nUnsure about a budget? Read its % off `/usage`, then run:');
  console.log('  splitclaude calibrate <session|weeklyAll|weeklyPremium> --pct <N>');
}

module.exports = { run };
