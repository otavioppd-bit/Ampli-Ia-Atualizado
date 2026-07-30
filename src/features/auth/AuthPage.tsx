import { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { userRepository } from '../../shared/storage/UserRepository';
import { isSupabaseConfigured } from '../../shared/lib/supabase';
import { Session, UserRole } from '../../shared/types';
import { IconMoon, IconSparkles, IconBrain, IconUsers } from '../../shared/ui/Icons';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AuthStep = 'role' | 'auth';

const ROLE_CONFIG: Record<UserRole, { label: string; desc: string; icon: React.ReactNode; gradient: string }> = {
  student: {
    label: 'Aluno',
    desc: 'Estudante focado no ENEM',
    icon: <IconBrain size={24} />,
    gradient: 'from-amber-400 to-orange-600',
  },
  educator: {
    label: 'Educacional',
    desc: 'Professor / Secretaria',
    icon: <IconUsers size={24} />,
    gradient: 'from-emerald-400 to-cyan-600',
  },
  parent: {
    label: 'Pais / Responsáveis',
    desc: 'Acompanhamento pedagógico',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
    gradient: 'from-violet-400 to-purple-600',
  },
};

export function AuthPage() {
  const [step, setStep] = useState<AuthStep>('role');
  const [selectedRole, setSelectedRole] = useState<UserRole>('student');
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setSession, setShowTutorial, setTutorialStep } = useAppStore();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!EMAIL_REGEX.test(email)) { setError('E-mail inválido'); setLoading(false); return; }
    if (senha.length < 4) { setError('Senha deve ter pelo menos 4 caracteres'); setLoading(false); return; }

    try {
      if (isLogin) {
        const { user, error: loginError } = await userRepository.loginSupabase(email, senha);
        if (loginError || !user) { setError(loginError || 'E-mail ou senha incorretos'); setLoading(false); return; }
        const role = user.role || selectedRole;
        const session: Session = { uid: user.uid, email: user.email, nome: user.nome, role };
        userRepository.saveSession(session);
        setSession(session);
      } else {
        if (!nome.trim()) { setError('Nome é obrigatório'); setLoading(false); return; }
        const { user, error: regError } = await userRepository.registerSupabase(email, senha, nome.trim(), selectedRole);
        if (regError || !user) { setError(regError || 'Erro ao cadastrar'); setLoading(false); return; }
        const session: Session = { uid: user.uid, email: user.email, nome: user.nome, role: selectedRole };
        userRepository.saveSession(session);
        setSession(session);
        if (selectedRole === 'student') {
          setShowTutorial(true);
          setTutorialStep(0);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Erro de conexão');
    }
    setLoading(false);
  }

  if (step === 'role') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative" style={{ background: '#0b1120' }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-amber-500/5 blur-[100px]" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-orange-500/5 blur-[100px]" />
        </div>

        <div className="w-full max-w-lg animate-fade-up relative z-10">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center mx-auto mb-5 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
              <IconMoon size={28} className="text-gray-900" />
            </div>
            <h1 className="text-2xl font-extrabold text-white">
              <span className="text-gradient">Midnight Mentor</span>
            </h1>
            <p className="text-sm text-gray-500 mt-1.5">Selecione seu perfil de acesso</p>
          </div>

          <div className="space-y-3">
            {(Object.entries(ROLE_CONFIG) as [UserRole, typeof ROLE_CONFIG['student']][]).map(([role, cfg]) => (
              <button
                key={role}
                onClick={() => { setSelectedRole(role); setStep('auth'); setIsLogin(true); setError(''); }}
                className="w-full glass rounded-2xl p-5 text-left hover:border-amber-500/20 transition-all group border border-white/5 flex items-center gap-4"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center text-white shadow-lg shrink-0`}>
                  {cfg.icon}
                </div>
                <div className="flex-1">
                  <p className="text-base font-bold text-white group-hover:text-amber-400 transition-colors">{cfg.label}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{cfg.desc}</p>
                </div>
                <div className="text-gray-600 group-hover:text-amber-400 transition-colors">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6 text-xs text-center text-gray-600">
            <div className="glass-light rounded-xl px-4 py-2.5 inline-flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${isSupabaseConfigured() ? 'bg-emerald-500' : 'bg-gray-500'}`} />
              {isSupabaseConfigured() ? 'Conectado ao banco de dados' : 'Modo offline'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const roleCfg = ROLE_CONFIG[selectedRole];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={{ background: '#0b1120' }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-amber-500/5 blur-[100px]" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-orange-500/5 blur-[100px]" />
      </div>

      <div className="w-full max-w-sm animate-fade-up relative z-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center mx-auto mb-5 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
            <IconMoon size={28} className="text-gray-900" />
          </div>
          <h1 className="text-2xl font-extrabold text-white">
            <span className="text-gradient">Midnight Mentor</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">Seu assistente de estudos para o ENEM</p>
        </div>

        <div className="glass rounded-2xl p-7">
          <button
            onClick={() => setStep('role')}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-amber-400 transition-colors mb-4"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Trocar perfil
          </button>

          <div className={`rounded-xl bg-gradient-to-br ${roleCfg.gradient}/10 border border-white/5 p-3 flex items-center gap-3 mb-5`}>
            <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${roleCfg.gradient} flex items-center justify-center text-white`}>
              {roleCfg.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{roleCfg.label}</p>
              <p className="text-xs text-gray-500">{roleCfg.desc}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-6">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
            <span className="text-xs text-gray-500 uppercase tracking-widest font-medium">
              {isLogin ? 'Acessar' : 'Criar Conta'}
            </span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="group">
                <label className="block text-xs text-gray-500 mb-1.5 font-medium tracking-wide">Nome</label>
                <input
                  type="text"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Seu nome completo"
                  className="w-full transition-all group-focus-within:border-amber-500/30"
                />
              </div>
            )}
            <div className="group">
              <label className="block text-xs text-gray-500 mb-1.5 font-medium tracking-wide">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full transition-all group-focus-within:border-amber-500/30"
              />
            </div>
            <div className="group">
              <label className="block text-xs text-gray-500 mb-1.5 font-medium tracking-wide">Senha</label>
              <input
                type="password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                placeholder="Mínimo 4 caracteres"
                className="w-full transition-all group-focus-within:border-amber-500/30"
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm bg-red-500/10 rounded-xl px-4 py-2.5 border border-red-500/10 animate-slide-up flex items-center gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2 h-12" disabled={loading}>
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <IconSparkles size={16} />
              )}
              {loading ? 'Aguarde...' : (isLogin ? 'Entrar' : 'Cadastrar')}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setIsLogin(!isLogin); setError(''); }}
              className="text-sm text-gray-500 hover:text-amber-400 transition-colors"
            >
              {isLogin ? 'Não tem conta? ' : 'Já tem conta? '}
              <span className="text-amber-400 hover:text-amber-300 font-medium">
                {isLogin ? 'Cadastre-se' : 'Faça login'}
              </span>
            </button>
          </div>
        </div>

        <div className="mt-6 text-xs text-center text-gray-600">
          <div className="glass-light rounded-xl px-4 py-2.5 inline-flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${isSupabaseConfigured() ? 'bg-emerald-500' : 'bg-gray-500'}`} />
            {isSupabaseConfigured()
              ? 'Conectado ao banco de dados — dados salvos na nuvem.'
              : 'Modo offline — dados salvos apenas no navegador.'
            }
          </div>
        </div>
      </div>
    </div>
  );
}
