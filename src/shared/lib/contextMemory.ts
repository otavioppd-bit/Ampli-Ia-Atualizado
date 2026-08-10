// =========================================================
// MEMÓRIA DE CONTEXTO DO MENTOR — última matéria estudada.
// O chat inicia sempre a partir dessa variável, retomando
// o assunto onde o aluno parou.
// =========================================================

export const LAST_SUBJECT = 'Matemática Financeira';

/** Cumprimento inicial do bot, ancorado na última matéria estudada. */
export function buildContextGreeting(subject: string = LAST_SUBJECT): string {
  return [
    'Oi! Que bom te ver de novo por aqui! 🐒',
    '',
    `Lembrei que você estava estudando **${subject}**. Excelente escolha — juros, porcentagem e análises financeiras caem bastante no ENEM.`,
    'Quer continuar de onde parou? Me conta o que você já revisou que eu te guio até o próximo passo. 💪',
  ].join('\n');
}