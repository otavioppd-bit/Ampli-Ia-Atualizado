import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import { getProfile, getEscolasCadastradas, getTurmasCadastradas } from '../../shared/lib/rankingEngine';
import { moderar } from '../../shared/lib/moderationEngine';
import { getSupabase, isSupabaseConfigured } from '../../shared/lib/supabase';
import type { CommunityMessage, Escola, Turma } from '../../shared/types';
import { createStudyLeague, joinLeague, normalizeStudyLeague, postLeagueMessage, toggleGoalCompletion, type StudyLeague } from '../../shared/lib/ligasEngine';
import { IconSend, IconUsersGroup, IconSparkles } from '../../shared/ui/Icons';

function gerarId() { return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

function carregarMensagensLocal(turmaId: string): CommunityMessage[] {
  try {
    const raw = localStorage.getItem(`mm_comunidade_turma_${turmaId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function salvarMensagensLocal(turmaId: string, msgs: CommunityMessage[]) {
  localStorage.setItem(`mm_comunidade_turma_${turmaId}`, JSON.stringify(msgs));
}

function carregarLigasLocal(): StudyLeague[] {
  try {
    const raw = localStorage.getItem('mm_study_leagues');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(item => normalizeStudyLeague(item)) : [];
  } catch { return []; }
}

function salvarLigasLocal(ligas: StudyLeague[]) {
  localStorage.setItem('mm_study_leagues', JSON.stringify(ligas));
}

function getLigasIniciais(): StudyLeague[] {
  return [
    createStudyLeague({
      id: 'liga_portugues',
      title: 'Liga de Português: crase e interpretação',
      prompt: 'Aprofunde a leitura crítica e explique regras gramaticais com exemplos claros.',
      authorName: 'Prof. Lígia',
      turma: '3A',
      escola: 'Escola do Sol',
      discipline: 'Português',
      xpReward: 35,
      goals: [
        { id: 'p1', title: 'Resolver 3 exercícios', description: 'Exercícios sobre crase e interpretação', target: 3, unit: 'exercícios' },
        { id: 'p2', title: 'Compartilhar 1 explicação', description: 'Explicação em texto para a equipe', target: 1, unit: 'explicação' },
      ],
    }),
    createStudyLeague({
      id: 'liga_matematica',
      title: 'Liga de Matemática: resolução em dupla',
      prompt: 'Trabalhe em colaboração para resolver problemas exatos e registrar a estratégia.',
      authorName: 'Prof. João',
      turma: '3B',
      escola: 'Escola do Sol',
      discipline: 'Matemática',
      xpReward: 40,
      goals: [
        { id: 'm1', title: 'Fazer 6 exercícios', description: 'Questões de cálculo e raciocínio', target: 6, unit: 'exercícios' },
        { id: 'm2', title: 'Enviar 1 dica', description: 'Método ou passo a passo da resolução', target: 1, unit: 'dica' },
      ],
    }),
  ];
}

export function ComunidadePage() {
  const { session, addXP, addLog } = useAppStore();
  const [mensagens, setMensagens] = useState<CommunityMessage[]>([]);
  const [input, setInput] = useState('');
  const [materia] = useState('Geral');
  const [modError, setModError] = useState('');
  const [escolas, setEscolas] = useState<Escola[]>([]);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [ligas, setLigas] = useState<StudyLeague[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [pendingJoinLeagueId, setPendingJoinLeagueId] = useState<string | null>(null);
  const [leagueDrafts, setLeagueDrafts] = useState<Record<string, string>>({});
  const [leagueSending, setLeagueSending] = useState<Record<string, boolean>>({});
  const msgsEndRef = useRef<HTMLDivElement>(null);

  const profile = session ? getProfile(session.uid) : null;
  const escolaAtual = escolas.find(e => e.id === profile?.escolaId);
  const turmaAtual = turmas.find(t => t.id === profile?.turmaId);
  const participantesAtivos = Array.from(new Set(mensagens.map(m => m.userName).filter(Boolean))).slice(0, 6);
  const ligasAtivas = ligas.filter(liga => liga.joinedBy.includes(profile?.uid || '') || liga.messages.length > 0).length;

  useEffect(() => {
    setEscolas(getEscolasCadastradas());
    setTurmas(getTurmasCadastradas());

    const ligasSalvas = carregarLigasLocal();
    if (ligasSalvas.length > 0) {
      setLigas(ligasSalvas);
      return;
    }

    const iniciais = getLigasIniciais();
    setLigas(iniciais);
    salvarLigasLocal(iniciais);
  }, []);

  useEffect(() => {
    if (profile?.turmaId) {
      setMensagens(carregarMensagensLocal(profile.turmaId));
    }
  }, [profile?.turmaId]);

  useEffect(() => {
    if (ligas.length === 0) return;
    if (!selectedLeagueId || !ligas.some(liga => liga.id === selectedLeagueId)) {
      const preferida = ligas.find(liga => liga.joinedBy.includes(profile?.uid || '')) || ligas[0];
      setSelectedLeagueId(preferida?.id || null);
    }
  }, [ligas, profile?.uid, selectedLeagueId]);

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  // Polling de novas mensagens do Supabase (quando configurado)
  useEffect(() => {
    if (!isSupabaseConfigured() || !profile?.turmaId) return;
    const sb = getSupabase();
    if (!sb) return;

    const interval = setInterval(async () => {
      try {
        const { data } = await sb
          .from('community_messages')
          .select('*')
          .eq('turma_id', profile.turmaId)
          .order('timestamp', { ascending: false })
          .limit(100);

        if (data) {
          const local = carregarMensagensLocal(profile.turmaId!);
          const cloudIds = new Set(data.map((m: any) => m.id));
          const merged = [...data.map((m: any) => ({
            id: m.id,
            escolaId: m.escola_id,
            turmaId: m.turma_id,
            userId: m.user_id,
            userName: m.user_name,
            text: m.text,
            timestamp: m.timestamp,
            moderated: m.moderated,
            moderatedReason: m.moderated_reason,
            replyTo: m.reply_to,
            materia: m.materia,
            likes: m.likes || 0,
            likedBy: m.liked_by || [],
          } as CommunityMessage)), ...local.filter(m => !cloudIds.has(m.id))];
          merged.sort((a, b) => b.timestamp - a.timestamp);
          setMensagens(merged);
          salvarMensagensLocal(profile.turmaId!, merged);
        }
      } catch {}
    }, 5000);

    return () => clearInterval(interval);
  }, [profile?.turmaId]);

  const _enviarMensagem = useCallback(async () => {
    if (!input.trim() || !profile || !profile.turmaId || !profile.escolaId) return;

    const resultado = moderar(input);
    if (!resultado.aprovado) {
      setModError(resultado.razao || 'Mensagem rejeitada');
      setTimeout(() => setModError(''), 4000);
      return;
    }

    const novaMsg: CommunityMessage = {
      id: gerarId(),
      escolaId: profile.escolaId,
      turmaId: profile.turmaId,
      userId: profile.uid,
      userName: profile.nome || 'Anônimo',
      text: resultado.textoLimpio,
      timestamp: Date.now(),
      moderated: true,
      materia: materia === 'Geral' ? undefined : materia,
      likes: 0,
      likedBy: [],
    };

    const updated = [novaMsg, ...mensagens];
    setMensagens(updated);
    salvarMensagensLocal(profile.turmaId, updated);

    // Sync to Supabase if configured
    if (isSupabaseConfigured()) {
      try {
        const sb = getSupabase();
        if (sb) {
          await sb.from('community_messages').insert({
            id: novaMsg.id,
            escola_id: novaMsg.escolaId,
            turma_id: novaMsg.turmaId,
            user_id: novaMsg.userId,
            user_name: novaMsg.userName,
            text: novaMsg.text,
            timestamp: novaMsg.timestamp,
            moderated: true,
            materia: novaMsg.materia,
          });
        }
      } catch (e) {
        console.warn('Falha ao sincronizar mensagem com nuvem:', e);
      }
    }

    setInput('');
  }, [input, profile, mensagens, materia]);

  function aceitarLiga(liga: StudyLeague) {
    if (!profile?.uid) return;
    if (liga.joinedBy.includes(profile.uid)) return;
    if (pendingJoinLeagueId && pendingJoinLeagueId !== liga.id) {
      setPendingJoinLeagueId(liga.id);
    }
    if (pendingJoinLeagueId === liga.id) {
      const updated = joinLeague(liga, profile.uid, profile.nome || 'Anônimo');
      const next = ligas.map(item => item.id === liga.id ? updated : item);
      setLigas(next);
      setSelectedLeagueId(updated.id);
      setPendingJoinLeagueId(null);
      salvarLigasLocal(next);
      addXP(updated.xpReward);
      addLog({ timestamp: Date.now(), type: 'atividade', description: `Entrou na liga de estudos "${updated.title}"`, xp: updated.xpReward });
      return;
    }
    setPendingJoinLeagueId(liga.id);
  }

  function concluirMeta(ligaId: string, goalId: string) {
    if (!profile?.uid) return;
    const liga = ligas.find(item => item.id === ligaId);
    if (!liga) return;
    const updated = toggleGoalCompletion(liga, goalId, profile.uid);
    const next = ligas.map(item => item.id === ligaId ? updated : item);
    setLigas(next);
    salvarLigasLocal(next);
  }

  function enviarMensagemLiga(ligaId: string) {
    if (!profile?.uid || !leagueDrafts[ligaId]?.trim()) return;
    const origem = ligas.find(item => item.id === ligaId);
    if (!origem) return;

    setLeagueSending(prev => ({ ...prev, [ligaId]: true }));
    const updated = postLeagueMessage(origem, {
      id: gerarId(),
      userId: profile.uid,
      userName: profile.nome || 'Anônimo',
      text: leagueDrafts[ligaId].trim(),
    });

    const next = ligas.map(item => item.id === ligaId ? updated : item);
    setLigas(next);
    salvarLigasLocal(next);
    setLeagueDrafts(prev => ({ ...prev, [ligaId]: '' }));
    setLeagueSending(prev => ({ ...prev, [ligaId]: false }));
  }

  const selectedLeague = ligas.find(liga => liga.id === selectedLeagueId) || ligas.find(liga => liga.joinedBy.includes(profile?.uid || '')) || ligas[0] || null;
  const selectedProgress = selectedLeague && selectedLeague.goals.length > 0
    ? Math.round((selectedLeague.goals.filter(goal => (goal.completedBy || []).includes(profile?.uid || '')).length / selectedLeague.goals.length) * 100)
    : 0;
  const nextGoal = selectedLeague?.goals.find(goal => !(goal.completedBy || []).includes(profile?.uid || '')) || null;

  return (
    <div className="flex flex-col h-[calc(100dvh-10rem)] md:h-[calc(100dvh-8rem)] animate-fade-up">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/15 to-emerald-600/10 flex items-center justify-center">
            <IconUsersGroup size={20} className="text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold text-white">Ligas de estudo</h1>
            <p className="text-xs text-gray-500">
              {turmaAtual ? `${turmaAtual.nome} • ${escolaAtual?.nome}` : 'Selecione sua turma no Perfil'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-subtle" />
          {mensagens.length} mensagens
          {turmaAtual && <span className="ml-2 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20 text-[10px]">
            🧑‍🤝‍🧑 {ligasAtivas} ligas ativas
          </span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3 scroll-smooth">
        <div className="glass rounded-2xl border border-cyan-500/10 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                <IconSparkles size={16} className="text-cyan-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Seu espaço de liga</h2>
                <p className="text-xs text-gray-500">Escolha uma liga, entre nela e trabalhe só no contexto daquela equipe.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-400">
              <span className="px-2 py-1 rounded-full bg-white/5">{ligas.length} ligas</span>
              <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400">{participantesAtivos.length} ativos</span>
            </div>
          </div>

          <div className="mb-3 rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-cyan-500/10 via-emerald-500/5 to-transparent p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-400">Fluxo rápido</p>
                <p className="text-sm font-medium text-white">Escolha uma liga, complete metas e converse com seu grupo em um só lugar.</p>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-gray-300">
                <span className="rounded-full bg-white/10 px-2 py-1">1. Escolha</span>
                <span className="rounded-full bg-white/10 px-2 py-1">2. Desafios</span>
                <span className="rounded-full bg-white/10 px-2 py-1">3. Chat</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="rounded-2xl border border-white/8 bg-black/10 p-3">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-400">Ligas</p>
                  <h3 className="text-sm font-semibold text-white">Escolha sua liga</h3>
                </div>
                <span className="text-[10px] text-gray-500">{ligas.length} opções</span>
              </div>

              <div className="space-y-2">
                {ligas.map(liga => {
                  const isAccepted = liga.joinedBy.includes(profile?.uid || '');
                  const isSelected = selectedLeague?.id === liga.id;
                  return (
                    <button
                      key={liga.id}
                      onClick={() => {
                        setSelectedLeagueId(liga.id);
                        if (liga.joinedBy.includes(profile?.uid || '')) {
                          setPendingJoinLeagueId(null);
                        }
                      }}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
                        isSelected
                          ? 'border-cyan-500/25 bg-cyan-500/10'
                          : 'border-white/8 bg-white/5 hover:border-cyan-500/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-white">{liga.title}</span>
                        {isAccepted ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-[10px] text-emerald-400">Ativa</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-white/5 text-[10px] text-gray-400">Disponível</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-gray-500">
                        <span>{liga.discipline}</span>
                        <span>•</span>
                        <span>{liga.joinedByNames.length} membros</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedLeague ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/10 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-400">Liga selecionada</p>
                      <h3 className="text-base font-semibold text-white">{selectedLeague.title}</h3>
                      <p className="text-xs text-gray-300 mt-1">{selectedLeague.prompt}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full bg-white/10 text-[10px] text-gray-200">{selectedLeague.discipline}</span>
                      <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-[10px] text-amber-400">+{selectedLeague.xpReward} XP</span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-gray-300">
                    <span className="px-2 py-0.5 rounded-full bg-black/10">{selectedLeague.escola}</span>
                    <span className="px-2 py-0.5 rounded-full bg-black/10">{selectedLeague.turma}</span>
                    <span className="px-2 py-0.5 rounded-full bg-black/10">{selectedLeague.joinedByNames.length} participantes</span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-gray-300">
                      {selectedLeague.joinedByNames.length > 0 ? `Equipe: ${selectedLeague.joinedByNames.join(', ')}` : 'Ainda sem participantes'}
                    </div>
                    <button
                      onClick={() => aceitarLiga(selectedLeague)}
                      disabled={!profile?.uid || selectedLeague.joinedBy.includes(profile?.uid || '')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        selectedLeague.joinedBy.includes(profile?.uid || '')
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:brightness-110'
                      }`}
                    >
                      {selectedLeague.joinedBy.includes(profile?.uid || '')
                        ? 'Participando'
                        : pendingJoinLeagueId === selectedLeague.id
                          ? 'Confirmar entrada'
                          : 'Entrar na liga'}
                    </button>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/8 bg-black/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-400">Progresso da liga</p>
                        <p className="text-xs text-gray-300">{selectedProgress}% concluído</p>
                      </div>
                      <div className="h-2 w-24 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500" style={{ width: `${selectedProgress}%` }} />
                      </div>
                    </div>
                    {nextGoal && (
                      <div className="mt-2 rounded-lg border border-white/8 bg-white/5 px-3 py-2">
                        <p className="text-[11px] text-gray-400">Próximo desafio</p>
                        <p className="text-sm text-white">{nextGoal.title}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
                  <div className="rounded-2xl border border-white/8 bg-black/10 p-3">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="text-sm font-semibold text-white">Desafios da liga</h4>
                        <p className="text-xs text-gray-500">Meta prática para manter a equipe em movimento.</p>
                      </div>
                      <span className="text-[10px] text-gray-400">{selectedProgress}% concluído</span>
                    </div>

                    <div className="space-y-2">
                      {selectedLeague.goals.map(goal => {
                        const completed = (goal.completedBy || []).includes(profile?.uid || '');
                        return (
                          <button
                            key={goal.id}
                            onClick={() => concluirMeta(selectedLeague.id, goal.id)}
                            disabled={!profile?.uid}
                            className={`w-full flex items-start justify-between rounded-xl border px-3 py-2 text-left transition-all ${completed ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-white/8 bg-black/10 hover:border-cyan-500/20'}`}
                          >
                            <div>
                              <p className="text-sm text-white">{goal.title}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{goal.description}</p>
                            </div>
                            <span className={`text-[11px] px-2 py-1 rounded-full ${completed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-gray-400'}`}>
                              {goal.target} {goal.unit}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-black/10 p-3 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="text-sm font-semibold text-white">Chat da liga</h4>
                        <p className="text-xs text-gray-500">Trocas rápidas da sua equipe.</p>
                      </div>
                      <span className="px-2 py-1 rounded-full bg-cyan-500/10 text-[10px] text-cyan-400">Ao vivo</span>
                    </div>

                    <div className="space-y-2 flex-1 overflow-y-auto pr-1 max-h-[280px]">
                      {selectedLeague.messages.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/10 p-3 text-center text-xs text-gray-500">
                          Nenhuma mensagem ainda. Comece a conversa da equipe.
                        </div>
                      ) : selectedLeague.messages.map(msg => (
                        <div key={msg.id} className="rounded-xl border border-white/8 bg-white/5 px-3 py-2">
                          <div className="flex items-center gap-2 text-[11px] text-gray-400">
                            <span className="font-semibold text-gray-200">{msg.userName}</span>
                            <span>•</span>
                            <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="text-sm text-gray-200 mt-1">{msg.text}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex items-end gap-2">
                      <textarea
                        value={leagueDrafts[selectedLeague.id] || ''}
                        onChange={e => setLeagueDrafts(prev => ({ ...prev, [selectedLeague.id]: e.target.value }))}
                        rows={1}
                        placeholder="Contribua para a liga..."
                        className="flex-1 resize-none bg-transparent border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-cyan-400/40"
                      />
                      <button
                        onClick={() => enviarMensagemLiga(selectedLeague.id)}
                        disabled={!leagueDrafts[selectedLeague.id]?.trim() || leagueSending[selectedLeague.id]}
                        className="h-10 w-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white disabled:opacity-30"
                      >
                        <IconSend size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-center text-sm text-gray-500">
                Escolha uma liga para abrir o painel de desafios e chat.
              </div>
            )}
          </div>
        </div>

        {modError && (
          <div className="text-red-400 text-xs bg-red-500/10 rounded-xl px-4 py-2 border border-red-500/10 mb-2 animate-slide-up flex items-center gap-2">
            <span>⚠️</span>
            <span>{modError}</span>
          </div>
        )}
      </div>
    </div>
  );
}
