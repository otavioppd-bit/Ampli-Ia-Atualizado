import { useState, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import { QuizQuestion, QuizResult } from '../../shared/types';
import { generateQuizQuestions, aiAvailable } from '../../shared/lib/aiService';
import { playCorrect, playError, playLevelUp } from '../../shared/lib/sfx';
import { mascotStore } from '../../stores/mascotStore';
import { XpMilestone } from '../../shared/ui/XpMilestone';

type Stage = 'select' | 'topics' | 'playing' | 'result';

const MAT_ICONS: Record<string, string> = {
  Matemática: '📐', Português: '📝', Biologia: '🧬', Física: '⚡', Química: '🧪',
  História: '📜', Geografia: '🌍', Filosofia: '🤔', Inglês: '🇬🇧', Redação: '✍️',
};

const MATERIAS = ['Matemática', 'Português', 'Biologia', 'Física', 'Química', 'História', 'Geografia', 'Filosofia', 'Inglês', 'Redação'];

const TOPIC_MAP: Record<string, string[]> = {
  'Matemática': ['Trigonometria', 'Funções', 'Geometria Plana', 'Geometria Espacial', 'Probabilidade', 'Estatística', 'Análise Combinatória', 'Matrizes', 'Logaritmos', 'Progressões'],
  'Português': ['Crase', 'Concordância', 'Regência', 'Figuras de Linguagem', 'Interpretação Textual', 'Literatura Brasileira', 'Funções da Linguagem', 'Ortografia', 'Morfologia', 'Colocação Pronominal'],
  'Biologia': ['Citologia', 'Genética', 'Ecologia', 'Fisiologia Humana', 'Botânica', 'Zoologia', 'Evolução', 'Microbiologia', 'Bioquímica', 'Imunologia'],
  'Física': ['Mecânica', 'Termodinâmica', 'Óptica', 'Eletromagnetismo', 'Ondulatória', 'Hidrostática', 'Física Moderna', 'Cinemática', 'Dinâmica', 'Eletrodinâmica'],
  'Química': ['Química Orgânica', 'Estequiometria', 'Soluções', 'Termoquímica', 'Eletroquímica', 'Cinética Química', 'Equilíbrio Químico', 'Atomística', 'Ligações Químicas', 'Funções Inorgânicas'],
  'História': ['Brasil Colônia', 'Brasil Império', 'Era Vargas', 'Ditadura Militar', 'Revolução Francesa', 'Guerras Mundiais', 'Grécia Antiga', 'Roma Antiga', 'Independência do Brasil', 'República Velha'],
  'Geografia': ['Geopolítica', 'Climatologia', 'Geomorfologia', 'Urbanização', 'População', 'Cartografia', 'Meio Ambiente', 'Hidrografia', 'Agricultura', 'Globalização'],
  'Filosofia': ['Filosofia Antiga', 'Filosofia Medieval', 'Racionalismo', 'Empirismo', 'Ética', 'Política', 'Filosofia Contemporânea', 'Lógica', 'Estética', 'Existencialismo'],
  'Inglês': ['Interpretação Textual', 'Verbos Irregulares', 'Tempos Verbais', 'Conjunções', 'Preposições', 'Voz Passiva', 'Condicionais', 'Pronomes', 'Cognatos', 'Vocabulário ENEM'],
  'Redação': ['Estrutura Dissertativa', 'Repertório Sociocultural', 'Argumentação', 'Coesão Textual', 'Proposta de Intervenção', 'Introdução', 'Desenvolvimento', 'Conclusão', 'Temas ENEM', 'Citação'],
};

function parseQuestions(text: string): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  const blocks = text.split(/(?=^\d+[.)]|\*\*\d+[.)])/m).filter(b => b.trim().length > 50);
  for (const block of blocks) {
    try {
      const lines = block.split('\n').filter(l => l.trim());
      const enunciado = lines[0].replace(/^\d+[.)]\s*\*{0,2}/, '').trim();
      const alternativas: string[] = [];
      let correta = -1;
      let explicacao = '';
      for (const line of lines.slice(1)) {
        const trimmed = line.trim();
        if (/^[a-eA-E][.)]/.test(trimmed)) {
          const text = trimmed.replace(/^[a-eA-E][.)]\s*/, '').replace(/\*{1,2}/g, '').trim();
          alternativas.push(text);
          if (trimmed.includes('*') && !trimmed.includes('**')) {
            correta = alternativas.length - 1;
          }
        } else if (trimmed.toLowerCase().startsWith('resposta') || trimmed.toLowerCase().startsWith('correta')) {
          const match = trimmed.match(/[a-eA-E]/);
          if (match) correta = match[0].toUpperCase().charCodeAt(0) - 65;
        } else if (trimmed.toLowerCase().startsWith('explica') || trimmed.toLowerCase().startsWith('justificativa')) {
          explicacao = trimmed.replace(/^(explica|justificativa)[^:]*:/i, '').trim();
        }
      }
      if (enunciado && alternativas.length >= 2 && correta >= 0) {
        questions.push({
          id: `ai_q_${Date.now()}_${questions.length}`,
          materia: '',
          enunciado,
          alternativas: alternativas.slice(0, 5),
          correta: correta < alternativas.length ? correta : 0,
          explicacao: explicacao || 'Questão gerada por IA.',
        });
      }
    } catch { /* skip malformed */ }
  }
  return questions;
}

export function QuizPage() {
  const { addXP, addLog, isMuted, quizResults, addQuizResult, apiKey, setToast } = useAppStore();
  const [stage, setStage] = useState<Stage>('select');
  const [materia, setMateria] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAlt, setSelectedAlt] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [acertos, setAcertos] = useState(0);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showMilestone, setShowMilestone] = useState(false);

  const flashcardQuiz = (window as any).__flashcardQuiz as QuizQuestion[] | undefined;
  if (flashcardQuiz && stage === 'select') {
    const fq = flashcardQuiz;
    (window as any).__flashcardQuiz = undefined;
    setTimeout(() => { setMateria('Flashcards'); setQuestions(fq); setStage('playing'); }, 0);
  }

  const startQuiz = useCallback(async () => {
    if (!materia || selectedTopics.length === 0) return;
    setGenerating(true);
    mascotStore.getState().setState('loading', 'Gerando suas questões com a IA');
    try {
      if (!aiAvailable(apiKey)) {
        setToast('Configure sua chave da API Gemini no Perfil para gerar quizzes.', 'error');
        setGenerating(false);
        mascotStore.getState().setState('error', 'Preciso da sua chave da IA no Perfil para criar as questões!');
        return;
      }
      const topicPrompt = selectedTopics.includes('Geral')
        ? 'Geral'
        : selectedTopics.join(', ');
      const raw = await generateQuizQuestions(materia, topicPrompt, apiKey, 10);
      const parsed = parseQuestions(raw);
      if (parsed.length > 0) {
        setQuestions(parsed.map(q => ({ ...q, materia })));
        setCurrentIndex(0); setSelectedAlt(null); setShowExplanation(false); setAcertos(0); setResult(null);
        setStage('playing');
        mascotStore.getState().setState('idle', 'Respira fundo e leia a questão com calma. 📖');
      } else {
        setToast('Não foi possível gerar questões. Tente outros tópicos.', 'error');
        setStage('topics');
        mascotStore.getState().setState('error', 'Não consegui gerar as questões. Tenta outros tópicos!');
      }
    } catch (e: any) {
      setToast(e?.message || 'Erro ao gerar questões', 'error');
      setStage('topics');
      mascotStore.getState().setState('error', 'Ops! Algo deu errado ao gerar as questões.');
    }
    setGenerating(false);
  }, [materia, selectedTopics, apiKey, setToast]);

  function toggleTopic(topic: string) {
    setSelectedTopics(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    );
  }

  function handleAnswer(idx: number) {
    if (selectedAlt !== null) return;
    setSelectedAlt(idx);
    setShowExplanation(true);
    if (idx === questions[currentIndex].correta) {
      setAcertos(p => p + 1);
      if (!isMuted) playCorrect();
      mascotStore.getState().setState('success', 'Mandou bem! 🎉 Resposta certa!');
    } else {
      if (!isMuted) playError();
      mascotStore.getState().setState('error', 'Quase! Dá uma olhada na explicação e tenta de novo! 💪');
    }
  }

  function nextQuestion() {
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(p => p + 1); setSelectedAlt(null); setShowExplanation(false);
    } else { finishQuiz(); }
  }

  function finishQuiz() {
    const xpGanho = acertos * 30;
    const res: QuizResult = { materia, acertos, total: questions.length, xpGanho, timestamp: Date.now() };
    setResult(res); addQuizResult(res); addXP(xpGanho);
    addLog({ timestamp: Date.now(), type: 'quiz', description: `Quiz de ${materia}: ${acertos}/${questions.length}`, xp: xpGanho });
    if (!isMuted && xpGanho > 0) playLevelUp();
    mascotStore.getState().setState('success', `🎉 Quiz concluído! +${xpGanho} XP de bônus — meta cumprida!`);
    setStage('result');
    if (xpGanho > 0) setShowMilestone(true);
  }

  if (stage === 'select') {
    return (
      <div className="space-y-5 animate-fade-up">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/15 to-amber-600/10 flex items-center justify-center text-lg">🎯</div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white">Quiz Adaptativo IA</h1>
            <p className="text-sm text-gray-500 mt-0.5">Escolha uma matéria para praticar</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {MATERIAS.map(m => (
            <button
              key={m}
              onClick={() => { setMateria(m); setSelectedTopics([]); setStage('topics'); }}
              className="glass rounded-2xl p-5 text-center hover:border-amber-500/20 hover:shadow-[0_8px_32px_rgba(245,158,11,0.08)] transition-all group border border-white/5"
            >
              <span className="text-3xl block mb-3 group-hover:scale-110 transition-transform">{MAT_ICONS[m] || '📚'}</span>
              <p className="text-sm font-semibold text-white">{m}</p>
              <p className="text-xs text-gray-500 mt-1">10 questões</p>
            </button>
          ))}
        </div>

        {!aiAvailable(apiKey) && (
          <div className="glass rounded-2xl p-4 border border-amber-500/10 bg-amber-500/5">
            <p className="text-sm text-amber-400 flex items-center gap-2">
              <span>⚠️</span>
              <span>Configure sua chave da API Gemini no <button onClick={() => useAppStore.getState().setActiveTab('profile')} className="underline font-medium">Perfil</button> para gerar quizzes personalizados.</span>
            </p>
          </div>
        )}

        {quizResults.length > 0 && (
          <div className="glass rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">📊 Histórico recente</h2>
            <div className="space-y-1">
              {quizResults.slice(-5).reverse().map((r, i) => {
                const pct = Math.round((r.acertos / r.total) * 100);
                return (
                  <div key={i} className="flex items-center justify-between text-sm py-2.5 px-3 rounded-xl hover:bg-white/[0.02] transition-all">
                    <div className="flex items-center gap-2">
                      <span>{MAT_ICONS[r.materia] || '📚'}</span>
                      <span className="text-gray-400">{r.materia}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium ${pct >= 60 ? 'text-emerald-400' : pct >= 30 ? 'text-amber-400' : 'text-red-400'}`}>
                        {r.acertos}/{r.total}
                      </span>
                      <span className="text-amber-400 font-medium tabular-nums text-xs bg-amber-500/10 px-2 py-0.5 rounded-full">
                        +{r.xpGanho} XP
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (stage === 'topics') {
    const topics = TOPIC_MAP[materia] || [];
    return (
      <div className="space-y-5 animate-fade-up max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ backgroundColor: '#f59e0b15' }}>
              {MAT_ICONS[materia] || '📚'}
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{materia}</h1>
              <p className="text-sm text-gray-500">Selecione os tópicos para estudar</p>
            </div>
          </div>
          <button onClick={() => setStage('select')} className="btn-ghost text-xs">← Voltar</button>
        </div>

        <div className="glass rounded-2xl p-6 space-y-4">
          <p className="text-sm text-gray-400">Escolha um ou mais tópicos para a IA gerar questões personalizadas.</p>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => toggleTopic('Geral')}
              className={`px-4 py-3 md:py-2.5 rounded-xl text-sm font-medium transition-all border min-h-[44px] ${
                selectedTopics.includes('Geral')
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                  : 'bg-white/[0.03] border-white/5 text-gray-400 hover:border-white/10 hover:text-gray-200'
              }`}
            >
              📚 Geral (todos os tópicos)
            </button>
            {topics.map(topic => (
              <button
                key={topic}
                onClick={() => toggleTopic(topic)}
                className={`px-4 py-3 md:py-2.5 rounded-xl text-sm font-medium transition-all border min-h-[44px] ${
                  selectedTopics.includes(topic)
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    : 'bg-white/[0.03] border-white/5 text-gray-400 hover:border-white/10 hover:text-gray-200'
                }`}
              >
                {topic}
              </button>
            ))}
          </div>

          {selectedTopics.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{selectedTopics.length} tópico{selectedTopics.length !== 1 ? 's' : ''} selecionado{selectedTopics.length !== 1 ? 's' : ''}</span>
              <button onClick={() => setSelectedTopics([])} className="text-red-400 hover:text-red-300 underline">Limpar</button>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={startQuiz} disabled={selectedTopics.length === 0 || generating} className="btn-primary flex-1">
              {generating ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" /> Gerando questões...</>
              ) : 'Gerar Quiz'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'result' && result) {
    const pct = Math.round((result.acertos / result.total) * 100);
    const grade = pct >= 80 ? 'Excelente!' : pct >= 60 ? 'Mandou bem!' : pct >= 30 ? 'Bom, mas pode melhorar!' : 'Continue praticando!';
    return (
      <>
      <div className="space-y-5 animate-scale-in max-w-md mx-auto">
        <div className="glass rounded-2xl p-8 text-center">
          <div className="relative w-36 h-36 mx-auto mb-5">
            <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
              <circle cx="60" cy="60" r="52" fill="none" stroke={pct >= 60 ? '#10b981' : pct >= 30 ? '#f59e0b' : '#ef4444'} strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${pct * 3.267} 326.7`} className="transition-all duration-1000 ease-out" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold text-white tabular-nums">{result.acertos}/{result.total}</span>
              <span className="text-[10px] text-gray-500">acertos</span>
            </div>
          </div>

          <span className={`inline-block text-xs font-medium px-3 py-1 rounded-full ${
            pct >= 60 ? 'bg-emerald-500/10 text-emerald-400' : pct >= 30 ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
          }`}>
            {grade}
          </span>

          <div className="mt-4 flex items-center justify-center gap-2 text-lg">
            <span className="text-amber-400 font-bold tabular-nums">+{result.xpGanho} XP</span>
            <span className="text-gray-500">ganhos</span>
          </div>

          <div className="flex gap-3 mt-8 justify-center">
            <button onClick={() => { setStage('topics'); setSelectedTopics([]); }} className="btn-primary">Tentar novamente</button>
            <button onClick={() => setStage('select')} className="btn-secondary">Outra matéria</button>
          </div>
        </div>
      </div>

      {/* Marco da lição: XP salta no centro + sagui cai com joinha */}
      <XpMilestone
        open={showMilestone}
        xp={result.xpGanho}
        acertos={result.acertos}
        total={result.total}
        onClose={() => setShowMilestone(false)}
      />
      </>
    );
  }

  const question = questions[currentIndex];

  return (
    <div className="space-y-5 animate-fade-up max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ backgroundColor: '#f59e0b15' }}>
            {MAT_ICONS[materia] || '📚'}
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">{materia}</h1>
            <p className="text-xs text-gray-500">Questão {currentIndex + 1} de {questions.length}</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          {questions.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${
              i === currentIndex ? 'bg-amber-400 w-6'
                : i < currentIndex ? 'bg-emerald-500/50 w-2' : 'bg-white/10 w-2'
            }`} />
          ))}
        </div>
      </div>

      <div className="glass rounded-2xl p-6">
        <p className="text-base text-white font-medium mb-6 leading-relaxed">{question.enunciado}</p>
        <div className="space-y-2.5">
          {question.alternativas.map((alt, idx) => {
            let style = 'bg-transparent border-white/5 text-gray-200';
            if (selectedAlt !== null) {
              if (idx === question.correta) style = 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200';
              else if (idx === selectedAlt && idx !== question.correta) style = 'bg-red-500/10 border-red-500/40 text-red-200';
              else style = 'opacity-30 border-white/5 text-gray-400';
            }
            return (
              <button
                key={idx}
                onClick={() => handleAnswer(idx)}
                disabled={selectedAlt !== null}
                className={`w-full text-left p-4 md:p-4 rounded-xl border ${style} transition-all duration-200 text-sm md:text-base hover:bg-white/[0.02] min-h-[52px]`}
              >
                <span className={`inline-flex items-center justify-center w-7 h-7 md:w-6 md:h-6 rounded-lg text-sm font-mono mr-3 ${
                  selectedAlt !== null && idx === question.correta
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : selectedAlt !== null && idx === selectedAlt && idx !== question.correta
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-white/5 text-gray-500'
                }`}>
                  {String.fromCharCode(65 + idx)}
                </span>
                {alt}
              </button>
            );
          })}
        </div>

        {showExplanation && (
          <div className="mt-5 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 animate-slide-up">
            <p className="text-xs text-amber-400 font-semibold tracking-wide mb-1">📖 Explicação</p>
            <p className="text-sm text-gray-300 leading-relaxed">{question.explicacao}</p>
          </div>
        )}

        {selectedAlt !== null && (
          <div className="flex justify-end mt-5">
            <button onClick={nextQuestion} className="btn-primary px-6">
              {currentIndex + 1 < questions.length ? 'Próxima →' : 'Ver resultado'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
