import { useAppStore } from '../stores/appStore';
import { TabId } from '../shared/types';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ChatPage } from '../features/chat/ChatPage';
import { EssayPage } from '../features/essay/EssayPage';
import { NotebookPage } from '../features/notebook/NotebookPage';
import { QuizPage } from '../features/quiz/QuizPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { RankingPage } from '../features/ranking/RankingPage';
import { FocoPage } from '../features/foco/FocoPage';
import { ComunidadePage } from '../features/comunidade/ComunidadePage';
import { CrisisOverlay } from '../features/overlays/CrisisOverlay';
import { WeeklyReportModal } from '../features/overlays/WeeklyReportModal';
import { NotebookStudioModal } from '../features/overlays/NotebookStudioModal';
import { IconHome, IconBrain, IconEdit, IconNotebook, IconTarget, IconUser, IconTrophy, IconClock, IconMoon, IconLogOut, IconUsersGroup } from '../shared/ui/Icons';
import { calcLevel } from '../shared/lib/utils';

const TABS: { id: TabId; label: string; icon: typeof IconHome }[] = [
  { id: 'dashboard', label: 'Central', icon: IconHome },
  { id: 'chat', label: 'Mentor', icon: IconBrain },
  { id: 'essay', label: 'Redação', icon: IconEdit },
  { id: 'foco', label: 'Foco', icon: IconClock },
  { id: 'quiz', label: 'Quiz', icon: IconTarget },
  { id: 'ranking', label: 'Ranking', icon: IconTrophy },
  { id: 'comunidade', label: 'Ligas', icon: IconUsersGroup },
  { id: 'notebook', label: 'Caderno', icon: IconNotebook },
  { id: 'profile', label: 'Perfil', icon: IconUser },
];

export function AppShell() {
  const { activeTab, setActiveTab, session, logout, gamification } = useAppStore();
  const { level, remainder } = calcLevel(gamification.xp);
  const xpForNext = 100 * level;

  function renderPage() {
    switch (activeTab) {
      case 'dashboard': return <DashboardPage key="dashboard" />;
      case 'chat': return <ChatPage key="chat" />;
      case 'essay': return <EssayPage key="essay" />;
      case 'notebook': return <NotebookPage key="notebook" />;
      case 'quiz': return <QuizPage key="quiz" />;
      case 'profile': return <ProfilePage key="profile" />;
      case 'ranking': return <RankingPage key="ranking" />;
      case 'foco': return <FocoPage key="foco" />;
      case 'comunidade': return <ComunidadePage key="comunidade" />;
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#0b1120' }}>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 h-screen fixed left-0 top-0 z-40">
        <div className="flex-1 flex flex-col glass mx-2 my-2 rounded-2xl p-4">
          {/* Logo */}
          <div className="flex items-center gap-3 px-2 pt-2 pb-6 mb-4 border-b border-white/[0.03]">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-glow">
              <IconMoon size={20} className="text-gray-900" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-white tracking-tight">
                <span className="text-gradient">Midnight Mentor</span>
              </h1>
              <p className="text-[10px] text-gray-500 tracking-wide uppercase">Mentor ENEM</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-0.5 px-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  data-tab={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                    isActive
                      ? 'bg-amber-500/10 text-amber-400 shadow-[inset_0_1px_0_rgba(245,158,11,0.05)]'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.03]'
                  }`}
                >
                  <Icon
                    size={18}
                    className={isActive ? '' : 'transition-transform group-hover:scale-110'}
                  />
                  <span>{tab.label}</span>
                  {isActive && <span className="ml-auto w-1 h-4 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" />}
                </button>
              );
            })}
          </nav>

          {/* XP Bar */}
          <div className="px-3 py-3 mb-2 glass-light rounded-xl">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-gray-400 font-medium">Nv. {level}</span>
              <span className="text-gray-500 tabular-nums">{remainder}/{xpForNext} XP</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full xp-bar bg-gradient-to-r from-amber-500 to-orange-500"
                style={{ width: `${(remainder / xpForNext) * 100}%` }}
              />
            </div>
          </div>

          {/* User */}
          <div className="flex items-center gap-3 px-3 py-2.5 glass-light rounded-xl">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-600/20 flex items-center justify-center text-amber-400 font-bold text-sm">
              {session?.nome?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{session?.nome || 'Usuário'}</p>
              <p className="text-[10px] text-gray-500 truncate">{session?.email || ''}</p>
            </div>
            <button
              onClick={logout}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
              title="Sair"
            >
              <IconLogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 pb-28 md:pb-8 relative z-10">
        <div className="max-w-5xl mx-auto min-h-[calc(100dvh-4rem)]">
          {renderPage()}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 px-1 pb-1.5">
        <div className="glass rounded-2xl px-1 py-1 flex justify-around gap-0">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                  key={tab.id}
                  data-tab={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center justify-center min-w-0 flex-1 py-1.5 rounded-xl transition-all duration-200 text-[9px] leading-tight font-medium ${
                    isActive
                      ? 'text-amber-400 bg-amber-500/10'
                      : 'text-gray-500'
                  }`}
                >
                  <Icon
                    size={18}
                    className={`mb-0.5 ${isActive ? '' : ''}`}
                  />
                  <span className="truncate max-w-full">{tab.label}</span>
                </button>
            );
          })}
        </div>
      </nav>

      {/* Overlays */}
      <CrisisOverlay />
      <WeeklyReportModal />
      <NotebookStudioModal />
    </div>
  );
}
