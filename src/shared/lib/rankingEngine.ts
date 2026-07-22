import type { Escola, Turma, RankingEntry, RankingFilter, RankingData, UserProfile } from '../types';

// === Escolas demo simuladas ===
export const ESCOLAS: Escola[] = [
  { id: 'escola_1', nome: 'Colégio Ampli', cidade: 'São Paulo', cor: '#f59e0b' },
  { id: 'escola_2', nome: 'Instituto Saber', cidade: 'Rio de Janeiro', cor: '#3b82f6' },
  { id: 'escola_3', nome: 'Colégio Futuro', cidade: 'Belo Horizonte', cor: '#10b981' },
  { id: 'escola_4', nome: 'Centro Educacional Nova Geração', cidade: 'Curitiba', cor: '#8b5cf6' },
  { id: 'escola_5', nome: 'Colégio Primavera', cidade: 'Salvador', cor: '#ec4899' },
];

export const TURMAS: Turma[] = [
  { id: '1A-EXA', nome: '1ª Série A (Exatas)', escolaId: 'escola_1' },
  { id: '1B-HUM', nome: '1ª Série B (Humanas)', escolaId: 'escola_1' },
  { id: '2A-EXA', nome: '2ª Série A (Exatas)', escolaId: 'escola_1' },
  { id: '2B-HUM', nome: '2ª Série B (Humanas)', escolaId: 'escola_1' },
  { id: '3A-INT', nome: '3ª Série A (Integrado)', escolaId: 'escola_1' },
  { id: '3B-INT', nome: '3ª Série B (Integrado)', escolaId: 'escola_1' },
  { id: 'SA-1A', nome: '1ª Série A', escolaId: 'escola_2' },
  { id: 'SA-2A', nome: '2ª Série A', escolaId: 'escola_2' },
  { id: 'SA-3A', nome: '3ª Série A', escolaId: 'escola_2' },
  { id: 'CF-1A', nome: '1º Ano EM', escolaId: 'escola_3' },
  { id: 'CF-2A', nome: '2º Ano EM', escolaId: 'escola_3' },
  { id: 'CF-3A', nome: '3º Ano EM', escolaId: 'escola_3' },
  { id: 'CNG-1A', nome: '1ª Série', escolaId: 'escola_4' },
  { id: 'CNG-2A', nome: '2ª Série', escolaId: 'escola_4' },
  { id: 'CNG-3A', nome: '3ª Série', escolaId: 'escola_4' },
  { id: 'CP-1A', nome: '1º Ano', escolaId: 'escola_5' },
  { id: 'CP-2A', nome: '2º Ano', escolaId: 'escola_5' },
  { id: 'CP-3A', nome: '3º Ano', escolaId: 'escola_5' },
];

const ADJETIVOS = [
  'Determinado', 'Focado', 'Persistente', 'Incansável', 'Brillante',
  'Estratégico', 'Disciplinado', 'Intenso', 'Dedicado', 'Guerreiro',
  'Supremo', 'Ágil', 'Veloz', 'Expert', 'Ninja',
  'Lendário', 'Invencível', 'Poderoso', 'Sábio', 'Audaz',
  'Valente', 'Campeão', 'Raio', 'Fera', 'Mestre',
  'Super', 'Turbo', 'Ligeiro', 'Top', 'Brabo',
];

const ANIMAIS = [
  'Coruja', 'Leão', 'Fênix', 'Tubarão', 'Águia',
  'Pantera', 'Lobo', 'Falcão', 'Tigre', 'Grifo',
  'Orca', 'Gavião', 'Cervo', 'Lince', 'Bufalo',
  'Jaguar', 'Condor', 'Lontra', 'Zebra', 'Gazela',
  'Puma', 'Harpia', 'Tucano', 'Arara', 'Pégaso',
];

const EMOJIS_RANKING = [
  '🚀', '🔥', '💪', '⚡', '🎯', '🌟', '✨', '💎',
  '🏆', '📚', '🧠', '🎓', '⭐', '🌀', '💫', '🔮',
];

function gerarNickname(seed: number): string {
  const adj = ADJETIVOS[Math.floor(seedRandom(seed) * ADJETIVOS.length)];
  const animal = ANIMAIS[Math.floor(seedRandom(seed + 50) * ANIMAIS.length)];
  const emoji = EMOJIS_RANKING[Math.floor(seedRandom(seed + 100) * EMOJIS_RANKING.length)];
  const num = Math.floor(seedRandom(seed + 150) * 99) + 1;
  return `${emoji} ${animal}${adj}${num}`;
}

function gerarXpMock(): number {
  return Math.floor(Math.random() * 5000) + 200;
}

function gerarStreakMock(): number {
  return Math.floor(Math.random() * 30) + 1;
}

function nivelPorXp(xp: number): number {
  let level = 1;
  let acc = 0;
  while (acc + 100 * level <= xp) {
    acc += 100 * level;
    level++;
  }
  return level;
}

function getFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, data: unknown) {
  localStorage.setItem(key, JSON.stringify(data));
}

/** Escolas cadastradas pelo usuário (persistidas) */
export function getEscolasCadastradas(): Escola[] {
  return getFromStorage<Escola[]>('mm_escolas', ESCOLAS);
}

export function getTurmasCadastradas(): Turma[] {
  return getFromStorage<Turma[]>('mm_turmas', TURMAS);
}

export function salvarEscola(escola: Escola) {
  const list = getEscolasCadastradas();
  if (!list.find(e => e.id === escola.id)) {
    list.push(escola);
    saveToStorage('mm_escolas', list);
  }
}

export function salvarTurma(turma: Turma) {
  const list = getTurmasCadastradas();
  if (!list.find(t => t.id === turma.id)) {
    list.push(turma);
    saveToStorage('mm_turmas', list);
  }
}

export function getProfile(uid: string): UserProfile {
  const defaultProfile: UserProfile = { uid, nome: 'Você', email: '' };
  return getFromStorage<UserProfile>(`mm_profile_${uid}`, defaultProfile);
}

export function saveProfile(profile: UserProfile) {
  saveToStorage(`mm_profile_${profile.uid}`, profile);
}

/** Gera dados mock de ranking para demonstração offline */
function gerarRankingMock(
  filter: RankingFilter,
  userProfile: UserProfile,
  userXp: number,
  userStreak: number,
): RankingEntry[] {
  const escolas = getEscolasCadastradas();
  const turmas = getTurmasCadastradas();
  const entries: RankingEntry[] = [];
  const rng = seedFromString(userProfile.uid || 'default');

  // Each entry — anonymous nicknames (LGPD compliant, like Duolingo)
  for (let i = 0; i < ADJETIVOS.length * ANIMAIS.length; i++) {
    if (entries.length >= 48) break;
    const nickname = gerarNickname(rng + i * 7);
    const turma = turmas[i % turmas.length];
    const escola = escolas.find(e => e.id === turma.escolaId) || escolas[0];
    const xp = gerarXpMockSeed(rng + i * 3 + 1);
    const streak = gerarStreakMockSeed(rng + i * 3 + 100);
    entries.push({
      posicao: 0,
      nome: nickname,
      turma: turma.nome,
      turmaId: turma.id,
      escola: escola.nome,
      escolaId: escola.id,
      xp,
      level: nivelPorXp(xp),
      streak,
      avatarInicial: '',
      destaque: false,
      variacao: Math.floor((seedRandom(rng + i * 3) - 0.5) * 6) - 2,
    });
  }

  const userEntry: RankingEntry = {
    posicao: 0,
    nome: userProfile.nome || 'Você',
    turma: turmas.find(t => t.id === userProfile.turmaId)?.nome || '—',
    turmaId: userProfile.turmaId || '',
    escola: escolas.find(e => e.id === userProfile.escolaId)?.nome || '—',
    escolaId: userProfile.escolaId || '',
    xp: userXp,
    level: nivelPorXp(userXp),
    streak: userStreak,
    avatarInicial: userProfile.nome?.charAt(0)?.toUpperCase() || 'V',
    destaque: true,
    variacao: 0,
  };
  entries.push(userEntry);

  // Filter
  let filtered = entries;
  if (filter === 'turma' && userProfile.turmaId) {
    filtered = entries.filter(e => e.turmaId === userProfile.turmaId);
  } else if (filter === 'escola' && userProfile.escolaId) {
    filtered = entries.filter(e => e.escolaId === userProfile.escolaId);
  }

  // Sort by XP descending
  filtered.sort((a, b) => b.xp - a.xp);

  // Assign positions
  return filtered.map((e, i) => ({ ...e, posicao: i + 1 }));
}

/** Busca dados reais do Supabase */
async function gerarRankingSupabase(
  filter: RankingFilter,
  userProfile: UserProfile,
): Promise<RankingEntry[]> {
  const { getSupabase, isSupabaseConfigured } = await import('./supabase');
  if (!isSupabaseConfigured()) return [];

  const sb = getSupabase();
  if (!sb) return [];

  try {
    const { data: profiles } = await sb
      .from('profiles')
      .select('uid, nome, email, escola_id, turma_id')
      .limit(500);

    const { data: gamifications } = await sb
      .from('gamification')
      .select('user_uid, xp, level, streak')
      .limit(500);

    if (!profiles || !gamifications) return [];

    const escolas = getEscolasCadastradas();
    const turmas = getTurmasCadastradas();

    const xpMap = new Map(gamifications.map(g => [g.user_uid, g]));

    const entries: RankingEntry[] = profiles.map((p, idx) => {
      const g = xpMap.get(p.uid);
      const turma = turmas.find(t => t.id === p.turma_id);
      const escola = escolas.find(e => e.id === p.escola_id);
      const isSelf = p.uid === userProfile.uid;
      return {
        posicao: 0,
        nome: isSelf ? (userProfile.nome || 'Você') : gerarNickname(seedFromString(p.uid || `${idx}`)),
        turma: turma?.nome || '—',
        turmaId: p.turma_id || '',
        escola: escola?.nome || '—',
        escolaId: p.escola_id || '',
        xp: g?.xp || 0,
        level: g?.level || 1,
        streak: g?.streak || 0,
        avatarInicial: isSelf ? (userProfile.nome?.charAt(0)?.toUpperCase() || 'V') : '',
        destaque: isSelf,
        variacao: 0,
      };
    });

    let filtered = entries.filter(e => e.xp > 0);
    if (filter === 'turma' && userProfile.turmaId) {
      filtered = filtered.filter(e => e.turmaId === userProfile.turmaId);
    } else if (filter === 'escola' && userProfile.escolaId) {
      filtered = filtered.filter(e => e.escolaId === userProfile.escolaId);
    }

    filtered.sort((a, b) => b.xp - a.xp);
    return filtered.map((e, i) => ({ ...e, posicao: i + 1 }));
  } catch {
    return [];
  }
}

export async function getRankingData(
  filter: RankingFilter,
  uid: string,
  userXp: number,
  userStreak: number,
): Promise<RankingData> {
  const profile = getProfile(uid);
  const { isSupabaseConfigured } = await import('./supabase');

  let entries: RankingEntry[];

  if (isSupabaseConfigured()) {
    entries = await gerarRankingSupabase(filter, profile);
    // If empty (no other users registered), fallback to mock
    if (entries.length <= 1) {
      entries = gerarRankingMock(filter, profile, userXp, userStreak);
    }
  } else {
    entries = gerarRankingMock(filter, profile, userXp, userStreak);
  }

  const labels: Record<RankingFilter, string> = {
    geral: 'Ranking Geral',
    turma: 'Ranking da Turma',
    escola: 'Ranking da Escola',
  };

  return {
    filter,
    label: labels[filter],
    entries,
    totalParticipantes: entries.length,
    updatedAt: Date.now(),
  };
}

// === Deterministic seeded random (for consistent mock data) ===
function seedFromString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return Math.abs(hash);
}

function seedRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function gerarXpMockSeed(seed: number): number {
  return Math.floor(seedRandom(seed) * 5000) + 200;
}

function gerarStreakMockSeed(seed: number): number {
  return Math.floor(seedRandom(seed) * 30) + 1;
}
