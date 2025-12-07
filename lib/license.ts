import crypto from 'crypto';

export function generateLicenseKey(): string {
  return `MC-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

export function validateLicenseFormat(key: string): boolean {
  return /^MC-[A-F0-9]{12}$/.test(key);
}

export function getLicenseTier(price: number): 'basic' | 'pro' | 'elite' {
  if (price >= 497) return 'elite';
  if (price >= 197) return 'pro';
  return 'basic';
}
