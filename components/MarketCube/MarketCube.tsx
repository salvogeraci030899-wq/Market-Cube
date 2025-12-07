// components/MarketCube/MarketCube.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './MarketCube.module.css';

interface MarketData {
  sentiment: number;
  volatility: number;
  confidence: number;
  marketRegime: string;
  timestamp: number;
  isDemo?: boolean;
  message?: string;
  dataSources?: {
    binance: string;
    coingecko: string;
    fearGreed: string;
  };
  callsToday?: number;
  callsLimit?: number;
}

interface MarketCubeProps {
  licenseKey?: string | null;
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

export default function MarketCube({ licenseKey }: MarketCubeProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const cubeRef = useRef<HTMLDivElement>(null);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [licenseInput, setLicenseInput] = useState('');
  const animationRef = useRef<number>();

  // Funzione per generare dati demo
  const generateDemoData = (): MarketData => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    
    let baseSentiment = 50;
    
    // Ciclo giornaliero simulato
    if (hour >= 14 && hour < 22) baseSentiment = 60; // US hours
    else if (hour >= 8 && hour < 14) baseSentiment = 55; // EU hours
    else if (hour >= 0 && hour < 8) baseSentiment = 48; // Asia hours
    else baseSentiment = 52; // Weekend
    
    const minuteVariation = Math.sin(minute * 0.1) * 5;
    const randomVariation = (Math.random() - 0.5) * 10;
    
    const sentiment = Math.max(0, Math.min(100, baseSentiment + minuteVariation + randomVariation));
    const volatility = 0.8 + Math.random() * 0.8;
    const confidence = 75 + Math.random() * 20;
    
    return {
      sentiment: Math.round(sentiment * 10) / 10,
      volatility: Math.round(volatility * 100) / 100,
      confidence: Math.round(confidence),
      marketRegime: getMarketRegime(sentiment, volatility),
      timestamp: Date.now(),
      isDemo: true,
      message: 'Using demo data. Upgrade to PRO for real-time market data.',
    };
  };

  const getMarketRegime = (sentiment: number, volatility: number): string => {
    if (volatility > 2.0) {
      if (sentiment > 70) return 'PARABOLIC BULL';
      if (sentiment > 55) return 'VOLATILE NEUTRAL';
      return 'CAPITULATION';
    }
    
    if (sentiment > 70) return 'STRONG BULLISH';
    if (sentiment > 60) return 'BULLISH';
    if (sentiment > 50) return 'SLIGHTLY BULLISH';
    if (sentiment > 40) return 'SLIGHTLY BEARISH';
    if (sentiment > 30) return 'BEARISH';
    return 'STRONG BEARISH';
  };

  // Fetch dati di mercato
  const fetchMarketData = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);
      
      const headers: HeadersInit = {};
      const currentLicenseKey = licenseKey || localStorage.getItem('marketCubeLicense');
      
      if (currentLicenseKey && currentLicenseKey !== 'demo') {
        headers['X-License-Key'] = currentLicenseKey;
      }
      
      const response = await fetch(`/api/market-data?t=${forceRefresh ? Date.now() : ''}`, { headers });
      
      if (!response.ok) {
        if (response.status === 403) {
          // License expired or invalid
          localStorage.removeItem('marketCubeLicense');
          setError('License expired or invalid. Please upgrade to PRO.');
          setMarketData(generateDemoData());
          return;
        }
        if (response.status === 429) {
          setError('Rate limit exceeded. Please wait before refreshing.');
          return;
        }
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      setMarketData(data);
      
      // Se riceviamo dati demo ma abbiamo una license key valida, mostra warning
      if (data.isDemo && currentLicenseKey && currentLicenseKey.startsWith('MC-')) {
        setError('PRO features temporarily unavailable. Using demo data.');
      }
      
    } catch (err) {
      console.error('Error fetching market data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch market data');
      
      // Fallback a dati demo
      if (!marketData) {
        setMarketData(generateDemoData());
      }
    } finally {
      setLoading(false);
    }
  };

  // Inizializzazione
  useEffect(() => {
    // Controlla license key nell'URL
    const urlParams = new URLSearchParams(window.location.search);
    const urlLicenseKey = urlParams.get('key');
    
    if (urlLicenseKey) {
      localStorage.setItem('marketCubeLicense', urlLicenseKey);
      // Rimuovi key dall'URL
      window.history.replaceState({}, '', window.location.pathname);
    }
    
    // Prima fetch
    fetchMarketData();
    
    // Setup intervallo di aggiornamento
    const interval = setInterval(() => {
      fetchMarketData();
    }, marketData?.isDemo ? 60000 : 30000); // 60s per demo, 30s per PRO
    
    return () => {
      clearInterval(interval);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Animazione
  useEffect(() => {
    if (!sceneRef.current || !cubeRef.current || !marketData) return;
    
    let lastTime = 0;
    const rotationSpeed = 0.5 + marketData.volatility * 0.5;
    
    const animate = (timestamp: number) => {
      if (!lastTime) lastTime = timestamp;
      
      const delta = timestamp - lastTime;
      lastTime = timestamp;
      
      const rotationY = (timestamp * 0.001 * rotationSpeed) % 360;
      
      // Effetti visivi basati sui dati
      const baseWobble = Math.sin(timestamp * 0.001) * 0.2;
      const volatilityWobble = Math.sin(timestamp * 0.002) * 0.3 * marketData.volatility;
      const confidenceWobble = Math.sin(timestamp * 0.0015) * 0.1 * (1 - marketData.confidence / 100);
      
      // Shake per alta volatilità
      let shakeX = 0, shakeY = 0;
      if (marketData.volatility > 2.0) {
        shakeX = Math.sin(timestamp * 0.02) * 0.3;
        shakeY = Math.cos(timestamp * 0.017) * 0.3;
      }
      
      // Vibrazione per bassa confidence
      let vibrationX = 0, vibrationY = 0;
      if (marketData.confidence < 70) {
        vibrationX = Math.sin(timestamp * 0.015) * (1 - marketData.confidence / 100);
        vibrationY = Math.cos(timestamp * 0.012) * (1 - marketData.confidence / 100);
      }
      
      cubeRef.current!.style.transform = `
        rotateX(${15 + baseWobble + volatilityWobble + confidenceWobble}deg)
        rotateY(${rotationY}deg)
        scale(${1 + marketData.volatility * 0.03})
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
    // Interpolazione tra colori vicini
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
    
    // Estremi
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

  // Gestione license key
  const handleLicenseSubmit = () => {
    if (!licenseInput.trim()) return;
    
    if (licenseInput === 'demo') {
      localStorage.setItem('marketCubeLicense', 'demo');
      setShowLicenseModal(false);
      fetchMarketData(true);
      return;
    }
    
    // Formato license: MC-XXXX-XXXX-XXXX o MC-XXXXXXXX
    if (!licenseInput.startsWith('MC-')) {
      setError('Invalid license format. Must start with MC-');
      return;
    }
    
    localStorage.setItem('marketCubeLicense', licenseInput);
    setShowLicenseModal(false);
    fetchMarketData(true);
  };

  const currentLicense = licenseKey || localStorage.getItem('marketCubeLicense');

  // Loading iniziale
  if (loading && !marketData) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Loading Market Cube...</p>
      </div>
    );
  }

  if (!marketData) {
    return (
      <div className={styles.errorContainer}>
        <h2>Unable to load market data</h2>
        <button onClick={() => fetchMarketData(true)}>Retry</button>
      </div>
    );
  }

  const color = getColorForSentiment(marketData.sentiment);
  const isDemo = marketData.isDemo || !currentLicense || currentLicense === 'demo';

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>MARKET CUBE</h1>
        
        {currentLicense && currentLicense !== 'demo' && (
          <span className={styles.badge}>PRO</span>
        )}
        
        {isDemo && (
          <span className={styles.demoBadge}>DEMO</span>
        )}
      </div>
      
      {/* Error/Warning Banner */}
      {error && (
        <div className={styles.error}>
          ⚠️ {error}
          <button className={styles.dismissError} onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
      
      {/* Demo Warning */}
      {isDemo && (
        <div className={styles.demoWarning}>
          <div className={styles.demoWarningContent}>
            <span>DEMO MODE - Using simulated data</span>
            <button 
              className={styles.upgradeButton}
              onClick={() => setShowLicenseModal(true)}
            >
              🔥 Upgrade to PRO
            </button>
          </div>
        </div>
      )}
      
      {/* Cube 3D */}
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
                  boxShadow: (marketData.sentiment > 80 || marketData.sentiment < 20)
                    ? `0 0 ${10 + Math.abs(marketData.sentiment - 50) / 5}px ${color}`
                    : 'none',
                }}
              />
            ))}
          </div>
        </div>
      </div>
      
      {/* Dashboard */}
      <div className={styles.dashboard}>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Sentiment</span>
            <span className={styles.statValue} style={{ color }}>
              {marketData.sentiment.toFixed(1)}
            </span>
            <div className={styles.statSubtitle}>
              {marketData.sentiment > 50 ? 'Bullish' : 'Bearish'}
            </div>
          </div>
          
          <div className={styles.stat}>
            <span className={styles.statLabel}>Volatility</span>
            <span className={styles.statValue}>
              {marketData.volatility.toFixed(2)}x
            </span>
            <div className={styles.statSubtitle}>
              {marketData.volatility > 2.0 ? 'High' : marketData.volatility > 1.0 ? 'Normal' : 'Low'}
            </div>
          </div>
          
          <div className={styles.stat}>
            <span className={styles.statLabel}>Confidence</span>
            <span className={styles.statValue}>
              {marketData.confidence.toFixed(0)}%
            </span>
            <div className={styles.statSubtitle}>
              {marketData.confidence > 80 ? 'High' : marketData.confidence > 60 ? 'Medium' : 'Low'}
            </div>
          </div>
          
          <div className={styles.stat}>
            <span className={styles.statLabel}>Regime</span>
            <span className={styles.statValue}>
              {marketData.marketRegime}
            </span>
            <div className={styles.statSubtitle}>
              {marketData.sentiment > 60 ? '🟢' : marketData.sentiment > 40 ? '🟡' : '🔴'}
            </div>
          </div>
        </div>
        
        {/* Info Bar */}
        <div className={styles.info}>
          <div className={styles.updateTime}>
            Last update: {formatTime(marketData.timestamp)}
          </div>
          
          {marketData.dataSources && (
            <div className={styles.dataSources}>
              Sources:&nbsp;
              <span className={marketData.dataSources.binance === 'online' ? styles.online : styles.offline}>
                Binance
              </span>
              &nbsp;•&nbsp;
              <span className={marketData.dataSources.coingecko === 'online' ? styles.online : styles.offline}>
                CoinGecko
              </span>
              &nbsp;•&nbsp;
              <span className={marketData.dataSources.fearGreed === 'online' ? styles.online : styles.offline}>
                Fear & Greed
              </span>
            </div>
          )}
          
          {marketData.callsToday !== undefined && (
            <div className={styles.apiUsage}>
              API calls: {marketData.callsToday}/{marketData.callsLimit || 100}
            </div>
          )}
        </div>
        
        {/* Controls */}
        <div className={styles.controls}>
          <button 
            className={styles.refreshButton}
            onClick={() => fetchMarketData(true)}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className={styles.spinnerSmall}></span>
                Updating...
              </>
            ) : (
              '🔄 Refresh Data'
            )}
          </button>
          
          {isDemo ? (
            <button 
              className={styles.purchaseButton}
              onClick={() => setShowLicenseModal(true)}
            >
              🔥 Upgrade to PRO
            </button>
          ) : (
            <button 
              className={styles.licenseButton}
              onClick={() => setShowLicenseModal(true)}
            >
              🔑 License Settings
            </button>
          )}
          
          <button 
            className={styles.infoButton}
            onClick={() => window.open('https://marketcube.io/info', '_blank')}
          >
            ℹ️ How to Read
          </button>
        </div>
        
        {/* Message */}
        {marketData.message && (
          <div className={styles.message}>
            ℹ️ {marketData.message}
          </div>
        )}
      </div>
      
      {/* License Modal */}
      {showLicenseModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>
              {isDemo ? '🔓 Activate PRO Version' : '🔑 License Management'}
            </h2>
            
            <div className={styles.modalContent}>
              <p>Enter your license key to unlock real-time market data:</p>
              
              <input
                type="text"
                placeholder="MC-XXXX-XXXX-XXXX"
                value={licenseInput}
                onChange={(e) => setLicenseInput(e.target.value.toUpperCase())}
                className={styles.licenseInput}
              />
              
              <div className={styles.modalButtons}>
                <button 
                  className={styles.modalButtonPrimary}
                  onClick={handleLicenseSubmit}
                >
                  Activate License
                </button>
                
                <button 
                  className={styles.modalButtonSecondary}
                  onClick={() => {
                    setLicenseInput('demo');
                    handleLicenseSubmit();
                  }}
                >
                  Continue in Demo
                </button>
                
                <button 
                  className={styles.modalButtonTertiary}
                  onClick={() => setShowLicenseModal(false)}
                >
                  Cancel
                </button>
              </div>
              
              <div className={styles.licenseInfo}>
                <p>Don't have a license? <a href="/purchase" target="_blank">Get PRO Version</a></p>
                <p className={styles.licenseHint}>
                  License key format: MC- followed by 12 characters<br/>
                  You'll receive your key via email after purchase
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Color Legend */}
      <div className={styles.colorLegend}>
        <div className={styles.legendTitle}>Sentiment Scale:</div>
        <div className={styles.colorScale}>
          {COLOR_RANGES.map((range, index) => (
            <div 
              key={index}
              className={styles.colorItem}
              style={{ backgroundColor: range.color }}
              title={range.label}
            />
          ))}
        </div>
        <div className={styles.legendLabels}>
          <span>PANIC</span>
          <span>NEUTRAL</span>
          <span>FOMO</span>
        </div>
      </div>
    </div>
  );
}