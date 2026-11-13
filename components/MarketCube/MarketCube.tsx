'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './MarketCube.module.css';
import { NO_DATA_COLOR, scoreLabel, scoreToColor } from '@/lib/palette';
import type { MetricId, Snapshot } from '@/lib/market';

const REFRESH_MS = 60_000;
const HISTORY_MAX = 90;
const IDLE_RESUME_MS = 6000;

// Quale metrica sta su quale faccia, e come ruotare il cubo per portarla di fronte.
const FACES: Array<{ id: MetricId; cls: string; view: { rx: number; ry: number } }> = [
  { id: 'btc', cls: 'front', view: { rx: 12, ry: 0 } },
  { id: 'eth', cls: 'back', view: { rx: 12, ry: 180 } },
  { id: 'fng', cls: 'right', view: { rx: 12, ry: -90 } },
  { id: 'trend', cls: 'left', view: { rx: 12, ry: 90 } },
  { id: 'breadth', cls: 'top', view: { rx: -80, ry: 0 } },
  { id: 'funding', cls: 'bottom', view: { rx: 80, ry: 0 } },
];

const shortestDelta = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className={styles.muted}>raccolta storico…</span>;
  const w = 120;
  const h = 28;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - (v / 100) * h).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label="Andamento del sentiment in questa sessione">
      <line x1="0" x2={w} y1={h / 2} y2={h / 2} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 3" />
      <polyline points={pts} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" />
    </svg>
  );
}

export default function MarketCube() {
  const cubeRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<number[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const dataRef = useRef<Snapshot | null>(null);
  dataRef.current = data;

  // ---- caricamento dati (solo dal nostro endpoint; nessun fallback inventato)
  const inflight = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setLoading(true);
    try {
      const res = await fetch('/api/market-data', { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`Errore server (${res.status})`);
      const snap: Snapshot = await res.json();
      setData(snap);
      setError(null);
      if (snap.sentiment !== null && !snap.stale) {
        setHistory((h) => [...h, snap.sentiment as number].slice(-HISTORY_MAX));
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Errore di rete');
    } finally {
      if (inflight.current === ctrl) setLoading(false);
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
      inflight.current?.abort();
    };
  }, [load]);

  // ---- animazione del cubo
  const vol = data?.volatility.index ?? 1;
  const coverage = data ? data.coverage.available / data.coverage.total : 1;
  const motion = useRef({ vol: 1, coverage: 1 });
  motion.current = { vol, coverage };

  const rot = useRef({ rx: 12, ry: -25 });
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
          const speed = reduce ? 4 : 6 + v * 8; // gradi/secondo: più volatilità = più veloce
          r.ry = (r.ry + (speed * dt) / 1000) % 360;
          r.rx += (12 - r.rx) * Math.min(1, dt * 0.004);
        }
      }

      let wobble = 0;
      let jx = 0;
      let jy = 0;
      if (!reduce) {
        wobble = Math.sin(t * 0.0012) * (1 + v) * 1.2;
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
            <button className={styles.button} onClick={load}>
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
        <span className={`${styles.badge} ${outdated ? styles.badgeStale : ''}`}>
          {outdated ? 'DATI VECCHI' : 'LIVE'}
        </span>
      </header>

      {outdated && (
        <div className={styles.warning} role="status">
          {data.stale
            ? `Le fonti non rispondono: mostro l'ultimo dato valido (${age}).`
            : `Aggiornamento fallito (${error}). Mostro l'ultimo dato (${age}).`}
        </div>
      )}

      <section className={styles.stage} aria-label="Cubo 3D del sentiment: trascina per ruotarlo">
        <div
          className={styles.scene}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className={styles.cube} ref={cubeRef}>
            {FACES.map(({ id, cls }) => {
              const m = byId.get(id);
              const score = m?.score ?? null;
              const color = score === null ? NO_DATA_COLOR(0.55) : scoreToColor(score, 0.78);
              const strong = score !== null && (score > 80 || score < 20);
              return (
                <div
                  key={id}
                  className={`${styles.face} ${styles[cls]} ${activeFace === id ? styles.faceActive : ''}`}
                  style={{
                    backgroundColor: color,
                    boxShadow: strong ? `inset 0 0 40px ${scoreToColor(score as number, 0.9)}` : undefined,
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
          <div>
            <div className={styles.regime}>{data.regime}</div>
            <div className={styles.muted}>{sentiment === null ? 'servono almeno 3 fonti' : scoreLabel(sentiment)}</div>
          </div>
          <div className={styles.spark}>
            <Sparkline values={history} />
          </div>
        </div>

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

        <div className={styles.footer}>
          <span title="Volatilità realizzata BTC sulle ultime 24h, annualizzata. Il cubo ruota più veloce e vibra quando è alta (2x = 100%).">
            Volatilità:{' '}
            {data.volatility.annualizedPct === null
              ? 'n/d'
              : `${data.volatility.annualizedPct.toFixed(0)}% ann. (${(data.volatility.index ?? 1).toFixed(1)}x)`}
            {data.volatility.stale ? ' · precedente' : ''}
          </span>
          <span>Dominance BTC: {data.dominance === null ? 'n/d' : `${data.dominance.toFixed(1)}%`}</span>
          <span>
            Copertura: {data.coverage.available}/{data.coverage.total}
          </span>
          <span>
            Fonti:{' '}
            {Object.entries(data.sources).map(([name, ok], i) => (
              <span key={name}>
                {i > 0 && ' · '}
                <span className={ok ? styles.online : styles.offline}>{name}</span>
              </span>
            ))}
          </span>
          <span>Aggiornato {age}</span>
          <button className={styles.button} onClick={load} disabled={loading}>
            {loading ? 'Aggiorno…' : 'Aggiorna'}
          </button>
        </div>
        <p className={styles.disclaimer}>
          Indicatore informativo, non è un consiglio finanziario. Ogni faccia è un punteggio 0–100 (rosso = panico, viola =
          neutro, verde = euforia); il totale è una media pesata delle sole metriche disponibili.
        </p>
      </section>
    </main>
  );
}
