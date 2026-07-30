import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import { searchKB, matchSubject, extractKeywords, SPECIAL_RESPONSES, buildKBFromQuiz } from '../../shared/lib/kbSearch';
import { getEmpathicPrefix } from '../../shared/lib/emotionEngine';
import { QUIZ_BANK } from '../../shared/lib/quizBank';
import { ENEM_KB } from '../../shared/lib/kbEnem';
import { askGemini } from '../../shared/lib/aiService';
import { ChatMessage, Nota, ChatPersona } from '../../shared/types';
import { playClick, speak, stopSpeech } from '../../shared/lib/sfx';
import { PersonaManager } from '../../shared/ui/PersonaManager';
import { IconSend, IconMic, IconCamera, IconVolume, IconVolumeOff, IconUsers, IconSparkles, IconBrain } from '../../shared/ui/Icons';

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
      Matemática: '📐 Pratique exercícios de lógica e revisão de fórmulas. Foco em razão, proporção e funções.',
      Português: '📝 Revise concordância verbal e nominal, regência e crase. Leia os enunciados com atenção.',
      História: '📜 Contextualize eventos em ordem cronológica. Destaque para Brasil Colônia, Império e Era Vargas.',
      Geografia: '🌍 Questões de geografia política, ambiental e urbana são frequentes. Atente-se a mapas.',
      Biologia: '🧬 Fisiologia humana, ecologia e genética são os temas mais cobrados.',
      Física: '⚡ Mecânica, termologia e ondas são tópicos principais. Foco em interpretação de gráficos.',
      Química: '🧪 Estequiometria, soluções e oxirredução são recorrentes. Pratique cálculos.',
      Filosofia: '🤔 Conheça os principais filósofos e suas ideias centrais (Sócrates, Descartes, Nietzsche).',
      Inglês: '🇬🇧 Foco em interpretação de texto e vocabulário. Palavras cognatas ajudam muito.',
      Sociologia: '🏛️ Trabalho, cultura, cidadania e movimentos sociais são temas frequentes.',
    };
    const prefix = getEmpathicPrefix(mood as any);
    return prefix ? `${prefix}\n\n${dicas[subject] || `Sobre ${subject}: revise os fundamentos e pratique questões.`}` : (dicas[subject] || `Sobre ${subject}: revise os fundamentos e pratique questões.`);
  }
  const keywords = extractKeywords(userMessage);
  const prefix = getEmpathicPrefix(mood as any);
  if (persona && !isMentor) {
    const fallback = `Não encontrei informações específicas sobre "${keywords.join(', ') || 'isso'}" na minha base. ${persona.instruction.length > 60 ? `Minha especialidade: ${persona.instruction.slice(0, 100)}...` : `Minha especialidade: ${persona.instruction}`} Que tal reformular dentro da minha área?`;
    return prefix ? `${prefix}\n\n${fallback}` : fallback;
  }
  const fallback = `Hmm, não encontrei informações sobre "${keywords.join(', ') || 'isso'}" na minha base local. 🧐 Tente reformular sua pergunta ou explore as seções Quiz, Redação e Caderno de Estudos!`;
  return prefix ? `${prefix}\n\n${fallback}` : fallback;
}

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
  const { chatMessages, addChatMessage, detectAndSetMood, isMuted, setIsMuted, notas, setNotas, setToast,
    personas, activePersonaId, setActivePersonaId, setShowPersonaManager, apiKey } = useAppStore();
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activePersona = useMemo(() => personas.find(p => p.id === activePersonaId) || null, [personas, activePersonaId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  useEffect(() => {
    if (chatMessages.length === 0) {
      const saved = localStorage.getItem('mm_chat_messages');
      if (saved) { try { useAppStore.getState().setChatMessages(JSON.parse(saved)); } catch { } }
    }
  }, []);

  useEffect(() => {
    if (inputRef.current) autoResize(inputRef.current);
  }, [input]);

  function persistMessages(msgs: ChatMessage[]) { localStorage.setItem('mm_chat_messages', JSON.stringify(msgs)); }

  const handleSend = useCallback(async (text: string, image?: string) => {
    if (!text.trim() && !image) return;
    playClick();
    const userMsg: ChatMessage = { id: generateId(), role: 'user', text: text.trim(), timestamp: Date.now(), image };
    const newMsgs = [...chatMessages, userMsg];
    addChatMessage(userMsg);
    persistMessages(newMsgs);
    setInput('');
    if (inputRef.current) { inputRef.current.style.height = 'auto'; }
    const mood = await detectAndSetMood(text);

    if (apiKey) {
      setIsGenerating(true);
      try {
        abortRef.current = new AbortController();
        const reply = await askGemini(text || (image ? 'Analise esta imagem de estudo' : ''), activePersona, apiKey, image, abortRef.current.signal);
        const botMsg: ChatMessage = { id: generateId(), role: 'assistant', text: reply, timestamp: Date.now(), mood };
        addChatMessage(botMsg);
        persistMessages([...newMsgs, botMsg]);
        if (!isMuted) { stopSpeech(); speak(reply); }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setToast(err.message || 'Erro ao conectar com a IA. Usando modo local.', 'error');
          const fallback = getBotReply(text, mood, activePersona);
          const botMsg: ChatMessage = { id: generateId(), role: 'assistant', text: fallback, timestamp: Date.now(), mood };
          addChatMessage(botMsg);
          persistMessages([...newMsgs, botMsg]);
          if (!isMuted) { stopSpeech(); speak(fallback); }
        }
      }
      setIsGenerating(false);
    } else {
      setTimeout(() => {
        const reply = getBotReply(text, mood, activePersona);
        const botMsg: ChatMessage = { id: generateId(), role: 'assistant', text: reply, timestamp: Date.now(), mood };
        addChatMessage(botMsg);
        persistMessages([...newMsgs, botMsg]);
        if (!isMuted) { stopSpeech(); speak(reply); }
      }, 400 + Math.random() * 600);
    }
  }, [chatMessages, addChatMessage, detectAndSetMood, isMuted, activePersona, apiKey]);

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
    const newNota: Nota = { id: `nota_${Date.now()}`, text, data: new Date().toISOString(), tag: 'chat' };
    const updated = [...notas, newNota];
    setNotas(updated);
    localStorage.setItem('mm_notas', JSON.stringify(updated));
    setToast('Salva no Caderno!', 'success');
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-10rem)] md:h-[calc(100dvh-8rem)] animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-all"
            style={{ backgroundColor: activePersona ? activePersona.color + '20' : '#f59e0b20' }}
          >
            <IconBrain size={20} style={{ color: activePersona?.color || '#f59e0b' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-bold text-white">{activePersona?.name || 'Mentor IA'}</h1>
              {apiKey && (
                <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/15 flex items-center gap-1">
                  <IconSparkles size={10} /> IA
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">{getSubjectName(activePersona)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowPersonaManager(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
            title="Gerenciar Personas"
          >
            <IconUsers size={18} />
          </button>
          <button
            onClick={() => { setIsMuted(!isMuted); if (!isMuted) stopSpeech(); }}
            className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${
              isMuted ? 'text-red-400 hover:bg-red-500/10' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
            title={isMuted ? 'Som ativado' : 'Som desativado'}
          >
            {isMuted ? <IconVolumeOff size={18} /> : <IconVolume size={18} />}
          </button>
        </div>
      </div>

      {/* Persona selector cards */}
      <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none">
        {personas.map(p => {
          const isActive = activePersonaId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setActivePersonaId(p.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                isActive
                  ? 'text-white shadow-sm border'
                  : 'text-gray-400 hover:text-gray-200 bg-white/[0.02] border border-white/5'
              }`}
              style={isActive ? { backgroundColor: p.color + '18', borderColor: p.color + '35' } : {}}
            >
              <span className="text-lg">{p.icon}</span>
              <span className="font-semibold">{p.name}</span>
              {isActive && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />}
            </button>
          );
        })}
        <button
          onClick={() => setShowPersonaManager(true)}
          className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium text-gray-500 hover:text-gray-300 bg-white/[0.02] border border-white/5 border-dashed shrink-0"
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
              <IconBrain size={32} style={{ color: activePersona?.color || '#f59e0b' }} />
            </div>
            <p className="text-gray-400 font-medium">
              {activePersona ? `Fale com ${activePersona.name}` : 'Comece uma conversa!'}
            </p>
            <p className="text-sm text-gray-500 mt-1 max-w-xs leading-relaxed">
              {activePersona ? activePersona.instruction.slice(0, 100) + '...' : 'Pergunte sobre matérias, dicas de estudo, ou desabafe.'}
            </p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => handleSend('Dicas de estudo para o ENEM')} className="btn-secondary text-xs px-4 py-2">
                💡 Dicas ENEM
              </button>
              <button onClick={() => handleSend('Como fazer uma redação nota 1000?')} className="btn-secondary text-xs px-4 py-2">
                ✍️ Redação
              </button>
              <button onClick={() => handleSend('Matemática básica para o ENEM')} className="btn-secondary text-xs px-4 py-2">
                📐 Matemática
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
              className={`max-w-[88%] md:max-w-[72%] rounded-2xl p-4 ${
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
              {msg.text && <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{msg.text}</p>}
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
                  📓
                </button>
              </div>
            </div>
          </div>
        ))}
        {isGenerating && (
          <div className="flex justify-start animate-slide-up">
            <div className="glass border-l-4 border-l-amber-500/50 rounded-2xl px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">Pensando</span>
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
          className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all relative group shrink-0"
          title="Tirar foto"
        >
          <IconCamera size={18} />
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-[10px] text-gray-300 px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Foto
          </span>
        </button>
        <button
          onClick={handleVoice}
          className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all relative group shrink-0 ${
            isListening
              ? 'bg-red-500/15 text-red-400 shadow-[0_0_16px_rgba(239,68,68,0.2)]'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
          }`}
          title={isListening ? 'Gravando...' : 'Voz'}
        >
          {isListening ? (
            <IconMic size={18} className="animate-pulse" />
          ) : (
            <IconMic size={18} />
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
          <IconSend size={16} />
        </button>
      </div>

      <PersonaManager />
    </div>
  );
}


