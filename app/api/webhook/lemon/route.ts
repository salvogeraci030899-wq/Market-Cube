import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { saveLicense } from '@/lib/kv';
import { generateLicenseKey, getLicenseTier } from '@/lib/license';

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
    const signature = request.headers.get('x-signature');

    // Verifica firma
    const hmac = crypto.createHmac('sha256', secret || '');
    const digest = Buffer.from(hmac.update(body).digest('hex'), 'utf8');
    const signatureBuffer = Buffer.from(signature || '', 'utf8');
    
    if (!crypto.timingSafeEqual(digest, signatureBuffer)) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const data = JSON.parse(body);
    const eventName = data.meta?.event_name;
    
    // Gestione eventi
    if (eventName === 'order_created') {
      const order = data.data.attributes;
      const variantId = order.variant_id;
      const customerEmail = order.customer_email;
      const total = order.total_usd_cents / 100; // Converti in euro
      
      // Genera o usa license key esistente
      let licenseKey = data.meta?.custom_data?.license_key || generateLicenseKey();
      
      // Determina tier basato sul prezzo
      const plan = getLicenseTier(total);
      
      // Data scadenza (2 anni dalla data acquisto)
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 2);
      
      // Salva licenza
      await saveLicense({
        email: customerEmail,
        licenseKey,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        plan,
        apiCallsToday: 0,
        isActive: true,
      });

      // Qui potresti inviare una email con la license key
      // Per ora loggiamo solo
      console.log(`License created: ${licenseKey} for ${customerEmail}, plan: ${plan}`);
      
      // Potresti chiamare un servizio email come Resend
      // await sendLicenseEmail(customerEmail, licenseKey);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
