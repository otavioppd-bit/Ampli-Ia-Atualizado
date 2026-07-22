import { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { userRepository } from '../../shared/storage/UserRepository';
import { isSupabaseConfigured } from '../../shared/lib/supabase';
import { Session } from '../../shared/types';
import { IconMoon, IconSparkles } from '../../shared/ui/Icons';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthPage() {
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
        const session: Session = { uid: user.uid, email: user.email, nome: user.nome };
        userRepository.saveSession(session);
        setSession(session);
      } else {
        if (!nome.trim()) { setError('Nome é obrigatório'); setLoading(false); return; }
        const { user, error: regError } = await userRepository.registerSupabase(email, senha, nome.trim());
        if (regError || !user) { setError(regError || 'Erro ao cadastrar'); setLoading(false); return; }
        const session: Session = { uid: user.uid, email: user.email, nome: user.nome };
        userRepository.saveSession(session);
        setSession(session);
        setShowTutorial(true);
        setTutorialStep(0);
      }
    } catch (err: any) {
      setError(err.message || 'Erro de conexão');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={{ background: '#0b1120' }}>
      {/* Decorative gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-amber-500/5 blur-[100px]" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-orange-500/5 blur-[100px]" />
      </div>

      <div className="w-full max-w-sm animate-fade-up relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center mx-auto mb-5 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
            <IconMoon size={28} className="text-gray-900" />
          </div>
          <h1 className="text-2xl font-extrabold text-white">
            <span className="text-gradient">Midnight Mentor</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">Seu assistente de estudos para o ENEM</p>
        </div>

        {/* Form Card */}
        <div className="glass rounded-2xl p-7">
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

        {/* Footer */}
        <div className={`mt-6 text-xs text-center ${isSupabaseConfigured() ? 'text-emerald-600' : 'text-gray-600'} transition-colors`}>
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
