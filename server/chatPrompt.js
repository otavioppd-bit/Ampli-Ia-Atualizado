/**
 * CHAT TEMATICO COM GROUNDING - modos, prompt dinamico e busca.
 *
 * Este arquivo e a FONTE UNICA do prompt: o worker importa (rota
 * /api/chat/completions) e o app tambem importa (caminho sem worker, em
 * que o aluno usa a propria chave Gemini). Duplicar aqui significaria
 * dois mentores diferentes dependendo de haver proxy configurado.
 *
 * E JavaScript puro de proposito - o worker e bundlado pelo wrangler e
 * nao passa pelo tsc do app. Os tipos vivem em chatPrompt.d.ts ao lado.
 */

/**
 * Modos do seletor.
 *
 * `bancas` e `fontes` nao sao enfeite: entram no prompt para orientar a
 * BUSCA. Sem dizer onde procurar, o modelo cita "uma questao do ENEM"
 * generica - que e exatamente a alucinacao que o grounding deveria
 * eliminar.
 */
export const MODOS_CHAT = [
  {
    id: 'enem_geral',
    rotulo: 'ENEM Geral',
    escopo: 'todas as areas do ENEM, estrategia de prova e organizacao de estudo',
    bancas: ['ENEM (INEP)'],
    fontes: ['gov.br/inep', 'download.inep.gov.br (provas e gabaritos oficiais)'],
    cor: '#f59e0b',
  },
  {
    id: 'exatas',
    rotulo: 'Matemática & Exatas',
    escopo: 'matematica e suas tecnologias: algebra, funcoes, geometria, estatistica, probabilidade, razao e proporcao',
    bancas: ['ENEM', 'Fuvest', 'Unicamp', 'ITA', 'IME'],
    fontes: ['provas oficiais e gabaritos comentados das bancas'],
    cor: '#3b82f6',
  },
  {
    id: 'natureza',
    rotulo: 'Ciências da Natureza',
    escopo: 'biologia, fisica e quimica',
    bancas: ['ENEM', 'Fuvest', 'Unicamp', 'UFRGS'],
    fontes: ['provas oficiais das bancas', 'materiais de universidades publicas'],
    cor: '#8b5cf6',
  },
  {
    id: 'humanas',
    rotulo: 'Humanas & Linguagens',
    escopo: 'historia, geografia, filosofia, sociologia, lingua portuguesa, literatura e redacao',
    bancas: ['ENEM', 'Fuvest', 'Unicamp', 'UERJ'],
    fontes: ['provas oficiais', 'listas de leitura obrigatoria das bancas'],
    cor: '#ec4899',
  },
  {
    id: 'vestibulares',
    rotulo: 'Vestibulares Específicos',
    escopo: 'o estilo e o conteudo cobrado por vestibulares estaduais e federais fora do ENEM',
    bancas: ['Fuvest (USP)', 'Unicamp', 'UFRGS', 'UERJ', 'UFPR', 'UNESP', 'ITA', 'IME'],
    fontes: [
      'sites oficiais das bancas (fuvest.br, comvest.unicamp.br, ufrgs.br/coperse, vestibular.uerj.br)',
      'editais e provas anteriores publicadas pelas proprias universidades',
    ],
    cor: '#10b981',
  },
];

export const MODO_PADRAO = 'enem_geral';

export function acharModo(id) {
  return MODOS_CHAT.find((m) => m.id === id) || MODOS_CHAT[0];
}

export function modoValido(id) {
  return MODOS_CHAT.some((m) => m.id === id);
}

/**
 * Faixa horaria do acesso.
 *
 * O publico e ensino medio noturno: quem abre o app as 2h da manha
 * trabalhou o dia inteiro e vai dormir em uma hora. A carga cognitiva
 * que serve as 15h e cruel nesse horario.
 */
export function faixaHoraria(hora) {
  const h = Number.isFinite(hora) ? ((hora % 24) + 24) % 24 : 12;
  if (h >= 0 && h < 5) return 'madrugada';
  if (h >= 19 || h === 5) return 'noite';
  return 'dia';
}

/** Regras de densidade por faixa - o "adaptar ao horario" do pedido. */
const DENSIDADE = {
  madrugada: [
    'DENSIDADE: e madrugada. Responda em no maximo 120 palavras, um conceito por vez, sem listas longas e sem desvios.',
    'Faca UMA pergunta por mensagem, nunca duas.',
    'Ao fechar um raciocinio, ofereca parar por hoje em uma frase curta - sem insistir e sem culpa.',
  ],
  noite: [
    'DENSIDADE: e noite e o aluno provavelmente veio do trabalho. Responda em no maximo 180 palavras, direto ao ponto.',
    'Prefira um exemplo concreto a uma definicao formal.',
  ],
  dia: [
    'DENSIDADE: horario comum. Pode desenvolver ate cerca de 250 palavras quando o tema pedir.',
    'Ainda assim, prefira profundidade em um ponto a cobertura rasa de varios.',
  ],
};

const SOCRATICO = [
  'METODO SOCRATICO (regra central):',
  '- Nao entregue a resposta final de imediato. Comece devolvendo o problema em uma pergunta que isole o proximo passo.',
  '- Um passo por mensagem. Espere a tentativa do aluno antes de avancar.',
  '- Quando ele errar, aponte em que passo o raciocinio saiu do trilho, nao apenas que errou.',
  '- Quando ele acertar, confirme em uma frase e siga para o proximo passo.',
  '- ESCAPE: se o aluno pedir a resposta direta duas vezes, disser que esta sem tempo, ou demonstrar frustracao, entregue a solucao completa e comentada. Insistir no metodo depois disso vira obstaculo, nao ensino.',
].join('\n');

const ANTIALUCINACAO = [
  'FONTES E QUESTOES REAIS:',
  '- Use a busca antes de afirmar que uma questao existe. Ao citar, informe banca, ano e, se houver, o numero da questao.',
  '- Se a busca nao trouxer a questao ou o dado, diga isso em uma frase e siga com a explicacao conceitual. Nunca invente enunciado, ano, numero de questao ou estatistica.',
  '- Nao apresente questao autoral como se fosse de prova oficial. Se criar um exercicio, diga "questao inedita, no estilo da banca".',
].join('\n');

/**
 * Monta o system instruction do chat.
 *
 * @param {{ modo?: string, horaLocal?: number, nomeAluno?: string, materiaRecente?: string }} opcoes
 * @returns {string}
 */
export function montarSystemInstructionChat(opcoes = {}) {
  const modo = acharModo(opcoes.modo);
  const faixa = faixaHoraria(opcoes.horaLocal);
  const primeiroNome = (opcoes.nomeAluno || '').trim().split(/\s+/)[0];

  const blocos = [
    'Voce e o Sagui, mentor de estudos do Ampli-IA, falando com um estudante brasileiro do ensino medio noturno que se prepara para vestibular.',
    `MODO ATIVO: ${modo.rotulo}. Voce cobre ${modo.escopo}.`,
    `BANCAS DE REFERENCIA: ${modo.bancas.join(', ')}. Priorize buscas em: ${modo.fontes.join('; ')}.`,
    SOCRATICO,
    ANTIALUCINACAO,
    DENSIDADE[faixa].join('\n'),
    [
      'ESTILO: portugues brasileiro, frases curtas, sem jargao desnecessario, sem emoji.',
      'Nunca comente o horario, nem diga que esta adaptando o tamanho da resposta.',
      'Cansaco, ansiedade e medo da prova nunca sao fora de escopo: acolha em uma frase antes de voltar ao conteudo.',
    ].join('\n'),
  ];

  if (primeiroNome) blocos.push(`O estudante se chama ${primeiroNome}.`);
  if (opcoes.materiaRecente) {
    blocos.push(`Ele praticou ${opcoes.materiaRecente} recentemente - use isso so se ajudar o exemplo, sem anunciar.`);
  }

  return blocos.join('\n\n');
}

/**
 * Ferramenta de busca conforme a familia do modelo.
 *
 * O nome da ferramenta MUDOU entre as geracoes: 1.5 usa
 * `google_search_retrieval`, 2.0+ usa `google_search`. Mandar o nome
 * errado devolve 400 e a conversa inteira falha - por isso a escolha e
 * derivada do modelo, e nao fixada.
 */
export function ferramentasDeBusca(modelo = '') {
  if (/gemini-1\.5/.test(modelo)) {
    // dynamicThreshold 0.3: aciona a busca com folga. O caso que importa
    // ("essa questao caiu na Fuvest?") nem sempre parece uma pergunta
    // factual para o classificador no limiar padrao.
    return [{ google_search_retrieval: { dynamic_retrieval_config: { mode: 'MODE_DYNAMIC', dynamic_threshold: 0.3 } } }];
  }
  return [{ google_search: {} }];
}

/**
 * Extrai as fontes que o modelo de fato consultou.
 *
 * Sao elas que viram os badges na interface. Sem isso o aluno nao tem
 * como distinguir "a IA leu a prova" de "a IA lembrou de algo parecido"
 * - e essa distincao e o motivo de existir o grounding.
 *
 * @param {any} resposta corpo bruto devolvido pela API do Gemini
 */
export function extrairFontes(resposta) {
  const candidato = resposta?.candidates?.[0];
  const meta = candidato?.groundingMetadata || candidato?.grounding_metadata;
  if (!meta) return { fontes: [], consultas: [], groundingUsado: false };

  const pedacos = meta.groundingChunks || meta.grounding_chunks || [];
  const vistos = new Set();
  const fontes = [];

  for (const pedaco of pedacos) {
    const web = pedaco?.web || pedaco?.retrievedContext;
    if (!web?.uri) continue;
    if (vistos.has(web.uri)) continue;
    vistos.add(web.uri);
    fontes.push({
      titulo: web.title || dominioDe(web.uri),
      uri: web.uri,
      dominio: dominioDe(web.uri),
    });
  }

  const consultas = meta.webSearchQueries || meta.web_search_queries || [];
  return { fontes, consultas, groundingUsado: fontes.length > 0 || consultas.length > 0 };
}

function dominioDe(uri) {
  try {
    return new URL(uri).hostname.replace(/^www\./, '');
  } catch {
    return 'fonte';
  }
}

/**
 * Marca se a resposta cita banca e ano - o sinal de que ela se apoiou em
 * prova real, e nao em memoria vaga do modelo.
 */
export function detectarCitacaoDeProva(texto = '') {
  const bancas = /(ENEM|FUVEST|UNICAMP|UFRGS|UERJ|UNESP|ITA|IME|UFPR)/i;
  const ano = /\b(19|20)\d{2}\b/;
  return bancas.test(texto) && ano.test(texto);
}
