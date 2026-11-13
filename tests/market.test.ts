import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregate, buildHistory, computeContext, dailyVolAnnualizedPct, getSnapshot, realizedVolAnnualizedPct,
  regimeFor, resetCache, scoreFunding, scoreMomentum, scoreTrend, TOP_N, type Fetcher, type Metric,
} from '../lib/market';

// ---- risposte finte, nel formato reale delle API
const pctRow = (id: string, symbol: string, price: number, c24: number, c7: number, c30: number) => ({
  id, symbol, name: id.toUpperCase(), current_price: price,
  price_change_percentage_24h: c24,
  price_change_percentage_24h_in_currency: c24,
  price_change_percentage_7d_in_currency: c7,
  price_change_percentage_30d_in_currency: c30,
});
const coins = [
  pctRow('bitcoin', 'btc', 70000, 2, 5, 12),
  pctRow('ethereum', 'eth', 3500, -1, 3, 8),
  pctRow('tether', 'usdt', 1, 0.01, 0, 0),
  pctRow('solana', 'sol', 160, 6, 10, -4),
  ...Array.from({ length: 46 }, (_, i) => pctRow(`c${i}`, `c${i}`, 1 + i, i % 2 ? 3 : -3, 1, 1)),
];
const hourly = Array.from({ length: 49 }, (_, i) => 70000 * (1 + (i % 2 ? 0.004 : -0.004)));
const dailyOf = (n: number, base: number) => Array.from({ length: n }, (_, i) => base * (1 + Math.sin(i / 6) * 0.08 + i * 0.001));
const fngHistory = Array.from({ length: 90 }, (_, i) => ({ value: String(40 + Math.round(Math.sin(i / 5) * 25)), value_classification: 'Neutral' }));
const bybit = { result: { list: [
  { symbol: 'BTCUSDT', fundingRate: '0.0001' }, { symbol: 'ETHUSDT', fundingRate: '0.00005' },
  { symbol: 'SOLUSDT', fundingRate: '0.0003' }, { symbol: '1000PEPEUSDT', fundingRate: '0.0001' },
] } };

function route(url: string, down: string[]): unknown {
  if (down.some((d) => url.includes(d))) throw new Error('down');
  if (url.includes('coins/markets')) return coins;
  if (url.includes('coingecko.com/api/v3/global')) return { data: { market_cap_percentage: { btc: 57.3 } } };
  if (url.includes('alternative.me')) return { data: fngHistory };
  if (url.includes('klines')) {
    const limit = Number(/limit=(\d+)/.exec(url)![1]);
    const base = url.includes('BTCUSDT') ? 70000 : url.includes('ETHUSDT') ? 3500 : 160;
    const closes = url.includes('interval=1h') ? hourly : dailyOf(limit, base);
    return closes.map((c) => [0, 0, 0, 0, String(c)]);
  }
  if (url.includes('ticker/24hr?symbols=')) {
    return ['BTC', 'ETH', 'SOL'].map((s) => ({ symbol: `${s}USDT`, priceChangePercent: '1.5', lastPrice: '100' }));
  }
  if (url.includes('bybit.com')) return bybit;
  if (url.includes('okx.com')) return { data: [{ fundingRate: '0.0002' }] };
  throw new Error('url inatteso ' + url);
}

function mockFetch(down: string[] = [], log?: string[]): Fetcher {
  return (async (input: any) => {
    const url = String(input);
    log?.push(url);
    try {
      const body = route(url, down);
      return { ok: true, status: 200, json: async () => body } as Response;
    } catch {
      return { ok: false, status: 503, json: async () => ({}) } as Response;
    }
  }) as Fetcher;
}

const snap = (id: string, down: string[] = []) => {
  resetCache();
  return getSnapshot(id, { f: mockFetch(down), force: true });
};

test('punteggi: neutro, estremi e clamp', () => {
  assert.equal(scoreMomentum(0), 50);
  assert.equal(scoreMomentum(50), 100);
  assert.equal(scoreMomentum(-50), 0);
  assert.equal(scoreMomentum(10, 2.5), 75);
  assert.equal(scoreTrend(100, 100), 50);
  assert.equal(scoreFunding(0.0001), 55);
  assert.equal(scoreFunding(-0.001), 0);
  assert.equal(scoreFunding(0.001), 100);
});

test('volatilità: serie piatta = 0, oscillante > 0', () => {
  assert.equal(realizedVolAnnualizedPct(Array(30).fill(100)), 0);
  assert.ok(realizedVolAnnualizedPct(hourly) > 50);
  assert.ok(dailyVolAnnualizedPct(dailyOf(90, 100)) > 0);
});

test('snapshot BTC: prime 20 coin, niente stablecoin, 6 metriche, storico a 90 giorni', async () => {
  const s = await snap('bitcoin');
  assert.equal(s.coins.length, TOP_N);
  assert.ok(!s.coins.some((c) => c.symbol === 'USDT'));
  assert.equal(s.coin.id, 'bitcoin');
  assert.equal(s.coverage.available, 6);
  assert.ok(s.sentiment! > 30 && s.sentiment! < 90);
  assert.equal(s.metrics.find((m) => m.id === 'rel')!.label, 'Ampiezza'); // BTC: ampiezza del mercato
  assert.equal(s.metrics.find((m) => m.id === 'rel')!.value, '25/49');
  assert.equal(s.dominance, 57.3);
  assert.ok(s.context && s.context.days === 90);
  assert.ok(Object.values(s.sources).every(Boolean));
  assert.equal(s.coin.score, s.sentiment); // la tessera e il titolo mostrano lo stesso numero
});

test('altre monete: SOL ha le sue metriche, il suo funding e "forza vs BTC"', async () => {
  const s = await snap('solana');
  assert.equal(s.coin.symbol, 'SOL');
  const rel = s.metrics.find((m) => m.id === 'rel')!;
  assert.equal(rel.label, 'Forza vs BTC');
  assert.equal(rel.value, '+4.0%'); // 6% - 2%
  assert.equal(s.metrics.find((m) => m.id === 'funding')!.value, '+0.030%');
  assert.equal(s.metrics.find((m) => m.id === 'm30')!.value, '-4.0%');
  assert.ok(s.context);
});

test('moneta sconosciuta: si ripiega sulla prima della lista, senza errori', async () => {
  const s = await snap('non-esiste');
  assert.equal(s.coin.id, 'bitcoin');
});

test('CoinGecko giù: ripiego su exchange, 7g/30g ricavati dalle candele', async () => {
  const s = await snap('solana', ['coingecko']);
  assert.equal(s.coin.symbol, 'SOL');
  assert.equal(s.sources.CoinGecko, false);
  assert.equal(s.sources.Exchange, true);
  assert.ok(s.metrics.find((m) => m.id === 'm7')!.score !== null);
  assert.ok(s.metrics.find((m) => m.id === 'm30')!.score !== null);
  assert.ok(s.coins.length >= 3);
});

test('funding: se Bybit è giù si usa OKX', async () => {
  const s = await snap('bitcoin', ['bybit']);
  assert.equal(s.metrics.find((m) => m.id === 'funding')!.value, '+0.020%');
});

test('niente dati inventati: tutto giù => nessun giudizio', async () => {
  const s = await snap('bitcoin', ['http']);
  assert.equal(s.sentiment, null);
  assert.equal(s.coverage.available, 0);
  assert.equal(s.coins.length, 0);
  assert.equal(s.regime, 'DATI INSUFFICIENTI');
  assert.equal(s.context, null);
});

test('con meno di 3 metriche non si dà un giudizio', () => {
  const m = (id: any, score: number | null): Metric => ({ id, label: id, score, value: '', detail: '' });
  assert.equal(aggregate([m('m24', 80), m('m7', 80), m('fng', null)]), null);
  assert.equal(aggregate([m('m24', 80), m('m7', 80), m('fng', 80)]), 80);
});

test('regime: volatilità alta cambia etichetta', () => {
  assert.equal(regimeFor(80, 1), 'EUFORIA');
  assert.equal(regimeFor(80, 2.5), 'EUFORIA VOLATILE');
  assert.equal(regimeFor(null, 1), 'DATI INSUFFICIENTI');
});

test('storico: 90 giorni confrontabili in 0..100; senza serie nulla (niente dati inventati)', () => {
  const fng = fngHistory.map((x) => Number(x.value));
  const series = buildHistory(dailyOf(120, 70000), dailyOf(100, 3500), fng);
  assert.equal(series.length, 90);
  assert.ok(series.every((v) => v >= 0 && v <= 100));
  assert.equal(buildHistory(null, null, null).length, 0);
  assert.equal(computeContext([]), null);
  assert.equal(computeContext(Array(10).fill(50)), null);
});

test('contesto: percentile e zone', () => {
  const base = Array.from({ length: 89 }, (_, i) => 40 + (i % 20));
  const high = computeContext([...base, 90])!;
  assert.equal(high.percentile, 100);
  assert.equal(high.zone, 'high');
  const low = computeContext([...base, 10])!;
  assert.equal(low.zone, 'low');
  assert.equal(computeContext([...base, 50])!.zone, null);
});

test('carry-over: se le fonti cadono si mostra il dato vecchio, dichiarato, per max 15 minuti', async () => {
  resetCache();
  let t = 1_000_000_000_000;
  const clock = mock.method(Date, 'now', () => t);
  try {
    const good = await getSnapshot('bitcoin', { f: mockFetch(), force: true });
    assert.equal(good.stale, false);
    t += 5 * 60_000;
    const down = await getSnapshot('bitcoin', { f: mockFetch(['http']), force: true });
    assert.equal(down.stale, true);
    assert.equal(down.coverage.available, 6);
    assert.ok(down.metrics.every((m) => m.score === null || m.stale === true || m.id === 'fng' || m.id === 'funding'));
    assert.equal(down.fetchedAt, good.fetchedAt); // l'età è quella del dato, non "adesso"
    t += 11 * 60_000; // oltre 15 minuti dal download
    const expired = await getSnapshot('bitcoin', { f: mockFetch(['http']), force: true });
    assert.equal(expired.sentiment, null);
  } finally {
    clock.mock.restore();
    resetCache();
  }
});

test('cache: richieste simultanee condividono i download; poi si usa la cache', async () => {
  resetCache();
  const log: string[] = [];
  const f = mockFetch([], log);
  const [a, b] = await Promise.all([getSnapshot('bitcoin', { f }), getSnapshot('bitcoin', { f })]);
  const after = log.length;
  assert.equal(a.coin.id, b.coin.id);
  await getSnapshot('bitcoin', { f });
  assert.equal(log.length, after);
  // cambiare moneta riusa i dati di mercato: scarica solo le candele della nuova moneta
  await getSnapshot('solana', { f });
  const extra = log.slice(after);
  assert.ok(extra.every((u) => u.includes('klines')), extra.join('\n'));
  resetCache();
});
