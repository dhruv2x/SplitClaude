# SplitClaude

Keep a shared Claude account fair across multiple machines.

When one Claude account is used across multiple computers, everyone shares the same usage limits—but Claude only shows the total account usage, not how much each machine has contributed.

SplitClaude reads your local Claude Code logs and answers one simple question:

> **Have I used more than my share?**

It adds lightweight usage gauges to your Claude Code status line, showing how close **this machine** is to its share of the account.

```
5h ███░░ 61% ↻2h14m │ wk ██░░░ 43% ↻4d7h │ fable ██░░░ 47% ↻4d7h │ 1/2 share
```

You'll get warnings at **50%, 80%, and 100%** of your share, so you know when it's time to let someone else take over.

## Install

```sh
npm install -g splitclaude
splitclaude init
```

Add it to your Claude Code status line (`~/.claude/settings.json`):

```json
"statusLine": {
  "type": "command",
  "command": "splitclaude statusline"
}
```

Run the same setup on every machine that shares the account.

### Already have a status line?

Claude Code allows only one `statusLine` command, so chain both through a
wrapper. Save this as `~/.claude/statusline.sh`:

```sh
#!/usr/bin/env bash
# Claude Code passes session JSON on stdin; feed it to both commands.
input="$(cat)"
left="$(printf '%s' "$input" | your-existing-statusline-command)"
right="$(printf '%s' "$input" | splitclaude statusline)"
printf '%s  ·  %s' "$left" "$right"
```

Make it executable and point Claude Code at it:

```sh
chmod +x ~/.claude/statusline.sh
```

```json
"statusLine": {
  "type": "command",
  "command": "bash ~/.claude/statusline.sh"
}
```

Replace `your-existing-statusline-command` with whatever your `statusLine` ran
before.

## What it tracks

SplitClaude mirrors the limits shown in Claude Code's `/usage`:

| Gauge | Tracks |
| ------ | ------ |
| `5h` | Current 5-hour session |
| `wk` | Weekly usage |
| `fable` | Weekly usage for premium models |

## Calibration

Claude doesn't publish its actual limits, so SplitClaude estimates them.

The easiest way to improve accuracy is to calibrate while using the account from a single machine:

```sh
splitclaude calibrate session       --pct 77
splitclaude calibrate weeklyAll     --pct 22
splitclaude calibrate weeklyPremium --pct 23
```

You can recalibrate anytime to keep the estimates accurate.

## Commands

| Command | Description |
| ------- | ----------- |
| `splitclaude init` | Configure your share and budgets |
| `splitclaude status` | Detailed usage report |
| `splitclaude statusline` | One-line status output |
| `splitclaude calibrate` | Improve usage estimates |
| `splitclaude help` | Show help |

## How it works

- Reads your local Claude Code logs.
- Estimates usage based on model pricing rather than tokens.
- Works completely offline—no accounts, servers, or syncing.
- Each machine keeps itself within its own share.

## Requirements

- Node.js 18+
- Claude Code
- `notify-send` (optional, for desktop notifications)

## License

MIT