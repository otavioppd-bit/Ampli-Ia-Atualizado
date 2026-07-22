import { useEffect, useState, useCallback, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import { TabId } from '../types';

interface Step {
  id: string;
  title: string;
  description: string;
  icon: string;
  tab: TabId;
  targetSelector?: string;
}

const STEPS: Step[] = [
  { id: 'welcome', title: 'Bem-vindo ao Midnight Mentor!', description: 'Vamos fazer um tour rápido pelo seu novo assistente de estudos para o ENEM. Conheça cada ferramenta e comece a estudar com inteligência.', icon: '🌙', tab: 'dashboard' },
  { id: 'dashboard', title: 'Central de Estudos', description: 'Seu painel principal. Veja o plano de estudos do dia, registre seu humor, acompanhe seu SSC e gerencie suas tarefas diárias.', icon: '🏠', tab: 'dashboard', targetSelector: '[data-tab="dashboard"]' },
  { id: 'chat', title: 'Mentor IA', description: 'Converse com seu mentor virtual. Tire dúvidas, receba dicas de estudo e suporte emocional personalizado.', icon: '🧠', tab: 'chat', targetSelector: '[data-tab="chat"]' },
  { id: 'essay', title: 'Redação 1000', description: 'Pratique redação no formato ENEM. Receba correção automática com nota por cada competência.', icon: '✍️', tab: 'essay', targetSelector: '[data-tab="essay"]' },
  { id: 'foco', title: 'Modo Foco', description: 'Use o modo foco para estudar em blocos curtos, manter ritmo e evitar distrações.', icon: '⏱️', tab: 'foco', targetSelector: '[data-tab="foco"]' },
  { id: 'quiz', title: 'Quiz Interativo', description: 'Teste seus conhecimentos com perguntas de múltipla escolha. Ganhe XP e veja seu progresso.', icon: '🎯', tab: 'quiz', targetSelector: '[data-tab="quiz"]' },
  { id: 'comunidade', title: 'Ligas de estudo', description: 'Entre em ligas da sua turma, complete metas e use o chat focado da sua equipe.', icon: '🤝', tab: 'comunidade', targetSelector: '[data-tab="comunidade"]' },
  { id: 'ranking', title: 'Ranking e evolução', description: 'Acompanhe sua posição, evolução e os resultados das suas atividades de estudo.', icon: '🏆', tab: 'ranking', targetSelector: '[data-tab="ranking"]' },
  { id: 'notebook', title: 'Caderno de Estudos', description: 'Crie anotações organizadas com tags e busca rápida. Seu material de revisão sempre à mão.', icon: '📓', tab: 'notebook', targetSelector: '[data-tab="notebook"]' },
  { id: 'profile', title: 'Perfil e Progresso', description: 'Acompanhe seu nível, XP total, sequência de dias de estudo e todo seu histórico.', icon: '👤', tab: 'profile', targetSelector: '[data-tab="profile"]' },
  { id: 'done', title: 'Tudo pronto! 🚀', description: 'Agora você conhece todas as ferramentas. Explore cada aba, complete seus planos e evolua seu nível. Bons estudos!', icon: '🎉', tab: 'dashboard' },
];

interface Rect { top: number; left: number; width: number; height: number; }

function SpotlightOverlay({ rect, padding = 12 }: { rect: Rect; padding?: number }) {
  const r = {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };

  return (
    <>
      {/* Top bar — from top of screen to top of target */}
      <div className="fixed z-[199] bg-black/70" style={{ top: 0, left: 0, right: 0, height: r.top, pointerEvents: 'auto' }} />
      {/* Bottom bar — from bottom of target to bottom of screen */}
      <div className="fixed z-[199] bg-black/70" style={{ left: 0, right: 0, top: r.top + r.height, bottom: 0, pointerEvents: 'auto' }} />
      {/* Left bar — between top and bottom, left side to target */}
      <div className="fixed z-[199] bg-black/70" style={{ top: r.top, left: 0, width: r.left, height: r.height, pointerEvents: 'auto' }} />
      {/* Right bar — between top and bottom, target right to screen edge */}
      <div className="fixed z-[199] bg-black/70" style={{ top: r.top, left: r.left + r.width, right: 0, height: r.height, pointerEvents: 'auto' }} />
      {/* Glowing border around the cutout */}
      <div
        className="fixed z-[200] rounded-xl pointer-events-none"
        style={{
          top: r.top - 2,
          left: r.left - 2,
          width: r.width + 4,
          height: r.height + 4,
          border: '2px solid rgba(245, 158, 11, 0.7)',
          boxShadow: '0 0 24px rgba(245, 158, 11, 0.4), inset 0 0 12px rgba(245, 158, 11, 0.05)',
        }}
      />
    </>
  );
}

export function OnboardingTour() {
  const { showTutorial, tutorialStep, setShowTutorial, setTutorialStep, setActiveTab, addXP, addLog } = useAppStore();
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [cardPos, setCardPos] = useState<'bottom' | 'top' | 'right'>('bottom');
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showTutorial) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [showTutorial]);

  const locateTarget = useCallback(() => {
    const step = STEPS[tutorialStep];
    if (!step.targetSelector) { setTargetRect(null); return; }
    const el = document.querySelector<HTMLElement>(step.targetSelector);
    if (el && el.offsetParent !== null) {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const cardHeight = 340;
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      setCardPos(r.top + r.height + cardHeight > vh ? 'top' : 'bottom');
    } else {
      setTargetRect(null);
    }
  }, [tutorialStep]);

  useEffect(() => {
    if (!showTutorial) { setTargetRect(null); return; }
    const step = STEPS[tutorialStep];
    setActiveTab(step.tab);
    const id = setTimeout(locateTarget, 100);
    window.addEventListener('resize', locateTarget);
    return () => { clearTimeout(id); window.removeEventListener('resize', locateTarget); };
  }, [showTutorial, tutorialStep, setActiveTab, locateTarget]);

  if (!showTutorial) return null;

  const step = STEPS[tutorialStep];
  const isFirst = tutorialStep === 0;
  const isLast = tutorialStep === STEPS.length - 1;
  const hasTarget = !!step.targetSelector && !!targetRect;

  function handleNext() {
    if (isLast) {
      localStorage.setItem('mm_tutorial_complete', 'true');
      addXP(50);
      addLog({ timestamp: Date.now(), type: 'tutorial', description: 'Completou o tour guiado', xp: 50 });
      setShowTutorial(false);
    } else {
      setTutorialStep(tutorialStep + 1);
    }
  }

  function handleSkip() {
    localStorage.setItem('mm_tutorial_complete', 'true');
    setShowTutorial(false);
  }

  return (
    <div className="fixed inset-0 z-[200]">
      {/* Cutout overlay with hole */}
      {hasTarget ? (
        <SpotlightOverlay rect={targetRect} padding={10} />
      ) : (
        <div className="fixed inset-0 bg-black/70" style={{ pointerEvents: 'auto' }} />
      )}

      {/* Card */}
      <div
        ref={cardRef}
        className="fixed z-[201] left-1/2 -translate-x-1/2 w-full max-w-sm px-4 animate-fade-up"
        style={{
          [cardPos === 'bottom' ? 'top' : 'bottom']: hasTarget
            ? targetRect.top + targetRect.height + (cardPos === 'bottom' ? 20 : 0)
            : '50%',
          transform: hasTarget && cardPos === 'bottom' ? 'translateX(-50%)' : hasTarget ? 'translateX(-50%)' : 'translate(-50%, -50%)',
        }}
      >
        <div className="glass-card rounded-3xl p-7 text-center shadow-2xl border border-white/10" style={{ pointerEvents: 'auto' }}>
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-3xl mx-auto mb-5 shadow-glow">
            {step.icon}
          </div>

          <h2 className="text-lg font-bold text-white mb-2">{step.title}</h2>
          <p className="text-sm text-gray-400 leading-relaxed mb-6">{step.description}</p>

          {/* Dots */}
          <div className="flex items-center justify-center gap-1.5 mb-6">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setTutorialStep(i)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  i === tutorialStep ? 'bg-amber-400 w-5' : 'bg-white/10 hover:bg-white/20'
                }`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-between gap-3">
            <button onClick={handleSkip} className="btn-ghost text-xs text-gray-500 hover:text-gray-300">
              Pular tour
            </button>
            <div className="flex items-center gap-2">
              {!isFirst && (
                <button onClick={() => setTutorialStep(tutorialStep - 1)} className="btn-ghost text-sm px-3 py-2 text-gray-400">
                  ← Voltar
                </button>
              )}
              <button onClick={handleNext} className="btn-primary px-6">
                {isLast ? 'Começar!' : 'Próximo →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
