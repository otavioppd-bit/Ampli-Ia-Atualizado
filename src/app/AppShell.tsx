import { lazy, Suspense, useEffect, useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { BookMarked, CalendarDays, Flame, Grid3x3, HeartHandshake, Headphones, House, LogOut, Moon, NotebookPen, PenLine, ShieldCheck, ShoppingBag, Target, Timer, Trophy, User, Users, X } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { TabId } from '../shared/types';
import { CrisisOverlay } from '../features/overlays/CrisisOverlay';
import { WeeklyReportModal } from '../features/overlays/WeeklyReportModal';
import { NotebookStudioModal } from '../features/overlays/NotebookStudioModal';
import { FocusCompanion } from '../features/foco/FocusCompanion';
import { DoomscrollGuard } from '../shared/ui/DoomscrollGuard';
import { AssistantWidget } from '../shared/ui/AssistantWidget';
import { PageSkeleton } from '../shared/ui/Skeleton';
import { calcLevel } from '../shared/lib/utils';
import { AnimatedNumber, BarraProgresso } from '../shared/ui/AnimatedNumber';
import { bottomSheet, LIMITE_ARRASTO, listContainer, listItem, pageEnter, springTap, VELOCIDADE_FECHAR } from '../shared/lib/motionPresets';

/*
 * Cada pagina entra por import dinamico.
 *
 * Antes, tudo era importado de forma estatica: abrir a Central baixava
 * junto o Caderno (com mermaid, ~1MB) e o painel de graficos (chart.js).
 * O aluno em 4G pagava por telas que talvez nem abrisse. Agora o codigo de
 * cada aba so viaja quando a aba e aberta.
 */
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })));
const ChatPage = lazy(() => import('../features/chat/ChatPage').then(m => ({ default: m.ChatPage })));
const EssayPage = lazy(() => import('../features/essay/EssayPage').then(m => ({ default: m.EssayPage })));
const NotebookPage = lazy(() => import('../features/notebook/NotebookPage').then(m => ({ default: m.NotebookPage })));
const QuizPage = lazy(() => import('../features/quiz/QuizPage').then(m => ({ default: m.QuizPage })));
const ProfilePage = lazy(() => import('../features/profile/ProfilePage').then(m => ({ default: m.ProfilePage })));
const RankingPage = lazy(() => import('../features/ranking/RankingPage').then(m => ({ default: m.RankingPage })));
const FocoPage = lazy(() => import('../features/foco/FocoPage').then(m => ({ default: m.FocoPage })));
const StudentStore = lazy(() => import('../features/store/StudentStore').then(m => ({ default: m.StudentStore })));
const ComunidadePage = lazy(() => import('../features/comunidade/ComunidadePage').then(m => ({ default: m.ComunidadePage })));
const EscudoPage = lazy(() => import('../features/escudo/EscudoPage').then(m => ({ default: m.EscudoPage })));
const AudioPillsPage = lazy(() => import('../features/audio/AudioPillsPage').then(m => ({ default: m.AudioPillsPage })));
const CalendarioPage = lazy(() => import('../features/calendario/CalendarioPage').then(m => ({ default: m.CalendarioPage })));
const CuidadoPage = lazy(() => import('../features/cuidado/CuidadoPage').then(m => ({ default: m.CuidadoPage })));

type IconeLucide = typeof House;

interface Aba {
  id: TabId;
  label: string;
  icon: IconeLucide;
}

const TABS: Aba[] = [
  { id: 'dashboard', label: 'Central', icon: House },
  { id: 'chat', label: 'Mentor', icon: BookMarked },
  { id: 'essay', label: 'Redação', icon: PenLine },
  { id: 'foco', label: 'Foco', icon: Timer },
  { id: 'escudo', label: 'Escudo', icon: ShieldCheck },
  { id: 'quiz', label: 'Quiz', icon: Target },
  { id: 'calendario', label: 'Revisões', icon: CalendarDays },
  { id: 'audio', label: 'Áudio', icon: Headphones },
  { id: 'cuidado', label: 'Apoio', icon: HeartHandshake },
  { id: 'store', label: 'Loja', icon: ShoppingBag },
  { id: 'ranking', label: 'Ranking', icon: Trophy },
  { id: 'comunidade', label: 'Ligas', icon: Users },
  { id: 'notebook', label: 'Caderno', icon: NotebookPen },
  { id: 'profile', label: 'Perfil', icon: User },
];

/*
 * No polegar cabem 5 alvos, nao 10.
 *
 * A barra anterior espremia as dez abas com fonte de 10px, o que nenhum
 * app do genero faz. Estas quatro sao as de uso diario; o resto vai para o
 * menu "Mais", a um toque de distancia.
 */
const ABAS_PRINCIPAIS: TabId[] = ['dashboard', 'chat', 'quiz', 'foco'];

export function AppShell() {
  const { activeTab, setActiveTab, session, logout, gamification } = useAppStore();
  const { level, remainder } = calcLevel(gamification.xp);
  const xpForNext = 100 * level;
  const progresso = Math.min(100, (remainder / xpForNext) * 100);

  const [sheetAberto, setSheetAberto] = useState(false);
  const reduzir = useReducedMotion();

  const principais = TABS.filter(t => ABAS_PRINCIPAIS.includes(t.id));
  const secundarias = TABS.filter(t => !ABAS_PRINCIPAIS.includes(t.id));
  const abaSecundariaAtiva = secundarias.some(t => t.id === activeTab);

  // Esc fecha o menu, e o scroll do fundo trava enquanto ele esta aberto.
  useEffect(() => {
    if (!sheetAberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheetAberto(false); };
    document.addEventListener('keydown', aoTeclar);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [sheetAberto]);

  function irPara(id: TabId) {
    setActiveTab(id);
    setSheetAberto(false);
  }

  function renderPage() {
    switch (activeTab) {
      case 'dashboard': return <DashboardPage />;
      case 'chat': return <ChatPage />;
      case 'essay': return <EssayPage />;
      case 'notebook': return <NotebookPage />;
      case 'quiz': return <QuizPage />;
      case 'profile': return <ProfilePage />;
      case 'ranking': return <RankingPage />;
      case 'foco': return <FocoPage />;
      case 'store': return <StudentStore />;
      case 'comunidade': return <ComunidadePage />;
      case 'escudo': return <EscudoPage />;
      case 'audio': return <AudioPillsPage />;
      case 'calendario': return <CalendarioPage />;
      case 'cuidado': return <CuidadoPage />;
    }
  }

  const inicial = session?.nome?.charAt(0)?.toUpperCase() || '?';
  const streakForte = gamification.streak >= 3;

  return (
    <div className="min-h-screen flex" style={{ background: '#0b1120' }}>
      {/* ============================================================
          Tablet: rail de 72px so com icones.
          Em md a sidebar de 264px comia um terco da largura util.
          ============================================================ */}
      <aside className="hidden md:flex lg:hidden flex-col w-[72px] h-screen fixed left-0 top-0 z-40">
        <div className="flex-1 flex flex-col items-center glass mx-1.5 my-2 rounded-2xl py-3 gap-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-glow mb-2 shrink-0">
            <Moon size={20} className="text-gray-900" />
          </div>

          <nav className="flex-1 flex flex-col gap-1 w-full items-center overflow-y-auto px-1.5">
            {TABS.map((tab) => {
              const ativa = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  data-tab={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  aria-label={tab.label}
                  aria-current={ativa ? 'page' : undefined}
                  className={`rail-item relative w-11 h-11 shrink-0 flex items-center justify-center rounded-xl press ${
                    ativa ? 'text-amber-400' : 'text-gray-500 hover:text-gray-200'
                  }`}
                >
                  {/* layoutId faz o destaque DESLIZAR entre os itens em vez
                      de sumir aqui e aparecer ali. */}
                  {ativa && !reduzir && (
                    <m.span
                      layoutId="rail-ativo"
                      className="absolute inset-0 rounded-xl bg-amber-500/10"
                      transition={springTap}
                    />
                  )}
                  {ativa && reduzir && <span className="absolute inset-0 rounded-xl bg-amber-500/10" />}
                  <Icon size={19} className="relative z-10" />
                  <span className="rail-tip glass rounded-lg px-2.5 py-1.5 text-xs font-medium text-white">
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="w-full px-2 pt-2 border-t border-white/[0.03] flex flex-col items-center gap-2">
            <div className="text-[10px] text-amber-400 font-bold tabular-nums">Nv{level}</div>
            <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-[width] duration-500"
                style={{ width: `${progresso}%` }}
              />
            </div>
            <button
              onClick={logout}
              aria-label="Sair"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 press"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ============================================================
          Desktop: sidebar completa
          ============================================================ */}
      <aside className="hidden lg:flex flex-col w-64 h-screen fixed left-0 top-0 z-40">
        <div className="flex-1 flex flex-col glass mx-2 my-2 rounded-2xl p-4">
          <div className="flex items-center gap-3 px-2 pt-2 pb-6 mb-4 border-b border-white/[0.03]">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-glow">
              <Moon size={20} className="text-gray-900" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-white tracking-tight">
                <span className="text-gradient">Midnight Mentor</span>
              </h1>
              <p className="text-[10px] text-gray-500 tracking-wide uppercase">Mentor ENEM</p>
            </div>
          </div>

          <div className="px-1 pb-1 border-b border-white/[0.03] mb-2">
            <AssistantWidget />
          </div>

          <nav className="flex-1 space-y-0.5 px-1 overflow-y-auto">
            {TABS.map((tab) => {
              const ativa = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  data-tab={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={ativa ? 'page' : undefined}
                  className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200 group press ${
                    ativa ? 'text-amber-400' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.03]'
                  }`}
                >
                  {ativa && !reduzir && (
                    <m.span
                      layoutId="sidebar-ativo"
                      className="absolute inset-0 rounded-xl bg-amber-500/10 shadow-[inset_0_1px_0_rgba(245,158,11,0.05)]"
                      transition={springTap}
                    />
                  )}
                  {ativa && reduzir && <span className="absolute inset-0 rounded-xl bg-amber-500/10" />}
                  <Icon size={18} className={`relative z-10 ${ativa ? '' : 'transition-transform group-hover:scale-110'}`} />
                  <span className="relative z-10">{tab.label}</span>
                  {ativa && <span className="relative z-10 ml-auto w-1 h-4 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" />}
                </button>
              );
            })}
          </nav>

          <div className="px-3 py-3 mb-2 glass-light rounded-xl">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-gray-400 font-medium">Nv. {level}</span>
              <span className="text-gray-500">
                <AnimatedNumber value={remainder} />/{xpForNext} XP
              </span>
            </div>
            <BarraProgresso valor={progresso} />
          </div>

          <div className="flex items-center gap-3 px-3 py-2.5 glass-light rounded-xl">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-600/20 flex items-center justify-center text-amber-400 font-bold text-sm">
              {inicial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-medium text-white truncate">{session?.nome || 'Usuário'}</p>
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500/10 text-[8px] text-amber-400 font-medium leading-none">Aluno</span>
              </div>
              <p className="text-[10px] text-gray-500 truncate">{session?.email || ''}</p>
            </div>
            <button
              onClick={logout}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all press"
              title="Sair"
              aria-label="Sair"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ============================================================
          Mobile: top bar fixa com streak e XP.
          Antes o progresso so existia na sidebar do desktop, ou seja, o
          aluno no celular nunca via o proprio avanco.
          ============================================================ */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 safe-area-top">
        <div className="glass mx-1 mt-1 rounded-2xl px-3 py-2 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-600/20 flex items-center justify-center text-amber-400 font-bold text-sm shrink-0">
            {inicial}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-gray-400 font-semibold">Nv. {level}</span>
              <span className="text-gray-500">
                <AnimatedNumber value={remainder} />/{xpForNext} XP
              </span>
            </div>
            <BarraProgresso valor={progresso} />
          </div>

          <div
            className={`flex items-center gap-1 shrink-0 px-2 py-1 rounded-lg ${
              streakForte ? 'bg-amber-500/10' : ''
            }`}
            title={`${gamification.streak} dias seguidos`}
          >
            <Flame
              size={16}
              className={streakForte ? 'text-amber-400 motion-safe:animate-flame' : 'text-gray-500'}
              fill={streakForte ? 'currentColor' : 'none'}
            />
            <AnimatedNumber
              value={gamification.streak}
              className={`text-sm font-bold ${streakForte ? 'text-amber-400' : 'text-gray-400'}`}
            />
          </div>
        </div>
      </header>

      {/* ============================================================
          Conteudo
          ============================================================ */}
      {/* min-w-0 e o que permite o conteudo encolher.
          Por padrao um flex item tem min-width:auto e se RECUSA a ficar
          menor que o conteudo, entao qualquer bloco largo (a fileira de
          personas do chat) empurrava a pagina inteira e o app passava a
          rolar de lado, mesmo com overflow-x-auto no filho. */}
      <main className="flex-1 min-w-0 md:ml-[72px] lg:ml-64 p-3 md:p-6 lg:p-8 pt-20 md:pt-6 pb-28 md:pb-8 relative z-10">
        <div className="max-w-5xl mx-auto min-h-[calc(100dvh-3rem)]">
          {/* mode="wait": a pagina que sai termina antes de a nova entrar.
              Com as duas ao mesmo tempo o conteudo se sobrepoe e a leitura
              fica confusa. */}
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={activeTab}
              variants={reduzir ? undefined : pageEnter}
              initial={reduzir ? false : 'inicial'}
              animate={reduzir ? undefined : 'animar'}
              exit={reduzir ? undefined : 'sair'}
            >
              <Suspense fallback={<PageSkeleton />}>
                {renderPage()}
              </Suspense>
            </m.div>
          </AnimatePresence>
        </div>
      </main>

      {/* ============================================================
          Mobile: bottom nav com 5 alvos
          ============================================================ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 safe-area-bottom" aria-label="Navegação principal">
        <div className="glass rounded-2xl mx-1 px-1 py-1 flex justify-around gap-0.5">
          {principais.map((tab) => {
            const ativa = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <m.button
                key={tab.id}
                data-tab={tab.id}
                onClick={() => irPara(tab.id)}
                aria-current={ativa ? 'page' : undefined}
                whileTap={reduzir ? undefined : { scale: 0.92 }}
                transition={springTap}
                className={`tap-target relative flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-xl text-[11px] leading-tight font-medium ${
                  ativa ? 'text-amber-400' : 'text-gray-500'
                }`}
              >
                {ativa && !reduzir && (
                  <m.span
                    layoutId="bottomnav-ativo"
                    className="absolute inset-0 rounded-xl bg-amber-500/10"
                    transition={springTap}
                  />
                )}
                {ativa && reduzir && <span className="absolute inset-0 rounded-xl bg-amber-500/10" />}
                <Icon size={21} className="relative z-10" />
                <span className="relative z-10 truncate max-w-full px-0.5">{tab.label}</span>
              </m.button>
            );
          })}

          <m.button
            onClick={() => setSheetAberto(true)}
            aria-haspopup="dialog"
            aria-expanded={sheetAberto}
            whileTap={reduzir ? undefined : { scale: 0.92 }}
            transition={springTap}
            className={`tap-target flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-xl text-[11px] leading-tight font-medium ${
              abaSecundariaAtiva ? 'text-amber-400 bg-amber-500/10' : 'text-gray-500'
            }`}
          >
            <Grid3x3 size={21} />
            <span>Mais</span>
          </m.button>
        </div>
      </nav>

      {/* ============================================================
          Bottom sheet do "Mais"
          ============================================================ */}
      {/* ============================================================
          Bottom sheet do "Mais"
          ============================================================ */}
      <AnimatePresence>
        {sheetAberto && (
          <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
            <m.button
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSheetAberto(false)}
              aria-label="Fechar menu"
              tabIndex={-1}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />

            <m.div
              role="dialog"
              aria-modal="true"
              aria-label="Mais seções"
              className="relative glass rounded-t-3xl px-4 pt-3 pb-6 safe-area-bottom"
              variants={reduzir ? undefined : bottomSheet}
              initial={reduzir ? { opacity: 0 } : 'inicial'}
              animate={reduzir ? { opacity: 1 } : 'animar'}
              exit={reduzir ? { opacity: 0 } : 'sair'}
              /* Arrastar para baixo fecha: no celular o polegar ja esta
                 embaixo, entao o gesto e mais rapido que mirar no X. */
              drag={reduzir ? false : 'y'}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.4 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > LIMITE_ARRASTO || info.velocity.y > VELOCIDADE_FECHAR) {
                  setSheetAberto(false);
                }
              }}
            >
              {/* Alca: sinaliza que da para arrastar */}
              <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-4" aria-hidden="true" />

              <div className="flex items-center justify-between mb-4 px-1">
                <h2 className="text-sm font-bold text-white">Mais seções</h2>
                <m.button
                  onClick={() => setSheetAberto(false)}
                  aria-label="Fechar"
                  whileTap={reduzir ? undefined : { scale: 0.9 }}
                  transition={springTap}
                  className="tap-target flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-white/[0.05]"
                >
                  <X size={20} />
                </m.button>
              </div>

              <m.div
                className="grid grid-cols-3 gap-2"
                variants={reduzir ? undefined : listContainer}
                initial={reduzir ? false : 'inicial'}
                animate={reduzir ? undefined : 'animar'}
              >
                {secundarias.map((tab) => {
                  const ativa = activeTab === tab.id;
                  const Icon = tab.icon;
                  return (
                    <m.button
                      key={tab.id}
                      data-tab={tab.id}
                      onClick={() => irPara(tab.id)}
                      aria-current={ativa ? 'page' : undefined}
                      variants={reduzir ? undefined : listItem}
                      whileTap={reduzir ? undefined : { scale: 0.94 }}
                      transition={springTap}
                      className={`flex flex-col items-center justify-center gap-2 py-4 rounded-2xl ${
                        ativa
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'glass-light text-gray-300 border border-white/[0.04]'
                      }`}
                    >
                      <Icon size={24} />
                      <span className="text-xs font-medium">{tab.label}</span>
                    </m.button>
                  );
                })}
              </m.div>

              <m.button
                onClick={() => { setSheetAberto(false); logout(); }}
                whileTap={reduzir ? undefined : { scale: 0.97 }}
                transition={springTap}
                className="w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-red-500/10"
              >
                <LogOut size={16} />
                Sair da conta
              </m.button>
            </m.div>
          </div>
        )}
      </AnimatePresence>

      <CrisisOverlay />
      <WeeklyReportModal />
      <NotebookStudioModal />
      <FocusCompanion />
      <DoomscrollGuard />
    </div>
  );
}
