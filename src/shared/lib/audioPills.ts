/**
 * PILULAS DE AUDIO - modo "tela desligada".
 *
 * O caso de uso manda na engenharia: aluno do noturno, no onibus, depois
 * do trabalho, com o celular no bolso e o fone no ouvido. Disso saem
 * quatro exigencias que este arquivo atende:
 *
 *   1. TRES MINUTOS. E o tempo entre dois pontos de onibus e o limite de
 *      atencao auditiva sem apoio visual. O roteiro e escrito para caber
 *      nisso (cerca de 450 palavras a 150 ppm em portugues).
 *   2. LINGUAGEM FALADA. Texto de apostila lido em voz alta e
 *      insuportavel: sem "conforme a figura", sem formula soletrada, com
 *      frases curtas e uma unica ideia por paragrafo.
 *   3. AUDIO SERVIDO, NAO PROCESSADO NO APARELHO. O TTS roda no worker
 *      (chave fora do navegador) e o mp3 volta em base64 ou URL, para o
 *      player tocar com a tela apagada.
 *   4. RETOMADA. O progresso e salvo em segundos: o onibus chega antes
 *      do fim mais vezes do que nao chega.
 */

/** Palavras por minuto de uma locucao pt-BR confortavel. */
export const PALAVRAS_POR_MINUTO = 150;

/** Alvo de duracao de uma pilula. */
export const DURACAO_ALVO_SEGUNDOS = 180;

/** Limite de caracteres por requisicao do Google Cloud TTS. */
export const LIMITE_CARACTERES_TTS = 4800;

export function contarPalavras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

export function estimarDuracaoSegundos(texto: string): number {
  return Math.round((contarPalavras(texto) / PALAVRAS_POR_MINUTO) * 60);
}

/**
 * Quebra o roteiro em blocos que cabem numa chamada de TTS.
 *
 * O corte e por FRASE, nunca por caractere: cortar no meio de uma frase
 * produz uma emenda audivel entre os arquivos, e a pessoa percebe.
 */
export function dividirEmBlocos(roteiro: string, limite = LIMITE_CARACTERES_TTS): string[] {
  const frases = roteiro.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*/g) ?? [roteiro];
  const blocos: string[] = [];
  let atual = '';

  for (const frase of frases) {
    if ((atual + frase).length > limite && atual) {
      blocos.push(atual.trim());
      atual = '';
    }
    atual += frase;
  }
  if (atual.trim()) blocos.push(atual.trim());
  return blocos;
}

/**
 * Prompt de geracao do roteiro.
 *
 * As restricoes estao no prompt porque sao de CONTEUDO, nao de
 * formatacao: um modelo que "resume bem" ainda escreve para os olhos se
 * ninguem pedir o contrario.
 */
export function promptRoteiroAudio(materia: string, topico: string, contexto?: string): string {
  return [
    `Escreva o roteiro de um micro-podcast de 3 minutos sobre "${topico}" (${materia}) para um estudante brasileiro do ensino medio noturno que vai ouvir no transporte publico, de olhos fechados.`,
    '',
    'Regras obrigatorias:',
    `- Entre 400 e 470 palavras (cerca de ${DURACAO_ALVO_SEGUNDOS} segundos falados).`,
    '- Portugues brasileiro falado, frases curtas, segunda pessoa ("voce").',
    '- Comece com uma pergunta ou cena concreta do cotidiano, nunca com "neste episodio".',
    '- Uma unica ideia por paragrafo; no maximo 3 conceitos no total.',
    '- Nada que dependa de ver: sem "observe a figura", sem formula soletrada, sem tabela.',
    '- Traga um exemplo de como o ENEM costuma cobrar esse tema.',
    '- Termine com uma frase de fechamento que caiba na memoria (um resumo de uma linha).',
    '- Nao use markdown, titulos, asteriscos nem marcacao de tempo. So o texto corrido para ser lido em voz alta.',
    contexto ? `\nContexto do aluno (adapte o exemplo, sem citar estes dados): ${contexto}` : '',
  ].join('\n');
}

/**
 * Vozes pt-BR do Google Cloud TTS que soam bem em fone de ouvido.
 * Neural2 custa mais que Standard, mas a diferenca em locucao longa e
 * grande o bastante para ser a escolha padrao.
 */
export const VOZES = [
  { id: 'pt-BR-Neural2-B', nome: 'Bruno', genero: 'masculina' },
  { id: 'pt-BR-Neural2-A', nome: 'Ana', genero: 'feminina' },
  { id: 'pt-BR-Neural2-C', nome: 'Clara', genero: 'feminina' },
  { id: 'pt-BR-Wavenet-B', nome: 'Bruno (leve)', genero: 'masculina' },
];

export interface PedidoTTS {
  texto: string;
  voz: string;
  velocidade: number;
}

/**
 * Monta o corpo enviado ao worker (/tts). A velocidade fica em 0.98 por
 * padrao: um hair abaixo do natural ajuda quem esta cansado a acompanhar
 * sem soar arrastado.
 */
export function montarPedidoTTS(texto: string, voz = VOZES[0].id, velocidade = 0.98): PedidoTTS {
  return { texto, voz, velocidade: Math.max(0.5, Math.min(velocidade, 1.6)) };
}

export function formatarTempo(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Considera concluido a partir de 90% - ninguem ouve o fade final. */
export const LIMIAR_CONCLUSAO = 0.9;

export function estaConcluido(segundosOuvidos: number, duracao: number): boolean {
  return duracao > 0 && segundosOuvidos / duracao >= LIMIAR_CONCLUSAO;
}
