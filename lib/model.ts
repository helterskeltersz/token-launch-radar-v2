// Token launch radar: comparables model over the sealed DefiLlama snapshot.
//
// The model answers one question from the snapshot's own figures: if a
// protocol that records no token issued one today and the market priced it
// like the launched protocols in its category, what would it be worth?
//
//   implied FDV = TVL x category multiple x growth x maturity
//
// - category multiple: the median mcap/TVL of launched protocols in the
//   same category, shrunk toward the global prior 0.246 with k = 3
//   (n * median + 3 * 0.246) / (n + 3), clamped to [0.02, 3.0]. A thin
//   category borrows strength from the prior instead of trusting 1-2 names.
// - growth: 1 + change_7d / 100, clamped to [0.5, 2.0]; 1.0 when unreported.
// - maturity: 1 + 0.10 * min(age in years since listed_at, 3), so a protocol
//   that has run longer with no token yet earns up to 1.3x; 1.0 when unlisted.
//   The snapshot's as_of date is the reference day, so the factor is fixed.
//
// Comparables exclude anything that is not a clean launch peer: bridges,
// liquid staking / restaking, CEX, versioned names, whole-word
// wrapped/staked/staking names and exchange-prefixed names. The same
// exclusion picks the board: only protocols that record no token
// (gecko_id and symbol both null) and are not such a product. Live-token
// protocols are set aside, never ranked. "Records no token" is the
// snapshot's record, never a claim that a protocol has no token.
//
// Everything is deterministic: fixed sort keys, no dates from the clock,
// no network, no randomness. Two runs on the same snapshot bytes write
// the same bytes.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  multiple: number;
  growth_factor: number;
  maturity_factor: number;
  watchlist: boolean;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
}

export interface MultipleRow {
  category: string;
  comparables: number;
  median: number | null;
  multiple: number;
}

export interface Radar {
  meta: {
    as_of: string;
    floor_usd: number;
    protocols: number;
    watchlist: number;
    board_rows: number;
    early_rows: number;
    live_set_aside: number;
    comparables: number;
    global_prior: number;
    shrink_k: number;
    model: string;
  };
  multiples: MultipleRow[];
  rows: BoardRow[];
  live: LiveRow[];
}

export const GLOBAL_PRIOR = 0.246;
export const SHRINK_K = 3;
export const MULTIPLE_MIN = 0.02;
export const MULTIPLE_MAX = 3.0;

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_PREFIXES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** True when the protocol is a wrapped / staked / bridged product or a CEX. */
export function isExcludedProduct(p: Protocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (VERSION_SUFFIX.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  for (const prefix of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(prefix)) return true;
  }
  return false;
}

/** True when the snapshot records a token for the protocol. */
export function hasToken(p: Protocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Growth factor from the 7-day TVL change, clamped to [0.5, 2.0]. */
export function growthFactor(p: Protocol): number {
  if (p.change_7d === null) return 1;
  return clamp(1 + p.change_7d / 100, 0.5, 2.0);
}

/** Maturity factor from how long the protocol has run with no token yet. */
export function maturityFactor(p: Protocol, asOf: string): number {
  if (p.listed_at === null) return 1;
  const years = daysBetween(p.listed_at, asOf) / 365.25;
  return 1 + 0.1 * Math.min(years, 3);
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

// ---------------------------------------------------------------- farm plans

const CORE_ACTIONS: Record<string, [string, string]> = {
  Lending: [
    'Supply $25-$100 of stablecoins or blue-chip collateral to the lending market, keeping the loan-to-value under 60% so a dip cannot liquidate you.',
    'Borrow a small amount against that supply, swap it back through the market, and re-supply it once, so you touch both sides of the book.',
  ],
  Dexs: [
    'Swap $20-$50 through the pool on the main chain, then add the same pair as liquidity in a $20-$50 range you can monitor.',
    'Route a second swap a few days later through the same pool so your volume is spread across weeks, not done in one afternoon.',
  ],
  Yield: [
    'Deposit $25-$100 into the main yield vault on the first chain and leave it earning for at least two weeks before touching it.',
    'Harvest or compound the vault rewards once, then add a second $25 deposit so your position shows two separate entries.',
  ],
  'Yield Aggregator': [
    'Deposit $25-$100 into the auto-compounding vault on the first chain and let it run untouched for at least two weeks.',
    'Claim or compound the vault yield once, then top up with a second $25 deposit from a different asset.',
  ],
  'Risk Curators': [
    'Allocate $25-$100 to a curator vault on the first chain, choosing a vault whose strategy description you actually read first.',
    'Add a second $25 allocation to a different curator vault a week later, so your activity spans more than one vault.',
  ],
  'Onchain Capital Allocator': [
    'Allocate $25-$100 to an allocator vault on the first chain after reading its strategy and fee note end to end.',
    'Top up with a second $25 allocation a week later and leave both positions in place for at least a month.',
  ],
  RWA: [
    'Buy or mint $25-$100 of the tokenized asset on the first chain, starting with the smallest denomination the app allows.',
    'Hold the position for at least two weeks and claim any yield or distribution it pays, recording the payout date.',
  ],
  Derivatives: [
    'Open a small $10-$25 hedged position on the first chain with a stop in place, sized so a full loss stings but does not hurt.',
    'Close the position after a few days and open a second small one in the opposite direction to show two-way use.',
  ],
  'Basis Trading': [
    'Deposit $25-$100 into the basis strategy on the first chain and leave it through at least one funding cycle.',
    'Withdraw a small slice after two weeks, then re-deposit it, so the record shows an exit and a re-entry.',
  ],
  CDP: [
    'Lock $50 of collateral to mint the stable asset on the first chain, keeping the collateral ratio above 200% at all times.',
    'Repay a quarter of the minted amount after a week, then mint it again, to show the full borrow-and-repay loop.',
  ],
  'Collateral Markets': [
    'Supply $25-$100 of collateral to the market on the first chain, keeping the position well under the liquidation line.',
    'Borrow a small amount against it once, repay it within a week, and leave the supply earning afterwards.',
  ],
  Chain: [
    'Bridge $20-$50 to the chain and use its core apps for a real swap or deposit, paying the $1-$3 of gas the chain charges.',
    'Come back a week later, bridge a second $20, and use a different app on the chain so your footprint is not one transaction.',
  ],
  Payments: [
    'Route a real $10-$25 payment through the app on the first chain and keep the receipt and transaction hash.',
    'Send a second payment a week later to a different recipient, so the history shows repeat use rather than a single test.',
  ],
  Insurance: [
    'Buy $25 of cover on the first chain for a risk you actually hold, reading the payout conditions before you pay.',
    'Renew or extend the cover once before it lapses, and keep the policy receipt with its dates.',
  ],
  Restaking: [
    'Restake $25-$50 of liquid-staked assets through the app on the first chain, checking the operator list first.',
    'Delegate to a second operator a week later with another $25, so your stake is split across two operators.',
  ],
  'Staking Pool': [
    'Stake $25-$50 through the pool on the first chain and confirm the stake shows in your wallet within an hour.',
    'Add a second $25 stake a week later and leave both staked for at least a month.',
  ],
  'Stablecoin Wrapper': [
    'Wrap $25-$50 of stablecoins through the app on the first chain, confirming the wrapped balance arrives before you move on.',
    'Unwrap half after a week and wrap it again, so the record shows both directions of the wrapper.',
  ],
  'Governance Incentives': [
    'Lock or delegate $25 through the app to earn governance incentives, noting the lock length before you confirm.',
    'Vote on one live proposal with that position, then extend the lock once if the app allows it.',
  ],
};

const GENERIC_CORE: [string, string] = [
  'Use the main feature on the first chain with $25-$50, starting with the smallest amount the app allows, and confirm the position shows in your wallet.',
  'Use the same feature a second time a few days later with another $25, so your activity spans more than one day and one transaction.',
];

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** Seven concrete farm steps for one protocol, each 20-600 chars. */
export function farmSteps(p: Protocol): string[] {
  const chain = p.chains[0] ?? 'its main chain';
  const chains = p.chains.length > 1 ? `${p.chains[0]} and ${p.chains[1]}` : chain;
  const core = (p.category !== null && CORE_ACTIONS[p.category]) || GENERIC_CORE;
  const tvl = money(p.tvl_usd);
  const steps = [
    `Set up a fresh wallet just for ${p.name}, fund it on ${chain} with $5-$15 of gas money, and open the protocol's official app to check it records no token yet; never paste a seed phrase anywhere. (15 minutes, about $5 in gas)`,
    `${core[0]!.replace('the first chain', chain)} Your starting size is small on purpose: the position should be money you can afford to lose outright.`,
    `${core[1]!.replace('the first chain', chain)} Each transaction costs roughly $0.50-$3 in gas on ${chain}; do them on separate days.`,
    `Return once a week for 10-20 minutes: repeat the core action, rebalance if the position drifted, and keep a note of every transaction hash and date. A ${tvl} TVL protocol rewards steady use, not one burst.`,
    `Finish any points, quest or social task the app itself lists, one per visit, and skip any task that asks you to pay for a boost or buy a badge; paid boosts rarely pay back. (5-10 minutes each, free)`,
    `Watch the protocol's own announcements for a token or snapshot date, and keep your funds in place until a snapshot is confirmed; if none is announced within 6-12 months, reassess rather than adding more. (5 minutes a week)`,
    `If a token launches, claim only from the official claim page linked in the app, check any vesting or lockup before claiming, and take profit in tranches instead of selling everything at once; if nothing launches, withdraw your ${tvl}-scale position and redeploy it. (30 minutes on claim day)`,
  ];
  // Safety net: the gate refuses steps outside 20-600 chars.
  return steps.map((s) => {
    const t = s.trim();
    if (t.length >= 20 && t.length <= 600) return t;
    if (t.length > 600) return t.slice(0, 597).trimEnd().concat('...');
    return `${t} Keep the position small, record every transaction hash, and check the official app before each step.`;
  });
}

// ---------------------------------------------------------------- build

export function parseSnapshot(text: string): Snapshot {
  const data = JSON.parse(text) as Snapshot;
  if (!Array.isArray(data.protocols) || !Array.isArray(data.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return data;
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const watch = new Set(snapshot.watchlist);

  // Comparables: launched protocols that are clean launch peers.
  const comparables = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.tvl_usd > 0 && !isExcludedProduct(p),
  );
  const byCategory = new Map<string, number[]>();
  for (const p of comparables) {
    const key = p.category ?? 'Uncategorized';
    const list = byCategory.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(key, list);
  }
  const multipleFor = (category: string | null): { median: number | null; multiple: number } => {
    const key = category ?? 'Uncategorized';
    const ratios = byCategory.get(key) ?? [];
    const med = median(ratios);
    if (med === null) return { median: null, multiple: GLOBAL_PRIOR };
    const shrunk = (ratios.length * med + SHRINK_K * GLOBAL_PRIOR) / (ratios.length + SHRINK_K);
    return { median: round3(med), multiple: round3(clamp(shrunk, MULTIPLE_MIN, MULTIPLE_MAX)) };
  };

  const multiples: MultipleRow[] = [...byCategory.keys()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((category) => {
      const { median: med, multiple } = multipleFor(category);
      return { category, comparables: byCategory.get(category)!.length, median: med, multiple };
    });

  // Board: every pre-token protocol that is not an excluded product.
  const candidates = snapshot.protocols.filter((p) => !hasToken(p) && !isExcludedProduct(p));
  const scored = candidates.map((p) => {
    const { multiple } = multipleFor(p.category);
    const growth = growthFactor(p);
    const maturity = maturityFactor(p, snapshot.as_of);
    const age = p.listed_at === null ? null : daysBetween(p.listed_at, snapshot.as_of);
    const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growth * maturity));
    return { p, multiple, growth, maturity, age, implied };
  });

  // Rank by implied value, then TVL, then slug: fully deterministic.
  scored.sort((a, b) => {
    if (b.implied !== a.implied) return b.implied - a.implied;
    if (b.p.tvl_usd !== a.p.tvl_usd) return b.p.tvl_usd - a.p.tvl_usd;
    return a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0;
  });

  const board: BoardRow[] = scored.map((s, i) => ({
    slug: s.p.slug,
    name: s.p.name,
    rank: i + 1,
    implied_value_usd: s.implied,
    farm_steps: farmSteps(s.p),
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.age,
    multiple: s.multiple,
    growth_factor: round3(s.growth),
    maturity_factor: round3(s.maturity),
    watchlist: watch.has(s.p.slug),
  }));

  const live: LiveRow[] = snapshot.protocols
    .filter((p) => hasToken(p))
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd! }))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));

  const early = board.filter((r) => !r.watchlist).length;
  const radar: Radar = {
    meta: {
      as_of: snapshot.as_of,
      floor_usd: snapshot.floor_usd,
      protocols: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      board_rows: board.length,
      early_rows: early,
      live_set_aside: live.length,
      comparables: comparables.length,
      global_prior: GLOBAL_PRIOR,
      shrink_k: SHRINK_K,
      model: 'implied FDV = TVL x category multiple x growth x maturity; multiple = category median mcap/TVL shrunk to 0.246 (k=3), clamped 0.02-3.0',
    },
    multiples,
    rows: board,
    live,
  };
  return { board, radar };
}

/** The dashboard's data file: window.RADAR, one deterministic script. */
export function dataScript(radar: Radar): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}

/** The gate's shape, checked before anything is written. Null means valid. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, the gate wants 100-4000`;
  const seen = new Set<string>();
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  for (const row of board) {
    if (!slugs.has(row.slug)) return `board names ${row.slug}, not in the snapshot`;
    if (seen.has(row.slug)) return `board repeats ${row.slug}`;
    seen.add(row.slug);
    if (!Number.isInteger(row.rank) || row.rank < 1) return `row ${row.slug} has a bad rank`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1) {
      return `row ${row.slug} has a bad implied value`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${row.farm_steps.length} farm steps`;
    }
    for (const step of row.farm_steps) {
      const n = step.trim().length;
      if (n < 20 || n > 600) return `row ${row.slug} has a farm step of ${n} chars`;
    }
  }
  for (let i = 0; i < board.length; i++) {
    if (board[i]!.rank !== i + 1) return `ranks are not exactly 1..${board.length}`;
    if (i > 0 && board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `implied value rises from rank ${i} to rank ${i + 1}`;
    }
  }
  if (board.every((r) => r.implied_value_usd === board[0]!.implied_value_usd)) {
    return 'every implied value is the same';
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  return null;
}
