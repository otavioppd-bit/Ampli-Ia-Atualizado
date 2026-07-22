import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import { getRankingData } from '../../shared/lib/rankingEngine';
import { IconTrophy, IconTrendingUp, IconUsersGroup } from '../../shared/ui/Icons';
import type { RankingFilter, RankingData, RankingEntry } from '../../shared/types';

const FILTERS: { id: RankingFilter; label: string; icon: typeof IconTrophy }[] = [
  { id: 'geral', label: 'Geral', icon: IconTrophy },
  { id: 'turma', label: 'Turma', icon: IconUsersGroup },
  { id: 'escola', label: 'Escola', icon: IconTrendingUp },
];

const MEDALHAS = ['🥇', '🥈', '🥉'];

const AVATAR_EMOJIS = ['🐯', '🦁', '🐺', '🦅', '🐉', '🦈', '🐆', '🦊', '🐬', '🦉', '🐻', '🦄', '🐲', '🦋', '🐙', '🦩'];

function getAvatarEmoji(nome: string): string {
  let hash = 0;
  for (let i = 0; i < nome.length; i++) {
    hash = ((hash << 5) - hash) + nome.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_EMOJIS[Math.abs(hash) % AVATAR_EMOJIS.length];
}

function EntryRow({ entry, isCurrentUser }: { entry: RankingEntry; isCurrentUser: boolean }) {
  const isTop3 = entry.posicao <= 3;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
        isCurrentUser
          ? 'bg-amber-500/8 border border-amber-500/15 shadow-[0_0_12px_rgba(245,158,11,0.04)]'
          : 'hover:bg-white/[0.02] border border-transparent'
      }`}
    >
      {/* Position */}
      <div className="w-8 shrink-0 text-center">
        {isTop3 ? (
          <span className="text-lg">{MEDALHAS[entry.posicao - 1]}</span>
        ) : (
          <span className="text-sm font-bold tabular-nums text-gray-500">{entry.posicao}</span>
        )}
      </div>

      {/* Avatar */}
      {isCurrentUser ? (
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-sm font-bold text-gray-900 shrink-0">
          {entry.avatarInicial}
        </div>
      ) : (
        <div className="w-9 h-9 rounded-xl bg-white/[0.03] flex items-center justify-center text-lg shrink-0">
          {getAvatarEmoji(entry.nome)}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold truncate ${isCurrentUser ? 'text-amber-300' : 'text-gray-200'}`}>
            {entry.nome}
          </span>
          {isCurrentUser && (
            <span className="text-[9px] font-medium text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded-full shrink-0">
              VOCÊ
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          <span>{entry.turma}</span>
          <span className="w-1 h-1 rounded-full bg-gray-600" />
          <span>{entry.escola}</span>
        </div>
      </div>

      {/* XP */}
      <div className="text-right shrink-0">
        <p className="text-sm font-bold tabular-nums text-white">{entry.xp.toLocaleString()}</p>
        <div className="flex items-center justify-end gap-1">
          <p className="text-[10px] text-gray-500 tabular-nums">Nv.{entry.level}</p>
          {entry.variacao !== 0 && entry.variacao !== undefined && (
            <span className={`text-[10px] font-medium ${(entry.variacao || 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {(entry.variacao || 0) > 0 ? '+' : ''}{entry.variacao}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function RankingPage() {
  const { session, gamification } = useAppStore();
  const [filter, setFilter] = useState<RankingFilter>('geral');
  const [data, setData] = useState<RankingData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRanking = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const result = await getRankingData(filter, session.uid, gamification.xp, gamification.streak);
    setData(result);
    setLoading(false);
  }, [filter, session, gamification.xp, gamification.streak]);

  useEffect(() => { loadRanking(); }, [loadRanking]);

  const currentUserEntry = data?.entries.find(e => e.destaque);

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/15 to-amber-600/10 flex items-center justify-center">
          <IconTrophy size={20} className="text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Ranking</h1>
          <p className="text-sm text-gray-500 mt-0.5">Compare seu desempenho com outros alunos</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {FILTERS.map(f => {
          const isActive = filter === f.id;
          const Icon = f.icon;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 border border-white/5 hover:bg-white/[0.03]'
              }`}
            >
              <Icon size={16} />
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Stats summary */}
      {data && !loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="glass rounded-xl px-4 py-3 text-center">
            <p className="text-lg font-bold text-white tabular-nums">{data.totalParticipantes}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Participantes</p>
          </div>
          <div className="glass rounded-xl px-4 py-3 text-center">
            <p className="text-lg font-bold text-white tabular-nums">
              {currentUserEntry?.posicao || '—'}°
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">Sua posição</p>
          </div>
          <div className="glass rounded-xl px-4 py-3 text-center">
            <p className="text-lg font-bold text-white tabular-nums">
              {gamification.xp.toLocaleString()}
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">Seu XP</p>
          </div>
          <div className="glass rounded-xl px-4 py-3 text-center">
            <p className="text-lg font-bold text-white tabular-nums">
              Nv. {gamification.level}
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">Seu nível</p>
          </div>
        </div>
      )}

      {/* Ranking list */}
      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-shimmer" style={{
                background: 'linear-gradient(90deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.02) 100%)',
                backgroundSize: '200% 100%',
                borderRadius: '12px',
                height: '56px',
              }} />
            ))}
          </div>
        ) : (
          <div className="p-3 space-y-1">
            {/* Header info */}
            {data && data.entries.length === 0 && (
              <div className="text-center py-12">
                <div className="w-14 h-14 rounded-2xl bg-white/[0.02] flex items-center justify-center text-3xl mx-auto mb-3">
                  🏆
                </div>
                <p className="text-gray-400 font-medium">Nenhum participante</p>
                <p className="text-sm text-gray-500 mt-1">Convide colegas para aparecerem no ranking!</p>
              </div>
            )}
            {data?.entries.map(entry => (
              <EntryRow
                key={`${entry.nome}_${entry.escolaId}`}
                entry={entry}
                isCurrentUser={!!entry.destaque}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info footer */}
      <div className="text-center text-xs text-gray-600 leading-relaxed">
        <p>🏆 Ranking atualizado em tempo real. Complete atividades e quizzes para ganhar XP e subir posições!</p>
      </div>
    </div>
  );
}
