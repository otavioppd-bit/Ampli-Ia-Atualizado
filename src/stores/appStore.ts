import { create } from 'zustand';
import { MoodType, TabId, GamificationState, ChatMessage, Nota, LogEntry, DailyPlan, EssayCorrection, QuizResult, Session, ChatPersona, UserRole, ChallengeResult } from '../shared/types';
import { calculateSSC } from '../shared/lib/sscCalculator';
import { detectEmotion, getMoodColor } from '../shared/lib/emotionEngine';
import { analyzeMoodWithAI } from '../shared/lib/aiService';
import { generatePlan, XP_PER_TASK } from '../shared/lib/plannerEngine';
import { userRepository } from '../shared/storage/UserRepository';
import { supabaseRepository } from '../shared/storage/SupabaseRepository';
import { isSupabaseConfigured } from '../shared/lib/supabase';
import { calcLevel, getToday } from '../shared/lib/utils';

interface AppState {
  session: Session | null;
  isAuthenticated: boolean;
  userRole: UserRole;

  activeTab: TabId;
  showCrisisOverlay: boolean;
  showWeeklyReport: boolean;
  showNotebookStudio: boolean;
  showTutorial: boolean;
  tutorialStep: number;
  personas: ChatPersona[];
  activePersonaId: string | null;
  showPersonaManager: boolean;
  apiKey: string;
  toastMessage: string | null;
  toastType: 'success' | 'error' | 'info';

  currentMood: MoodType;
  moodHistory: { mood: MoodType; timestamp: number }[];
  moodColor: string;

  sono: number;
  cansaco: number;
  sscScore: number;

  gamification: GamificationState;

  chatMessages: ChatMessage[];
  isMuted: boolean;

  lastCorrection: EssayCorrection | null;

  quizResults: QuizResult[];

  notas: Nota[];

  logs: LogEntry[];

  dailyPlan: DailyPlan | null;

  challengeResults: ChallengeResult[];
  challengeSeenTutorial: boolean;

  setSession: (session: Session | null) => void;
  logout: () => void;
  setActiveTab: (tab: TabId) => void;
  setSono: (v: number) => void;
  setCansaco: (v: number) => void;
  recalcSSC: () => void;
  detectAndSetMood: (text: string) => Promise<MoodType>;
  setMood: (mood: MoodType) => void;
  addChatMessage: (msg: ChatMessage) => void;
  addXP: (n: number) => void;
  addLog: (entry: LogEntry) => void;
  setDailyPlan: (plan: DailyPlan | null) => void;
  completeTask: (taskId: string) => void;
  regeneratePlan: () => void;
  setToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  clearToast: () => void;
  setShowCrisisOverlay: (v: boolean) => void;
  setShowWeeklyReport: (v: boolean) => void;
  setShowNotebookStudio: (v: boolean) => void;
  setShowTutorial: (v: boolean) => void;
  setTutorialStep: (n: number) => void;
  setPersonas: (personas: ChatPersona[]) => void;
  addPersona: (persona: ChatPersona) => void;
  removePersona: (id: string) => void;
  setActivePersonaId: (id: string | null) => void;
  setShowPersonaManager: (v: boolean) => void;
  setApiKey: (key: string) => void;
  setIsMuted: (v: boolean) => void;
  setLastCorrection: (c: EssayCorrection | null) => void;
  addQuizResult: (r: QuizResult) => void;
  setNotas: (notas: Nota[]) => void;
  addNota: (nota: Nota) => void;
  updateGamification: (g: Partial<GamificationState>) => void;
setChatMessages: (msgs: ChatMessage[]) => void;
  setLogs: (logs: LogEntry[]) => void;
  addChallengeResult: (r: ChallengeResult) => void;
  setChallengeSeenTutorial: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  session: null,
  isAuthenticated: false,
  userRole: 'student',

  activeTab: 'dashboard',
  showCrisisOverlay: false,
  showWeeklyReport: false,
  showNotebookStudio: false,
  showTutorial: false,
  tutorialStep: 0,
  personas: [
    { id: 'mentor_enem', name: 'Mentor ENEM', icon: '🧠', color: '#f59e0b', instruction: 'Você é um mentor de estudos para o ENEM. Ajude o aluno com todas as matérias, dê dicas de estudo, corrija redações, motive e oriente. Responda com rigor de pesquisador, use argumentos claros e baseie suas respostas em conceitos estruturados.', createdAt: 0 },
    { id: 'prof_matematica', name: 'Prof. Matemática', icon: '📐', color: '#3b82f6', instruction: 'Você é um professor de matemática focado no ENEM. Responda apenas sobre matemática: álgebra, geometria, estatística, probabilidade. Explique com precisão, justifique cada passo e use um estilo analítico de pesquisador.', createdAt: 0 },
    { id: 'prof_portugues', name: 'Prof. Português', icon: '📝', color: '#10b981', instruction: 'Você é um professor de português focado no ENEM. Ajude com gramática, interpretação de texto, literatura brasileira e redação. Explique regras com exemplos claros e análise formal, como um pesquisador acadêmico.', createdAt: 0 },
    { id: 'prof_ciencias', name: 'Prof. Ciências', icon: '🔬', color: '#8b5cf6', instruction: 'Você é um professor de ciências da natureza focado no ENEM. Responda sobre biologia, física e química. Apresente explicações fundamentadas, use analogias científicas e relacione com evidências de campo.', createdAt: 0 },
    { id: 'prof_humanas', name: 'Prof. Humanas', icon: '🌍', color: '#ec4899', instruction: 'Você é um professor de ciências humanas focado no ENEM. Responda sobre história, geografia, filosofia e sociologia. Contextualize eventos historicamente e use uma abordagem analítica de pesquisador.', createdAt: 0 },
  ],
  activePersonaId: 'mentor_enem',
  showPersonaManager: false,
  apiKey: '',
  toastMessage: null,
  toastType: 'info',

  currentMood: 'neutral',
  moodHistory: [],
  moodColor: '#10b981',

  sono: 7,
  cansaco: 4,
  sscScore: 20,

  gamification: { xp: 0, level: 1, streak: 1, lastAccessDate: getToday() },

  chatMessages: [],
  isMuted: false,

lastCorrection: null,
  quizResults: [],
  notas: [],
  logs: [],
  dailyPlan: null,
  challengeResults: (() => {
    try {
      const raw = localStorage.getItem('mm_challenge_results');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  })(),
  challengeSeenTutorial: localStorage.getItem('mm_challenge_tutorial') === '1',

  setSession: (session) => {
    localStorage.removeItem('mm_chat_messages');
    set({ session, isAuthenticated: !!session, userRole: session?.role || 'student', chatMessages: [] });
  },

  logout: () => {
    if (isSupabaseConfigured()) {
      const state = get();
      supabaseRepository.saveGamification(state.gamification).catch(() => {});
      state.logs.forEach(log => supabaseRepository.saveLog(log).catch(() => {}));
      state.notas.forEach(nota => supabaseRepository.saveNota(nota).catch(() => {}));
      userRepository.logoutSupabase();
    }
    userRepository.clearSession();
    set({ session: null, isAuthenticated: false, userRole: 'student' });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setSono: (sono) => set({ sono }),
  setCansaco: (cansaco) => set({ cansaco }),

  recalcSSC: () => {
    const { sono, cansaco, currentMood } = get();
    const ssc = calculateSSC({ sono, cansaco, mood: currentMood });
    set({ sscScore: ssc });
    if (ssc >= 70) {
      const session = get().session;
      if (session && !get().showCrisisOverlay) {
        set({ showCrisisOverlay: true });
      }
    }
  },

  detectAndSetMood: async (text) => {
    const apiKey = get().apiKey;
    let mood: MoodType;
    let aiReason = '';
    if (apiKey) {
      try {
        const raw = await analyzeMoodWithAI(text, apiKey);
        const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*$/gm, '').trim();
        const parsed = JSON.parse(cleaned);
        mood = parsed.mood as MoodType;
        aiReason = parsed.reason || '';
      } catch {
        const result = detectEmotion(text);
        mood = result.mood;
      }
    } else {
      const result = detectEmotion(text);
      mood = result.mood;
    }
    const moodColor = getMoodColor(mood);
    const moodEntry = { mood, timestamp: Date.now() };
    set((s) => ({
      currentMood: mood,
      moodColor,
      moodHistory: [...s.moodHistory.slice(-23), moodEntry],
    }));
    get().recalcSSC();
    get().regeneratePlan();
    return mood;
  },

  setMood: (mood) => {
    const moodColor = getMoodColor(mood);
    set((s) => ({
      currentMood: mood,
      moodColor,
      moodHistory: [...s.moodHistory.slice(-23), { mood, timestamp: Date.now() }],
    }));
    get().recalcSSC();
    get().regeneratePlan();
  },

  addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),

  addXP: (n) => {
    set((s) => {
      const newXp = s.gamification.xp + n;
      const { level } = calcLevel(newXp);
      const leveledUp = level > s.gamification.level;
      return {
        gamification: { ...s.gamification, xp: newXp, level, streak: s.gamification.streak },
        toastMessage: leveledUp ? `🎉 Level Up! Agora você é nível ${level}!` : `+${n} XP`,
        toastType: leveledUp ? 'success' : 'info',
      };
    });
  },

  addLog: (entry) => {
    set((s) => ({ logs: [...s.logs, entry] }));
    supabaseRepository.saveLog(entry).catch(() => {});
  },

  setDailyPlan: (plan) => set({ dailyPlan: plan }),

  completeTask: (taskId) => {
    set((s) => {
      if (!s.dailyPlan) return s;
      const tasks = s.dailyPlan.tasks.map((t) =>
        t.id === taskId ? { ...t, completed: !t.completed } : t
      );
      return { dailyPlan: { ...s.dailyPlan, tasks } };
    });
    const task = get().dailyPlan?.tasks.find(t => t.id === taskId);
    if (task && !task.completed) {
      get().addXP(XP_PER_TASK);
      get().addLog({ timestamp: Date.now(), type: 'atividade', description: `Concluiu: ${task.titulo}`, xp: XP_PER_TASK });
    }
  },

  regeneratePlan: () => {
    const { currentMood } = get();
    const today = getToday();
    const plan = generatePlan(currentMood);
    const stored = localStorage.getItem(`mm_plan_${today}`);
    if (!stored) {
      const dailyPlan: DailyPlan = { date: today, ...plan };
      localStorage.setItem(`mm_plan_${today}`, JSON.stringify(dailyPlan));
      set({ dailyPlan });
    }
  },

  setToast: (message, type = 'info') => set({ toastMessage: message, toastType: type }),
  clearToast: () => set({ toastMessage: null }),

  setShowCrisisOverlay: (v) => set({ showCrisisOverlay: v }),
  setShowWeeklyReport: (v) => set({ showWeeklyReport: v }),
  setShowNotebookStudio: (v) => set({ showNotebookStudio: v }),
  setShowTutorial: (v) => set({ showTutorial: v }),
  setTutorialStep: (n) => set({ tutorialStep: n }),
  setPersonas: (personas) => { localStorage.setItem('mm_personas', JSON.stringify(personas)); set({ personas }); },
  addPersona: (persona) => {
    set((s) => {
      const updated = [...s.personas, persona];
      localStorage.setItem('mm_personas', JSON.stringify(updated));
      return { personas: updated };
    });
    supabaseRepository.savePersona(persona).catch(() => {});
  },
  removePersona: (id) => {
    set((s) => {
      const updated = s.personas.filter(p => p.id !== id);
      localStorage.setItem('mm_personas', JSON.stringify(updated));
      return { personas: updated, activePersonaId: s.activePersonaId === id ? 'mentor_enem' : s.activePersonaId };
    });
    supabaseRepository.deletePersona(id).catch(() => {});
  },
  setActivePersonaId: (id) => { localStorage.setItem('mm_active_persona', id || ''); set({ activePersonaId: id }); },
  setShowPersonaManager: (v) => set({ showPersonaManager: v }),
  setApiKey: (key) => { localStorage.setItem('mm_api_key', key); set({ apiKey: key }); },
  setIsMuted: (v) => set({ isMuted: v }),

  setLastCorrection: (c) => set({ lastCorrection: c }),
  addQuizResult: (r) => {
    set((s) => ({ quizResults: [...s.quizResults, r] }));
    supabaseRepository.saveQuizResult(r).catch(() => {});
  },
  setNotas: (notas) => set({ notas }),
  addNota: (nota) => {
    set((s) => ({ notas: [nota, ...s.notas] }));
    supabaseRepository.saveNota(nota).catch(() => {});
  },
  updateGamification: (g) => set((s) => {
    const merged = { ...s.gamification, ...g };
    if (g.xp !== undefined) {
      const { level } = calcLevel(merged.xp);
      merged.level = level;
    }
    return { gamification: merged };
  }),
  setChatMessages: (msgs) => set({ chatMessages: msgs }),
  setLogs: (logs) => set({ logs }),

  addChallengeResult: (r) => {
    set((s) => {
      const updated = [r, ...s.challengeResults].slice(0, 20);
      localStorage.setItem('mm_challenge_results', JSON.stringify(updated));
      return { challengeResults: updated };
    });
    supabaseRepository.saveLog({ timestamp: r.timestamp, type: 'essay', description: `Desafio concluído: ${r.tema} — ${r.notaFinal}/1000`, xp: r.xpGanho }).catch(() => {});
  },

  setChallengeSeenTutorial: (v) => {
    if (v) localStorage.setItem('mm_challenge_tutorial', '1');
    else localStorage.removeItem('mm_challenge_tutorial');
    set({ challengeSeenTutorial: v });
  },
}));
