'use strict';

// A "limit" mirrors one of the quota bars Anthropic enforces on the account.
// The account has several simultaneous limits — a rolling 5-hour session cap,
// a weekly all-models cap, and a stricter weekly cap on premium models — and
// SplitClaude renders one gauge per limit so the statusline lines up with what
// `/usage` reports. Each machine is allowed `budget / split` of every limit.
//
// A limit is a plain descriptor:
//   id      stable key, used for warning state (never shown to the user)
//   short   compact label for the statusline (e.g. "wk")
//   label   full label for the detailed `status` report
//   window  'session' (fixed 5h grid slot) | 'weekly' (the weekly window)
//   budget  full-account budget for this limit, in USD-equivalent
//   models  '*' for all models, or an array of model-id prefixes to include

// Model families that count against Anthropic's stricter weekly premium cap.
// Prefix-matched, so date-suffixed ids resolve without an exact entry.
const PREMIUM_MODEL_PREFIXES = ['claude-fable', 'claude-mythos'];

// True when `modelId` is covered by a limit's `models` spec.
function matchesModels(modelId, spec) {
  if (spec === '*') return true;
  return spec.some((prefix) => modelId.startsWith(prefix));
}

// Build the standard three-limit set from a budgets object. Kept in one place
// so `init`, config migration, and defaults can't drift apart.
function defaultLimits({ session5h, weeklyAll, weeklyPremium }) {
  return [
    {
      id: 'session',
      short: '5h',
      label: '5h session (all models)',
      window: 'session',
      budget: session5h,
      models: '*',
    },
    {
      id: 'weeklyAll',
      short: 'wk',
      label: 'weekly (all models)',
      window: 'weekly',
      budget: weeklyAll,
      models: '*',
    },
    {
      id: 'weeklyPremium',
      short: 'fable',
      label: 'weekly (premium: Fable/Mythos)',
      window: 'weekly',
      budget: weeklyPremium,
      models: PREMIUM_MODEL_PREFIXES,
    },
  ];
}

module.exports = { PREMIUM_MODEL_PREFIXES, matchesModels, defaultLimits };
