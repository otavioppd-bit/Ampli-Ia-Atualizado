import { useEffect, useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import { getSSCColor, getSSCLabel } from '../../shared/lib/sscCalculator';
import { DailyPlan, QuizResult } from '../../shared/types';
import { IconMoon, IconSparkles, IconBarChart, IconClock, IconTarget, IconBookOpen } from '../../shared/ui/Icons';
import { getToday, MOOD_LABEL, MOOD_EMOJI, MOOD_COLOR } from '../../shared/lib/utils';

export function DashboardPage() {
  const {
    currentMood, moodColor, sscScore, sono, cansaco, gamification, dailyPlan,
    setSono, setCansaco, recalcSSC, completeTask, regeneratePlan,
    quizResults, logs, session,
  } = useAppStore();

  useEffect(() => {
    recalcSSC();
    const stored = localStorage.getItem(`mm_plan_${getToday()}`);
    if (stored) {
      try { const plan = JSON.parse(stored) as DailyPlan; useAppStore.setState({ dailyPlan: plan }); } catch { }
    } else {
      regeneratePlan();
    }
  }, []);

  const xpForNext = 100 * gamification.level;
  const xpProgress = gamification.xp % xpForNext;
  const sscLevel = getSSCLabel(sscScore);
  const sscColor = getSSCColor(sscScore);

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <IconSparkles size={22} className="text-gray-900" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white">Central de Comando</h1>
            <p className="text-sm text-gray-500 mt-0.5">Bem-vindo, {session?.nome?.split(' ')[0] || 'Estudante'}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition-all ${
          gamification.streak >= 3 ? 'bg-amber-500/10 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.05)]' : 'bg-white/5 text-gray-400'
        }`}>
          <span className={gamification.streak >= 3 ? 'animate-pulse-subtle' : ''}>🔥</span>
          <span className="font-bold tabular-nums">{gamification.streak}</span>
          <span className="text-xs opacity-60">dias</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass rounded-2xl p-5 group hover:border-white/[0.08] transition-all">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full animate-pulse-subtle" style={{ backgroundColor: moodColor, boxShadow: `0 0 12px ${moodColor}40` }} />
            <span className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Humor</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{MOOD_EMOJI[currentMood] || '😌'}</span>
            <div>
              <p className="text-xl font-bold text-white">{MOOD_LABEL[currentMood] || 'Tranquilo'}</p>
              <p className="text-xs text-gray-500">Baseado nas conversas</p>
            </div>
          </div>

        </div>

        <div className="glass rounded-2xl p-5 group hover:border-white/[0.08] transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Prontidão (SSC)</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full transition-all" style={{ backgroundColor: sscColor + '18', color: sscColor }}>
              {sscLevel}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3" />
                <circle cx="20" cy="20" r="16" fill="none" stroke={sscColor} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${(sscScore / 100) * 100.5} 100.5`} className="transition-all duration-1000 ease-out" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold tabular-nums" style={{ color: sscColor }}>{sscScore}%</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${sscScore}%`, backgroundColor: sscColor }} />
              </div>
              <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                <span>Descansado</span>
                <span>Sobrecarga</span>
              </div>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-5 group hover:border-white/[0.08] transition-all">
          <span className="text-[11px] text-gray-500 uppercase tracking-wider font-medium block mb-3">Estado Físico</span>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">😴</span>
                <span className="text-sm text-gray-400">Sono</span>
              </div>
              <span className="text-sm font-medium text-white tabular-nums">{sono}h</span>
            </div>
            <input type="range" min="0" max="12" step="0.5" value={sono} onChange={e => { setSono(+e.target.value); recalcSSC(); }} className="w-full h-2 md:h-1.5" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">😩</span>
                <span className="text-sm text-gray-400">Cansaço</span>
              </div>
              <span className="text-sm font-medium text-white tabular-nums">{cansaco}/10</span>
            </div>
            <input type="range" min="0" max="10" step="1" value={cansaco} onChange={e => { setCansaco(+e.target.value); recalcSSC(); }} className="w-full h-2 md:h-1.5" />
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <IconClock size={16} className="text-amber-400" />
            Plano do Dia
            {currentMood && (
              <span className="hidden sm:inline text-xs text-gray-500 font-normal ml-1">
                — {MOOD_LABEL[currentMood] || 'Neutro'} {MOOD_EMOJI[currentMood] || ''}
              </span>
            )}
          </h2>
          <span className="text-xs text-gray-500 tabular-nums bg-white/[0.03] px-2.5 py-1 rounded-full">
            {dailyPlan?.tasks.filter(t => t.completed).length || 0}/{dailyPlan?.tasks.length || 0} concluídas
          </span>
        </div>
        {dailyPlan && dailyPlan.tasks.length > 0 ? (
          <div className="space-y-2">
            {dailyPlan.tasks.map(task => (
              <label key={task.id}
                className={`flex items-start gap-3 p-3.5 rounded-xl cursor-pointer transition-all duration-200 border ${
                  task.completed ? 'bg-white/[0.02] border-white/5' : 'hover:bg-white/[0.02] border-transparent hover:border-white/5'
                }`}>
                <input type="checkbox" checked={task.completed} onChange={() => completeTask(task.id)} className="mt-0.5" />
                <div className={`flex-1 ${task.completed ? 'opacity-40' : ''}`}>
                  <span className={`text-sm font-medium ${task.completed ? 'text-gray-500 line-through' : 'text-white'}`}>
                    {task.emoji} {task.titulo}
                  </span>
                  <p className={`text-xs mt-0.5 ${task.completed ? 'text-gray-600' : 'text-gray-500'}`}>{task.descricao}</p>
                </div>
                {!task.completed && (
                  <span className="text-[10px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">+20 XP</span>
                )}
              </label>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.02] flex items-center justify-center text-2xl mx-auto mb-3">📋</div>
            <p className="text-sm text-gray-500">Ajuste seu humor para gerar um plano personalizado.</p>
          </div>
        )}
      </div>

      {quizResults.length > 0 && <QuizPerformance quizResults={quizResults} />}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] text-gray-500 uppercase tracking-wider font-medium flex items-center gap-1.5">
              <IconBarChart size={14} /> Progresso
            </span>
            <span className="text-xs text-gray-500 tabular-nums">Nível {gamification.level}</span>
          </div>
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-2xl font-bold text-white tabular-nums">{xpProgress}</span>
            <span className="text-sm text-gray-500 tabular-nums">/ {xpForNext} XP</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 xp-bar" style={{ width: `${(xpProgress / xpForNext) * 100}%` }} />
          </div>
          <p className="text-xs text-gray-500 mt-2 tabular-nums">{gamification.xp} XP acumulados</p>
        </div>

        <div className="glass rounded-2xl p-5">
          <span className="text-[11px] text-gray-500 uppercase tracking-wider font-medium block mb-3 flex items-center gap-1.5">
            <IconMoon size={14} /> Biofeedback (24h)
          </span>
          <MoodMiniGraph />
        </div>

        <div className="glass rounded-2xl p-5">
          <span className="text-[11px] text-gray-500 uppercase tracking-wider font-medium block mb-3 flex items-center gap-1.5">
            <IconBookOpen size={14} /> Atividades
          </span>
          <ActivitySummary logs={logs} />
        </div>
      </div>
    </div>
  );
}

function QuizPerformance({ quizResults }: { quizResults: QuizResult[] }) {
  const perMateria = useMemo(() => {
    const map = new Map<string, { acertos: number; total: number; count: number }>();
    for (const r of quizResults) {
      const prev = map.get(r.materia) || { acertos: 0, total: 0, count: 0 };
      prev.acertos += r.acertos;
      prev.total += r.total;
      prev.count += 1;
      map.set(r.materia, prev);
    }
    return Array.from(map.entries())
      .map(([materia, data]) => ({ materia, ...data, pct: Math.round((data.acertos / data.total) * 100) }))
      .sort((a, b) => b.pct - a.pct);
  }, [quizResults]);

  const media = Math.round(perMateria.reduce((acc, m) => acc + m.pct, 0) / perMateria.length);

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <IconTarget size={16} className="text-amber-400" />
          Desempenho nos Quizzes
        </h2>
        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
          media >= 70 ? 'bg-emerald-500/10 text-emerald-400' : media >= 40 ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
        }`}>
          {media}% média
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {perMateria.map(m => (
          <div key={m.materia} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/[0.02] transition-all">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-300 truncate">{m.materia}</span>
                <span className="text-xs text-gray-500 tabular-nums ml-2 shrink-0">{m.acertos}/{m.total}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${m.pct}%`, backgroundColor: m.pct >= 70 ? '#10b981' : m.pct >= 40 ? '#f59e0b' : '#ef4444' }} />
              </div>
            </div>
            <span className={`text-xs font-bold tabular-nums w-10 text-right ${
              m.pct >= 70 ? 'text-emerald-400' : m.pct >= 40 ? 'text-amber-400' : 'text-red-400'
            }`}>{m.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivitySummary({ logs }: { logs: { type: string; timestamp: number }[] }) {
  const hoje = useMemo(() => new Date().toDateString(), []);
  const semana = useMemo(() => {
    const dias: { label: string; active: boolean; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toDateString();
      const dayLogs = logs.filter(l => new Date(l.timestamp).toDateString() === dateStr);
      dias.push({
        label: d.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3),
        active: dayLogs.length > 0,
        count: dayLogs.length,
      });
    }
    return dias;
  }, [logs]);

  const totalHoje = useMemo(() =>
    logs.filter(l => new Date(l.timestamp).toDateString() === hoje).length,
  [logs, hoje]);
  const totalSemana = logs.length;

  const hojeRef = useMemo(() => new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }), []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-gray-400 mb-1 capitalize">
        <span>{hojeRef}</span>
        <span className="text-white font-medium tabular-nums">{totalHoje} atividade{totalHoje !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex items-center gap-1.5 justify-center">
        {semana.map((dia, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className={`w-full aspect-square rounded-lg transition-all ${
              dia.active ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.15)]' : 'bg-white/[0.03]'
            }`} style={{ width: '24px' }} title={`${dia.count} atividades`} />
            <span className={`text-[9px] font-medium ${dia.active ? 'text-gray-400' : 'text-gray-600'}`}>{dia.label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-white/[0.03]">
        <span className="text-gray-500">Total 7 dias</span>
        <span className="text-white font-medium tabular-nums">{totalSemana} atividades</span>
      </div>
    </div>
  );
}

function MoodMiniGraph() {
  const moodHistory = useAppStore(s => s.moodHistory);
  const recent = moodHistory.slice(-24);

  const moodLabels: Record<string, string> = {
    stress: 'Estresse', anxiety: 'Ansiedade', sadness: 'Tristeza', tired: 'Cansaço',
    demotivated: 'Desmotivação', focused: 'Foco', motivated: 'Motivação',
    happy: 'Alegria', energetic: 'Energia', neutral: 'Neutro',
  };

  const timeline = useMemo(() => {
    if (recent.length === 0) return [];
    const entries = [...recent];
    const minTime = entries[0]?.timestamp || Date.now();
    const maxTime = entries[entries.length - 1]?.timestamp || Date.now();
    const range = Math.max(maxTime - minTime, 1);
    return entries.map(e => ({ ...e, x: ((e.timestamp - minTime) / range) * 100 }));
  }, [recent]);

  if (recent.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-4">Converse com o Mentor para gerar registros emocionais.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-[2px] h-14 relative">
        {timeline.map((entry, i) => (
          <div key={i}
            className="flex-1 rounded-t-sm transition-all duration-300 hover:opacity-80 hover:scale-y-110 origin-bottom cursor-pointer relative group"
            style={{
              backgroundColor: MOOD_COLOR[entry.mood] || '#475569',
              height: `${25 + (Object.values(MOOD_COLOR).indexOf(MOOD_COLOR[entry.mood] || '#475569') / Object.keys(MOOD_COLOR).length) * 40}%`,
              minHeight: '8px',
            }}
            title={`${moodLabels[entry.mood] || entry.mood} — ${new Date(entry.timestamp).toLocaleTimeString()}`}>
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/30 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-gray-500 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" /> Estresse</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" /> Ansiedade</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#a855f7]" /> Tristeza</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" /> Positivo</span>
      </div>
    </div>
  );
}