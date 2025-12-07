import { NextResponse } from 'next/server';

const BINANCE_API = 'https://api.binance.com/api/v3';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint') || 'ticker/24hr?symbol=BTCUSDT';
    
    // Rate limiting per IP
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const rateLimitKey = `rate_limit:binance:${ip}`;
    
    const response = await fetch(`${BINANCE_API}/${endpoint}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MarketCube-Pro/1.0',
      },
    });

    if (!response.ok) {
      console.error('Binance API error:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Binance API error', status: response.status },
        { status: 502 }
      );
    }

    const data = await response.json();
    
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
        'X-Cache': 'HIT',
      },
    });
  } catch (error) {
    console.error('Binance proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Binance', message: (error as Error).message },
      { status: 500 }
    );
  }
}
