'use strict';

const { loadConfig } = require('../config');
const { buildReport, fireWarnings } = require('../report');
const { RESET, DIM, colorFor, bar, money, duration } = require('../format');

const LABEL_WIDTH = 30;

// One gauge as a full-width report row plus its per-model cost breakdown.
function gaugeBlock(gauge, now) {
  if (gauge.resetsAt == null) {
    return `  ${gauge.label.padEnd(LABEL_WIDTH)} ${DIM}window fresh — no active session${RESET}`;
  }
  const color = colorFor(gauge.pct);
  const pct = gauge.pct.toFixed(1).padStart(5);
  const reset = `resets in ${duration(gauge.resetsAt - now)}`;
  const head =
    `  ${gauge.label.padEnd(LABEL_WIDTH)} ${color}${bar(gauge.pct, 20)} ${pct}%${RESET}  ` +
    `${money(gauge.spend)} / ${money(gauge.share)}  ${DIM}${reset}${RESET}`;

  const models = gauge.models
    .map(([model, cost]) => `    ${DIM}${model.padEnd(LABEL_WIDTH)} ${money(cost)}${RESET}`)
    .join('\n');

  return models ? `${head}\n${models}` : head;
}

function run() {
  const cfg = loadConfig();
  if (!cfg) {
    console.error('splitclaude: not configured — run `splitclaude init`');
    process.exitCode = 1;
    return;
  }

  const report = buildReport(cfg);
  fireWarnings(report, cfg);

  console.log(`SplitClaude — this machine's 1/${report.split} share\n`);
  for (const gauge of report.gauges) {
    console.log(gaugeBlock(gauge, report.now));
    console.log('');
  }
  console.log(
    `${DIM}Budgets are full-account estimates ÷ ${report.split}. ` +
      `Costs are USD-equivalents from local Claude Code logs on this machine only.${RESET}`
  );
}

module.exports = { run };
