import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const response = await fetch('https://api.alternative.me/fng/?limit=10&format=json', {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MarketCube-Pro/1.0',
      },
    });

    if (!response.ok) {
      // Fallback a dati storici se API down
      return NextResponse.json(generateFakeFearGreedData(), {
        headers: {
          'Cache-Control': 'public, s-maxage=300',
          'X-Cache': 'FALLBACK',
        },
      });
    }

    const data = await response.json();
    
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'X-Cache': 'HIT',
      },
    });
  } catch (error) {
    console.error('Alternative.me proxy error:', error);
    return NextResponse.json(generateFakeFearGreedData(), {
      headers: {
        'Cache-Control': 'public, s-maxage=300',
        'X-Cache': 'FALLBACK',
      },
    });
  }
}

function generateFakeFearGreedData() {
  const values = [65, 68, 72, 70, 67, 65, 63, 60, 58, 55];
  const classifications = ['Greed', 'Greed', 'Greed', 'Greed', 'Neutral', 'Neutral', 'Neutral', 'Fear', 'Fear', 'Fear'];
  
  return {
    name: 'Alternative Fear and Greed Index',
    data: values.map((value, i) => ({
      value: value.toString(),
      value_classification: classifications[i],
      timestamp: Date.now() - (i * 24 * 60 * 60 * 1000),
    })),
    metadata: { error: 'Using fallback data' },
  };
}
