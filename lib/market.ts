// Motore dati di Market Cube: solo API pubbliche gratuite, nessuna chiave, nessun dato inventato.
// Se una fonte non risponde la metrica resta "non disponibile" (mai sostituita da valori casuali).

export type MetricId = 'btc' | 'eth' | 'fng' | 'trend' | 'breadth' | 'funding';

export interface Metric {
  id: MetricId;
  label: string;
  /** 0 (panico) .. 100 (euforia); null = dato non disponibile */
  score: number | null;
  value: string;
  detail: string;
  /** true se il dato arriva dall'ultimo aggiornamento riuscito, non da quello corrente */
  stale?: boolean;
}

export interface Snapshot {
  /** null se i dati disponibili sono troppo pochi per un giudizio sensato */
  sentiment: number | null;
  regime: string;
  volatility: {
    /** volatilità realizzata 24h annualizzata, in % */
    annualizedPct: number | null;
    /** rapporto rispetto a una volatilità "normale" del 50% (1 = normale) */
    index: number | null;
    stale?: boolean;
  };
  dominance: number | null;
  coverage: { available: number; total: number };
  metrics: Metric[];
  sources: Record<string, boolean>;
  fetchedAt: number;
  /** true se TUTTE le fonti sono fallite e si sta mostrando l'ultimo snapshot valido */
  stale: boolean;
}

export type Fetcher = typeof fetch;

export const METRIC_ORDER: MetricId[] = ['btc', 'eth', 'fng', 'trend', 'breadth', 'funding'];

const WEIGHTS: Record<MetricId, number> = {
  fng: 0.2,
  btc: 0.2,
  trend: 0.2,
  breadth: 0.15,
  funding: 0.15,
  eth: 0.1,
};

const MIN_METRICS = 3;
const BASELINE_VOL_PCT = 50;
const CARRY_OVER_MS = 15 * 60 * 1000;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const fmtPct = (n: number, d = 1) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`;
const fmtUsd = (n: number) =>
  `$${n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

async function getJson(url: string, f: Fetcher, timeoutMs = 8000): Promise<any> {
  const res = await f(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${new URL(url).hostname}`);
  return res.json();
}

/** Prova le fonti in ordine e restituisce la prima che funziona. */
async function firstOf<T>(attempts: Array<() => Promise<T>>): Promise<T> {
  let lastErr: unknown;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('nessuna fonte disponibile');
}

// ---------------------------------------------------------------- fonti

const STABLE_OR_WRAPPED = new Set([
  'usdt', 'usdc', 'dai', 'usde', 'fdusd', 'tusd', 'usds', 'usdd', 'pyusd', 'busd', 'usd1', 'usdg', 'rlusd',
  'steth', 'wsteth', 'weth', 'weeth', 'wbtc', 'cbbtc', 'wbeth', 'reth', 'usdt0', 'susde', 'bsc-usd', 'syrupusdc',
]);

interface MarketsData {
  btc?: { change: number; price: number };
  eth?: { change: number; price: number };
  breadth?: { up: number; n: number };
}

async function fetchMarkets(f: Fetcher): Promise<MarketsData> {
  const rows: any[] = await getJson(
    'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&price_change_percentage=24h',
    f,
  );
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('risposta CoinGecko vuota');
  const pick = (id: string) => {
    const r = rows.find((x) => x?.id === id);
    const change = Number(r?.price_change_percentage_24h);
    const price = Number(r?.current_price);
    return r && Number.isFinite(change) && Number.isFinite(price) ? { change, price } : undefined;
  };
  const eligible = rows.filter(
    (r) => !STABLE_OR_WRAPPED.has(String(r?.symbol).toLowerCase()) && Number.isFinite(Number(r?.price_change_percentage_24h)),
  );
  return {
    btc: pick('bitcoin'),
    eth: pick('ethereum'),
    breadth: eligible.length >= 20 ? { up: eligible.filter((r) => Number(r.price_change_percentage_24h) > 0).length, n: eligible.length } : undefined,
  };
}

async function fetchGlobalDominance(f: Fetcher): Promise<number> {
  const d = await getJson('https://api.coingecko.com/api/v3/global', f);
  const v = Number(d?.data?.market_cap_percentage?.btc);
  if (!Number.isFinite(v)) throw new Error('dominance assente');
  return v;
}

async function fetchFng(f: Fetcher): Promise<{ value: number; label: string }> {
  const d = await getJson('https://api.alternative.me/fng/?limit=1&format=json', f);
  const v = Number(d?.data?.[0]?.value);
  if (!Number.isFinite(v)) throw new Error('fear & greed assente');
  return { value: v, label: String(d.data[0].value_classification ?? '') };
}

/** Variazione 24h + prezzo da un exchange (fallback per BTC/ETH se CoinGecko è irraggiungibile). */
async function fetchTicker(base: 'BTC' | 'ETH', f: Fetcher): Promise<{ change: number; price: number }> {
  return firstOf([
    async () => {
      const d = await getJson(`https://api.binance.com/api/v3/ticker/24hr?symbol=${base}USDT`, f);
      return { change: Number(d.priceChangePercent), price: Number(d.lastPrice) };
    },
    async () => {
      const d = await getJson(`https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${base}USDT`, f);
      return { change: Number(d.priceChangePercent), price: Number(d.lastPrice) };
    },
    async () => {
      const d = await getJson(`https://api.exchange.coinbase.com/products/${base}-USD/stats`, f);
      const open = Number(d.open);
      const last = Number(d.last);
      return { change: ((last - open) / open) * 100, price: last };
    },
  ]).then((t) => {
    if (!Number.isFinite(t.change) || !Number.isFinite(t.price)) throw new Error('ticker non valido');
    return t;
  });
}

/** Chiusure BTC, dalla più vecchia alla più recente. */
async function fetchCloses(interval: '1h' | '1d', limit: number, f: Fetcher): Promise<number[]> {
  const fromBinance = (host: string) => async () => {
    const rows: any[] = await getJson(`https://${host}/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`, f);
    return rows.map((r) => Number(r[4]));
  };
  const closes = await firstOf<number[]>([
    fromBinance('api.binance.com'),
    fromBinance('data-api.binance.vision'),
    async () => {
      const g = interval === '1h' ? 3600 : 86400;
      const rows: any[] = await getJson(`https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=${g}`, f);
      // [time, low, high, open, close, volume], dal più recente
      return rows
        .slice()
        .sort((a, b) => a[0] - b[0])
        .slice(-limit)
        .map((r) => Number(r[4]));
    },
  ]);
  if (closes.length < Math.min(limit, 25) || closes.some((c) => !Number.isFinite(c) || c <= 0)) {
    throw new Error('candele insufficienti');
  }
  return closes;
}

async function fetchFunding(f: Fetcher): Promise<number> {
  return firstOf([
    async () => {
      const d = await getJson('https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP', f);
      const v = Number(d?.data?.[0]?.fundingRate);
      if (!Number.isFinite(v)) throw new Error('funding OKX assente');
      return v;
    },
    async () => {
      const d = await getJson('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT', f);
      const v = Number(d?.result?.list?.[0]?.fundingRate);
      if (!Number.isFinite(v)) throw new Error('funding Bybit assente');
      return v;
    },
  ]);
}

// ---------------------------------------------------------------- calcoli (puri, testabili)

export const scoreMomentum = (changePct: number) => clamp(50 + changePct * 5);
export const scoreTrend = (price: number, sma: number) => clamp(50 + ((price / sma - 1) * 100) * 2.5);
/** rate = tasso di funding per periodo (es. 0.0001 = 0.01%); 0.01% è la "norma" di mercato. */
export const scoreFunding = (rate: number) => clamp(55 + (rate * 100 - 0.01) * 1125);

export function realizedVolAnnualizedPct(closes: number[]): number {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(24 * 365) * 100;
}

export function regimeFor(sentiment: number | null, volIndex: number | null): string {
  if (sentiment === null) return 'DATI INSUFFICIENTI';
  if (volIndex !== null && volIndex >= 2) {
    if (sentiment > 65) return 'EUFORIA VOLATILE';
    if (sentiment >= 45) return 'INSTABILE';
    return 'PANICO VOLATILE';
  }
  if (sentiment >= 75) return 'EUFORIA';
  if (sentiment >= 60) return 'RIALZISTA';
  if (sentiment >= 52) return 'LEGGERMENTE RIALZISTA';
  if (sentiment >= 48) return 'NEUTRALE';
  if (sentiment >= 40) return 'LEGGERMENTE RIBASSISTA';
  if (sentiment >= 25) return 'RIBASSISTA';
  return 'PANICO';
}

export function aggregate(metrics: Metric[]): number | null {
  const avail = metrics.filter((m) => m.score !== null);
  if (avail.length < MIN_METRICS) return null;
  const wSum = avail.reduce((a, m) => a + WEIGHTS[m.id], 0);
  return avail.reduce((a, m) => a + (m.score as number) * WEIGHTS[m.id], 0) / wSum;
}

// ---------------------------------------------------------------- costruzione snapshot

type Settled<T> = { ok: true; v: T } | { ok: false; err: string };
async function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, v: await p };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : String(e) };
  }
}

const empty = (id: MetricId, label: string): Metric => ({ id, label, score: null, value: 'n/d', detail: 'fonte non raggiungibile' });

export async function buildSnapshot(f: Fetcher = fetch): Promise<Snapshot> {
  const [markets, dominance, fng, daily, hourly, funding, btcT, ethT] = await Promise.all([
    settle(fetchMarkets(f)),
    settle(fetchGlobalDominance(f)),
    settle(fetchFng(f)),
    settle(fetchCloses('1d', 30, f)),
    settle(fetchCloses('1h', 49, f)),
    settle(fetchFunding(f)),
    settle(fetchTicker('BTC', f)),
    settle(fetchTicker('ETH', f)),
  ]);

  const mk = markets.ok ? markets.v : undefined;
  const btc = mk?.btc ?? (btcT.ok ? btcT.v : undefined);
  const eth = mk?.eth ?? (ethT.ok ? ethT.v : undefined);

  const metrics: Metric[] = METRIC_ORDER.map((id) => {
    switch (id) {
      case 'btc':
        return btc
          ? { id, label: 'BTC 24h', score: scoreMomentum(btc.change), value: fmtPct(btc.change), detail: fmtUsd(btc.price) }
          : empty(id, 'BTC 24h');
      case 'eth':
        return eth
          ? { id, label: 'ETH 24h', score: scoreMomentum(eth.change), value: fmtPct(eth.change), detail: fmtUsd(eth.price) }
          : empty(id, 'ETH 24h');
      case 'fng':
        return fng.ok
          ? { id, label: 'Fear & Greed', score: clamp(fng.v.value), value: String(fng.v.value), detail: fng.v.label }
          : empty(id, 'Fear & Greed');
      case 'trend': {
        if (!daily.ok) return empty(id, 'Trend 30g');
        const last = daily.v[daily.v.length - 1];
        const sma = daily.v.reduce((a, b) => a + b, 0) / daily.v.length;
        const dev = (last / sma - 1) * 100;
        return { id, label: 'Trend 30g', score: scoreTrend(last, sma), value: fmtPct(dev), detail: 'BTC vs media 30 giorni' };
      }
      case 'breadth':
        return mk?.breadth
          ? {
              id,
              label: 'Ampiezza',
              score: (mk.breadth.up / mk.breadth.n) * 100,
              value: `${mk.breadth.up}/${mk.breadth.n}`,
              detail: 'top 50 coin in rialzo (24h)',
            }
          : empty(id, 'Ampiezza');
      case 'funding':
        return funding.ok
          ? { id, label: 'Funding', score: scoreFunding(funding.v), value: fmtPct(funding.v * 100, 3), detail: 'BTC perpetual, per periodo' }
          : empty(id, 'Funding');
    }
  });

  let annualizedPct: number | null = null;
  if (hourly.ok) {
    const v = realizedVolAnnualizedPct(hourly.v);
    if (Number.isFinite(v)) annualizedPct = v;
  }

  const sources: Record<string, boolean> = {
    'CoinGecko': markets.ok || dominance.ok,
    'Exchange (Binance/Coinbase)': daily.ok || hourly.ok || btcT.ok || ethT.ok,
    'Fear & Greed': fng.ok,
    'Funding (OKX/Bybit)': funding.ok,
  };

  return finalize({
    metrics,
    annualizedPct,
    dominance: dominance.ok ? dominance.v : null,
    sources,
    fetchedAt: Date.now(),
    stale: false,
  });
}

interface Raw {
  metrics: Metric[];
  annualizedPct: number | null;
  dominance: number | null;
  sources: Record<string, boolean>;
  fetchedAt: number;
  stale: boolean;
  volStale?: boolean;
}

function finalize(raw: Raw): Snapshot {
  const available = raw.metrics.filter((m) => m.score !== null).length;
  const sentiment = aggregate(raw.metrics);
  const index = raw.annualizedPct === null ? null : clamp(raw.annualizedPct / BASELINE_VOL_PCT, 0.5, 3);
  return {
    sentiment,
    regime: regimeFor(sentiment, index),
    volatility: { annualizedPct: raw.annualizedPct, index, ...(raw.volStale ? { stale: true } : {}) },
    dominance: raw.dominance,
    coverage: { available, total: raw.metrics.length },
    metrics: raw.metrics,
    sources: raw.sources,
    fetchedAt: raw.fetchedAt,
    stale: raw.stale,
  };
}

/**
 * Unisce il nuovo snapshot con il precedente: una metrica momentaneamente irraggiungibile
 * (es. rate limit di CoinGecko) viene mantenuta per max 15 minuti, marcata come "stale".
 */
export function mergeWithPrevious(next: Snapshot, prev: Snapshot | null, now = Date.now()): Snapshot {
  if (!prev || now - prev.fetchedAt > CARRY_OVER_MS) return next;
  const metrics = next.metrics.map((m) => {
    if (m.score !== null) return m;
    const old = prev.metrics.find((p) => p.id === m.id);
    return old && old.score !== null ? { ...old, stale: true } : m;
  });
  let annualizedPct = next.volatility.annualizedPct;
  let volStale = false;
  if (annualizedPct === null && prev.volatility.annualizedPct !== null) {
    annualizedPct = prev.volatility.annualizedPct;
    volStale = true;
  }
  return finalize({
    metrics,
    annualizedPct,
    dominance: next.dominance ?? prev.dominance,
    sources: next.sources,
    fetchedAt: next.fetchedAt,
    stale: false,
    volStale,
  });
}

// ---------------------------------------------------------------- cache in memoria (condivisa tra tutte le richieste)

let cache: Snapshot | null = null;
let inflight: Promise<Snapshot> | null = null;

export function resetCache() {
  cache = null;
  inflight = null;
}

export async function getSnapshot(ttlMs = 60_000, f: Fetcher = fetch): Promise<Snapshot> {
  if (cache && Date.now() - cache.fetchedAt < ttlMs) return cache;
  if (inflight) return inflight;

  inflight = buildSnapshot(f)
    .then((fresh) => {
      // Tutto è fallito: mostra l'ultimo snapshot valido dichiarandolo vecchio, senza rinnovarne la data.
      if (fresh.coverage.available === 0) return cache ? { ...cache, stale: true } : fresh;
      cache = mergeWithPrevious(fresh, cache);
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
