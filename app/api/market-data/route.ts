import { NextResponse } from 'next/server';
import { getLicense, incrementApiCalls, getApiCallsToday } from '@/lib/kv';

export async function GET(request: Request) {
  try {
    // Verifica licenza
    const licenseKey = request.headers.get('x-license-key');
    
    if (!licenseKey) {
      return NextResponse.json(generateDemoData(), {
        headers: { 'X-Mode': 'DEMO' },
      });
    }

    const license = await getLicense(licenseKey);
    
    if (!license || !license.isActive) {
      return NextResponse.json(
        { error: 'Invalid or expired license' },
        { status: 403 }
      );
    }

    // Rate limiting per licenza
    const callsToday = await getApiCallsToday(licenseKey);
    if (callsToday > getMaxCallsForTier(license.plan)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded for today' },
        { status: 429 }
      );
    }

    // Incrementa contatore chiamate
    await incrementApiCalls(licenseKey);

    // Fetch dati reali dalle API
    const marketData = await fetchRealMarketData();
    
    return NextResponse.json({
      ...marketData,
      licenseTier: license.plan,
      callsToday: callsToday + 1,
      callsLimit: getMaxCallsForTier(license.plan),
    });
  } catch (error) {
    console.error('Market data API error:', error);
    return NextResponse.json(generateDemoData(), {
      headers: { 'X-Mode': 'DEMO-FALLBACK' },
    });
  }
}

function getMaxCallsForTier(tier: string): number {
  switch (tier) {
    case 'elite': return 5000;
    case 'pro': return 1000;
    case 'basic': return 500;
    default: return 100;
  }
}

async function fetchRealMarketData() {
  try {
    const [binanceData, coingeckoData, fearGreedData] = await Promise.allSettled([
      fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/proxy/binance?endpoint=ticker/24hr?symbol=BTCUSDT`),
      fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/proxy/coingecko?endpoint=global`),
      fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/proxy/alternative`),
    ]);

    // Calcola sentiment basato sui dati reali
    const sentiment = calculateSentiment(
      binanceData,
      coingeckoData,
      fearGreedData
    );

    const volatility = calculateVolatility(binanceData);
    const confidence = calculateConfidence([
      binanceData.status,
      coingeckoData.status,
      fearGreedData.status
    ]);

    return {
      sentiment: Math.max(0, Math.min(100, sentiment)),
      volatility: Math.max(0.5, Math.min(3.0, volatility)),
      confidence: Math.max(30, Math.min(100, confidence)),
      marketRegime: getMarketRegime(sentiment, volatility),
      timestamp: Date.now(),
      lastUpdated: new Date().toISOString(),
      dataSources: {
        binance: binanceData.status === 'fulfilled' ? 'online' : 'offline',
        coingecko: coingeckoData.status === 'fulfilled' ? 'online' : 'offline',
        fearGreed: fearGreedData.status === 'fulfilled' ? 'online' : 'offline',
      },
    };
  } catch (error) {
    throw error;
  }
}

function calculateSentiment(binance: any, coingecko: any, fearGreed: any): number {
  let sentiment = 50; // Base neutrale
  
  // Peso 1: Fear & Greed Index (40%)
  if (fearGreed.status === 'fulfilled' && fearGreed.value.data) {
    const fgValue = parseInt(fearGreed.value.data[0]?.value || '50');
    sentiment = sentiment * 0.6 + fgValue * 0.4;
  }
  
  // Peso 2: Bitcoin price change (30%)
  if (binance.status === 'fulfilled' && binance.value) {
    const priceChange = parseFloat(binance.value.priceChangePercent) || 0;
    const priceScore = 50 + priceChange * 2;
    sentiment = sentiment * 0.7 + priceScore * 0.3;
  }
  
  // Peso 3: Market dominance (30%)
  if (coingecko.status === 'fulfilled' && coingecko.value.data) {
    const btcDominance = coingecko.value.data.market_cap_percentage?.btc || 50;
    // BTC dominance 40-60% è healthy, fuori range è estremo
    let dominanceScore = 50;
    if (btcDominance > 65) dominanceScore = 30; // Troppo alta
    else if (btcDominance > 55) dominanceScore = 60; // Buona
    else if (btcDominance > 45) dominanceScore = 70; // Ottimale
    else if (btcDominance > 35) dominanceScore = 40; // Bassa
    else dominanceScore = 20; // Molto bassa
    
    sentiment = sentiment * 0.7 + dominanceScore * 0.3;
  }
  
  return sentiment;
}

function calculateVolatility(binanceData: any): number {
  if (binanceData.status === 'fulfilled' && binanceData.value) {
    const price = parseFloat(binanceData.value.lastPrice) || 50000;
    const high = parseFloat(binanceData.value.highPrice) || price * 1.02;
    const low = parseFloat(binanceData.value.lowPrice) || price * 0.98;
    const range = (high - low) / price;
    return Math.min(3.0, Math.max(0.5, range * 50));
  }
  return 1.0;
}

function calculateConfidence(statuses: string[]): number {
  const successful = statuses.filter(s => s === 'fulfilled').length;
  return (successful / statuses.length) * 100;
}

function getMarketRegime(sentiment: number, volatility: number): string {
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
}

function generateDemoData() {
  // Dati demo con variazione realistica nel tempo
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  // Ciclo giornaliero simulato
  let baseSentiment = 50;
  
  // Orari di trading attivi (US/EU/Asia)
  if (hour >= 14 && hour < 22) baseSentiment = 60; // US hours
  else if (hour >= 8 && hour < 14) baseSentiment = 55; // EU hours
  else if (hour >= 0 && hour < 8) baseSentiment = 48; // Asia hours
  else baseSentiment = 52; // Weekend
  
  // Aggiungi variazione basata sui minuti
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
    lastUpdated: new Date().toISOString(),
    isDemo: true,
    message: 'Upgrade to PRO for real-time data from 5 sources',
  };
}
