// Scala colori condivisa: score 0 (panico) -> 100 (euforia). Funzioni pure, usabili lato client.

const STOPS: Array<{ at: number; rgb: [number, number, number] }> = [
  { at: 0, rgb: [150, 10, 30] },
  { at: 20, rgb: [220, 20, 60] },
  { at: 30, rgb: [255, 69, 0] },
  { at: 38, rgb: [255, 140, 0] },
  { at: 48, rgb: [138, 43, 226] },
  { at: 58, rgb: [157, 78, 221] },
  { at: 68, rgb: [100, 149, 237] },
  { at: 78, rgb: [0, 204, 255] },
  { at: 90, rgb: [0, 255, 136] },
  { at: 100, rgb: [0, 255, 136] },
];

export function scoreToRgb(score: number): [number, number, number] {
  const s = Math.max(0, Math.min(100, score));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i];
    const b = STOPS[i + 1];
    if (s >= a.at && s <= b.at) {
      const t = b.at === a.at ? 0 : (s - a.at) / (b.at - a.at);
      return [0, 1, 2].map((k) => Math.round(a.rgb[k] + (b.rgb[k] - a.rgb[k]) * t)) as [number, number, number];
    }
  }
  return STOPS[STOPS.length - 1].rgb;
}

export function scoreToColor(score: number, alpha = 1): string {
  const [r, g, b] = scoreToRgb(score);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const NO_DATA_COLOR = (alpha = 1) => `rgba(90, 90, 105, ${alpha})`;

export function scoreLabel(score: number): string {
  if (score >= 85) return 'FOMO ESTREMO';
  if (score >= 75) return 'OTTIMISMO FORTE';
  if (score >= 62) return 'OTTIMISMO';
  if (score >= 52) return 'LEGGERO OTTIMISMO';
  if (score >= 45) return 'NEUTRALE';
  if (score >= 35) return 'CAUTELA';
  if (score >= 25) return 'PESSIMISMO';
  if (score >= 12) return 'PESSIMISMO FORTE';
  return 'PANICO';
}
