import { User, Session } from '../types';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';

const USERS_KEY = 'mm_users';
const SESSION_KEY = 'mm_session';

export class UserRepository {
  getUsers(): User[] {
    try {
      const raw = localStorage.getItem(USERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveUsers(users: User[]): void {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  findByEmail(email: string): User | undefined {
    return this.getUsers().find(u => u.email === email);
  }

  register(user: User): boolean {
    const users = this.getUsers();
    if (users.length >= 40) return false;
    if (users.find(u => u.email === user.email)) return false;
    users.push(user);
    this.saveUsers(users);
    return true;
  }

  login(email: string, senha: string): User | null {
    const user = this.findByEmail(email);
    if (!user || user.senha !== senha) return null;
    return user;
  }

  async loginSupabase(email: string, senha: string): Promise<{ user: User | null; error?: string }> {
    // Try local first
    const localUser = this.login(email, senha);
    if (localUser) {
      const session: Session = { uid: localUser.uid, email: localUser.email, nome: localUser.nome };
      this.saveSession(session);
      // Try Supabase sync in background
      if (isSupabaseConfigured()) {
        const sb = getSupabase();
        if (sb) {
          sb.auth.signInWithPassword({ email, password: senha }).catch(() => {});
        }
      }
      return { user: localUser };
    }

    // If not found locally but Supabase is configured, try cloud login
    if (isSupabaseConfigured()) {
      const sb = getSupabase();
      if (sb) {
        try {
          const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
          if (error) return { user: null, error: error.message };
          if (!data.user) return { user: null, error: 'Usuário não encontrado' };

          const { data: profile } = await sb.from('profiles').select('*').eq('auth_id', data.user.id).maybeSingle();
          if (profile) {
            const session: Session = { uid: profile.uid, email: profile.email, nome: profile.nome };
            this.saveSession(session);
            return { user: { uid: profile.uid, email: profile.email, nome: profile.nome, senha: '' } };
          }
          return { user: null, error: 'Perfil não encontrado' };
        } catch (e: any) {
          return { user: null, error: e.message || 'Erro de conexão' };
        }
      }
    }

    return { user: null, error: 'E-mail ou senha incorretos' };
  }

  async registerSupabase(email: string, senha: string, nome: string): Promise<{ user: User | null; error?: string }> {
    // Always register locally first (offline-first)
    const localUid = `user_${Date.now()}`;
    const registered = this.register({ uid: localUid, email, nome, senha });
    if (!registered) {
      const users = this.getUsers();
      return { user: null, error: users.length >= 40 ? 'Turma cheia. Limite de 40 alunos.' : 'E-mail já cadastrado' };
    }

    const session: Session = { uid: localUid, email, nome };
    this.saveSession(session);

    // Try Supabase sync in background — if it fails (rate limit etc), user still works locally
    if (isSupabaseConfigured()) {
      const sb = getSupabase();
      if (sb) {
        try {
          const { data, error } = await sb.auth.signUp({
            email,
            password: senha,
            options: { data: { nome } },
          });
          if (!error && data?.user) {
            const supabaseUid = `user_${data.user.id}`;
            await sb.from('profiles').insert({
              uid: supabaseUid,
              email,
              nome,
              auth_id: data.user.id,
            });
            // Update session with Supabase UID
            const supabaseSession: Session = { uid: supabaseUid, email, nome };
            this.saveSession(supabaseSession);
            return { user: { uid: supabaseUid, email, nome, senha } };
          }
          if (error) {
            // Rate limit or other Supabase error — log but don't block user
            console.warn('Supabase signup skipped (rate limit or network):', error.message);
          }
        } catch (e) {
          console.warn('Supabase signup error (non-blocking):', e);
        }
      }
    }

    return { user: { uid: localUid, email, nome, senha } };
  }

  async logoutSupabase(): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabase();
      await sb?.auth.signOut();
    }
    this.clearSession();
  }

  updateProfile(uid: string, data: Partial<User>): void {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.uid === uid);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...data };
      this.saveUsers(users);
    }
  }

  saveSession(session: Session): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  getSession(): Session | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  clearSession(): void {
    localStorage.removeItem(SESSION_KEY);
  }
}

export const userRepository = new UserRepository();
