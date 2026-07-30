import { useAppStore } from '../../stores/appStore';
import { IconMoon, IconLogOut, IconBarChart } from '../../shared/ui/Icons';

export function ParentPage() {
  const { session, logout } = useAppStore();

  return (
    <div className="min-h-screen" style={{ background: '#0b1120' }}>
      {/* Header */}
      <header className="glass border-b border-white/[0.03]">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/10">
              <IconMoon size={20} className="text-gray-900" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-white">
                <span className="text-gradient">Midnight Mentor</span>
              </h1>
              <p className="text-[10px] text-gray-500 tracking-wide uppercase">Painel dos Pais</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 hidden md:block">{session?.nome}</span>
            <span className="px-2 py-1 rounded-full bg-violet-500/10 text-violet-400 text-[10px] font-medium border border-violet-500/20">
              Responsável
            </span>
            <button onClick={logout} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Sair">
              <IconLogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-8 py-8 space-y-6 animate-fade-up">
        {/* Welcome */}
        <div>
          <h2 className="text-2xl font-bold text-white">
            Olá, {session?.nome?.split(' ')[0] || 'Responsável'}!
          </h2>
          <p className="text-sm text-gray-500 mt-1">Acompanhe o desempenho e os alertas do seu filho no Midnight Mentor.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Placeholder: Performance */}
          <div className="glass rounded-2xl p-6 group hover:border-white/[0.08] transition-all border border-white/5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/15 to-purple-600/10 flex items-center justify-center">
                <IconBarChart size={20} className="text-violet-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Visualizar Desempenho</h3>
                <p className="text-xs text-gray-500 mt-0.5">Notas, frequência e evolução</p>
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.02] border border-dashed border-white/5 p-4 text-center">
              <p className="text-sm text-gray-500">📊 Os dados de desempenho serão exibidos aqui em breve.</p>
              <p className="text-xs text-gray-600 mt-1">Gráficos de notas, quizzes e atividades.</p>
            </div>
          </div>

          {/* Placeholder: Alerts */}
          <div className="glass rounded-2xl p-6 group hover:border-white/[0.08] transition-all border border-white/5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/15 to-orange-600/10 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Alertas do Mentor</h3>
                <p className="text-xs text-gray-500 mt-0.5">Notificações e recomendações</p>
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.02] border border-dashed border-white/5 p-4 text-center">
              <p className="text-sm text-gray-500">🔔 Os alertas personalizados serão exibidos aqui.</p>
              <p className="text-xs text-gray-600 mt-1">Notificações sobre engajamento e desempenho.</p>
            </div>
          </div>
        </div>

        {/* Info card */}
        <div className="glass rounded-2xl p-5 border border-violet-500/10 bg-gradient-to-br from-violet-500/5 to-transparent">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center text-lg shrink-0">💜</div>
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Portal do Responsável</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Este painel está em construção. Em breve você poderá visualizar o desempenho detalhado do estudante,
                receber alertas inteligentes do Mentor sobre o progresso acadêmico, e acompanhar a jornada de estudos em tempo real.
              </p>
              <p className="text-xs text-gray-500 mt-3">
                Fique atento às novidades! 🚀
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
