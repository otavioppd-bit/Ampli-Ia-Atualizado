import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { userRepository } from '../../shared/storage/UserRepository';
import { getProfile, saveProfile, getEscolasCadastradas, getTurmasCadastradas, salvarEscola, salvarTurma } from '../../shared/lib/rankingEngine';
import type { Escola, Turma } from '../../shared/types';

export function ProfilePage() {
  const { session, logout, setShowWeeklyReport, gamification, apiKey, setApiKey, setToast } = useAppStore();
  const [nome, setNome] = useState(session?.nome || '');
  const [sobrenome, setSobrenome] = useState('');
  const [meta, setMeta] = useState('');
  const [keyInput, setKeyInput] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);

  const [escolaId, setEscolaId] = useState('');
  const [turmaId, setTurmaId] = useState('');
  const [escolas, setEscolas] = useState<Escola[]>([]);
  const [turmas, setTurmas] = useState<Turma[]>([]);

  const [novaEscolaNome, setNovaEscolaNome] = useState('');
  const [novaTurmaNome, setNovaTurmaNome] = useState('');
  const [showNewSchool, setShowNewSchool] = useState(false);
  const [showNewClass, setShowNewClass] = useState(false);

  useEffect(() => {
    if (!session) return;
    const profile = getProfile(session.uid);
    setEscolaId(profile.escolaId || '');
    setTurmaId(profile.turmaId || '');
    const user = userRepository.findByEmail(session.email);
    if (user) {
      setSobrenome(user.sobrenome || '');
      setMeta(user.metaEstudo || '');
    }
    setEscolas(getEscolasCadastradas());
    setTurmas(getTurmasCadastradas());
  }, [session]);

  function handleAddSchool() {
    const id = `escola_${Date.now()}`;
    const escola: Escola = { id, nome: novaEscolaNome.trim() };
    salvarEscola(escola);
    setEscolas(getEscolasCadastradas());
    setEscolaId(id);
    setNovaEscolaNome('');
    setShowNewSchool(false);
    setToast('Escola cadastrada!', 'success');
  }

  function handleAddClass() {
    if (!escolaId) { setToast('Selecione uma escola primeiro', 'error'); return; }
    const id = `turma_${Date.now()}`;
    const turma: Turma = { id, nome: novaTurmaNome.trim(), escolaId };
    salvarTurma(turma);
    setTurmas(getTurmasCadastradas());
    setTurmaId(id);
    setNovaTurmaNome('');
    setShowNewClass(false);
    setToast('Turma cadastrada!', 'success');
  }

  function handleSaveProfile() {
    if (!session) return;
    userRepository.updateProfile(session.uid, { nome, sobrenome: sobrenome || undefined, metaEstudo: meta || undefined });

    const profile = getProfile(session.uid);
    saveProfile({ ...profile, nome, escolaId: escolaId || undefined, turmaId: turmaId || undefined });
    setToast('Perfil atualizado!', 'success');
  }

  function handleSaveKey() {
    setApiKey(keyInput.trim());
    setToast(keyInput.trim() ? 'Chave API salva!' : 'Chave removida', 'success');
  }

  const turmasFiltradas = turmas.filter(t => t.escolaId === escolaId);

  return (
    <div className="space-y-5 animate-fade-up max-w-lg mx-auto">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-2xl font-bold text-gray-900 shadow-glow">
          {session?.nome?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">{session?.nome || 'Usuário'}</h1>
          <p className="text-sm text-gray-500">{session?.email || ''}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Nível', value: gamification.level, icon: '⭐' },
          { label: 'XP Total', value: gamification.xp.toLocaleString(), icon: '⚡' },
          { label: 'Sequência', value: `${gamification.streak}d`, icon: gamification.streak >= 3 ? '🔥' : '📅' },
        ].map(stat => (
          <div key={stat.label} className="glass-card rounded-2xl p-4 text-center">
            <p className="text-xl mb-1">{stat.icon}</p>
            <p className={`text-lg font-bold tabular-nums ${stat.label === 'Sequência' && gamification.streak >= 3 ? 'text-amber-400' : 'text-white'}`}>
              {stat.value}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* XP Bar */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs text-gray-500 uppercase tracking-wider font-medium">Progresso</h2>
          <span className="text-xs text-gray-500 tabular-nums">Nível {gamification.level}</span>
        </div>
        <div className="flex items-baseline gap-1 mb-3">
          <span className="text-2xl font-bold text-white tabular-nums">{gamification.xp % (100 * gamification.level)}</span>
          <span className="text-sm text-gray-500">/ {100 * gamification.level} XP</span>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 xp-bar" style={{ width: `${((gamification.xp % (100 * gamification.level)) / (100 * gamification.level)) * 100}%` }} />
        </div>
      </div>

      {/* School & Class */}
      <div className="glass-card rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <span>🏫</span> Escola & Turma
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wider">Escola</label>
            <div className="flex gap-2">
              <select
                value={escolaId}
                onChange={e => { setEscolaId(e.target.value); setTurmaId(''); }}
                className="flex-1 text-sm"
              >
                <option value="">Selecione uma escola</option>
                {escolas.map(e => (
                  <option key={e.id} value={e.id}>{e.nome}{e.cidade ? ` (${e.cidade})` : ''}</option>
                ))}
              </select>
              <button onClick={() => setShowNewSchool(!showNewSchool)} className="btn-secondary text-xs px-3 py-2 shrink-0">
                + Nova
              </button>
            </div>
            {showNewSchool && (
              <div className="flex gap-2 mt-2 animate-slide-up">
                <input
                  value={novaEscolaNome}
                  onChange={e => setNovaEscolaNome(e.target.value)}
                  placeholder="Nome da escola"
                  className="flex-1 text-sm"
                />
                <button onClick={handleAddSchool} disabled={!novaEscolaNome.trim()} className="btn-primary text-xs px-3 py-2 shrink-0">
                  Adicionar
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wider">Turma</label>
            <div className="flex gap-2">
              <select
                value={turmaId}
                onChange={e => setTurmaId(e.target.value)}
                className="flex-1 text-sm"
                disabled={!escolaId}
              >
                <option value="">Selecione uma turma</option>
                {turmasFiltradas.map(t => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
              <button onClick={() => setShowNewClass(!showNewClass)} className="btn-secondary text-xs px-3 py-2 shrink-0" disabled={!escolaId}>
                + Nova
              </button>
            </div>
            {showNewClass && (
              <div className="flex gap-2 mt-2 animate-slide-up">
                <input
                  value={novaTurmaNome}
                  onChange={e => setNovaTurmaNome(e.target.value)}
                  placeholder="Ex: 3ª Série A"
                  className="flex-1 text-sm"
                />
                <button onClick={handleAddClass} disabled={!novaTurmaNome.trim()} className="btn-primary text-xs px-3 py-2 shrink-0">
                  Adicionar
                </button>
              </div>
            )}
          </div>

          <button onClick={handleSaveProfile} className="btn-primary w-full">
            Salvar Configuração
          </button>
        </div>
      </div>

      {/* Personal info */}
      <div className="glass-card rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">📋 Informações Pessoais</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wider">E-mail</label>
            <input type="email" value={session?.email || ''} disabled className="w-full text-sm opacity-50" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wider">Nome</label>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)} className="w-full text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wider">Sobrenome</label>
            <input type="text" value={sobrenome} onChange={e => setSobrenome(e.target.value)} className="w-full text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wider">Meta de Estudo</label>
            <input type="text" value={meta} onChange={e => setMeta(e.target.value)} className="w-full text-sm" placeholder="Ex: Medicina na USP" />
          </div>
          <button onClick={handleSaveProfile} className="btn-primary w-full">Salvar alterações</button>
        </div>
      </div>

      {/* AI Settings */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center text-lg">🤖</div>
          <div>
            <h2 className="text-sm font-semibold text-gray-300">IA Generativa</h2>
            <p className="text-xs text-gray-500">Conecte sua IA para respostas no nível de pesquisador e suporte a estudos avançados.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-amber-500/5 rounded-xl p-3 border border-amber-500/10 mb-4">
          <span className="text-amber-400 shrink-0">💡</span>
          <span>Use sua chave <strong className="text-gray-300">Gemini API</strong> (gratuita) do Google AI Studio. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-amber-400 underline">Obter chave grátis</a></span>
        </div>

        <div className="relative mb-4">
          <input
            type={showKey ? 'text' : 'password'}
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            placeholder="Cole sua chave Gemini API aqui..."
            className="w-full text-sm pr-10"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 p-1.5"
          >
            {showKey ? '🙈' : '👁️'}
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={handleSaveKey} className="btn-primary flex-1" disabled={!keyInput.trim()}>
            {keyInput.trim() === apiKey ? 'Conectado ✓' : 'Conectar IA'}
          </button>
          {apiKey && (
            <button onClick={() => { setKeyInput(''); setApiKey(''); }} className="btn-ghost text-sm text-red-400 hover:text-red-300">
              Remover
            </button>
          )}
        </div>

        {apiKey && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/5 rounded-xl px-3 py-2 border border-emerald-500/10">
            <span>✓</span> IA conectada. O chat usará IA generativa para respostas inteligentes.
          </div>
        )}
      </div>

      {/* Tools */}
      <div className="glass-card rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">🔧 Ferramentas</h2>
        <button onClick={() => setShowWeeklyReport(true)} className="btn-secondary w-full text-center">
          📊 Ver Relatório Semanal
        </button>
      </div>

      {/* About */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🌙</span>
          <h2 className="text-sm font-semibold text-gray-300">Midnight Mentor</h2>
        </div>
        <div className="text-sm text-gray-400 leading-relaxed space-y-2">
          <p>🧠 Assistente de estudos inteligente para o ENEM.</p>
          <p>🔒 <strong className="text-gray-300">Privacidade total:</strong> dados salvos apenas no navegador.</p>
          <p>⚡ Modo offline: motor local baseado em regras. Com chave API, usa IA generativa.</p>
        </div>
      </div>

      <button onClick={logout} className="btn-danger w-full text-center">
        Sair da Conta
      </button>
    </div>
  );
}
