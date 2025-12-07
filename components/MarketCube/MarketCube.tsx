'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './MarketCube.module.css';

interface MarketData {
  sentiment: number;
  volatility: number;
  confidence: number;
  marketRegime: string;
  timestamp: number;
  lastUpdated: string;
  isDemo?: boolean;
  message?: string;
  licenseTier?: string;
  callsToday?: number;
  callsLimit?: number;
  dataSources?: {
    binance: string;
    coingecko: string;
    fearGreed: string;
  };
}

const COLOR_RANGES = [
  { min: 85, color: 'rgba(0, 255, 136, 0.95)', label: 'FOMO ESTREMO' },
  { min: 75, color: 'rgba(0, 204, 255, 0.90)', label: 'OTTIMISMO FORTE' },
  { min: 65, color: 'rgba(100, 149, 237, 0.85)', label: 'OTTIMISMO' },
  { min: 55, color: 'rgba(157, 78, 221, 0.80)', label: 'LEGGERO OTTIMISMO' },
  { min: 45, color: 'rgba(138, 43, 226, 0.75)', label: 'NEUTRO-POSITIVO' },
  { min: 40, color: 'rgba(186, 85, 211, 0.70)', label: 'NEUTRO-NEGATIVO' },
  { min: 35, color: 'rgba(255, 140, 0, 0.65)', label: 'CAUTELA' },
  { min: 30, color: 'rgba(255, 69, 0, 0.60)', label: 'PESSIMISMO' },
  { min: 20, color: 'rgba(220, 20, 60, 0.55)', label: 'PESSIMISMO FORTE' },
  { min: 0,  color: 'rgba(139, 0, 0, 0.50)', label: 'PANICO' }
];

export default function MarketCube() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const cubeRef = useRef<HTMLDivElement>(null);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const animationRef = useRef<number>();
  const rotationSpeedRef = useRef(1.0);

  // Ottieni license key da localStorage o URL
  const getLicenseKey = () => {
    if (typeof window === 'undefined') return null;
    
    const urlParams = new URLSearchParams(window.location.search);
    const urlKey = urlParams.get('key');
    const storedKey = localStorage.getItem('marketCubeLicense');
    
    return urlKey || storedKey;
  };

  // Salva license key
  const saveLicenseKey = (key: string) => {
    localStorage.setItem('marketCubeLicense', key);
  };

  // Fetch dati di mercato
  const fetchMarketData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const licenseKey = getLicenseKey();
      const headers: HeadersInit = {};
      
      if (licenseKey) {
        headers['X-License-Key'] = licenseKey;
      }
      
      const response = await fetch('/api/market-data', { headers });
      
      if (!response.ok) {
        if (response.status === 403 || response.status === 429) {
          const data = await response.json();
          throw new Error(data.error || 'License error');
        }
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      setMarketData(data);
      
      // Aggiorna velocità di rotazione basata sulla volatilità
      rotationSpeedRef.current = 0.5 + (data.volatility || 1) * 0.5;
      
    } catch (err) {
      console.error('Error fetching market data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      
      // Fallback a dati demo se non ci sono già
      if (!marketData) {
        setMarketData({
          sentiment: 50,
          volatility: 1.0,
          confidence: 70,
          marketRegime: 'NEUTRAL',
          timestamp: Date.now(),
          lastUpdated: new Date().toISOString(),
          isDemo: true,
          message: 'Using demo data due to connection issues',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Setup iniziale
  useEffect(() => {
    // Controlla se c'è una license key nell'URL e salvala
    const urlParams = new URLSearchParams(window.location.search);
    const urlKey = urlParams.get('key');
    
    if (urlKey) {
      saveLicenseKey(urlKey);
      // Rimuovi key dall'URL per sicurezza
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    fetchMarketData();
    
    // Aggiorna ogni 30 secondi per dati reali, ogni 60 per demo
    const interval = setInterval(fetchMarketData, marketData?.isDemo ? 60000 : 30000);
    
    return () => {
      clearInterval(interval);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Animazione
  useEffect(() => {
    if (!sceneRef.current || !cubeRef.current) return;
    
    let lastTime = 0;
    
    const animate = (timestamp: number) => {
      if (!lastTime) lastTime = timestamp;
      
      const delta = timestamp - lastTime;
      lastTime = timestamp;
      
      const rotationY = (timestamp * 0.001 * rotationSpeedRef.current) % 360;
      
      // Aggiungi effetto wobble basato sulla volatilità
      const wobbleX = Math.sin(timestamp * 0.001) * 0.2;
      const wobbleY = Math.cos(timestamp * 0.0015) * 0.15;
      
      // Effetto shake se volatilità alta
      let shakeX = 0, shakeY = 0;
      if (marketData && marketData.volatility > 2.0) {
        shakeX = Math.sin(timestamp * 0.02) * 0.3;
        shakeY = Math.cos(timestamp * 0.017) * 0.3;
      }
      
      // Effetto vibrazione se confidence bassa
      let vibrationX = 0, vibrationY = 0;
      if (marketData && marketData.confidence < 70) {
        vibrationX = Math.sin(timestamp * 0.015) * 0.2;
        vibrationY = Math.cos(timestamp * 0.012) * 0.2;
      }
      
      cubeRef.current.style.transform = `
        rotateX(${15 + wobbleX + shakeX}deg)
        rotateY(${rotationY}deg)
        scale(${1 + (marketData?.volatility || 1) * 0.03})
        translate(${vibrationX + shakeX}px, ${vibrationY + shakeY}px)
      `;
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [marketData]);

  // Calcola colore basato sul sentiment
  const getColorForSentiment = (sentiment: number) => {
    for (let i = 0; i < COLOR_RANGES.length - 1; i++) {
      const current = COLOR_RANGES[i];
      const next = COLOR_RANGES[i + 1];
      
      if (sentiment >= current.min && sentiment < next.min) {
        const range = next.min - current.min;
        const position = (sentiment - current.min) / range;
        
        // Parse colors
        const curColor = hexToRgb(current.color);
        const nextColor = hexToRgb(next.color);
        
        // Interpolazione lineare
        const r = Math.round(curColor.r + (nextColor.r - curColor.r) * position);
        const g = Math.round(curColor.g + (nextColor.g - curColor.g) * position);
        const b = Math.round(curColor.b + (nextColor.b - curColor.b) * position);
        const a = curColor.a + (nextColor.a - curColor.a) * position;
        
        return `rgba(${r}, ${g}, ${b}, ${a})`;
      }
    }
    
    return sentiment >= COLOR_RANGES[0].min 
      ? COLOR_RANGES[0].color 
      : COLOR_RANGES[COLOR_RANGES.length - 1].color;
  };

  const hexToRgb = (hex: string) => {
    const match = hex.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*(\d*\.?\d+)?\)/);
    if (match) {
      return {
        r: parseInt(match[1]),
        g: parseInt(match[2]),
        b: parseInt(match[3]),
        a: parseFloat(match[4]) || 1
      };
    }
    return { r: 138, g: 43, b: 226, a: 0.75 }; // Default viola
  };

  // Formatta data
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  if (loading && !marketData) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Caricamento dati di mercato...</p>
      </div>
    );
  }

  const color = marketData ? getColorForSentiment(marketData.sentiment) : COLOR_RANGES[4].color;
  const isDemo = marketData?.isDemo || false;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>MARKET CUBE</h1>
        {marketData?.licenseTier && (
          <span className={styles.badge}>
            {marketData.licenseTier.toUpperCase()}
          </span>
        )}
      </div>
      
      {error && (
        <div className={styles.error}>
          ⚠️ {error}
        </div>
      )}
      
      {isDemo && (
        <div className={styles.demoWarning}>
          <div className={styles.demoWarningContent}>
            <span>DEMO MODE</span>
            <a href="/purchase" className={styles.upgradeLink}>
              🔥 Upgrade to PRO for real-time data
            </a>
          </div>
        </div>
      )}
      
      <div className={styles.sceneContainer}>
        <div className={styles.scene} ref={sceneRef}>
          <div className={styles.cube} ref={cubeRef}>
            {['front', 'back', 'right', 'left', 'top', 'bottom'].map((face) => (
              <div
                key={face}
                className={styles.face}
                style={{
                  backgroundColor: color,
                  borderColor: color.replace(')', ', 0.4)').replace('rgba', 'rgba'),
                  boxShadow: marketData && (marketData.sentiment > 80 || marketData.sentiment < 20)
                    ? `0 0 ${10 + Math.abs(marketData.sentiment - 50) / 5}px ${color}`
                    : 'none',
                }}
              />
            ))}
          </div>
        </div>
      </div>
      
      {marketData && (
        <div className={styles.dashboard}>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Sentiment</span>
              <span className={styles.statValue} style={{ color }}>
                {marketData.sentiment.toFixed(1)}
              </span>
            </div>
            
            <div className={styles.stat}>
              <span className={styles.statLabel}>Volatility</span>
              <span className={styles.statValue}>
                {marketData.volatility.toFixed(2)}x
              </span>
            </div>
            
            <div className={styles.stat}>
              <span className={styles.statLabel}>Confidence</span>
              <span className={styles.statValue}>
                {marketData.confidence.toFixed(0)}%
              </span>
            </div>
            
            <div className={styles.stat}>
              <span className={styles.statLabel}>Regime</span>
              <span className={styles.statValue}>
                {marketData.marketRegime}
              </span>
            </div>
          </div>
          
          <div className={styles.info}>
            <div className={styles.updateTime}>
              Last update: {formatTime(marketData.timestamp)}
            </div>
            
            {marketData.callsToday !== undefined && (
              <div className={styles.apiUsage}>
                API calls: {marketData.callsToday}/{marketData.callsLimit || 100}
              </div>
            )}
            
            {marketData.dataSources && (
              <div className={styles.dataSources}>
                Sources:{' '}
                <span className={marketData.dataSources.binance === 'online' ? styles.online : styles.offline}>
                  Binance
                </span>{' '}
                <span className={marketData.dataSources.coingecko === 'online' ? styles.online : styles.offline}>
                  CoinGecko
                </span>{' '}
                <span className={marketData.dataSources.fearGreed === 'online' ? styles.online : styles.offline}>
                  Fear & Greed
                </span>
              </div>
            )}
          </div>
          
          <div className={styles.controls}>
            <button 
              className={styles.refreshButton}
              onClick={fetchMarketData}
              disabled={loading}
            >
              {loading ? '🔄 Updating...' : '🔄 Refresh Data'}
            </button>
            
            {isDemo && (
              <a href="/purchase" className={styles.purchaseButton}>
                🔥 Upgrade to PRO
              </a>
            )}
          </div>
          
          {marketData.message && (
            <div className={styles.message}>
              ℹ️ {marketData.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
