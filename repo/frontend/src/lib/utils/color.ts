export const MOOD_COLORS: Record<number, string> = {
  1: '#3b82f6', // blue - calm/reflective
  2: '#22d3ee', // cyan - curious
  3: '#a3e635', // lime - balanced
  4: '#facc15', // yellow - energized
  5: '#f97316', // orange - passionate
};

export function moodToColor(mood: number): string {
  return MOOD_COLORS[mood] ?? MOOD_COLORS[3];
}

export function moodToHSL(mood: number): { h: number; s: number; l: number } {
  const hslMap: Record<number, { h: number; s: number; l: number }> = {
    1: { h: 217, s: 91, l: 60 },
    2: { h: 188, s: 78, l: 56 },
    3: { h: 82, s: 78, l: 55 },
    4: { h: 48, s: 96, l: 53 },
    5: { h: 25, s: 95, l: 53 },
  };
  return hslMap[mood] ?? hslMap[3];
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  };
}

export function tagToColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 70%, 60%)`;
}
