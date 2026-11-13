import { NextResponse } from 'next/server';
import { getSnapshot } from '@/lib/market';

// Mai prerenderizzata: i dati vanno letti a ogni richiesta (con cache in memoria di 60s in lib/market).
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = await getSnapshot();
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (error) {
    console.error('market-data error:', error);
    return NextResponse.json({ error: 'Impossibile ottenere i dati di mercato' }, { status: 502 });
  }
}
