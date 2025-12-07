import { kv } from '@vercel/kv';

export interface LicenseData {
  email: string;
  licenseKey: string;
  createdAt: string;
  expiresAt: string;
  plan: 'basic' | 'pro' | 'elite';
  apiCallsToday: number;
  lastApiCall?: string;
  isActive: boolean;
}

export async function saveLicense(data: LicenseData): Promise<void> {
  await kv.set(`license:${data.licenseKey}`, JSON.stringify(data));
  await kv.expire(`license:${data.licenseKey}`, 60 * 60 * 24 * 730); // 2 anni
}

export async function getLicense(licenseKey: string): Promise<LicenseData | null> {
  const data = await kv.get<string>(`license:${licenseKey}`);
  return data ? JSON.parse(data) : null;
}

export async function incrementApiCalls(licenseKey: string): Promise<number> {
  const key = `api_calls:${licenseKey}:${new Date().toISOString().split('T')[0]}`;
  return await kv.incr(key);
}

export async function getApiCallsToday(licenseKey: string): Promise<number> {
  const key = `api_calls:${licenseKey}:${new Date().toISOString().split('T')[0]}`;
  const calls = await kv.get<number>(key);
  return calls || 0;
}
