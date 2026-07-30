import { useMemo, Component, type ReactNode } from 'react';
import { useAppStore } from '../../stores/appStore';
import { Modal } from '../../shared/ui/Modal';
import { WeeklyReport } from '../../shared/types';

class WeeklyReportErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center py-8 animate-fade-up">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-2xl mx-auto mb-3">📊</div>
          <p className="text-gray-300 font-medium">Não foi possível carregar o relatório</p>
          <p className="text-sm text-gray-500 mt-1">Tente novamente mais tarde.</p>
          <button onClick={() => this.setState({ hasError: false })} className="btn-primary mt-4 text-sm">
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function generateWeeklyReport(logs: any[]): WeeklyReport {
  try {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const recentLogs = logs.filter((l: any) => l && l.timestamp >= sevenDaysAgo);

    if (!recentLogs || recentLogs.length === 0) {
      const days: { date: string; active: boolean }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now - i * 24 * 60 * 60 * 1000);
        days.push({ date: d.toISOString().split('T')[0], active: false });
      }
      return {
        diasAtivos: 0,
        totalAtividades: 0,
        totalExercicios: 0,
        performance: 'atencao',
        analise: 'Sua semana está apenas começando! 🌱 Que tal definir uma meta de 10 minutos de estudo hoje? Cada pequeno passo conta na sua jornada.',
        days,
      };
    }

    const days: { date: string; active: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      days.push({ date: dateStr, active: recentLogs.some((l: any) => l.timestamp >= dayStart && l.timestamp < dayEnd) });
    }

    const diasAtivos = days.filter(d => d.active).length;
    const totalAtividades = recentLogs.filter((l: any) => l.type === 'atividade').length;
    const totalExercicios = recentLogs.filter((l: any) => l.type === 'quiz' || l.type === 'exercicio').length;
    const score = diasAtivos * 2 + totalAtividades * 1 + totalExercicios * 2;

    let performance: WeeklyReport['performance'] = 'regular';
    let analise = '';

    if (score >= 20) {
      performance = 'excelente';
      analise = 'Semana brilhante! 🌟 Sua consistência está no caminho certo. Continue assim e os resultados no ENEM virão naturalmente.';
    } else if (score >= 12) {
      performance = 'boa';
      analise = 'Boa semana! 📈 Com pequenos ajustes na regularidade, você chega ao próximo nível. Tente manter uma média de 1h por dia.';
    } else if (score >= 6) {
      performance = 'regular';
      analise = 'Semana regular. 💪 Identifique quais dias foram mais produtivos e tente replicar. Lembre-se: constância vence intensidade.';
    } else {
      performance = 'atencao';
      analise = 'Toda jornada começa com um primeiro passo. 🌱 Defina metas pequenas para hoje — 10 minutos já fazem diferença. Você consegue!';
    }

    return { diasAtivos, totalAtividades, totalExercicios, performance, analise, days };
  } catch (e) {
    console.warn('Erro ao gerar relatório semanal:', e);
    const days: { date: string; active: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      days.push({ date: d.toISOString().split('T')[0], active: false });
    }
    return {
      diasAtivos: 0,
      totalAtividades: 0,
      totalExercicios: 0,
      performance: 'atencao',
      analise: 'Não foi possível analisar seus dados esta semana. 🌱 Continue estudando e o relatório será gerado automaticamente na próxima semana.',
      days,
    };
  }
}

function ReportContent() {
  const { logs, gamification } = useAppStore();
  const report = useMemo(() => {
    try {
      return generateWeeklyReport(logs);
    } catch {
      const days: { date: string; active: boolean }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        days.push({ date: d.toISOString().split('T')[0], active: false });
      }
      return { diasAtivos: 0, totalAtividades: 0, totalExercicios: 0, performance: 'atencao' as const, analise: 'Continue estudando!', days };
    }
  }, [logs]);

  const perfStyles: Record<string, string> = {
    excelente: 'text-emerald-400 bg-emerald-500/10',
    boa: 'text-amber-400 bg-amber-500/10',
    regular: 'text-orange-400 bg-orange-500/10',
    atencao: 'text-red-400 bg-red-500/10',
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium">Atividades</h3>
        <div className="flex gap-1.5">
          {report.days.map((day, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <div className={`w-full aspect-square rounded-xl transition-all ${day.active ? 'bg-emerald-500 shadow-[0_0_16px_rgba(16,185,129,0.2)]' : 'bg-white/[0.03]'}`} />
              <span className="text-[10px] text-gray-600 font-medium">
                {new Date(day.date).toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Dias Ativos', value: `${report.diasAtivos}/7` },
          { label: 'Atividades', value: report.totalAtividades },
          { label: 'Exercícios', value: report.totalExercicios },
        ].map(s => (
          <div key={s.label} className="text-center glass-light rounded-xl p-3">
            <p className="text-xl font-bold text-white tabular-nums">{s.value}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="text-center">
        <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-semibold ${perfStyles[report.performance]}`}>
          {report.performance === 'excelente' && '⭐ Excelente'}
          {report.performance === 'boa' && '👍 Boa'}
          {report.performance === 'regular' && '📊 Regular'}
          {report.performance === 'atencao' && '🌱 Começando'}
        </span>
      </div>

      <p className="text-sm text-gray-300 leading-relaxed">{report.analise}</p>

      <div className="text-center text-xs text-gray-500 flex items-center justify-center gap-1.5">
        <span>🔥 Streak atual: <strong className="text-white">{gamification.streak}</strong> dias</span>
      </div>
    </div>
  );
}

export function WeeklyReportModal() {
  const { showWeeklyReport, setShowWeeklyReport } = useAppStore();
  if (!showWeeklyReport) return null;

  return (
    <Modal open={showWeeklyReport} onClose={() => setShowWeeklyReport(false)} title="📊 Relatório Semanal">
      <WeeklyReportErrorBoundary>
        <ReportContent />
      </WeeklyReportErrorBoundary>
    </Modal>
  );
}
