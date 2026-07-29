export function calcLevel(xp: number): { level: number; remainder: number } {
  let level = 1;
  let remainder = xp;
  while (remainder >= 100 * level) {
    remainder -= 100 * level;
    level++;
  }
  return { level, remainder };
}

export function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

export const MOOD_LABEL: Record<string, string> = {
  stress: 'Estressado', anxiety: 'Ansioso', sadness: 'Triste', tired: 'Cansado',
  demotivated: 'Desmotivado', focused: 'Focado', motivated: 'Motivado',
  happy: 'Feliz', energetic: 'Energético', neutral: 'Tranquilo',
};

export const MOOD_EMOJI: Record<string, string> = {
  stress: '😰', anxiety: '😟', sadness: '😢', tired: '😴',
  demotivated: '😞', focused: '🎯', motivated: '🚀',
  happy: '😊', energetic: '⚡', neutral: '😌',
};

export const MOOD_COLOR: Record<string, string> = {
  stress: '#ef4444', anxiety: '#f59e0b', sadness: '#a855f7', tired: '#a855f7',
  demotivated: '#a855f7', focused: '#10b981', motivated: '#10b981',
  happy: '#10b981', energetic: '#10b981', neutral: '#475569',
};
