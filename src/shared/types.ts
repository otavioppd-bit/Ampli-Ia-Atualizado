// ===== Auth =====
export type UserRole = 'student' | 'educator' | 'parent';

export interface User {
  uid: string;
  email: string;
  nome: string;
  sobrenome?: string;
  metaEstudo?: string;
  senha: string;
  role: UserRole;
}

export interface Session {
  uid: string;
  email: string;
  nome: string;
  role: UserRole;
}

export type RolePage = 'dashboard' | 'educator-dashboard' | 'parent-dashboard';

// ===== Mood/Emotion =====
export type MoodType = 'stress' | 'anxiety' | 'sadness' | 'tired' | 'demotivated' | 'focused' | 'motivated' | 'happy' | 'energetic' | 'neutral';

export interface MoodEntry {
  timestamp: number;
  mood: MoodType;
  text?: string;
}

export interface EmotionWord {
  word: string;
  mood: MoodType;
  valence: number; // -1 to 1
  sscDelta: number; // -10 to 10
}

// ===== SSC =====
export interface SSCInput {
  sono: number; // 0-12
  cansaco: number; // 0-10
  mood: MoodType;
}

export type SSCLevel = 'normal' | 'attention' | 'critical';

// ===== Planner =====
export interface MicroTask {
  id: string;
  titulo: string;
  descricao: string;
  emoji: string;
  completed: boolean;
}

export interface DailyPlan {
  date: string; // YYYY-MM-DD
  mood: MoodType;
  tasks: MicroTask[];
}

// ===== Gamification =====
export interface GamificationState {
  xp: number;
  level: number;
  streak: number;
  lastAccessDate: string; // YYYY-MM-DD
}

// ===== Chat =====
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  mood?: MoodType;
  image?: string;
}

export interface KBEntry {
  id: string;
  keywords: string[];
  content: string;
  source: 'faq' | 'quiz';
}

// ===== Essay =====
export interface EssayCorrection {
  competencia1: number; // 0-200
  competencia2: number;
  competencia3: number;
  competencia4: number;
  competencia5: number;
  notaFinal: number;
  pontosFortes: string[];
  pontosMelhorar: string[];
  originalText: string;
}

export interface ChallengeResult {
  id: string;
  tema: string;
  notaFinal: number;
  competencia1: number;
  competencia2: number;
  competencia3: number;
  competencia4: number;
  competencia5: number;
  xpGanho: number;
  tempoUsadoSegundos: number;
  finalizado: boolean; // enviado dentro do prazo
  timestamp: number;
}

// ===== Quiz =====
export interface QuizQuestion {
  id: string;
  materia: string;
  enunciado: string;
  alternativas: string[];
  correta: number; // index
  explicacao: string;
}

export interface QuizResult {
  materia: string;
  acertos: number;
  total: number;
  xpGanho: number;
  timestamp: number;
}

// ===== Notebook =====
export interface Nota {
  id: string;
  text: string;
  data: string; // ISO date
  tag?: string;
}

// ===== Log =====
export type LogEventType = 'atividade' | 'exercicio' | 'foco' | 'quiz' | 'essay' | 'login' | 'tutorial';

export interface LogEntry {
  timestamp: number;
  type: LogEventType;
  description: string;
  xp?: number;
}

// ===== Storage =====
export interface StorageRepository<T> {
  get(id: string): T | null;
  set(id: string, data: T): void;
  list(): T[];
  push(data: T): void;
  delete(id: string): void;
}

// ===== Weekly Report =====
export interface WeeklyReport {
  diasAtivos: number;
  totalAtividades: number;
  totalExercicios: number;
  performance: 'excelente' | 'boa' | 'regular' | 'atencao';
  analise: string;
  days: { date: string; active: boolean }[];
}

// ===== Persona =====
export interface ChatPersona {
  id: string;
  name: string;
  icon: string;
  color: string;
  instruction: string;
  createdAt: number;
}

// ===== School / Class / Ranking =====
export type TurmaKey = string; // "3A-MAT" | "3B-HUM" etc
export type EscolaKey = string; // "escola_1" etc

export interface Escola {
  id: EscolaKey;
  nome: string;
  cidade?: string;
  cor?: string;
}

export interface Turma {
  id: TurmaKey;
  nome: string;
  escolaId: EscolaKey;
  ano?: string;
}

export interface UserProfile {
  uid: string;
  nome: string;
  email: string;
  escolaId?: EscolaKey;
  turmaId?: TurmaKey;
  avatarUrl?: string;
}

export interface RankingEntry {
  posicao: number;
  nome: string;
  turma: string;
  turmaId: TurmaKey;
  escola: string;
  escolaId: EscolaKey;
  xp: number;
  level: number;
  streak: number;
  avatarInicial: string;
  destaque?: boolean; // current user
  variacao?: number; // position change vs last week (-2, +1, 0)
}

export type RankingFilter = 'geral' | 'turma' | 'escola';

export interface RankingData {
  filter: RankingFilter;
  label: string;
  entries: RankingEntry[];
  totalParticipantes: number;
  updatedAt: number;
}

// ===== Community Chat =====
export interface CommunityMessage {
  id: string;
  escolaId: EscolaKey;
  turmaId: TurmaKey;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
  moderated: boolean;
  moderatedReason?: string;
  replyTo?: string;
  likes?: number;
  likedBy?: string[];
  materia?: string;
}

export interface CommunityChatFilter {
  escolaId: EscolaKey;
  materia?: string;
}

// ===== Tab Navigation =====
export type TabId = 'dashboard' | 'chat' | 'essay' | 'notebook' | 'quiz' | 'profile' | 'ranking' | 'foco' | 'comunidade' | 'store';

export interface Tab {
  id: TabId;
  label: string;
  icon: string;
}
