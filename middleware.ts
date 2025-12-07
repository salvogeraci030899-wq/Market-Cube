import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Solo per le rotte app protette
  if (request.nextUrl.pathname.startsWith('/app')) {
    // Controlla la licenza
    const licenseKey = request.headers.get('x-license-key') ||
                      request.cookies.get('license_key')?.value ||
                      request.nextUrl.searchParams.get('key');

    if (!licenseKey) {
      // Reindirizza alla pagina di acquisto
      return NextResponse.redirect(new URL('/purchase', request.url));
    }

    // Verifica la licenza
    const verifyUrl = new URL('/api/license/verify', request.url);
    const verifyResponse = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ licenseKey }),
    });

    if (!verifyResponse.ok) {
      return NextResponse.redirect(new URL('/purchase?error=invalid_license', request.url));
    }

    // Aggiungi header per le API
    const response = NextResponse.next();
    response.headers.set('x-license-key', licenseKey);
    
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/app/:path*',
};
