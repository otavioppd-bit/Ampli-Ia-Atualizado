import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import type { Session, GamificationState, LogEntry, ChatMessage, Nota, ChatPersona, QuizResult } from '../types';

export class SupabaseRepository {
  private get userId(): string | null {
    const raw = localStorage.getItem('mm_session');
    if (!raw) return null;
    try { return JSON.parse(raw).uid; } catch { return null; }
  }

  async syncProfile(uid: string, email: string, nome: string): Promise<void> {
    if (!isSupabaseConfigured()) return;
    const sb = getSupabase();
    if (!sb) return;
    const { data: existing } = await sb.from('profiles').select('id').eq('uid', uid).maybeSingle();
    if (!existing) {
      const { data: { user } } = await sb.auth.getUser();
      await sb.from('profiles').insert({
        uid,
        email,
        nome,
        auth_id: user?.id || null,
      });
    }
  }

  async loadGamification(): Promise<GamificationState | null> {
    if (!isSupabaseConfigured() || !this.userId) return null;
    const sb = getSupabase(); if (!sb) return null;
    const { data } = await sb.from('gamification').select('*').eq('user_uid', this.userId).maybeSingle();
    if (data) return { xp: data.xp, level: data.level, streak: data.streak, lastAccessDate: data.last_access_date };
    return null;
  }

  async saveGamification(g: GamificationState): Promise<void> {
    if (!isSupabaseConfigured() || !this.userId) return;
    const sb = getSupabase(); if (!sb) return;
    await sb.from('gamification').upsert({
      user_uid: this.userId,
      xp: g.xp,
      level: g.level,
      streak: g.streak,
      last_access_date: g.lastAccessDate,
    }, { onConflict: 'user_uid' });
  }

  async loadLogs(): Promise<LogEntry[]> {
    if (!isSupabaseConfigured() || !this.userId) return [];
    const sb = getSupabase(); if (!sb) return [];
    const { data } = await sb.from('logs').select('*').eq('user_uid', this.userId).order('timestamp', { ascending: false }).limit(200);
    return (data || []).map((r: any) => ({ timestamp: r.timestamp, type: r.type, description: r.description, xp: r.xp }));
  }

  async saveLog(entry: LogEntry): Promise<void> {
    if (!isSupabaseConfigured() || !this.userId) return;
    const sb = getSupabase(); if (!sb) return;
    await sb.from('logs').insert({ user_uid: this.userId, timestamp: entry.timestamp, type: entry.type, description: entry.description, xp: entry.xp || 0 });
  }

  async loadNotas(): Promise<Nota[]> {
    if (!isSupabaseConfigured() || !this.userId) return [];
    const sb = getSupabase(); if (!sb) return [];
    const { data } = await sb.from('notas').select('*').eq('user_uid', this.userId).order('data', { ascending: false });
    return (data || []).map((r: any) => ({ id: r.note_id, text: r.text, data: r.data, tag: r.tag || undefined }));
  }

  async saveNota(nota: Nota): Promise<void> {
    if (!isSupabaseConfigured() || !this.userId) return;
    const sb = getSupabase(); if (!sb) return;
    await sb.from('notas').insert({ user_uid: this.userId, note_id: nota.id, text: nota.text, data: nota.data, tag: nota.tag || '' });
  }

  async deleteNota(noteId: string): Promise<void> {
    if (!isSupabaseConfigured() || !this.userId) return;
    const sb = getSupabase(); if (!sb) return;
    await sb.from('notas').delete().eq('user_uid', this.userId).eq('note_id', noteId);
  }

  async loadQuizResults(): Promise<QuizResult[]> {
    if (!isSupabaseConfigured() || !this.userId) return [];
    const sb = getSupabase(); if (!sb) return [];
    const { data } = await sb.from('quiz_results').select('*').eq('user_uid', this.userId).order('timestamp', { ascending: false });
    return (data || []).map((r: any) => ({ materia: r.materia, acertos: r.acertos, total: r.total, xpGanho: r.xp_ganho, timestamp: r.timestamp }));
  }

  async saveQuizResult(r: QuizResult): Promise<void> {
    if (!isSupabaseConfigured() || !this.userId) return;
    const sb = getSupabase(); if (!sb) return;
    await sb.from('quiz_results').insert({ user_uid: this.userId, materia: r.materia, acertos: r.acertos, total: r.total, xp_ganho: r.xpGanho, timestamp: r.timestamp });
  }

  async loadPersonas(): Promise<ChatPersona[]> {
    if (!isSupabaseConfigured() || !this.userId) return [];
    const sb = getSupabase(); if (!sb) return [];
    const { data } = await sb.from('personas').select('*').eq('user_uid', this.userId);
    return (data || []).map((r: any) => ({ id: r.persona_id, name: r.name, icon: r.icon, color: r.color, instruction: r.instruction, createdAt: r.created_at }));
  }

  async savePersona(p: ChatPersona): Promise<void> {
    if (!isSupabaseConfigured() || !this.userId) return;
    const sb = getSupabase(); if (!sb) return;
    await sb.from('personas').insert({ user_uid: this.userId, persona_id: p.id, name: p.name, icon: p.icon, color: p.color, instruction: p.instruction, created_at: p.createdAt });
  }

  async deletePersona(personaId: string): Promise<void> {
    if (!isSupabaseConfigured() || !this.userId) return;
    const sb = getSupabase(); if (!sb) return;
    await sb.from('personas').delete().eq('user_uid', this.userId).eq('persona_id', personaId);
  }
}

export const supabaseRepository = new SupabaseRepository();
