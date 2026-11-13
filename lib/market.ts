// Motore dati di Market Cube: solo API pubbliche gratuite, senza chiave, nessun dato inventato.
// Se una fonte non risponde la metrica resta "non disponibile" (mai sostituita da valori casuali).

export type MetricId = 'm24' | 'm7' | 'm30' | 'fng' | 'funding' | 'rel' | 'trend' | 'sec';

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

export interface CoinTile {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  /** punteggio 0..100 della moneta; null se i dati sono troppo pochi */
  score: number | null;
}

export interface Context {
  /** giorni dell'indice storico (compreso oggi) */
  days: number;
  /** valore di oggi, calcolato con le stesse metriche dello storico (quindi confrontabile) */
  today: number;
  /** quota di giorni passati con valore più basso di oggi, 0..100 */
  percentile: number;
  min: number;
  max: number;
  /** indice storico giorno per giorno, dal più vecchio a oggi */
  series: number[];
  /** 'high'/'low' se oggi è tra il 10% più alto/basso degli ultimi giorni */
  zone: 'high' | 'low' | null;
}

export interface Snapshot {
  coin: CoinTile;
  /** le prime coin per capitalizzazione, con il loro punteggio */
  coins: CoinTile[];
  /** null se i dati disponibili sono troppo pochi per un giudizio sensato */
  sentiment: number | null;
  regime: string;
  volatility: {
    /** volatilità realizzata 24h annualizzata, in % */
    annualizedPct: number | null;
    /** volatilità "normale" della moneta (ultimi 90 giorni), in % */
    normalPct: number | null;
    /** volatilità 24h rapportata alla sua norma (1 = normale) */
    index: number | null;
    stale?: boolean;
  };
  dominance: number | null;
  /** confronto di oggi con gli ultimi 90 giorni; null se lo storico non è disponibile */
  context: Context | null;
  coverage: { available: number; total: number };
  metrics: Metric[];
  sources: Record<string, boolean>;
  fetchedAt: number;
  /** true se TUTTE le fonti sono fallite e si sta mostrando l'ultimo dato valido */
  stale: boolean;
}

export type Fetcher = typeof fetch;

export const FACE_ORDER: MetricId[] = ['m24', 'm7', 'm30', 'fng', 'funding', 'rel'];
export const TOP_N = 20;
export const HISTORY_DAYS = 90;

const WEIGHTS: Record<string, number> = { m24: 0.2, m7: 0.2, m30: 0.15, fng: 0.15, funding: 0.15, rel: 0.15 };
const HISTORY_WEIGHTS: Record<string, number> = { m24: 0.3, trend: 0.3, sec: 0.15, fng: 0.25 };

const MIN_METRICS = 3;
const FALLBACK_VOL_PCT = 50;
const CARRY_OVER_MS = 15 * 60 * 1000;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmtPct = (n: number, d = 1) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`;
export const fmtUsd = (n: number) =>
  n >= 100
    ? `$${Math.round(n).toLocaleString('en-US')}`
    : n >= 1
      ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
      : `$${n.toLocaleString('en-US', { maximumSignificantDigits: 3 })}`;

// ---------------------------------------------------------------- rete

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
  'ustb', 'buidl', 'usdtb', 'usdf', 'figr_heloc', 'jitosol', 'msol', 'cbeth',
]);

interface CoinRow {
  id: string;
  symbol: string; // maiuscolo
  name: string;
  price: number;
  ch24: number;
  ch7?: number;
  ch30?: number;
}

interface MarketsData {
  rows: CoinRow[];
  breadth?: { up: number; n: number };
}

/** Monete di ripiego se CoinGecko è irraggiungibile (variazione 24h da exchange). */
const DEFAULT_COINS: Array<[string, string, string]> = [
  ['bitcoin', 'BTC', 'Bitcoin'], ['ethereum', 'ETH', 'Ethereum'], ['ripple', 'XRP', 'XRP'],
  ['binancecoin', 'BNB', 'BNB'], ['solana', 'SOL', 'Solana'], ['dogecoin', 'DOGE', 'Dogecoin'],
  ['tron', 'TRX', 'TRON'], ['cardano', 'ADA', 'Cardano'], ['chainlink', 'LINK', 'Chainlink'],
  ['avalanche-2', 'AVAX', 'Avalanche'], ['stellar', 'XLM', 'Stellar'], ['sui', 'SUI', 'Sui'],
  ['litecoin', 'LTC', 'Litecoin'], ['polkadot', 'DOT', 'Polkadot'], ['uniswap', 'UNI', 'Uniswap'],
  ['near', 'NEAR', 'NEAR'], ['aave', 'AAVE', 'Aave'], ['pepe', 'PEPE', 'Pepe'],
  ['internet-computer', 'ICP', 'Internet Computer'], ['bitcoin-cash', 'BCH', 'Bitcoin Cash'],
];

const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && Number.isFinite(n) ? n : undefined;
};

async function fetchMarkets(f: Fetcher): Promise<MarketsData> {
  const rows: any[] = await getJson(
    'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&price_change_percentage=24h,7d,30d',
    f,
  );
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('risposta CoinGecko vuota');
  const eligible: CoinRow[] = [];
  for (const r of rows) {
    const symbol = String(r?.symbol ?? '').toLowerCase();
    const price = num(r?.current_price);
    const ch24 = num(r?.price_change_percentage_24h_in_currency) ?? num(r?.price_change_percentage_24h);
    if (!symbol || STABLE_OR_WRAPPED.has(symbol) || price === undefined || ch24 === undefined) continue;
    eligible.push({
      id: String(r.id),
      symbol: symbol.toUpperCase(),
      name: String(r.name ?? symbol),
      price,
      ch24,
      ch7: num(r?.price_change_percentage_7d_in_currency),
      ch30: num(r?.price_change_percentage_30d_in_currency),
    });
  }
  if (eligible.length === 0) throw new Error('nessuna moneta valida');
  return {
    rows: eligible,
    breadth: eligible.length >= 20 ? { up: eligible.filter((r) => r.ch24 > 0).length, n: eligible.length } : undefined,
  };
}

/** Ripiego: variazione 24h di una lista di monete da Binance (una sola chiamata). */
async function fetchMarketsFromExchange(f: Fetcher): Promise<MarketsData> {
  const symbols = encodeURIComponent(JSON.stringify(DEFAULT_COINS.map(([, s]) => `${s}USDT`)));
  const rows: any[] = await firstOf([
    () => getJson(`https://api.binance.com/api/v3/ticker/24hr?symbols=${symbols}`, f),
    () => getJson(`https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${symbols}`, f),
  ]);
  const out: CoinRow[] = [];
  for (const [id, sym, name] of DEFAULT_COINS) {
    const r = rows.find((x) => x?.symbol === `${sym}USDT`);
    const price = num(r?.lastPrice);
    const ch24 = num(r?.priceChangePercent);
    if (price !== undefined && ch24 !== undefined) out.push({ id, symbol: sym, name, price, ch24 });
  }
  if (out.length === 0) throw new Error('nessuna moneta dall\'exchange');
  return { rows: out };
}

async function fetchGlobalDominance(f: Fetcher): Promise<number> {
  const d = await getJson('https://api.coingecko.com/api/v3/global', f);
  const v = Number(d?.data?.market_cap_percentage?.btc);
  if (!Number.isFinite(v)) throw new Error('dominance assente');
  return v;
}

async function fetchFng(f: Fetcher): Promise<{ value: number; label: string; history: number[] }> {
  const d = await getJson('https://api.alternative.me/fng/?limit=90&format=json', f);
  const v = Number(d?.data?.[0]?.value);
  if (!Number.isFinite(v)) throw new Error('fear & greed assente');
  // history[0] = oggi, poi i giorni precedenti
  const history = (d.data as any[]).map((x) => Number(x?.value)).filter((n) => Number.isFinite(n));
  return { value: v, label: String(d.data[0].value_classification ?? ''), history };
}

/** Funding rate per periodo, per simbolo (BTC, ETH, ...). Bybit in blocco, poi OKX moneta per moneta. */
async function fetchFundingMap(symbols: string[], f: Fetcher): Promise<Record<string, number>> {
  return firstOf<Record<string, number>>([
    async () => {
      const d = await getJson('https://api.bybit.com/v5/market/tickers?category=linear', f);
      const out: Record<string, number> = {};
      for (const t of d?.result?.list ?? []) {
        const sym = String(t?.symbol ?? '');
        const rate = num(t?.fundingRate);
        if (sym.endsWith('USDT') && rate !== undefined) out[sym.slice(0, -4)] = rate;
      }
      if (Object.keys(out).length === 0) throw new Error('funding Bybit assente');
      return out;
    },
    async () => {
      const results = await Promise.allSettled(
        symbols.map(async (s) => {
          const d = await getJson(`https://www.okx.com/api/v5/public/funding-rate?instId=${s}-USDT-SWAP`, f);
          const rate = num(d?.data?.[0]?.fundingRate);
          if (rate === undefined) throw new Error('assente');
          return [s, rate] as const;
        }),
      );
      const out: Record<string, number> = {};
      for (const r of results) if (r.status === 'fulfilled') out[r.value[0]] = r.value[1];
      if (Object.keys(out).length === 0) throw new Error('funding OKX assente');
      return out;
    },
  ]);
}

/** Chiusure di una moneta, dalla più vecchia alla più recente. */
async function fetchCloses(base: string, interval: '1h' | '1d', limit: number, f: Fetcher): Promise<number[]> {
  const fromBinance = (host: string) => async () => {
    const rows: any[] = await getJson(`https://${host}/api/v3/klines?symbol=${base}USDT&interval=${interval}&limit=${limit}`, f);
    return rows.map((r) => Number(r[4]));
  };
  const closes = await firstOf<number[]>([
    fromBinance('api.binance.com'),
    fromBinance('data-api.binance.vision'),
    async () => {
      const g = interval === '1h' ? 3600 : 86400;
      const rows: any[] = await getJson(`https://api.exchange.coinbase.com/products/${base}-USD/candles?granularity=${g}`, f);
      // [time, low, high, open, close, volume], dal più recente
      return rows
        .slice()
        .sort((a, b) => a[0] - b[0])
        .slice(-limit)
        .map((r) => Number(r[4]));
    },
  ]);
  if (closes.length < Math.min(limit, 30) || closes.some((c) => !Number.isFinite(c) || c <= 0)) {
    throw new Error('candele insufficienti');
  }
  return closes;
}

// ---------------------------------------------------------------- calcoli (puri, testabili)

export const scoreMomentum = (changePct: number, perPoint = 5) => clamp(50 + changePct * perPoint);
export const scoreTrend = (price: number, sma: number) => clamp(50 + ((price / sma - 1) * 100) * 2.5);
/** rate = tasso di funding per periodo (es. 0.0001 = 0.01%); 0.01% è la "norma" di mercato. */
export const scoreFunding = (rate: number) => clamp(55 + (rate * 100 - 0.01) * 1125);

export function stdevLogReturns(closes: number[]): number {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  if (rets.length < 2) return NaN;
  const mean = avg(rets);
  return Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
}

/** Volatilità realizzata annualizzata, in %, da chiusure orarie. */
export const realizedVolAnnualizedPct = (hourlyCloses: number[]) => stdevLogReturns(hourlyCloses) * Math.sqrt(24 * 365) * 100;
/** Volatilità "normale" annualizzata, in %, da chiusure giornaliere. */
export const dailyVolAnnualizedPct = (dailyCloses: number[]) => stdevLogReturns(dailyCloses) * Math.sqrt(365) * 100;

export function aggregate(metrics: Metric[], weights: Record<string, number> = WEIGHTS): number | null {
  const avail = metrics.filter((m) => m.score !== null);
  if (avail.length < MIN_METRICS) return null;
  const wSum = avail.reduce((a, m) => a + weights[m.id], 0);
  return avail.reduce((a, m) => a + (m.score as number) * weights[m.id], 0) / wSum;
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

/**
 * Ricostruisce l'indice di sentiment giorno per giorno con le metriche che hanno uno storico pubblico gratuito:
 * momentum 24h e trend 30g della moneta, momentum di una seconda moneta di riferimento, Fear & Greed.
 * (Funding e metriche a più giorni non hanno storico gratuito e restano fuori da questo confronto.)
 * primary/secondary: chiusure giornaliere dalla più vecchia alla più recente; fng: dal più recente (oggi) indietro.
 */
export function buildHistory(primary: number[] | null, secondary: number[] | null, fng: number[] | null, days = HISTORY_DAYS): number[] {
  const out: number[] = [];
  for (let k = days - 1; k >= 0; k--) {
    const ms: Metric[] = [];
    const add = (id: MetricId, score: number) => {
      if (Number.isFinite(score)) ms.push({ id, label: id, score, value: '', detail: '' });
    };
    if (primary) {
      const i = primary.length - 1 - k;
      if (i >= 1) add('m24', scoreMomentum((primary[i] / primary[i - 1] - 1) * 100));
      if (i >= 29) add('trend', scoreTrend(primary[i], avg(primary.slice(i - 29, i + 1))));
    }
    if (secondary) {
      const i = secondary.length - 1 - k;
      if (i >= 1) add('sec', scoreMomentum((secondary[i] / secondary[i - 1] - 1) * 100));
    }
    if (fng && k < fng.length) add('fng', clamp(fng[k]));
    const v = aggregate(ms, HISTORY_WEIGHTS);
    if (v !== null) out.push(v);
  }
  return out;
}

export function computeContext(series: number[]): Context | null {
  if (series.length < 30) return null;
  const today = series[series.length - 1];
  const past = series.slice(0, -1);
  const below = past.filter((v) => v < today).length;
  const equal = past.filter((v) => v === today).length;
  const percentile = ((below + equal / 2) / past.length) * 100;
  return {
    days: series.length,
    today,
    percentile,
    min: Math.min(...series),
    max: Math.max(...series),
    series,
    zone: percentile >= 90 ? 'high' : percentile <= 10 ? 'low' : null,
  };
}

interface MetricInputs {
  coin: CoinRow;
  btc?: CoinRow;
  fng?: { value: number; label: string };
  funding?: number;
  breadth?: { up: number; n: number };
  /** variazioni 7g/30g ricavate dalle candele, se CoinGecko non le fornisce */
  derived?: { ch7?: number; ch30?: number };
  stale: Partial<Record<MetricId, boolean>>;
}

const empty = (id: MetricId, label: string): Metric => ({ id, label, score: null, value: 'n/d', detail: 'fonte non raggiungibile' });

/** Le 6 metriche (una per faccia del cubo) di una moneta. */
export function computeMetrics(i: MetricInputs): Metric[] {
  const { coin, btc, fng, funding, breadth, derived, stale } = i;
  const isBtc = coin.id === 'bitcoin';
  const ch7 = coin.ch7 ?? derived?.ch7;
  const ch30 = coin.ch30 ?? derived?.ch30;
  return FACE_ORDER.map((id): Metric => {
    const s = stale[id] ? { stale: true } : {};
    switch (id) {
      case 'm24':
        return { id, label: '24 ore', score: scoreMomentum(coin.ch24), value: fmtPct(coin.ch24), detail: fmtUsd(coin.price), ...s };
      case 'm7':
        return ch7 === undefined
          ? empty(id, '7 giorni')
          : { id, label: '7 giorni', score: scoreMomentum(ch7, 2.5), value: fmtPct(ch7), detail: 'variazione settimanale', ...s };
      case 'm30':
        return ch30 === undefined
          ? empty(id, '30 giorni')
          : { id, label: '30 giorni', score: scoreMomentum(ch30, 1.25), value: fmtPct(ch30), detail: 'variazione mensile', ...s };
      case 'fng':
        return fng
          ? { id, label: 'Fear & Greed', score: clamp(fng.value), value: String(fng.value), detail: `mercato · ${fng.label}`, ...s }
          : empty(id, 'Fear & Greed');
      case 'funding':
        return funding === undefined
          ? empty(id, 'Funding')
          : { id, label: 'Funding', score: scoreFunding(funding), value: fmtPct(funding * 100, 3), detail: 'perpetual, per periodo', ...s };
      case 'rel':
        if (isBtc) {
          return breadth
            ? { id, label: 'Ampiezza', score: (breadth.up / breadth.n) * 100, value: `${breadth.up}/${breadth.n}`, detail: 'top coin in rialzo (24h)', ...s }
            : empty(id, 'Ampiezza');
        }
        return btc
          ? {
              id,
              label: 'Forza vs BTC',
              score: scoreMomentum(coin.ch24 - btc.ch24),
              value: fmtPct(coin.ch24 - btc.ch24),
              detail: 'differenza 24h rispetto a BTC',
              ...s,
            }
          : empty(id, 'Forza vs BTC');
    }
    return empty(id, id);
  });
}

// ---------------------------------------------------------------- cache a componenti (con carry-over)

type CompState = 'fresh' | 'stale' | 'none';
interface Comp<T> {
  v: T | null;
  state: CompState;
  /** quando il dato è stato scaricato (0 se assente) */
  at: number;
}

const store = new Map<string, { v: unknown; at: number }>();
const pending = new Map<string, Promise<unknown>>();

export function resetCache() {
  store.clear();
  pending.clear();
}

/**
 * Restituisce un dato dalla cache se ancora valido, altrimenti lo riscarica (una sola richiesta per chiave).
 * Se il download fallisce, riusa l'ultimo dato per al massimo 15 minuti, marcandolo "stale".
 */
async function comp<T>(key: string, ttlMs: number, force: boolean, fetcher: () => Promise<T>): Promise<Comp<T>> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && !force && now - hit.at < ttlMs) return { v: hit.v as T, state: 'fresh', at: hit.at };

  let p = pending.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fetcher().then((v) => {
      store.set(key, { v, at: Date.now() });
      return v;
    });
    pending.set(key, p);
    p.then(
      () => pending.delete(key),
      () => pending.delete(key),
    );
  }
  try {
    const v = await p;
    return { v, state: 'fresh', at: store.get(key)?.at ?? Date.now() };
  } catch {
    if (hit && now - hit.at < CARRY_OVER_MS) return { v: hit.v as T, state: 'stale', at: hit.at };
    return { v: null, state: 'none', at: 0 };
  }
}

const TTL = { markets: 45_000, global: 300_000, fng: 1_800_000, funding: 120_000, daily: 600_000, hourly: 300_000 };

// ---------------------------------------------------------------- snapshot

export interface SnapshotOptions {
  force?: boolean;
  f?: Fetcher;
}

export async function getSnapshot(coinId = 'bitcoin', opts: SnapshotOptions = {}): Promise<Snapshot> {
  const f = opts.f ?? fetch;
  const force = opts.force ?? false;

  // 1) dati di mercato condivisi da tutte le monete
  const [marketsCg, glob, fng] = await Promise.all([
    comp('markets', TTL.markets, force, () => fetchMarkets(f)),
    comp('global', TTL.global, force, () => fetchGlobalDominance(f)),
    comp('fng', TTL.fng, force, () => fetchFng(f)),
  ]);
  // ripiego: se CoinGecko non c'è, almeno prezzi e variazione 24h da exchange
  const markets =
    marketsCg.v !== null ? marketsCg : await comp('markets-ex', TTL.markets, force, () => fetchMarketsFromExchange(f));
  const usingExchangeMarkets = marketsCg.v === null && markets.v !== null;

  const rows = (markets.v?.rows ?? []).slice(0, TOP_N);
  const funding = await comp('funding', TTL.funding, force, () => fetchFundingMap(rows.map((r) => r.symbol).concat(['BTC', 'ETH']), f));

  const btcRow = (markets.v?.rows ?? []).find((r) => r.id === 'bitcoin');
  const sel = rows.find((r) => r.id === coinId) ?? rows[0];

  const shared = {
    btc: btcRow,
    fng: fng.v ? { value: fng.v.value, label: fng.v.label } : undefined,
    breadth: markets.v?.breadth,
  };
  const staleOf = (extra: Partial<Record<MetricId, boolean>> = {}): Partial<Record<MetricId, boolean>> => ({
    m24: markets.state === 'stale',
    m7: markets.state === 'stale',
    m30: markets.state === 'stale',
    rel: markets.state === 'stale',
    fng: fng.state === 'stale',
    funding: funding.state === 'stale',
    ...extra,
  });
  const tileFor = (r: CoinRow): CoinTile => ({
    id: r.id,
    symbol: r.symbol,
    name: r.name,
    price: r.price,
    change24h: r.ch24,
    score: aggregate(computeMetrics({ coin: r, ...shared, funding: funding.v?.[r.symbol], stale: {} })),
  });
  const coins = rows.map(tileFor);

  // senza nessuna moneta non c'è nulla da mostrare
  if (!sel) {
    const none: CoinTile = { id: coinId, symbol: '—', name: 'Nessun dato', price: 0, change24h: 0, score: null };
    const metrics = computeMetrics({ coin: { id: coinId, symbol: '—', name: '', price: 0, ch24: 0 }, ...shared, stale: {} }).map(
      (m) => empty(m.id, m.label),
    );
    return {
      coin: none, coins: [], sentiment: null, regime: 'DATI INSUFFICIENTI',
      volatility: { annualizedPct: null, normalPct: null, index: null },
      dominance: glob.v, context: null, coverage: { available: 0, total: FACE_ORDER.length }, metrics,
      sources: { CoinGecko: false, Exchange: false, 'Fear & Greed': fng.state === 'fresh', Funding: false },
      fetchedAt: Date.now(), stale: false,
    };
  }

  // 2) dettaglio della moneta scelta: candele per storico e volatilità
  const secondaryBase = sel.symbol === 'BTC' ? 'ETH' : 'BTC';
  const [daily, hourly, secDaily] = await Promise.all([
    comp(`daily:${sel.symbol}`, TTL.daily, force, () => fetchCloses(sel.symbol, '1d', HISTORY_DAYS + 30, f)),
    comp(`hourly:${sel.symbol}`, TTL.hourly, force, () => fetchCloses(sel.symbol, '1h', 49, f)),
    comp(`daily:${secondaryBase}`, TTL.daily, force, () => fetchCloses(secondaryBase, '1d', HISTORY_DAYS + 30, f)),
  ]);

  const derived: { ch7?: number; ch30?: number } = {};
  if (daily.v && daily.v.length >= 31) {
    const last = daily.v[daily.v.length - 1];
    derived.ch7 = (last / daily.v[daily.v.length - 8] - 1) * 100;
    derived.ch30 = (last / daily.v[daily.v.length - 31] - 1) * 100;
  }
  const metrics = computeMetrics({
    coin: sel,
    ...shared,
    funding: funding.v?.[sel.symbol],
    derived: usingExchangeMarkets ? derived : undefined,
    stale: staleOf(),
  });
  const sentiment = aggregate(metrics);

  const annualizedPct = hourly.v ? realizedVolAnnualizedPct(hourly.v) : NaN;
  const normal = daily.v ? dailyVolAnnualizedPct(daily.v.slice(-(HISTORY_DAYS + 1))) : NaN;
  const normalPct = Number.isFinite(normal) && normal > 0 ? normal : null;
  const ann = Number.isFinite(annualizedPct) ? annualizedPct : null;
  const index = ann === null ? null : clamp(ann / (normalPct ?? FALLBACK_VOL_PCT), 0.5, 3);

  const context = computeContext(buildHistory(daily.v, secDaily.v, fng.v ? fng.v.history : null));

  const states = [marketsCg.state, glob.state, fng.state, funding.state, daily.state, hourly.state];
  // età del dato: l'ultimo scaricamento riuscito (così uno snapshot "vecchio" non finge di essere appena aggiornato)
  const fetchedAt = Math.max(markets.at, glob.at, fng.at, funding.at, daily.at, hourly.at) || Date.now();
  const sources: Record<string, boolean> = {
    CoinGecko: marketsCg.state === 'fresh' || glob.state === 'fresh',
    Exchange: usingExchangeMarkets ? markets.state === 'fresh' : daily.state === 'fresh' || hourly.state === 'fresh',
    'Fear & Greed': fng.state === 'fresh',
    Funding: funding.state === 'fresh',
  };
  const available = metrics.filter((m) => m.score !== null).length;

  return {
    coin: tileFor(sel),
    coins,
    sentiment,
    regime: regimeFor(sentiment, index),
    volatility: {
      annualizedPct: ann,
      normalPct,
      index,
      ...(hourly.state === 'stale' ? { stale: true } : {}),
    },
    dominance: glob.v,
    context,
    coverage: { available, total: metrics.length },
    metrics,
    sources,
    fetchedAt,
    stale: available > 0 && !states.includes('fresh'),
  };
}
