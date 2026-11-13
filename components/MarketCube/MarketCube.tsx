'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './MarketCube.module.css';
import { scoreLabel, scoreToColor, scoreToRgbVar } from '@/lib/palette';
import { fmtUsd, getSnapshot, type MetricId, type Snapshot } from '@/lib/market';

const REFRESH_MS = 60_000;
const IDLE_RESUME_MS = 6000;
const STORAGE_COIN = 'mc_coin';

// Quale metrica sta su quale faccia, e come ruotare il cubo per portarla di fronte.
const FACES: Array<{ id: MetricId; cls: string; view: { rx: number; ry: number } }> = [
  { id: 'm24', cls: 'front', view: { rx: -18, ry: 0 } },
  { id: 'm7', cls: 'back', view: { rx: -18, ry: 180 } },
  { id: 'm30', cls: 'right', view: { rx: -18, ry: -90 } },
  { id: 'fng', cls: 'left', view: { rx: -18, ry: 90 } },
  { id: 'rel', cls: 'top', view: { rx: -80, ry: 0 } },
  { id: 'funding', cls: 'bottom', view: { rx: 80, ry: 0 } },
];

const shortestDelta = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;
const cssVars = (c: string) => ({ ['--c' as string]: c }) as React.CSSProperties;

const storageGet = (k: string): string | null => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const storageSet = (k: string, v: string) => {
  try { localStorage.setItem(k, v); } catch { /* storage non disponibile */ }
};

/** Numero che "scorre" verso il nuovo valore, come il punteggio di un gioco. */
function useCountUp(target: number | null, ms = 700): number | null {
  const [v, setV] = useState<number | null>(target);
  const from = useRef<number>(target ?? 0);
  useEffect(() => {
    if (target === null) { setV(null); return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { from.current = target; setV(target); return; }
    const start = performance.now();
    const f0 = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const cur = f0 + (target - f0) * (1 - Math.pow(1 - k, 3));
      from.current = cur;
      setV(cur);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function HistoryChart({ series }: { series: number[] }) {
  const w = 540;
  const h = 56;
  const last = series[series.length - 1];
  // scala adattata all'intervallo reale dei dati, così le variazioni restano leggibili
  const lo = Math.max(0, Math.min(...series) - 4);
  const hi = Math.min(100, Math.max(...series) + 4);
  const x = (i: number) => (i / (series.length - 1)) * w;
  const y = (v: number) => h - 4 - ((v - lo) / Math.max(1, hi - lo)) * (h - 8);
  const pts = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const sorted = [...series].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * 0.1)];
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
  const col = scoreToColor(last);
  return (
    <svg className={styles.chart} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img"
         aria-label="Indice di sentiment degli ultimi 90 giorni">
      <rect x="0" y="0" width={w} height={Math.max(0, y(p90))} fill="rgba(57,255,20,0.08)" />
      <rect x="0" y={y(p10)} width={w} height={Math.max(0, h - y(p10))} fill="rgba(255,0,60,0.10)" />
      <line x1="0" x2={w} y1={y(p90)} y2={y(p90)} stroke="rgba(57,255,20,0.5)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <line x1="0" x2={w} y1={y(p10)} y2={y(p10)} stroke="rgba(255,0,60,0.5)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <polyline points={pts} fill="none" stroke={col} strokeWidth="2" vectorEffect="non-scaling-stroke"
                style={{ filter: `drop-shadow(0 0 4px ${col})` }} />
      <circle cx={x(series.length - 1)} cy={y(last)} r="5" fill="#fff" stroke={col} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function SegBar({ score, stale }: { score: number | null; stale?: boolean }) {
  const filled = score === null ? 0 : Math.max(score > 0 ? 1 : 0, Math.round(score / 10));
  return (
    <span className={styles.seg} style={{ opacity: stale ? 0.5 : 1 }} aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={i < filled ? styles.segOn : styles.segOff} />
      ))}
    </span>
  );
}

export default function MarketCube() {
  const cubeRef = useRef<HTMLDivElement>(null);
  const rosterRef = useRef<HTMLElement>(null);
  const [coinId, setCoinId] = useState('bitcoin');
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const coinRef = useRef(coinId);
  coinRef.current = coinId;
  const dataRef = useRef<Snapshot | null>(null);
  dataRef.current = data;

  // moneta salvata dall'ultima visita
  useEffect(() => {
    const saved = storageGet(STORAGE_COIN);
    if (saved) setCoinId(saved);
    setReady(true);
  }, []);

  // ---- caricamento dati: direttamente dal browser verso le API pubbliche (nessun server, nessun dato inventato)
  const reqId = useRef(0);
  const load = useCallback(async (force = false) => {
    const id = ++reqId.current;
    const wanted = coinRef.current;
    setLoading(true);
    try {
      const snap = await getSnapshot(wanted, { force });
      if (id !== reqId.current) return; // risposta superata da una richiesta più recente
      setData(snap);
      setError(null);
      // la moneta richiesta non è più nella lista (es. uscita dalle prime 20): si allinea a quella mostrata
      if (snap.coin.id !== wanted && snap.coins.length > 0) setCoinId(snap.coin.id);
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : 'Errore di rete');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [coinId, ready, load]);

  useEffect(() => {
    if (!ready) return;
    const poll = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 5000);
    const onVisible = () => {
      const d = dataRef.current;
      if (!document.hidden && (!d || Date.now() - d.fetchedAt > REFRESH_MS)) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready, load]);

  const selectCoin = (id: string) => {
    if (id === coinRef.current) return;
    storageSet(STORAGE_COIN, id);
    setCoinId(id);
  };

  // la tessera selezionata resta visibile nella fila scorrevole
  useEffect(() => {
    // scorrimento solo orizzontale della fila (scrollIntoView farebbe scorrere anche la pagina)
    const row = rosterRef.current;
    const el = row?.querySelector<HTMLElement>('[aria-current="true"]');
    if (row && el && row.scrollWidth > row.clientWidth) {
      row.scrollTo({ left: el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
    }
  }, [coinId, data?.coins.length]);

  // ---- zona estrema, titolo della scheda e avvisi
  const zone = data?.context?.zone ?? null;
  const [alertsOn, setAlertsOn] = useState(false);
  const [alertsSupported, setAlertsSupported] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      const ok = typeof Notification !== 'undefined';
      setAlertsSupported(ok);
      setAlertsOn(ok && storageGet('mc_alerts') === '1' && Notification.permission === 'granted');
    } catch {
      /* gli avvisi restano spenti */
    }
  }, []);

  const toggleAlerts = async () => {
    setAlertMsg(null);
    if (alertsOn) {
      setAlertsOn(false);
      storageSet('mc_alerts', '0');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setAlertsOn(true);
        storageSet('mc_alerts', '1');
      } else {
        setAlertMsg('Il browser ha negato il permesso per le notifiche.');
      }
    } catch {
      setAlertMsg('Notifiche non supportate da questo browser.');
    }
  };

  useEffect(() => {
    if (!data) return;
    const score = data.sentiment === null ? '—' : Math.round(data.sentiment);
    document.title = `${data.coin.symbol} ${score}${zone === 'high' ? ' ▲' : zone === 'low' ? ' ▼' : ''} · Market Cube`;

    // avvisa solo al cambio di zona di quella moneta (anche tra un ricaricamento e l'altro), mai a ogni aggiornamento
    const key = `mc_zone:${data.coin.id}`;
    const cur = zone ?? 'none';
    if (cur === storageGet(key)) return;
    storageSet(key, cur);
    const ctx = data.context;
    if (zone && ctx && alertsOn && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const pct = Math.round(zone === 'high' ? ctx.percentile : 100 - ctx.percentile);
      new Notification(`${data.coin.symbol}: ${zone === 'high' ? 'zona alta' : 'zona bassa'}`, {
        body: `Il sentiment di ${data.coin.name} è ${zone === 'high' ? 'più alto' : 'più basso'} del ${pct}% degli ultimi ${ctx.days - 1} giorni (oggi ${ctx.today.toFixed(0)}).`,
      });
    }
  }, [data, zone, alertsOn]);

  // ---- animazione del cubo
  const vol = data?.volatility.index ?? 1;
  const coverage = data ? data.coverage.available / data.coverage.total : 1;
  const motion = useRef({ vol: 1, coverage: 1 });
  motion.current = { vol, coverage };

  const rot = useRef({ rx: -18, ry: -25 });
  const focus = useRef<{ rx: number; ry: number } | null>(null);
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const lastInteraction = useRef(0);
  const [activeFace, setActiveFace] = useState<MetricId | null>(null);

  const hasData = data !== null; // il cubo esiste nel DOM solo dopo il primo caricamento
  useEffect(() => {
    const el = cubeRef.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = 0;

    const frame = (t: number) => {
      const dt = last ? Math.min(t - last, 100) : 16;
      last = t;
      const { vol: v, coverage: cov } = motion.current;
      const r = rot.current;

      if (drag.current === null) {
        if (focus.current) {
          r.ry += shortestDelta(r.ry, focus.current.ry) * Math.min(1, dt * 0.008);
          r.rx += (focus.current.rx - r.rx) * Math.min(1, dt * 0.008);
          if (performance.now() - lastInteraction.current > IDLE_RESUME_MS) {
            focus.current = null;
            setActiveFace(null);
          }
        } else {
          r.ry = (r.ry + ((18 + v * 9) * dt) / 1000) % 360; // più volatilità = più veloce
          r.rx += (-18 - r.rx) * Math.min(1, dt * 0.004);
        }
      }

      let wobble = 0;
      let jx = 0;
      let jy = 0;
      if (!reduce) {
        wobble = Math.sin(t * 0.0012) * (1 + v) * 2.5;
        if (v >= 2) {
          jx = Math.sin(t * 0.021) * 1.2;
          jy = Math.cos(t * 0.017) * 1.2;
        }
        if (cov < 0.7) {
          jx += Math.sin(t * 0.015) * (1 - cov) * 3;
          jy += Math.cos(t * 0.012) * (1 - cov) * 3;
        }
      }
      el.style.transform = `translate(${jx}px, ${jy}px) scale(${1 + (v - 1) * 0.03}) rotateX(${r.rx + wobble}deg) rotateY(${r.ry}deg)`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [hasData]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    focus.current = null;
    setActiveFace(null);
    lastInteraction.current = performance.now();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    rot.current.ry += (e.clientX - d.x) * 0.5;
    rot.current.rx = Math.max(-90, Math.min(90, rot.current.rx - (e.clientY - d.y) * 0.5));
    d.x = e.clientX;
    d.y = e.clientY;
  };
  const endDrag = () => {
    drag.current = null;
  };
  const showFace = (id: MetricId) => {
    const f = FACES.find((x) => x.id === id);
    if (!f) return;
    focus.current = f.view;
    lastInteraction.current = performance.now();
    setActiveFace(id);
  };

  const shown = useCountUp(data?.sentiment ?? null);

  // ---- render
  if (!data) {
    return (
      <div className={styles.center}>
        {error ? (
          <>
            <h2 className={styles.centerTitle}>// LINK PERSO</h2>
            <p className={styles.muted}>{error}</p>
            <button className={styles.button} onClick={() => load(true)}>Riprova</button>
          </>
        ) : (
          <>
            <div className={styles.spinner} />
            <p className={styles.muted}>CONNESSIONE AI MERCATI…</p>
          </>
        )}
      </div>
    );
  }

  const sentiment = data.sentiment;
  const headVar = scoreToRgbVar(sentiment);
  const headColor = sentiment === null ? 'rgb(110,110,125)' : scoreToColor(sentiment);
  const ageSec = Math.max(0, Math.round((now - data.fetchedAt) / 1000));
  const age = ageSec < 90 ? `${ageSec}s fa` : `${Math.round(ageSec / 60)} min fa`;
  const outdated = data.stale || error !== null;
  const noData = data.coverage.available === 0;
  const switching = loading && data.coin.id !== coinId;
  const byId = new Map(data.metrics.map((m) => [m.id, m]));
  const ctx = data.context;

  return (
    <main className={`${styles.container} ${switching ? styles.switching : ''}`} style={cssVars(headVar)}>
      <div className={styles.sweep} aria-hidden="true" />

      <header className={styles.topbar}>
        <h1 className={styles.title}>
          MARKET<span className={styles.slashes}>//</span>CUBE
        </h1>
        <span className={`${styles.status} ${outdated || noData ? styles.statusWarn : ''}`}>
          <i className={styles.dot} />
          {noData ? 'NESSUN DATO' : outdated ? 'DATI VECCHI' : 'ONLINE'}
        </span>
      </header>

      {outdated && (
        <div className={styles.warning} role="status">
          {data.stale
            ? `Le fonti non rispondono: ultimo dato valido (${age}).`
            : `Aggiornamento fallito (${error}). Ultimo dato (${age}).`}
        </div>
      )}

      <nav className={styles.roster} ref={rosterRef} aria-label="Scegli la moneta">
        {data.coins.map((c) => (
          <button
            key={c.id}
            className={`${styles.tile} ${c.id === data.coin.id ? styles.tileOn : ''}`}
            style={cssVars(scoreToRgbVar(c.score))}
            onClick={() => selectCoin(c.id)}
            aria-current={c.id === data.coin.id ? 'true' : undefined}
            title={`${c.name} · ${fmtUsd(c.price)}`}
          >
            <span className={styles.tileSym}>{c.symbol}</span>
            <span className={styles.tileScore}>{c.score === null ? '--' : Math.round(c.score)}</span>
            <span className={c.change24h >= 0 ? styles.up : styles.down}>
              {c.change24h >= 0 ? '▲' : '▼'} {Math.abs(c.change24h).toFixed(1)}%
            </span>
          </button>
        ))}
      </nav>

      <div className={styles.layout}>
        <section className={styles.stage} aria-label="Cubo 3D del sentiment: trascina per ruotarlo">
          <div className={styles.floorWrap} aria-hidden="true">
            <div className={styles.floor} />
          </div>
          <div className={styles.target}>
            <span>TARGET</span> {data.coin.symbol} <i>·</i> {data.coin.name} <i>·</i> {data.coin.price ? fmtUsd(data.coin.price) : '—'}
          </div>
          <div
            className={`${styles.scene} ${zone ? styles.zoneGlow : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className={styles.cube} ref={cubeRef}>
              {FACES.map(({ id, cls }) => {
                const m = byId.get(id);
                const score = m?.score ?? null;
                return (
                  <div
                    key={id}
                    className={`${styles.face} ${styles[cls]} ${activeFace === id ? styles.faceActive : ''}`}
                    style={cssVars(scoreToRgbVar(score))}
                  >
                    <span className={styles.faceLabel}>{m?.label ?? id}</span>
                    <span className={styles.faceValue}>{m?.value ?? 'n/d'}</span>
                    {m?.stale && <span className={styles.faceStale}>dato precedente</span>}
                  </div>
                );
              })}
            </div>
          </div>
          <p className={styles.hint}>TRASCINA PER RUOTARE · TOCCA UNA METRICA PER MIRARLA</p>
        </section>

        <section className={styles.panel}>
          <div className={`${styles.hud} ${styles.scoreBlock}`}>
            <div className={styles.scoreCol}>
              <span className={styles.tag}>SENTIMENT · {data.coin.symbol}</span>
              <div key={`${data.coin.id}-${sentiment === null ? 'x' : Math.round(sentiment)}`} className={`${styles.score} ${styles.glitch}`}>
                {shown === null ? '--' : Math.round(shown)}
                <small>/100</small>
              </div>
            </div>
            <div className={styles.statusCol}>
              <span className={styles.regime} style={{ color: headColor, borderColor: headColor }}>
                {data.regime}
              </span>
              {sentiment !== null && scoreLabel(sentiment) !== data.regime && (
                <span className={styles.muted}>{scoreLabel(sentiment)}</span>
              )}
              {sentiment === null && <span className={styles.muted}>servono almeno 3 fonti</span>}
            </div>
          </div>

          {zone && ctx && (
            <div className={`${styles.alert} ${zone === 'high' ? styles.alertHigh : styles.alertLow}`} role="alert">
              <b>⚠ ALLERTA · {zone === 'high' ? 'ZONA ALTA' : 'ZONA BASSA'}</b>
              <span>
                {data.coin.symbol} è {zone === 'high' ? 'più alto' : 'più basso'} del{' '}
                {Math.round(zone === 'high' ? ctx.percentile : 100 - ctx.percentile)}% degli ultimi {ctx.days - 1} giorni
              </span>
            </div>
          )}

          <div className={styles.hud}>
            {ctx ? (
              <>
                <div className={styles.historyHead}>
                  <span className={styles.tag}>STORICO {ctx.days}G</span>
                  <span className={styles.historyNote}>
                    OGGI {ctx.today.toFixed(0)} · MIN {ctx.min.toFixed(0)} · MAX {ctx.max.toFixed(0)}
                  </span>
                </div>
                <HistoryChart series={ctx.series} />
                <div className={styles.historyText}>
                  Oggi è {ctx.percentile >= 50 ? 'più alto' : 'più basso'} del{' '}
                  <b>{Math.round(ctx.percentile >= 50 ? ctx.percentile : 100 - ctx.percentile)}%</b> degli ultimi {ctx.days - 1} giorni.
                </div>
              </>
            ) : (
              <span className={styles.muted}>Storico a 90 giorni non disponibile per {data.coin.symbol} (fonti non raggiungibili).</span>
            )}
          </div>

          <ul className={styles.metrics}>
            {data.metrics.map((m) => (
              <li key={m.id}>
                <button
                  className={`${styles.metric} ${activeFace === m.id ? styles.metricOn : ''}`}
                  style={cssVars(scoreToRgbVar(m.score))}
                  onClick={() => showFace(m.id)}
                >
                  <span className={styles.metricName}>{m.label}</span>
                  <span className={styles.metricValue}>{m.value}</span>
                  <SegBar score={m.score} stale={m.stale} />
                  <span className={styles.metricDetail}>{m.stale ? `${m.detail} · precedente` : m.detail}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className={styles.chips}>
            <span
              className={styles.chip}
              title="Volatilità realizzata nelle ultime 24h (annualizzata) rapportata alla norma degli ultimi 90 giorni della moneta. Il cubo ruota più veloce e vibra quando è alta (2x = doppia del normale)."
            >
              VOLATILITÀ{' '}
              <b>
                {data.volatility.annualizedPct === null
                  ? 'n/d'
                  : `${data.volatility.annualizedPct.toFixed(0)}% (${(data.volatility.index ?? 1).toFixed(1)}x)`}
              </b>
            </span>
            <span className={styles.chip}>
              DOMINANCE BTC <b>{data.dominance === null ? 'n/d' : `${data.dominance.toFixed(1)}%`}</b>
            </span>
            <span className={styles.chip}>
              COPERTURA{' '}
              <b>
                {data.coverage.available}/{data.coverage.total}
              </b>
            </span>
          </div>

          <div className={styles.footer}>
            <span className={styles.sources}>
              {Object.entries(data.sources).map(([name, ok]) => (
                <span key={name} className={ok ? styles.online : styles.offline} title={ok ? 'online' : 'non raggiungibile'}>
                  ● {name}
                </span>
              ))}
            </span>
            {alertsSupported && (
              <button
                className={`${styles.button} ${styles.buttonGhost}`}
                onClick={toggleAlerts}
                title="Notifica del browser quando il sentiment di una moneta entra in zona alta o bassa (funziona finché la scheda resta aperta)"
              >
                {alertsOn ? 'AVVISI: ON' : 'AVVISI: OFF'}
              </button>
            )}
            <span className={styles.muted}>AGG. {age.toUpperCase()}</span>
            <button className={styles.button} onClick={() => load(true)} disabled={loading}>
              {loading ? 'SYNC…' : 'AGGIORNA'}
            </button>
          </div>
          {alertMsg && <p className={styles.warningInline}>{alertMsg}</p>}
          <p className={styles.disclaimer}>
            Punteggio 0–100 per moneta: 24h, 7g, 30g, Fear &amp; Greed, funding e forza relativa (per BTC: ampiezza del mercato). Lo
            storico usa momentum, trend 30g, una moneta di riferimento e Fear &amp; Greed. Zona alta/bassa = tra il 10% più alto/basso
            degli ultimi 90 giorni. Indicatore informativo, non è un consiglio finanziario.
          </p>
        </section>
      </div>
    </main>
  );
}
