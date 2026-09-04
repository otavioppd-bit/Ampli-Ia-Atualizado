import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { BadgeCheck, Brain, Camera, Link2, Mic, SendHorizontal, Sparkles, TriangleAlert, Users, Volume2, VolumeX } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { searchKB, matchSubject, extractKeywords, SPECIAL_RESPONSES, buildKBFromQuiz } from '../../shared/lib/kbSearch';
import { getEmpathicPrefix } from '../../shared/lib/emotionEngine';
import { QUIZ_BANK } from '../../shared/lib/quizBank';
import { ENEM_KB } from '../../shared/lib/kbEnem';
import { sendMessageToGemini, aiAvailable } from '../../shared/lib/aiService';
import {
  MODOS_CHAT,
  MODO_PADRAO,
  acharModo,
  conversarComMentor,
  temEndpointDeChat,
} from '../../shared/lib/chatGrounding';
import { ChatMessage, Nota, ChatPersona } from '../../shared/types';
import { playClick, speak, stopSpeech } from '../../shared/lib/sfx';
import { buildContextGreeting, ultimaMateria } from '../../shared/lib/contextMemory';
import { PersonaManager } from '../../shared/ui/PersonaManager';
import { AppIcon } from '../../shared/ui/AppIcon';
import { TextoFormatado } from '../../shared/ui/TextoFormatado';

const QUIZ_KB = buildKBFromQuiz(QUIZ_BANK);
const ALL_KB = [...ENEM_KB, ...QUIZ_KB];

function generateId() { return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

function getSubjectName(persona: ChatPersona | null): string {
  if (!persona || persona.id === 'mentor_enem') return 'geral';
  if (persona.id === 'prof_matematica') return 'Matemática';
  if (persona.id === 'prof_portugues') return 'Português';
  if (persona.id === 'prof_ciencias') return 'Ciências da Natureza';
  if (persona.id === 'prof_humanas') return 'Ciências Humanas';
  return persona.name;
}

function getBotReply(userMessage: string, mood: string, persona: ChatPersona | null): string {
  const lower = userMessage.trim().toLowerCase();
  const isMentor = !persona || persona.id === 'mentor_enem';
  for (const [key, response] of Object.entries(SPECIAL_RESPONSES)) {
    if (lower === key || lower.startsWith(key)) {
      const prefix = getEmpathicPrefix(mood as any);
      return prefix ? `${prefix}\n\n${response}` : response;
    }
  }
  const match = searchKB(userMessage, ALL_KB);
  if (match) {
    const prefix = getEmpathicPrefix(mood as any);
    return prefix ? `${prefix}\n\n${match.entry.content}` : match.entry.content;
  }
  const subject = matchSubject(userMessage);
  if (isMentor && subject) {
    const dicas: Record<string, string> = {
      Matemática: ' Pratique exercícios de lógica e revisão de fórmulas. Foco em razão, proporção e funções.',
      Português: ' Revise concordância verbal e nominal, regência e crase. Leia os enunciados com atenção.',
      História: ' Contextualize eventos em ordem cronológica. Destaque para Brasil Colônia, Império e Era Vargas.',
      Geografia: ' Questões de geografia política, ambiental e urbana são frequentes. Atente-se a mapas.',
      Biologia: ' Fisiologia humana, ecologia e genética são os temas mais cobrados.',
      Física: ' Mecânica, termologia e ondas são tópicos principais. Foco em interpretação de gráficos.',
      Química: ' Estequiometria, soluções e oxirredução são recorrentes. Pratique cálculos.',
      Filosofia: ' Conheça os principais filósofos e suas ideias centrais (Sócrates, Descartes, Nietzsche).',
      Inglês: '🇬🇧 Foco em interpretação de texto e vocabulário. Palavras cognatas ajudam muito.',
      Sociologia: ' Trabalho, cultura, cidadania e movimentos sociais são temas frequentes.',
    };
    const prefix = getEmpathicPrefix(mood as any);
    return prefix ? `${prefix}\n\n${dicas[subject] || `Sobre ${subject}: revise os fundamentos e pratique questões.`}` : (dicas[subject] || `Sobre ${subject}: revise os fundamentos e pratique questões.`);
  }
  const keywords = extractKeywords(userMessage);
  const prefix = getEmpathicPrefix(mood as any);
  if (persona && !isMentor) {
    /* Sem IA, o limite da persona tambem precisa aparecer - mas pelo
       ESCOPO, nao pela instrucao: a instrucao e escrita em segunda
       pessoa ("Voce ensina...") e ficava esquisita como fala do bot. */
    const especialidade = persona.escopo ?? persona.name;
    const fallback = `Não encontrei informações específicas sobre "${keywords.join(', ') || 'isso'}" na minha base local. Minha especialidade é ${especialidade}. Que tal reformular dentro dessa área?`;
    return prefix ? `${prefix}\n\n${fallback}` : fallback;
  }
  const fallback = `Hmm, não encontrei informações sobre "${keywords.join(', ') || 'isso'}" na minha base local.  Tente reformular sua pergunta ou explore as seções Quiz, Redação e Caderno de Estudos!`;
  return prefix ? `${prefix}\n\n${fallback}` : fallback;
}

/**
 * Modo tematico -> professor embutido.
 *
 * Os dois eixos ja existiam separados no app (persona = quem fala) e o
 * pedido trouxe um novo (modo = de onde vem o conteudo). Deixar os dois
 * soltos permitiria a combinacao sem sentido "Prof. Matematica no modo
 * Humanas". Aqui o modo manda: escolher um modo troca o professor junto.
 * Persona CRIADA PELO USUARIO continua no comando dela mesma - ver
 * handleSend.
 */
const PERSONA_DO_MODO: Record<string, string> = {
  enem_geral: 'mentor_enem',
  exatas: 'prof_matematica',
  natureza: 'prof_ciencias',
  humanas: 'prof_humanas',
  vestibulares: 'mentor_enem',
};

const PERSONAS_EMBUTIDAS = Object.values(PERSONA_DO_MODO);
const CHAVE_MODO = 'mm_modo_chat';

const personaBorderColors: Record<string, string> = {
  mentor_enem: 'border-l-amber-500/50',
  prof_matematica: 'border-l-blue-500/50',
  prof_portugues: 'border-l-emerald-500/50',
  prof_ciencias: 'border-l-purple-500/50',
  prof_humanas: 'border-l-pink-500/50',
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

export function ChatPage() {
  const { chatMessages, addChatMessage, detectAndSetMood, isMuted, setIsMuted, addNota, setToast,
    personas, activePersonaId, setActivePersonaId, setShowPersonaManager, apiKey,
    quizResults, logs } = useAppStore();
  const [input, setInput] = useState('');
  /* Modo tematico do mentor. Fica no localStorage porque e preferencia de
     uso, nao dado de conta: quem estuda exatas nao quer reescolher o modo
     a cada visita. */
  const [modo, setModo] = useState<string>(() => localStorage.getItem(CHAVE_MODO) || MODO_PADRAO);
  const [isListening, setIsListening] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activePersona = useMemo(() => personas.find(p => p.id === activePersonaId) || null, [personas, activePersonaId]);

  /* Professor criado pelo usuario tem instrucao propria: nesse caso o
     modo tematico sai de cena e o caminho antigo (persona) prevalece. */
  const personaCustomizada = useMemo(
    () => (activePersona && !PERSONAS_EMBUTIDAS.includes(activePersona.id) ? activePersona : null),
    [activePersona],
  );

  const modoAtivo = useMemo(() => acharModo(modo), [modo]);

  function trocarModo(id: string) {
    setModo(id);
    localStorage.setItem(CHAVE_MODO, id);
    setActivePersonaId(PERSONA_DO_MODO[id] ?? 'mentor_enem');
  }

  /* Materia retomada: sai do historico real do aluno (ultimo quiz, depois
     registros de atividade) e so cai na persona como ultimo recurso. */
  const materiaRetomada = useMemo(
    () => ultimaMateria({ quizResults, logs, persona: activePersona }),
    [quizResults, logs, activePersona],
  );

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  const saudacaoEnviada = useRef(false);

  useEffect(() => {
    // O historico ja foi carregado do banco no boot (App.tsx). Se mesmo
    // assim estiver vazio, e a primeira conversa: monta a saudacao.
    //
    // A guarda por ref existe porque o StrictMode roda o efeito duas vezes
    // em desenvolvimento e o estado ainda nao atualizou entre as duas
    // chamadas: sem ela, a saudacao aparecia repetida E era gravada duas
    // vezes no banco.
    if (chatMessages.length === 0 && !saudacaoEnviada.current) {
      saudacaoEnviada.current = true;
      const greeting: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        text: buildContextGreeting(materiaRetomada),
        timestamp: Date.now(),
      };
      addChatMessage(greeting);
    }
  }, []);

  useEffect(() => {
    if (inputRef.current) autoResize(inputRef.current);
  }, [input]);

  const handleSend = useCallback(async (text: string, image?: string) => {
    if (!text.trim() && !image) return;
    playClick();
    const userMsg: ChatMessage = { id: generateId(), role: 'user', text: text.trim(), timestamp: Date.now(), image };
    const newMsgs = [...chatMessages, userMsg];
    addChatMessage(userMsg);
    setInput('');
    if (inputRef.current) { inputRef.current.style.height = 'auto'; }
    const mood = await detectAndSetMood(text);

    if (aiAvailable(apiKey)) {
      setIsGenerating(true);
      try {
        abortRef.current = new AbortController();
        const history = chatMessages.map(m => ({
          role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
          text: m.text || (m.image ? '[Anexo de imagem]' : ''),
        }));
        /*
         * Duas rotas de conversa:
         *
         * - MODO TEMATICO (padrao): vai para /api/chat/completions, que
         *   monta o prompt socratico no servidor e liga a busca. E o unico
         *   caminho que devolve fontes para os badges.
         * - PERSONA CUSTOMIZADA: o professor que o proprio aluno criou tem
         *   instrucao dele; sobrepor um modo tematico ali seria ignorar o
         *   que ele escreveu.
         *
         * Mensagem com imagem tambem segue o caminho antigo: a rota
         * tematica e de texto, e a leitura de foto de exercicio ja
         * existia aqui.
         */
        let reply: string;
        let extras: Partial<ChatMessage> = {};

        if (personaCustomizada || image) {
          reply = await sendMessageToGemini(
            text || (image ? 'Analise esta imagem de estudo' : 'Olá!'),
            { apiKey, persona: activePersona, history, imageBase64: image, signal: abortRef.current.signal },
          );
        } else {
          const resposta = await conversarComMentor({
            modo,
            mensagens: [...history, { role: 'user', text: text || 'Olá!' }],
            apiKey,
            materiaRecente: materiaRetomada || undefined,
            signal: abortRef.current.signal,
          });
          reply = resposta.texto;
          extras = {
            fontes: resposta.fontes,
            groundingUsado: resposta.groundingUsado,
            citouProva: resposta.citouProva,
            modoChat: resposta.modo,
          };
        }

        const botMsg: ChatMessage = {
          id: generateId(), role: 'assistant', text: reply, timestamp: Date.now(), mood, ...extras,
        };
        addChatMessage(botMsg);
        if (!isMuted) { stopSpeech(); speak(reply); }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setToast(err.message || 'Erro ao conectar com a IA. Usando modo local.', 'error');
          const fallback = getBotReply(text, mood, activePersona);
          const botMsg: ChatMessage = { id: generateId(), role: 'assistant', text: fallback, timestamp: Date.now(), mood };
          addChatMessage(botMsg);
          if (!isMuted) { stopSpeech(); speak(fallback); }
        }
      }
      setIsGenerating(false);
    } else {
      setTimeout(() => {
        const reply = getBotReply(text, mood, activePersona);
        const botMsg: ChatMessage = { id: generateId(), role: 'assistant', text: reply, timestamp: Date.now(), mood };
        addChatMessage(botMsg);
        if (!isMuted) { stopSpeech(); speak(reply); }
      }, 400 + Math.random() * 600);
    }
  }, [chatMessages, addChatMessage, detectAndSetMood, isMuted, activePersona, apiKey, modo, personaCustomizada, materiaRetomada]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input); }
  }

  function handleVoice() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setToast('Reconhecimento de voz não disponível', 'error');
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognitionRef.current = recognition;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
      handleSend(transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
    setIsListening(true);
  }

  async function handleFileCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setToast('Imagem muito grande. Máximo 5MB.', 'error');
      return;
    }
    try {
      const base64 = await readFileAsBase64(file);
      handleSend(input, base64);
    } catch {
      setToast('Erro ao carregar imagem', 'error');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function saveToNotebook(msg: ChatMessage) {
    const text = msg.image ? `[Imagem] ${msg.text || 'Foto de lição'}` : msg.text;
    // addNota persiste no banco e troca o id provisorio pelo definitivo.
    addNota({ id: `tmp_${Date.now()}`, text, data: new Date().toISOString(), tag: 'chat' });
    setToast('Salva no Caderno!', 'success');
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-10rem)] md:h-[calc(100dvh-8rem)] animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shadow-sm transition-all"
            style={{ backgroundColor: activePersona ? activePersona.color + '20' : '#f59e0b20' }}
          >
            <Brain size={20} style={{ color: activePersona?.color || '#f59e0b' }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-lg md:text-xl font-bold text-white truncate">{activePersona?.name || 'Mentor'}</h1>
              {/* Antes era um selo "brilho + IA", exatamente o clichê que a
                  regra 5 proibe. O que interessa ao aluno nao e a
                  tecnologia, e se o mentor esta disponivel agora. */}
              {aiAvailable(apiKey) && (
                <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/15 flex items-center gap-1.5 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse-subtle" />
                  online
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 truncate">
              {getSubjectName(activePersona)}
              {materiaRetomada && (
                <>
                  <span className="text-gray-600"> · </span>
                  <span className="text-violet-400/90">
                    <Brain size={13} className="inline-block align-[-0.15em] text-violet-400" /> retomando: {materiaRetomada}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowPersonaManager(true)}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
            title="Gerenciar Personas"
          >
            <Users size={18} />
          </button>
          <button
            onClick={() => { setIsMuted(!isMuted); if (!isMuted) stopSpeech(); }}
            className={`w-11 h-11 flex items-center justify-center rounded-xl transition-all ${
              isMuted ? 'text-red-400 hover:bg-red-500/10' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
            title={isMuted ? 'Som ativado' : 'Som desativado'}
          >
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>
      </div>

      {/* ============================================================
          Seletor de modo tematico.
          Fica ACIMA da fileira de professores porque e ele que decide o
          que a IA vai buscar; a fileira de baixo passou a servir aos
          professores que o proprio aluno cria.
          ============================================================ */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Modo do mentor">
        {MODOS_CHAT.map((m) => {
          const ativo = modo === m.id && !personaCustomizada;
          return (
            <button
              key={m.id}
              role="tab"
              aria-selected={ativo}
              onClick={() => trocarModo(m.id)}
              title={`${m.escopo}. Bancas: ${m.bancas.join(', ')}`}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                ativo ? 'text-white' : 'glass-light text-gray-400 border-white/[0.04] hover:text-gray-200'
              }`}
              style={ativo ? { borderColor: `${m.cor}66`, background: `${m.cor}1a`, color: m.cor } : undefined}
            >
              {m.rotulo}
            </button>
          );
        })}
      </div>

      {/* Uma linha honesta sobre a procedencia das respostas neste modo. */}
      <p className="text-[11px] text-gray-600 -mt-2">
        {personaCustomizada ? (
          <>Falando com o seu professor <strong className="text-gray-400">{personaCustomizada.name}</strong> - o modo tematico volta ao escolher um professor da lista.</>
        ) : temEndpointDeChat() ? (
          <>Busca ativa em provas oficiais: {modoAtivo.bancas.join(', ')}.</>
        ) : (
          <>Sem servidor de busca configurado: as respostas saem do conhecimento do modelo, sem consultar provas. Fontes nao serao exibidas.</>
        )}
      </p>

      {/* Persona selector cards */}
      <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none">
        {personas.map(p => {
          const isActive = activePersonaId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setActivePersonaId(p.id)}
              className={`flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-xl text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                isActive
                  ? 'text-white shadow-sm border'
                  : 'text-gray-400 hover:text-gray-200 bg-white/[0.02] border border-white/5'
              }`}
              style={isActive ? { backgroundColor: p.color + '18', borderColor: p.color + '35' } : {}}
            >
              <AppIcon name={p.icon} size={17} className="text-amber-300" />
              <span className="font-semibold">{p.name}</span>
              {isActive && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />}
            </button>
          );
        })}
        <button
          onClick={() => setShowPersonaManager(true)}
          className="flex items-center gap-1 px-3 py-2 min-h-[44px] rounded-xl text-xs font-medium text-gray-500 hover:text-gray-300 bg-white/[0.02] border border-white/5 border-dashed shrink-0"
        >
          + Nova
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4 scroll-smooth">
        {chatMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-sm"
              style={{ backgroundColor: activePersona ? activePersona.color + '12' : '#f59e0b12' }}
            >
              <Brain size={32} style={{ color: activePersona?.color || '#f59e0b' }} />
            </div>
            <p className="text-gray-400 font-medium">
              {activePersona ? `Fale com ${activePersona.name}` : 'Comece uma conversa!'}
            </p>
            <p className="text-sm text-gray-500 mt-1 max-w-xs leading-relaxed">
              {activePersona ? activePersona.instruction.slice(0, 100) + '...' : 'Pergunte sobre matérias, dicas de estudo, ou desabafe.'}
            </p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => handleSend('Dicas de estudo para o ENEM')} className="btn-secondary text-xs px-4 py-2"> Dicas ENEM
              </button>
              <button onClick={() => handleSend('Como fazer uma redação nota 1000?')} className="btn-secondary text-xs px-4 py-2"> Redação
              </button>
              <button onClick={() => handleSend('Matemática básica para o ENEM')} className="btn-secondary text-xs px-4 py-2"> Matemática
              </button>
            </div>
          </div>
        )}
        {chatMessages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}
            onMouseEnter={() => setHoveredMsg(msg.id)}
            onMouseLeave={() => setHoveredMsg(null)}
          >
            <div
              className={`max-w-[88%] md:max-w-[72%] min-w-0 rounded-2xl p-4 ${
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-amber-500/15 to-orange-600/10 border border-amber-500/10'
                  : `glass border-l-4 ${personaBorderColors[activePersonaId || 'mentor_enem'] || 'border-l-amber-500/50'}`
              }`}
            >
              {msg.image && (
                <div className="mb-3 rounded-xl overflow-hidden border border-white/5">
                  <img src={msg.image} alt="Foto" className="w-full h-auto max-h-64 object-cover" />
                </div>
              )}
              {msg.text && (
                <TextoFormatado texto={msg.text} className="text-sm text-gray-200 leading-relaxed" />
              )}
              {/* ==================================================
                  Procedencia da resposta.
                  Verde = a IA abriu a fonte. Ambar = ela citou banca e
                  ano sem ter consultado nada, que e exatamente o caso em
                  que o aluno precisa desconfiar. Sem os dois sinais, nada
                  aparece - badge em toda mensagem viraria ruido.
                  ================================================== */}
              {msg.role === 'assistant' && (msg.fontes?.length || msg.citouProva) && (
                <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-2">
                  {msg.citouProva && (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        msg.groundingUsado
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}
                    >
                      {msg.groundingUsado ? <BadgeCheck size={11} /> : <TriangleAlert size={11} />}
                      {msg.groundingUsado ? 'Questão conferida na fonte' : 'Citou prova sem fonte verificada'}
                    </span>
                  )}

                  {!!msg.fontes?.length && (
                    <div className="flex flex-wrap gap-1.5">
                      {msg.fontes.slice(0, 4).map((f) => (
                        <a
                          key={f.uri}
                          href={f.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={f.titulo}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] text-[10px] text-gray-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors max-w-[190px]"
                        >
                          <Link2 size={10} className="shrink-0" />
                          <span className="truncate">{f.dominio}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between mt-3">
                <span className="text-[10px] text-gray-600">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                <button
                  onClick={() => saveToNotebook(msg)}
                  className={`text-xs px-2 py-1 rounded-lg transition-all duration-200 ${
                    hoveredMsg === msg.id
                      ? 'text-amber-400 bg-amber-500/10'
                      : 'text-gray-500'
                  }`}
                  title="Salvar no Caderno"
                >
                  
                </button>
              </div>
            </div>
          </div>
        ))}
        {isGenerating && (
          <div className="flex justify-start animate-slide-up">
            <div className="glass border-l-4 border-l-amber-500/50 rounded-2xl px-4 py-3 flex items-center gap-2.5">
              <img loading="lazy"
                src="/assets/sagui_estudando_2.png"
                alt="Sagui digitando"
                draggable={false}
                className="w-8 h-8 rounded-full object-cover border border-white/10 mascot-assist-idle shrink-0"
              />
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">Sagui está digitando</span>
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="glass rounded-2xl p-1.5 flex items-end gap-1.5">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => {
            setInput(e.target.value);
            if (inputRef.current) autoResize(inputRef.current);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Digite sua mensagem..."
          rows={1}
          className="flex-1 resize-none bg-transparent border-0 focus:ring-0 text-sm py-2.5 px-3 scrollbar-none"
          style={{ background: 'transparent', boxShadow: 'none', maxHeight: '200px' }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileCapture}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all relative group shrink-0"
          title="Tirar foto"
        >
          <Camera size={18} />
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-[10px] text-gray-300 px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none"> Foto
          </span>
        </button>
        <button
          onClick={handleVoice}
          className={`w-11 h-11 flex items-center justify-center rounded-xl transition-all relative group shrink-0 ${
            isListening
              ? 'bg-red-500/15 text-red-400 shadow-[0_0_16px_rgba(239,68,68,0.2)]'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
          }`}
          title={isListening ? 'Gravando...' : 'Voz'}
        >
          {isListening ? (
            <Mic size={18} className="animate-pulse" />
          ) : (
            <Mic size={18} />
          )}
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-[10px] text-gray-300 px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            {isListening ? 'Gravando...' : 'Voz'}
          </span>
        </button>
        <button
          onClick={() => handleSend(input)}
          disabled={!input.trim()}
          className="h-10 w-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-gray-900 font-bold shadow-[0_4px_14px_rgba(245,158,11,0.25)] hover:shadow-[0_6px_20px_rgba(245,158,11,0.35)] hover:brightness-110 active:brightness-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:brightness-100 shrink-0"
        >
          <SendHorizontal size={16} />
        </button>
      </div>

      <PersonaManager />
    </div>
  );
}


