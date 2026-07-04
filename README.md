# SplitClaude

Per-machine spend gauge for a Claude account shared across **n** machines.

One Claude account on two computers shares one usage limit, but neither
machine can see the account-wide remainder — that lives on Anthropic's
servers. What each machine *can* see is its own Claude Code session logs
(`~/.claude/projects/**/*.jsonl`), which record every API response's model and
token usage. SplitClaude reads those logs and answers one question:

> **Has this machine spent more than its 1/n share of the account's budget?**

It shows one gauge per account limit in your Claude Code statusline — mirroring
the bars on Claude Code's `/usage` screen — and warns at 50 / 80 / 100% of
*your share*:

```
5h ██░░░ 39% ↻1h03m │ wk ██░░░ 33% ↻1d20h │ fable ██░░░ 47% ↻1d20h │ 1/2 share
```

## Install

```sh
cd SplitClaude
npm link          # puts `splitclaude` on your PATH
splitclaude init
```

Then add to `~/.claude/settings.json`:

```json
"statusLine": {
  "type": "command",
  "command": "splitclaude statusline"
}
```

Repeat on each machine (same `--n`, same budgets).

## Commands

| Command | What it does |
|---|---|
| `splitclaude init` | Interactive setup: n, three budgets, weekly reset anchor, notifications. Non-interactive flags: `--n 2 --weekly 527 --weekly-fable 192 --five-hour 57 --reset "mon 09:30" --no-notify` |
| `splitclaude status` | Detailed report: every gauge, spend vs share, per-model cost breakdown |
| `splitclaude statusline` | One-line ANSI gauges (what Claude Code renders) |
| `splitclaude calibrate <id> [--pct N]` | Set one budget. `--pct N` uses the account % from `/usage` (recommended); without it, uses current spend × n (run at a cap-hit). ids: `session`, `weeklyAll`, `weeklyPremium` |

## How it works

**Cost, not tokens.** Machines may run different models (Opus on the desktop,
Fable on the laptop), and raw token counts aren't comparable across models.
Every log entry carries its own `message.model`, so each entry is converted to
a USD-equivalent at that model's price (including cache-read/write
multipliers). Budgets and gauges live in USD-equivalent.

**One gauge per account limit — matching `/usage`.** Anthropic enforces several
quota bars at once, so SplitClaude renders one gauge for each:

| Gauge | Window | Models counted |
|---|---|---|
| `5h` | fixed 5h grid slot | all |
| `wk` | weekly | all |
| `fable` | weekly | premium only (Fable / Mythos) |

The premium gauge exists because Anthropic caps premium-model usage separately
and more tightly than overall usage — the same reason `/usage` shows both a
"week (all models)" and a "week (Fable)" bar. Limits are defined in
`src/limits.js`; adding a new cap (e.g. a per-model-family budget) is one entry.

**Both window types run on one shared clock, split by n:**

- **Weekly window** — anchored to a fixed weekly reset you configure from the
  "resets …" text on Claude Code's `/usage` screen (e.g. `mon 09:30`, local
  time). Crossing the anchor zeroes the gauges.
- **5h slots** — a fixed grid ticking from the weekly anchor (Mon 09:30 →
  09:30–14:30, 14:30–19:30, …; the final short slot of the week is clipped at
  the next weekly reset). At each slot boundary the 5h gauge reads 0 again.

Because both windows derive purely from the configured anchor, **every machine
with the same config computes identical boundaries and refreshes its counter at
the same instant** — no cross-machine sync, no drift, and no stale warning
surviving a quota refresh.

*Approximation note:* Anthropic's real 5h window is activity-anchored (it
starts at the account's first message after idle), which no single machine can
observe locally. The fixed grid trades that unobservable start for determinism;
any mismatch is bounded within one slot. The **weekly** gauges are the ones
that bite on Max plans, and those anchors are exact.

**Warning state machine.** Fired thresholds are stored per gauge, keyed by
*window id* (`~/.config/splitclaude/state.json`). A new 5h slot or a
weekly-anchor crossing changes the id, which wipes that gauge's fired list — so
each threshold fires exactly once per window, and a refreshed quota can never
show a leftover warning. With `notify: true`, crossings also fire a desktop
notification via `notify-send`.

## Calibration

Anthropic doesn't publish limits as dollar figures, so budgets are estimates.
Two ways to set them accurately:

**From `/usage` percentages (recommended, no cap-hit needed).** Type `/usage`
in Claude Code, read the percentage for a limit, and let the tool back out the
budget from your current spend:

```sh
splitclaude calibrate weeklyAll     --pct 16     # /usage: week (all) = 16%
splitclaude calibrate weeklyPremium --pct 23     # /usage: week (Fable) = 23%
```

Because `budget = spend ÷ (pct/100)` and, on a solo machine, your spend equals
the account's spend, this is exact up to the percentage's rounding.

**At a cap-hit (fallback).** Work until the account actually blocks you, then:

```sh
splitclaude calibrate weeklyAll                  # budget = spend × n
```

Either way: if the *other* machine was also burning quota in that window, the
estimate is low — calibrate on a day only this machine is active.

## Honest limitations

- **Local-only by design.** Each machine caps itself at budget/n. If the other
  machine is idle all week, your gauge still stops you at your share — that's
  the intended behavior, not a bug.
- **Cost-equivalent is a proxy.** Anthropic's real rate-limit accounting isn't
  published token-for-token; cache reads especially may be weighted
  differently. Calibration absorbs most of the error.
- **Log retention.** Claude Code prunes logs after `cleanupPeriodDays`
  (default ~30 days) — plenty for 5h/weekly windows, but don't build monthly
  stats on this.
- Pricing table lives in `src/pricing.js`; unknown models fall back to
  top-tier pricing (gauge errs toward warning early).
