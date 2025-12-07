import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const licenseKey = request.headers.get('x-license-key');
    
    // Se non c'è license key, ritorna demo
    if (!licenseKey || licenseKey === 'demo') {
      return NextResponse.json(generateDemoData());
    }
    
    // Verifica license key (qui dovresti controllare nel database)
    const isValid = await verifyLicense(licenseKey);
    
    if (!isValid) {
      return NextResponse.json(generateDemoData());
    }
    
    // Fetch dati reali
    const marketData = await fetchRealMarketData();
    
    return NextResponse.json(marketData);
    
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(generateDemoData());
  }
}

async function verifyLicense(key: string): Promise<boolean> {
  // Per ora, accetta qualsiasi key che inizia con "MC-"
  return key.startsWith('MC-');
}

async function fetchRealMarketData() {
  const [binance, coingecko, fearGreed] = await Promise.all([
    fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT'),
    fetch('https://api.coingecko.com/api/v3/global'),
    fetch('https://api.alternative.me/fng/?limit=1&format=json')
  ]);
  
  // ... logica per calcolare sentiment reale
  return {
    sentiment: 65,
    volatility: 1.2,
    confidence: 85,
    marketRegime: 'BULLISH',
    timestamp: Date.now(),
    isDemo: false,
    message: 'Real-time data'
  };
}

function generateDemoData() {
  // ... stessa logica demo
}