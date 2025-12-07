import { NextResponse } from 'next/server';
import { getLicense } from '@/lib/kv';

export async function POST(request: Request) {
  try {
    const { licenseKey } = await request.json();
    
    if (!licenseKey) {
      return NextResponse.json(
        { valid: false, error: 'No license key provided' },
        { status: 400 }
      );
    }

    const license = await getLicense(licenseKey);
    
    if (!license) {
      return NextResponse.json(
        { valid: false, error: 'License not found' },
        { status: 404 }
      );
    }

    if (!license.isActive) {
      return NextResponse.json(
        { valid: false, error: 'License is inactive' },
        { status: 403 }
      );
    }

    const expiresAt = new Date(license.expiresAt);
    const now = new Date();
    
    if (expiresAt < now) {
      return NextResponse.json(
        { valid: false, error: 'License has expired' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      valid: true,
      license: {
        email: license.email,
        plan: license.plan,
        expiresAt: license.expiresAt,
        createdAt: license.createdAt,
      },
    });
  } catch (error) {
    console.error('License verification error:', error);
    return NextResponse.json(
      { valid: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
