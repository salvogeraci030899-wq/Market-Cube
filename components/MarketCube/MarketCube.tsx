'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './MarketCube.module.css';
import { NO_DATA_COLOR, scoreLabel, scoreToColor } from '@/lib/palette';
import { getSnapshot, type MetricId, type Snapshot } from '@/lib/market';

const REFRESH_MS = 60_000;
const IDLE_RESUME_MS = 6000;

// Quale metrica sta su quale faccia, e come ruotare il cubo per portarla di fronte.
const FACES: Array<{ id: MetricId; cls: string; view: { rx: number; ry: number } }> = [
  { id: 'btc', cls: 'front', view: { rx: -18, ry: 0 } },
  { id: 'eth', cls: 'back', view: { rx: -18, ry: 180 } },
  { id: 'fng', cls: 'right', view: { rx: -18, ry: -90 } },
  { id: 'trend', cls: 'left', view: { rx: -18, ry: 90 } },
  { id: 'breadth', cls: 'top', view: { rx: -80, ry: 0 } },
  { id: 'funding', cls: 'bottom', view: { rx: 80, ry: 0 } },
];

const shortestDelta = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;

function HistoryChart({ series }: { series: number[] }) {
  const w = 540;
  const h = 52;
  const x = (i: number) => (i / (series.length - 1)) * w;
  // scala adattata all'intervallo reale dei dati, così le variazioni restano leggibili
  const lo = Math.max(0, Math.min(...series) - 4);
  const hi = Math.min(100, Math.max(...series) + 4);
  const y = (v: number) => h - 4 - ((v - lo) / Math.max(1, hi - lo)) * (h - 8);
  const pts = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = series[series.length - 1];
  const sorted = [...series].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * 0.1)];
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
  return (
    <svg className={styles.chart} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img"
         aria-label="Indice di sentiment degli ultimi 90 giorni">
      <rect x="0" y={0} width={w} height={Math.max(0, y(p90))} fill="rgba(0,255,136,0.07)" />
      <rect x="0" y={y(p10)} width={w} height={Math.max(0, h - y(p10))} fill="rgba(220,20,60,0.09)" />
      <line x1="0" x2={w} y1={y(p90)} y2={y(p90)} stroke="rgba(0,255,136,0.3)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <line x1="0" x2={w} y1={y(p10)} y2={y(p10)} stroke="rgba(255,90,90,0.3)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <polyline points={pts} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <circle cx={x(series.length - 1)} cy={y(last)} r="4.5" fill={scoreToColor(last)} stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function MarketCube() {
  const cubeRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const dataRef = useRef<Snapshot | null>(null);
  dataRef.current = data;

  // ---- caricamento dati: direttamente dal browser verso le API pubbliche (nessun server, nessun dato inventato)
  const reqId = useRef(0);
  const load = useCallback(async (force = false) => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const snap = await getSnapshot(force ? 0 : 30_000);
      if (id !== reqId.current) return; // risposta superata da una richiesta più recente
      setData(snap);
      setError(null);
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : 'Errore di rete');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
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
  }, [load]);

  // ---- zona estrema, titolo della scheda e avvisi del browser
  const zone = data?.context?.zone ?? null;
  const [alertsOn, setAlertsOn] = useState(false);
  const [alertsSupported, setAlertsSupported] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      const ok = typeof Notification !== 'undefined';
      setAlertsSupported(ok);
      setAlertsOn(ok && localStorage.getItem('mc_alerts') === '1' && Notification.permission === 'granted');
    } catch {
      /* storage non disponibile: gli avvisi restano spenti */
    }
  }, []);

  const toggleAlerts = async () => {
    setAlertMsg(null);
    if (alertsOn) {
      setAlertsOn(false);
      try { localStorage.setItem('mc_alerts', '0'); } catch { /* ignora */ }
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setAlertsOn(true);
        try { localStorage.setItem('mc_alerts', '1'); } catch { /* ignora */ }
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
    document.title = `${score}${zone === 'high' ? ' ▲' : zone === 'low' ? ' ▼' : ''} · Market Cube`;

    // avvisa solo al cambio di zona (anche tra un ricaricamento e l'altro), mai a ogni aggiornamento
    const cur = zone ?? 'none';
    let last: string | null = null;
    try { last = localStorage.getItem('mc_zone'); } catch { /* ignora */ }
    if (cur === last) return;
    try { localStorage.setItem('mc_zone', cur); } catch { /* ignora */ }
    const ctx = data.context;
    if (zone && ctx && alertsOn && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const pct = Math.round(zone === 'high' ? ctx.percentile : 100 - ctx.percentile);
      new Notification(zone === 'high' ? 'Market Cube: zona alta' : 'Market Cube: zona bassa', {
        body: `Il sentiment è ${zone === 'high' ? 'più alto' : 'più basso'} del ${pct}% degli ultimi ${ctx.days - 1} giorni (oggi ${ctx.today.toFixed(0)}).`,
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
      const interacting = drag.current !== null;

      if (!interacting) {
        if (focus.current) {
          // verso la faccia scelta, con easing
          r.ry += shortestDelta(r.ry, focus.current.ry) * Math.min(1, dt * 0.008);
          r.rx += (focus.current.rx - r.rx) * Math.min(1, dt * 0.008);
          if (performance.now() - lastInteraction.current > IDLE_RESUME_MS) {
            focus.current = null;
            setActiveFace(null);
          }
        } else {
          const speed = 20 + v * 14; // gradi/secondo: più volatilità = più veloce
          r.ry = (r.ry + (speed * dt) / 1000) % 360;
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
          // pochi dati affidabili: leggera instabilità visibile
          jx += Math.sin(t * 0.015) * (1 - cov) * 3;
          jy += Math.cos(t * 0.012) * (1 - cov) * 3;
        }
      }
      const scale = 1 + (v - 1) * 0.03;
      el.style.transform = `translate(${jx}px, ${jy}px) scale(${scale}) rotateX(${r.rx + wobble}deg) rotateY(${r.ry}deg)`;
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

  // ---- render
  if (!data) {
    return (
      <div className={styles.center}>
        {error ? (
          <>
            <h2>Dati non raggiungibili</h2>
            <p className={styles.muted}>{error}</p>
            <button className={styles.button} onClick={() => load(true)}>
              Riprova
            </button>
          </>
        ) : (
          <>
            <div className={styles.spinner} />
            <p className={styles.muted}>Carico i dati di mercato…</p>
          </>
        )}
      </div>
    );
  }

  const sentiment = data.sentiment;
  const headColor = sentiment === null ? NO_DATA_COLOR() : scoreToColor(sentiment);
  const ageSec = Math.max(0, Math.round((now - data.fetchedAt) / 1000));
  const age = ageSec < 90 ? `${ageSec}s fa` : `${Math.round(ageSec / 60)} min fa`;
  const outdated = data.stale || error !== null;
  const byId = new Map(data.metrics.map((m) => [m.id, m]));

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>MARKET CUBE</h1>
        <span className={`${styles.badge} ${outdated || data.coverage.available === 0 ? styles.badgeStale : ''}`}>
          {data.coverage.available === 0 ? 'NESSUN DATO' : outdated ? 'DATI VECCHI' : 'LIVE'}
        </span>
      </header>

      {outdated && (
        <div className={styles.warning} role="status">
          {data.stale
            ? `Le fonti non rispondono: mostro l'ultimo dato valido (${age}).`
            : `Aggiornamento fallito (${error}). Mostro l'ultimo dato (${age}).`}
        </div>
      )}

      <div className={styles.layout}>
        <section className={styles.stage} aria-label="Cubo 3D del sentiment: trascina per ruotarlo">
          <div
            className={`${styles.scene} ${zone ? styles.zoneGlow : ''}`}
            style={{ ['--glow' as string]: headColor }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className={styles.cube} ref={cubeRef}>
              {FACES.map(({ id, cls }) => {
                const m = byId.get(id);
                const score = m?.score ?? null;
                const color = score === null ? NO_DATA_COLOR(1) : scoreToColor(score, 1);
                const strong = score !== null && (score > 80 || score < 20);
                return (
                  <div
                    key={id}
                    className={`${styles.face} ${styles[cls]} ${activeFace === id ? styles.faceActive : ''}`}
                    style={{
                      backgroundColor: color,
                      boxShadow: strong ? `0 0 38px ${scoreToColor(score as number, 0.8)}` : undefined,
                    }}
                  >
                    <span className={styles.faceLabel}>{m?.label ?? id}</span>
                    <span className={styles.faceValue}>{m?.value ?? 'n/d'}</span>
                    {m?.stale && <span className={styles.faceStale}>dato precedente</span>}
                  </div>
                );
              })}
            </div>
          </div>
          <p className={styles.hint}>Trascina per ruotare · clicca una metrica per vederla sul cubo</p>
        </section>

        <section className={styles.panel}>
          <div className={styles.summary}>
            <div className={styles.score} style={{ color: headColor }}>
              {sentiment === null ? '—' : sentiment.toFixed(0)}
              <small>/100</small>
            </div>
            <div className={styles.summaryText}>
              <div className={styles.regime}>{data.regime}</div>
              {sentiment === null ? (
                <div className={styles.muted}>servono almeno 3 fonti</div>
              ) : (
                scoreLabel(sentiment) !== data.regime && <div className={styles.muted}>{scoreLabel(sentiment)}</div>
              )}
            </div>
          </div>

          {data.context ? (
            <div className={`${styles.history} ${zone ? styles.historyZone : ''}`}>
              <div className={styles.historyHead}>
                <span className={styles.historyTitle}>Ultimi {data.context.days} giorni</span>
                {zone && (
                  <span className={zone === 'high' ? styles.pillHigh : styles.pillLow}>
                    {zone === 'high' ? '▲ ZONA ALTA' : '▼ ZONA BASSA'}
                  </span>
                )}
                <span className={styles.historyNote}>
                  oggi {data.context.today.toFixed(0)} · min {data.context.min.toFixed(0)} · max {data.context.max.toFixed(0)}
                </span>
              </div>
              <HistoryChart series={data.context.series} />
              <div className={styles.historyText}>
                Oggi è {data.context.percentile >= 50 ? 'più alto' : 'più basso'} del{' '}
                <b>{Math.round(data.context.percentile >= 50 ? data.context.percentile : 100 - data.context.percentile)}%</b>{' '}
                degli ultimi {data.context.days - 1} giorni.
              </div>
            </div>
          ) : (
            <div className={styles.history}>
              <span className={styles.muted}>Storico a 90 giorni non disponibile (fonti non raggiungibili).</span>
            </div>
          )}

          <ul className={styles.metrics}>
            {data.metrics.map((m) => (
              <li key={m.id}>
                <button
                  className={`${styles.metric} ${activeFace === m.id ? styles.metricActive : ''}`}
                  onClick={() => showFace(m.id)}
                >
                  <span className={styles.metricName}>{m.label}</span>
                  <span className={styles.metricValue}>{m.value}</span>
                  <span className={styles.bar}>
                    <span
                      className={styles.barFill}
                      style={{
                        width: `${m.score ?? 0}%`,
                        background: m.score === null ? 'transparent' : scoreToColor(m.score),
                        opacity: m.stale ? 0.45 : 1,
                      }}
                    />
                  </span>
                  <span className={styles.metricDetail}>{m.stale ? `${m.detail} · precedente` : m.detail}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className={styles.chips}>
            <span
              className={styles.chip}
              title="Volatilità realizzata BTC sulle ultime 24h, annualizzata. Il cubo ruota più veloce e vibra quando è alta (2x = 100%)."
            >
              Volatilità{' '}
              <b>
                {data.volatility.annualizedPct === null
                  ? 'n/d'
                  : `${data.volatility.annualizedPct.toFixed(0)}% (${(data.volatility.index ?? 1).toFixed(1)}x)`}
              </b>
            </span>
            <span className={styles.chip}>
              Dominance BTC <b>{data.dominance === null ? 'n/d' : `${data.dominance.toFixed(1)}%`}</b>
            </span>
            <span className={styles.chip}>
              Copertura{' '}
              <b>
                {data.coverage.available}/{data.coverage.total}
              </b>
            </span>
          </div>

          <div className={styles.footer}>
            <span className={styles.sources}>
              {Object.entries(data.sources).map(([name, ok]) => (
                <span key={name} className={ok ? styles.online : styles.offline} title={ok ? 'online' : 'non raggiungibile'}>
                  ● {name.split(' (')[0]}
                </span>
              ))}
            </span>
            {alertsSupported && (
              <button
                className={`${styles.button} ${styles.buttonGhost}`}
                onClick={toggleAlerts}
                title="Notifica del browser quando il sentiment entra in zona alta o bassa (funziona finché la scheda resta aperta)"
              >
                {alertsOn ? '🔔 Avvisi attivi' : '🔕 Avvisi spenti'}
              </button>
            )}
            <span className={styles.muted}>Aggiornato {age}</span>
            <button className={styles.button} onClick={() => load(true)} disabled={loading}>
              {loading ? 'Aggiorno…' : 'Aggiorna'}
            </button>
          </div>
          {alertMsg && <p className={styles.warningInline}>{alertMsg}</p>}
          <p className={styles.disclaimer}>
            Lo storico usa BTC, ETH, trend 30g e Fear &amp; Greed (funding e ampiezza non hanno storico gratuito). Zona alta/bassa =
            tra il 10% più alto/basso degli ultimi 90 giorni. Indicatore informativo, non è un consiglio finanziario. Ogni faccia è un punteggio 0–100 (rosso = panico, viola =
            neutro, verde = euforia); il totale è la media pesata delle sole metriche disponibili.
          </p>
        </section>
      </div>
    </main>
  );
}
