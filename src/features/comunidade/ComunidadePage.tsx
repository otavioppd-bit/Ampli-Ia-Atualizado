import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import { getProfile, getEscolasCadastradas, getTurmasCadastradas } from '../../shared/lib/rankingEngine';
import { moderar } from '../../shared/lib/moderationEngine';
import { getSupabase, isSupabaseConfigured } from '../../shared/lib/supabase';
import type { CommunityMessage, Escola, Turma } from '../../shared/types';
import { createStudyLeague, joinLeague, normalizeStudyLeague, canJoinMoreLeagues, type StudyLeague } from '../../shared/lib/ligasEngine';
import { IconUsersGroup, IconSparkles } from '../../shared/ui/Icons';
import { LeagueDetail } from './LeagueDetail';

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
    createStudyLeague({
      id: 'liga_fisica',
      title: 'Liga de Física: energia e movimento',
      prompt: 'Resolva problemas de mecânica, termodinâmica e eletromagnetismo em equipe.',
      authorName: 'Prof. Rafael',
      turma: '3A',
      escola: 'Escola do Sol',
      discipline: 'Física',
      xpReward: 38,
      goals: [
        { id: 'f1', title: 'Resolver 4 problemas', description: 'Problemas de cinemática e dinâmica', target: 4, unit: 'problemas' },
        { id: 'f2', title: 'Explicar 1 lei física', description: 'Escolha uma lei e explique com exemplo', target: 1, unit: 'explicação' },
      ],
    }),
    createStudyLeague({
      id: 'liga_quimica',
      title: 'Liga de Química: reações e soluções',
      prompt: 'Domine estequiometria, ligações e reações químicas com seu grupo.',
      authorName: 'Prof. Marina',
      turma: '3B',
      escola: 'Escola do Sol',
      discipline: 'Química',
      xpReward: 38,
      goals: [
        { id: 'q1', title: 'Balancear 5 equações', description: 'Equações de diferentes tipos de reação', target: 5, unit: 'equações' },
        { id: 'q2', title: 'Calcular pH', description: 'Resolver 2 problemas de pH e pOH', target: 2, unit: 'problemas' },
      ],
    }),
    createStudyLeague({
      id: 'liga_biologia',
      title: 'Liga de Biologia: genética e ecologia',
      prompt: 'Explore mecanismos evolutivos, ecossistemas e genética populacional.',
      authorName: 'Prof. Carla',
      turma: '3A',
      escola: 'Escola do Sol',
      discipline: 'Biologia',
      xpReward: 36,
      goals: [
        { id: 'b1', title: 'Resolver 3 heredogramas', description: 'Analisar heredogramas e determinar padrões', target: 3, unit: 'heredogramas' },
        { id: 'b2', title: 'Mapear 1 ecossistema', description: 'Descrever cadeia alimentar de um bioma', target: 1, unit: 'mapa' },
      ],
    }),
    createStudyLeague({
      id: 'liga_historia',
      title: 'Liga de História: Brasil República',
      prompt: 'Analise os períodos republicanos brasileiros e seus impactos sociais.',
      authorName: 'Prof. Pedro',
      turma: '3B',
      escola: 'Escola do Sol',
      discipline: 'História',
      xpReward: 35,
      goals: [
        { id: 'h1', title: 'Linha do tempo', description: 'Criar linha do tempo da República Brasileira', target: 1, unit: 'linha do tempo' },
        { id: 'h2', title: 'Debater 1 período', description: 'Debater com o grupo sobre a Era Vargas', target: 1, unit: 'debate' },
      ],
    }),
    createStudyLeague({
      id: 'liga_geografia',
      title: 'Liga de Geografia: geopolítica mundial',
      prompt: 'Entenda as relações de poder, conflitos e blocos econômicos atuais.',
      authorName: 'Prof. Sofia',
      turma: '3A',
      escola: 'Escola do Sol',
      discipline: 'Geografia',
      xpReward: 34,
      goals: [
        { id: 'g1', title: 'Analisar 1 conflito', description: 'Pesquisar e apresentar um conflito atual', target: 1, unit: 'análise' },
        { id: 'g2', title: 'Mapa temático', description: 'Criar mapa sobre fluxos econômicos', target: 1, unit: 'mapa' },
      ],
    }),
  ];
}

export function ComunidadePage() {
  const { session, addXP, addLog, setToast } = useAppStore();
  const [mensagens, setMensagens] = useState<CommunityMessage[]>([]);
  const [input, setInput] = useState('');
  const [materia] = useState('Geral');
  const [modError, setModError] = useState('');
  const [escolas, setEscolas] = useState<Escola[]>([]);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [ligas, setLigas] = useState<StudyLeague[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [pendingJoinLeagueId, setPendingJoinLeagueId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const msgsEndRef = useRef<HTMLDivElement>(null);

  const profile = session ? getProfile(session.uid) : null;
  const escolaAtual = escolas.find(e => e.id === profile?.escolaId);
  const turmaAtual = turmas.find(t => t.id === profile?.turmaId);

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

  // Polling de novas mensagens do Supabase
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
    if (liga.joinedBy.includes(profile.uid)) {
      setViewMode('detail');
      return;
    }
    if (pendingJoinLeagueId && pendingJoinLeagueId !== liga.id) {
      setPendingJoinLeagueId(liga.id);
      return;
    }
    if (pendingJoinLeagueId === liga.id) {
      if (!canJoinMoreLeagues(ligas, profile.uid, 2)) {
        setToast('Você já está em 2 ligas. Saia de uma para entrar em outra.', 'error');
        setPendingJoinLeagueId(null);
        return;
      }
      const updated = joinLeague(liga, profile.uid, profile.nome || 'Anônimo');
      const next = ligas.map(item => item.id === liga.id ? updated : item);
      setLigas(next);
      setSelectedLeagueId(updated.id);
      setPendingJoinLeagueId(null);
      salvarLigasLocal(next);
      addXP(updated.xpReward);
      addLog({ timestamp: Date.now(), type: 'atividade', description: `Entrou na liga "${updated.title}"`, xp: updated.xpReward });
      setViewMode('detail');
      return;
    }
    if (!canJoinMoreLeagues(ligas, profile.uid, 2)) {
      setToast('Você já está em 2 ligas. Saia de uma para entrar em outra.', 'error');
      return;
    }
    setPendingJoinLeagueId(liga.id);
  }

  function updateLeague(updated: StudyLeague) {
    const next = ligas.map(item => item.id === updated.id ? updated : item);
    setLigas(next);
    salvarLigasLocal(next);
  }

  const selectedLeague = ligas.find(liga => liga.id === selectedLeagueId) || null;
  const selectedProgress = selectedLeague && selectedLeague.goals.length > 0
    ? Math.round((selectedLeague.goals.filter(goal => (goal.completedBy || []).includes(profile?.uid || '')).length / selectedLeague.goals.length) * 100)
    : 0;
  const nextGoal = selectedLeague?.goals.find(goal => !(goal.completedBy || []).includes(profile?.uid || '')) || null;

  // Sala da Liga (detail view)
  if (viewMode === 'detail' && selectedLeague) {
    return (
      <LeagueDetail
        league={selectedLeague}
        onBack={() => setViewMode('list')}
        onUpdateLeague={updateLeague}
      />
    );
  }

  // List view
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
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3 scroll-smooth">
        <div className="glass rounded-2xl border border-cyan-500/10 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0">
                <IconSparkles size={16} className="text-cyan-400" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm md:text-base font-semibold text-white">Seu espaço de liga</h2>
                <p className="text-xs text-gray-500">Escolha uma liga, entre nela e acesse a sala da equipe.</p>
              </div>
            </div>
            <span className="px-2 py-1 rounded-full bg-white/5 text-[10px] text-gray-400">{ligas.length} ligas</span>
          </div>

          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex flex-col gap-2 lg:w-[300px] lg:shrink-0">
              <div className="flex items-center justify-between px-1">
                <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-400">Ligas disponíveis</p>
                <span className="text-[10px] text-gray-500">{ligas.length} opções</span>
              </div>

              <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100dvh-28rem)] lg:max-h-[calc(100dvh-24rem)] pr-1">
                {ligas.map(liga => {
                  const isAccepted = liga.joinedBy.includes(profile?.uid || '');
                  const isSelected = selectedLeague?.id === liga.id;

                  const discColors: Record<string, { from: string; via: string; border: string }> = {
                    Português: { from: 'from-emerald-600', via: 'via-teal-700', border: 'border-emerald-500/20' },
                    Matemática: { from: 'from-blue-600', via: 'via-indigo-700', border: 'border-blue-500/20' },
                    Física: { from: 'from-purple-600', via: 'via-violet-700', border: 'border-purple-500/20' },
                    Química: { from: 'from-red-600', via: 'via-rose-700', border: 'border-red-500/20' },
                    Biologia: { from: 'from-green-600', via: 'via-emerald-700', border: 'border-green-500/20' },
                    História: { from: 'from-amber-600', via: 'via-yellow-700', border: 'border-amber-500/20' },
                    Geografia: { from: 'from-teal-600', via: 'via-cyan-700', border: 'border-teal-500/20' },
                    default: { from: 'from-cyan-600', via: 'via-teal-700', border: 'border-cyan-500/20' },
                  };
                  const dc = discColors[liga.discipline] || discColors.default;

                  return (
                    <button
                      key={liga.id}
                      onClick={() => { setSelectedLeagueId(liga.id); }}
                      className={`group relative w-full rounded-2xl border text-left transition-all duration-200 overflow-hidden min-h-[88px] ${
                        isSelected ? `${dc.border} shadow-lg` : 'border-white/[0.06] hover:border-white/15'
                      }`}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br ${dc.from}/10 ${dc.via}/5 to-transparent opacity-${isSelected ? '100' : '0'} group-hover:opacity-100 transition-opacity`} />
                      <div className="relative p-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-400">{liga.discipline}</span>
                              {isAccepted && <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">✓ Ativa</span>}
                            </div>
                            <h3 className="text-sm font-semibold text-white leading-tight">{liga.title}</h3>
                            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                              <span>👤</span>
                              <span>{liga.authorName}</span>
                            </p>
                          </div>
                          <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full ${
                            isAccepted ? 'bg-amber-500/10 text-amber-400' : 'bg-cyan-500/10 text-cyan-400'
                          }`}>
                            +{liga.xpReward} XP
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-white/[0.04]">
                          <div className="flex -space-x-1.5">
                            {liga.joinedByNames.slice(0, 4).map((name, i) => (
                              <div key={i} className="w-5 h-5 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center text-[8px] font-bold text-white ring-1 ring-black/30">
                                {name.charAt(0).toUpperCase()}
                              </div>
                            ))}
                            {liga.joinedByNames.length > 4 && (
                              <div className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[8px] text-gray-400 ring-1 ring-black/30">
                                +{liga.joinedByNames.length - 4}
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-500">{liga.joinedByNames.length} participante{liga.joinedByNames.length !== 1 ? 's' : ''}</span>
                          <div className="ml-auto hidden md:flex items-center gap-1 text-[10px] text-gray-600">
                            <span>{liga.escola}</span>
                            <span>•</span>
                            <span>{liga.turma}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedLeague ? (
              <div className="flex-1 space-y-3">
                <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/10 p-3 md:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-400">Liga selecionada</p>
                      <h3 className="text-base font-semibold text-white truncate">{selectedLeague.title}</h3>
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

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-gray-300 min-w-0 flex-1">
                      {selectedLeague.joinedByNames.length > 0 ? `Equipe: ${selectedLeague.joinedByNames.join(', ')}` : 'Ainda sem participantes'}
                    </div>
                    <button
                      onClick={() => aceitarLiga(selectedLeague)}
                      disabled={!profile?.uid}
                      className={`px-4 md:px-3 py-2.5 md:py-1.5 rounded-xl text-sm md:text-xs font-semibold transition-all min-h-[44px] ${
                        selectedLeague.joinedBy.includes(profile?.uid || '')
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : pendingJoinLeagueId === selectedLeague.id
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse-subtle'
                            : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:brightness-110'
                      }`}
                    >
                      {selectedLeague.joinedBy.includes(profile?.uid || '')
                        ? 'Acessar sala →'
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
                      <div className="h-2 w-24 rounded-full bg-white/10 overflow-hidden shrink-0">
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
              </div>
            ) : (
              <div className="flex-1 rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-center text-sm text-gray-500">
                Escolha uma liga para abrir o painel de desafios.
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
