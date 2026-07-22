import { EssayCorrection } from '../types';

/**
 * Corretor de Redação heurístico estilo ENEM.
 * 100% local, baseado em regras. Substituir por API de correção real (ex: Claude) quando disponível.
 */

const GIRIAS = ['tipo', 'tlgd', 'mano', 'parceiro', 'meu', 'brother', 'fml', 'tranquilo', 'suave', 'tô', 'tava', 'pra caramba', 'muito louco', 'da hora', 'legalzinho'];

const CONECTIVOS = ['portanto', 'assim', 'logo', 'contudo', 'entretanto', 'no entanto', 'todavia', 'ademais', 'além disso', 'outrossim', 'por conseguinte', 'consequentemente', 'dessa forma', 'desse modo', 'nesse sentido', 'primeiramente', 'em primeiro lugar', 'por outro lado', 'em contrapartida', 'do mesmo modo', 'analogamente', 'por fim', 'finalmente', 'diante disso', 'frente a isso', 'dado que', 'visto que', 'já que', 'porque', 'pois', 'uma vez que'];

const REPERTORIO_MARKERS = ['segundo', 'de acordo com', 'pesquisa', 'dados do ibge', 'dados da', 'conforme', 'estudo', 'pesquisador', 'cientista', 'filósofo', 'sociólogo', 'historiador', 'segundo a constituição', 'de acordo com a lei', 'como diz', 'nas palavras de'];

const AGENTES = ['governo', 'estado', 'escola', 'mídia', 'ong', 'sociedade', 'ministério', 'prefeitura', 'família', 'comunidade', 'instituição', 'poder público', 'secretaria'];

const ACAO_VERBOS = ['criar', 'promover', 'investir', 'fiscalizar', 'implementar', 'desenvolver', 'estabelecer', 'garantir', 'propor', 'elaborar', 'incentivar', 'viabilizar', 'ampliar', 'criar', 'formular', 'executar', 'instituir'];

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countSentences(text: string): number {
  return text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
}

function countParagraphs(text: string): number {
  return text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;
}

function wordFrequency(text: string): Record<string, number> {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const freq: Record<string, number> = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }
  return freq;
}

function containsAny(text: string, list: string[]): string[] {
  const lower = text.toLowerCase();
  return list.filter(item => lower.includes(item));
}

export function correctEssay(text: string): EssayCorrection {
  const wordCount = countWords(text);
  const sentenceCount = countSentences(text);
  const paragraphCount = countParagraphs(text);
  const freq = wordFrequency(text);
  const maxFreq = Math.max(...Object.values(freq), 0);
  const foundGirias = containsAny(text, GIRIAS);
  const foundConectivos = containsAny(text, CONECTIVOS);
  const foundRepertorio = containsAny(text, REPERTORIO_MARKERS);
  const foundAgentes = containsAny(text, AGENTES);
  const foundAcao = containsAny(text, ACAO_VERBOS);

  // Competência 1: Norma culta (0-200)
  let c1 = 200;
  if (maxFreq > 6) c1 -= (maxFreq - 6) * 20;
  if (foundGirias.length > 0) c1 -= foundGirias.length * 30;
  if (wordCount < 150) c1 -= (150 - wordCount) * 2;
  c1 = Math.max(0, Math.min(200, c1));

  // Competência 2: Tema (0-200)
  let c2 = 0;
  if (wordCount >= 200) c2 += 80;
  if (wordCount >= 280) c2 += 40;
  if (paragraphCount >= 4) c2 += 40;
  if (paragraphCount >= 5) c2 += 20;
  c2 += Math.min(20, wordCount * 0.05);
  c2 = Math.max(0, Math.min(200, c2));

  // Competência 3: Argumentação (0-200)
  let c3 = 0;
  if (paragraphCount >= 4) c3 += 50;
  if (foundRepertorio.length > 0) c3 += Math.min(80, foundRepertorio.length * 20);
  if (sentenceCount >= 8) c3 += 40;
  if (wordCount >= 200) c3 += 30;
  c3 = Math.max(0, Math.min(200, c3));

  // Competência 4: Coesão (0-200)
  let c4 = Math.min(200, foundConectivos.length * 25);
  c4 = Math.max(0, Math.min(200, c4));

  // Competência 5: Proposta de intervenção (0-200)
  let c5 = 0;
  const paragraphs = text.split(/\n\s*\n/);
  const lastParagraph = paragraphs[paragraphs.length - 1] || '';
  const hasAgente = foundAgentes.length > 0;
  const hasAcao = foundAcao.length > 0;

  if (paragraphCount >= 4) c5 += 40;
  if (hasAgente) c5 += 80;
  if (hasAcao) c5 += 80;
  c5 = Math.max(0, Math.min(200, c5));

  const notaFinal = Math.min(1000, c1 + c2 + c3 + c4 + c5);

  // Generate feedback
  const pontosFortes: string[] = [];
  const pontosMelhorar: string[] = [];

  if (c1 >= 160) pontosFortes.push('Bom domínio da norma culta');
  else if (c1 < 100) pontosMelhorar.push('Revisar concordância e evitar repetições excessivas');
  if (foundGirias.length > 0) pontosMelhorar.push('Evitar linguagem informal e gírias');

  if (c2 >= 160) pontosFortes.push('Boa estruturação do tema');
  else if (c2 < 100) pontosMelhorar.push('Desenvolver melhor o tema proposto');

  if (c3 >= 140) pontosFortes.push('Boa capacidade argumentativa com repertório');
  else if (c3 < 80) pontosMelhorar.push('Utilizar mais repertórios socioculturais (citações, dados, referências)');

  if (c4 >= 140) pontosFortes.push('Boa coesão textual com conectivos variados');
  else if (c4 < 80) pontosMelhorar.push('Utilizar mais conectivos para articular as ideias');

  if (c5 >= 140) pontosFortes.push('Proposta de intervenção bem elaborada com agente e ação');
  else if (c5 < 80) {
    if (!hasAgente) pontosMelhorar.push('Detalhar o agente responsável na proposta de intervenção');
    if (!hasAcao) pontosMelhorar.push('Especificar a ação concreta na proposta de intervenção');
  }

  if (wordCount < 150) pontosMelhorar.push('Texto muito curto — mínimo recomendado: 150 palavras');

  return {
    competencia1: Math.round(c1),
    competencia2: Math.round(c2),
    competencia3: Math.round(c3),
    competencia4: Math.round(c4),
    competencia5: Math.round(c5),
    notaFinal: Math.round(notaFinal),
    pontosFortes,
    pontosMelhorar,
    originalText: text,
  };
}
