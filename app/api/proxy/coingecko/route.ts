import { NextResponse } from 'next/server';

const COINGECKO_API = 'https://api.coingecko.com/api/v3';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint') || 'global';
    
    // Cache più lungo per dati meno volatili
    const response = await fetch(`${COINGECKO_API}/${endpoint}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MarketCube-Pro/1.0',
      },
    });

    if (!response.ok) {
      // Fallback a endpoint alternativi
      if (endpoint === 'global') {
        return await fetchGlobalFallback();
      }
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'X-Cache': 'HIT',
      },
    });
  } catch (error) {
    console.error('CoinGecko proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from CoinGecko' },
      { status: 500 }
    );
  }
}

async function fetchGlobalFallback() {
  // Fallback semplificato se CoinGecko è down
  return NextResponse.json({
    data: {
      active_cryptocurrencies: 8000,
      total_market_cap: { usd: 1600000000000 },
      market_cap_percentage: { btc: 52.5 },
      total_volume: { usd: 60000000000 },
      market_cap_change_percentage_24h_usd: 2.5,
    },
    isFallback: true,
  });
}
