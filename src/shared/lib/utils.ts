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
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const MOOD_LABEL: Record<string, string> = {
  stress: 'Estressado', anxiety: 'Ansioso', sadness: 'Triste', tired: 'Cansado',
  demotivated: 'Desmotivado', focused: 'Focado', motivated: 'Motivado',
  happy: 'Feliz', energetic: 'Energético', neutral: 'Tranquilo',
};

/*
 * MOOD_EMOJI foi removido.
 *
 * Cada sistema operacional desenhava os rostos de um jeito, entao o mesmo
 * humor tinha aparencias diferentes, e o leitor de tela anunciava "rosto
 * desanimado" no meio da frase. O substituto e <MoodIcon /> em
 * shared/ui/AppIcon.tsx, que usa as cores ja definidas em MOOD_COLOR.
 */

export const MOOD_COLOR: Record<string, string> = {
  stress: '#ef4444', anxiety: '#f59e0b', sadness: '#a855f7', tired: '#a855f7',
  demotivated: '#a855f7', focused: '#10b981', motivated: '#10b981',
  happy: '#10b981', energetic: '#10b981', neutral: '#475569',
};
