'use strict';

// USD per 1M tokens. Matched by longest model-id prefix so date-suffixed
// ids ("claude-haiku-4-5-20251001") resolve without an exact entry.
// Cache multipliers follow Anthropic's published pricing model:
// read ~0.1x input, 5m-TTL write 1.25x, 1h-TTL write 2x.
const PRICE_TABLE = [
  ['claude-fable-5', { in: 10, out: 50 }],
  ['claude-mythos-5', { in: 10, out: 50 }],
  ['claude-opus-4', { in: 5, out: 25 }],
  ['claude-sonnet', { in: 3, out: 15 }],
  ['claude-haiku', { in: 1, out: 5 }],
];

// Unknown model: assume top-tier price so the gauge errs toward warning
// earlier rather than later.
const DEFAULT_PRICE = { in: 10, out: 50 };

const warnedModels = new Set();

function priceFor(modelId) {
  for (const [prefix, price] of PRICE_TABLE) {
    if (modelId.startsWith(prefix)) return price;
  }
  if (!warnedModels.has(modelId)) {
    warnedModels.add(modelId);
    process.stderr.write(`splitclaude: unknown model "${modelId}", using top-tier pricing\n`);
  }
  return DEFAULT_PRICE;
}

// usage: the `message.usage` object from a Claude Code JSONL entry.
// Returns USD-equivalent cost for that single API response.
function entryCost(modelId, usage) {
  const p = priceFor(modelId);
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;

  let cacheWriteCost;
  const breakdown = usage.cache_creation;
  if (breakdown && typeof breakdown === 'object') {
    const c5m = breakdown.ephemeral_5m_input_tokens || 0;
    const c1h = breakdown.ephemeral_1h_input_tokens || 0;
    cacheWriteCost = c5m * p.in * 1.25 + c1h * p.in * 2;
  } else {
    cacheWriteCost = (usage.cache_creation_input_tokens || 0) * p.in * 1.25;
  }

  return (
    (input * p.in + output * p.out + cacheRead * p.in * 0.1 + cacheWriteCost) / 1e6
  );
}

module.exports = { entryCost, priceFor };
