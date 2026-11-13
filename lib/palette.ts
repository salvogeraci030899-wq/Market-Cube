// Scala colori neon condivisa: score 0 (panico) -> 100 (euforia). Funzioni pure, usabili lato client.

const STOPS: Array<{ at: number; rgb: [number, number, number] }> = [
  { at: 0, rgb: [255, 0, 60] }, //     rosso fluo
  { at: 22, rgb: [255, 42, 109] }, //  rosa shocking
  { at: 38, rgb: [255, 140, 0] }, //   arancio fluo
  { at: 50, rgb: [180, 92, 255] }, //  viola neon
  { at: 62, rgb: [92, 108, 255] }, //  blu elettrico
  { at: 76, rgb: [0, 229, 255] }, //   ciano
  { at: 90, rgb: [57, 255, 20] }, //   verde acido
  { at: 100, rgb: [57, 255, 20] },
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

/** "r, g, b" da usare in CSS come rgba(var(--c), 0.3). */
export const scoreToRgbVar = (score: number | null): string => (score === null ? '110, 110, 125' : scoreToRgb(score).join(', '));

export function scoreToColor(score: number, alpha = 1): string {
  const [r, g, b] = scoreToRgb(score);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const NO_DATA_COLOR = (alpha = 1) => `rgba(110, 110, 125, ${alpha})`;

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
