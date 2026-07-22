import { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { getMaterias, getRandomQuestions } from '../../shared/lib/quizBank';
import { QuizQuestion, QuizResult } from '../../shared/types';
import { playCorrect, playError, playLevelUp } from '../../shared/lib/sfx';

type Stage = 'select' | 'playing' | 'result';

const MAT_ICONS: Record<string, string> = {
  Matemática: '📐', Português: '📝', Biologia: '🧬', Física: '⚡', Química: '🧪',
  História: '📜', Geografia: '🌍', Filosofia: '🤔', Inglês: '🇬🇧', Redação: '✍️',
  Sociologia: '🏛️',
};

export function QuizPage() {
  const [stage, setStage] = useState<Stage>('select');
  const [materia, setMateria] = useState('');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAlt, setSelectedAlt] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [acertos, setAcertos] = useState(0);
  const [result, setResult] = useState<QuizResult | null>(null);

  const { addXP, addLog, isMuted, quizResults, addQuizResult } = useAppStore();
  const materias = getMaterias();

  const flashcardQuiz = (window as any).__flashcardQuiz as QuizQuestion[] | undefined;
  if (flashcardQuiz && stage === 'select') {
    const fq = flashcardQuiz;
    (window as any).__flashcardQuiz = undefined;
    setTimeout(() => startQuiz('Flashcards', fq), 0);
  }

  function startQuiz(m: string, qs?: QuizQuestion[]) {
    setMateria(m);
    const qList = qs || getRandomQuestions(m, 3);
    setQuestions(qList);
    setCurrentIndex(0); setSelectedAlt(null); setShowExplanation(false); setAcertos(0); setResult(null);
    setStage('playing');
  }

  function handleAnswer(idx: number) {
    if (selectedAlt !== null) return;
    setSelectedAlt(idx);
    setShowExplanation(true);
    const isCorrect = idx === questions[currentIndex].correta;
    if (isCorrect) { setAcertos(p => p + 1); if (!isMuted) playCorrect(); }
    else { if (!isMuted) playError(); }
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
    setStage('result');
  }

  if (stage === 'select') {
    return (
      <div className="space-y-5 animate-fade-up">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/15 to-amber-600/10 flex items-center justify-center text-lg">🎯</div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white">Quiz Adaptativo</h1>
            <p className="text-sm text-gray-500 mt-0.5">Escolha uma matéria para praticar</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {materias.map(m => (
            <button
              key={m}
              onClick={() => startQuiz(m)}
              className="glass rounded-2xl p-5 text-center hover:border-amber-500/20 hover:shadow-[0_8px_32px_rgba(245,158,11,0.08)] transition-all group border border-white/5"
            >
              <span className="text-3xl block mb-3 group-hover:scale-110 transition-transform">{MAT_ICONS[m] || '📚'}</span>
              <p className="text-sm font-semibold text-white">{m}</p>
              <p className="text-xs text-gray-500 mt-1">3 questões · +90 XP</p>
            </button>
          ))}
        </div>

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

  if (stage === 'result' && result) {
    const pct = Math.round((result.acertos / result.total) * 100);
    const grade = pct >= 80 ? 'Excelente!' : pct >= 60 ? 'Mandou bem!' : pct >= 30 ? 'Bom, mas pode melhorar!' : 'Continue praticando!';
    return (
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
            <button onClick={() => startQuiz(result.materia)} className="btn-primary">Tentar novamente</button>
            <button onClick={() => setStage('select')} className="btn-secondary">Outra matéria</button>
          </div>
        </div>
      </div>
    );
  }

  const question = questions[currentIndex];

  return (
    <div className="space-y-5 animate-fade-up max-w-2xl mx-auto">
      {/* Progress header */}
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
              i === currentIndex
                ? 'bg-amber-400 w-6'
                : i < currentIndex
                  ? 'bg-emerald-500/50 w-2'
                  : 'bg-white/10 w-2'
            }`} />
          ))}
        </div>
      </div>

      {/* Question */}
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
                className={`w-full text-left p-4 rounded-xl border ${style} transition-all duration-200 text-sm hover:bg-white/[0.02]`}
              >
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-mono mr-3 ${
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
