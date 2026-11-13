import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregate, buildHistory, buildSnapshot, computeContext, getSnapshot, mergeWithPrevious, realizedVolAnnualizedPct,
  regimeFor, resetCache, scoreFunding, scoreMomentum, scoreTrend, type Fetcher, type Metric,
} from '../lib/market';

// ---- risposte finte, nel formato reale delle API
const coins = [
  { id: 'bitcoin', symbol: 'btc', current_price: 70000, price_change_percentage_24h: 2 },
  { id: 'ethereum', symbol: 'eth', current_price: 3500, price_change_percentage_24h: -1 },
  { id: 'tether', symbol: 'usdt', current_price: 1, price_change_percentage_24h: 0.01 },
  ...Array.from({ length: 47 }, (_, i) => ({
    id: `c${i}`, symbol: `c${i}`, current_price: 1, price_change_percentage_24h: i % 2 ? 3 : -3,
  })),
];
const hourly = Array.from({ length: 49 }, (_, i) => 70000 * (1 + (i % 2 ? 0.004 : -0.004)));
const dailyOf = (n: number, base: number) => Array.from({ length: n }, (_, i) => base * (1 + Math.sin(i / 6) * 0.08 + i * 0.001));
const fngHistory = Array.from({ length: 90 }, (_, i) => ({ value: String(40 + Math.round(Math.sin(i / 5) * 25)), value_classification: 'Neutral' }));

function route(url: string, down: string[] = []): unknown {
  if (down.some((d) => url.includes(d))) throw new Error('down');
  if (url.includes('coins/markets')) return coins;
  if (url.includes('coingecko.com/api/v3/global')) return { data: { market_cap_percentage: { btc: 57.3 } } };
  if (url.includes('alternative.me')) return { data: fngHistory };
  if (url.includes('klines')) {
    const limit = Number(/limit=(\d+)/.exec(url)![1]);
    const base = url.includes('ETHUSDT') ? 3500 : 70000;
    const closes = url.includes('interval=1h') ? hourly : dailyOf(limit, base);
    return closes.map((c) => [0, 0, 0, 0, String(c)]);
  }
  if (url.includes('ticker/24hr')) return { priceChangePercent: '1.5', lastPrice: '70000' };
  if (url.includes('okx.com')) return { data: [{ fundingRate: '0.0001' }] };
  throw new Error('url inatteso ' + url);
}
const mockFetch = (down: string[] = []): Fetcher =>
  (async (input: any) => {
    try {
      const body = route(String(input), down);
      return { ok: true, status: 200, json: async () => body } as Response;
    } catch {
      return { ok: false, status: 503, json: async () => ({}) } as Response;
    }
  }) as Fetcher;

test('punteggi: neutro, estremi e clamp', () => {
  assert.equal(scoreMomentum(0), 50);
  assert.equal(scoreMomentum(50), 100);
  assert.equal(scoreMomentum(-50), 0);
  assert.equal(scoreTrend(100, 100), 50);
  assert.equal(scoreFunding(0.0001), 55);
  assert.equal(scoreFunding(-0.001), 0);
  assert.equal(scoreFunding(0.001), 100);
});

test('volatilità realizzata: serie piatta = 0, serie oscillante > 0', () => {
  assert.equal(realizedVolAnnualizedPct(Array(30).fill(100)), 0);
  assert.ok(realizedVolAnnualizedPct(hourly) > 50);
});

test('snapshot completo con tutte le fonti', async () => {
  const s = await buildSnapshot(mockFetch());
  assert.equal(s.coverage.available, 6);
  assert.ok(s.sentiment! > 40 && s.sentiment! < 80);
  assert.equal(s.dominance, 57.3);
  const breadth = s.metrics.find((m) => m.id === 'breadth')!;
  assert.equal(breadth.value, '24/49'); // stablecoin esclusa
  assert.ok(Object.values(s.sources).every(Boolean));
});

test('fallback exchange quando CoinGecko è giù: BTC/ETH ancora disponibili, ampiezza no', async () => {
  const s = await buildSnapshot(mockFetch(['coingecko']));
  assert.equal(s.metrics.find((m) => m.id === 'btc')!.score !== null, true);
  assert.equal(s.metrics.find((m) => m.id === 'breadth')!.score, null);
  assert.equal(s.coverage.available, 5);
  assert.equal(s.sources['CoinGecko'], false);
});

test('niente dati inventati: tutto giù => sentiment null', async () => {
  const s = await buildSnapshot(mockFetch(['http']));
  assert.equal(s.sentiment, null);
  assert.equal(s.coverage.available, 0);
  assert.equal(s.regime, 'DATI INSUFFICIENTI');
});

test('con meno di 3 metriche non si dà un giudizio', () => {
  const m = (id: any, score: number | null): Metric => ({ id, label: id, score, value: '', detail: '' });
  assert.equal(aggregate([m('btc', 80), m('eth', 80), m('fng', null)]), null);
  assert.equal(aggregate([m('btc', 80), m('eth', 80), m('fng', 80)]), 80);
});

test('regime: volatilità alta cambia etichetta', () => {
  assert.equal(regimeFor(80, 1), 'EUFORIA');
  assert.equal(regimeFor(80, 2.5), 'EUFORIA VOLATILE');
  assert.equal(regimeFor(null, 1), 'DATI INSUFFICIENTI');
});

test('carry-over: metrica persa viene mantenuta ma marcata stale, poi scade', async () => {
  const good = await buildSnapshot(mockFetch());
  const bad = await buildSnapshot(mockFetch(['coingecko']));
  const merged = mergeWithPrevious(bad, good);
  const b = merged.metrics.find((x) => x.id === 'breadth')!;
  assert.equal(b.stale, true);
  assert.equal(merged.coverage.available, 6);
  const expired = mergeWithPrevious(bad, good, good.fetchedAt + 16 * 60_000);
  assert.equal(expired.coverage.available, 5);
});

test('cache: una sola serie di chiamate per finestra di TTL; se tutto fallisce serve lo snapshot vecchio', async () => {
  resetCache();
  let calls = 0;
  const counting: Fetcher = ((i: any, o: any) => { calls++; return mockFetch()(i, o); }) as Fetcher;
  const [a, b] = await Promise.all([getSnapshot(60_000, counting), getSnapshot(60_000, counting)]);
  const afterFirst = calls;
  await getSnapshot(60_000, counting);
  assert.equal(calls, afterFirst);
  assert.equal(a, b);
  const old = await getSnapshot(0, mockFetch(['http'])); // TTL 0 => forza refresh, ma tutto è giù
  assert.equal(old.stale, true);
  assert.equal(old.coverage.available, 6);
  resetCache();
});

test('storico: 90 giorni ricostruiti, confrontabili con oggi, valori in 0..100', () => {
  const btc = dailyOf(120, 70000);
  const eth = dailyOf(100, 3500);
  const fng = fngHistory.map((x) => Number(x.value));
  const series = buildHistory(btc, eth, fng);
  assert.equal(series.length, 90);
  assert.ok(series.every((v) => v >= 0 && v <= 100));
});

test('storico: senza serie disponibili non produce nulla (niente dati inventati)', () => {
  assert.equal(buildHistory(null, null, null).length, 0);
  assert.equal(computeContext([]), null);
  assert.equal(computeContext(Array(10).fill(50)), null); // troppo corto
});

test('contesto: percentile e zone', () => {
  const base = Array.from({ length: 89 }, (_, i) => 40 + (i % 20)); // 40..59
  const high = computeContext([...base, 90])!;
  assert.equal(high.percentile, 100);
  assert.equal(high.zone, 'high');
  assert.equal(high.max, 90);
  const low = computeContext([...base, 10])!;
  assert.equal(low.percentile, 0);
  assert.equal(low.zone, 'low');
  const mid = computeContext([...base, 50])!;
  assert.equal(mid.zone, null);
  assert.ok(mid.percentile > 30 && mid.percentile < 70);
});

test('snapshot include il contesto e lo conserva se la fonte cade (carry-over)', async () => {
  const good = await buildSnapshot(mockFetch());
  assert.ok(good.context && good.context.days === 90);
  const bad = await buildSnapshot(mockFetch(['binance', 'coinbase', 'alternative']));
  assert.equal(bad.context, null);
  const merged = mergeWithPrevious(bad, good);
  assert.equal(merged.context, good.context);
});
