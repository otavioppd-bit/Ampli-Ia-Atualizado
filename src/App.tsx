import { useEffect, useRef, useState } from 'react';
import { useAppStore } from './stores/appStore';
import { userRepository } from './shared/storage/UserRepository';
import { supabaseRepository } from './shared/storage/SupabaseRepository';
import { isSupabaseConfigured } from './shared/lib/supabase';
import { AuthPage } from './features/auth/AuthPage';
import { AppShell } from './app/AppShell';
import { EducatorPage } from './features/educator/EducatorPage';
import { ParentPage } from './features/parent/ParentPage';
import { ParticleCanvas } from './features/atmo/ParticleCanvas';
import { Toast } from './shared/ui/Toast';
import { OnboardingTour } from './shared/ui/OnboardingTour';
import { LevelUpOverlay } from './shared/ui/LevelUpOverlay';
import { mascotStore } from './stores/mascotStore';
import { GamificationState, ChatPersona } from './shared/types';
import { getToday } from './shared/lib/utils';

export default function App() {
  const { isAuthenticated, userRole, setSession, updateGamification, setLogs, setNotas, setChatMessages, setPersonas, setActivePersonaId, setApiKey, gamification } = useAppStore();
  const { session } = useAppStore();
  const logs = useAppStore(s => s.logs);
  const prevLevel = useRef(gamification.level);
  const [levelUp, setLevelUp] = useState<number | null>(null);

  // Restore session + load data from Supabase if connected
  useEffect(() => {
    async function load() {
      const sessionData = userRepository.getSession();
      if (sessionData) {
        setSession(sessionData);

        if (isSupabaseConfigured()) {
          try {
            const [gam, logs, notas, _quizResults, personas] = await Promise.all([
              supabaseRepository.loadGamification(),
              supabaseRepository.loadLogs(),
              supabaseRepository.loadNotas(),
              supabaseRepository.loadQuizResults(),
              supabaseRepository.loadPersonas(),
            ]);
            if (gam) updateGamification(gam);
            if (logs.length > 0) setLogs(logs);
            if (notas.length > 0) setNotas(notas);
            if (personas.length > 0) {
              const allPersonas = [...useAppStore.getState().personas.filter(p => ['mentor_enem', 'prof_matematica', 'prof_portugues', 'prof_ciencias', 'prof_humanas'].includes(p.id)), ...personas];
              setPersonas(allPersonas);
            }
          } catch { /* fallback to localStorage */ }
        }
      }
    }
    load();
  }, []);

  // Restore localStorage data (fallback)
  useEffect(() => {
    if (isSupabaseConfigured()) return;
    const savedLogs = localStorage.getItem('mm_logs');
    if (savedLogs) { try { setLogs(JSON.parse(savedLogs)); } catch { /* ignore */ } }
    const savedNotas = localStorage.getItem('mm_notas');
    if (savedNotas) { try { setNotas(JSON.parse(savedNotas)); } catch { /* ignore */ } }
    const savedChat = localStorage.getItem('mm_chat_messages');
    if (savedChat) { try { setChatMessages(JSON.parse(savedChat)); } catch { /* ignore */ } }
    const savedGamification = localStorage.getItem('mm_gamification');
    if (savedGamification) { try { updateGamification(JSON.parse(savedGamification) as GamificationState); } catch { /* ignore */ } }
    const savedPersonas = localStorage.getItem('mm_personas');
    if (savedPersonas) { try { const p = JSON.parse(savedPersonas) as ChatPersona[]; if (p.length > 0) setPersonas(p); } catch { /* ignore */ } }
    const activePersona = localStorage.getItem('mm_active_persona');
    if (activePersona) setActivePersonaId(activePersona);
    const savedApiKey = localStorage.getItem('mm_api_key');
    if (savedApiKey) setApiKey(savedApiKey);
  }, []);

  // Streak check (only for students)
  useEffect(() => {
    if (!isAuthenticated || userRole !== 'student') return;
    const today = getToday();
    const lastAccess = gamification.lastAccessDate;
    let streak = gamification.streak;
    if (lastAccess !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      if (lastAccess === yesterdayStr) {
        streak = gamification.streak + 1;
      } else {
        streak = 1;
      }
      updateGamification({ lastAccessDate: today, streak });
    }
  }, [isAuthenticated, userRole]);

  // Mascote: comemora subida de nível
  useEffect(() => {
    if (!isAuthenticated || userRole !== 'student') return;
    if (gamification.level > prevLevel.current) {
      mascotStore.getState().setState('success', `🎉 Uau! Você subiu para o nível ${gamification.level}! Continue assim!`);
      setLevelUp(gamification.level);
    }
    prevLevel.current = gamification.level;
  }, [gamification.level, isAuthenticated, userRole]);

  // Mascote: celebra streak novo (a partir de 2 dias)
  useEffect(() => {
    if (!isAuthenticated || userRole !== 'student' || gamification.streak < 2) return;
    mascotStore.getState().setState('success', `🔥 ${gamification.streak} dias seguidos de estudo! Seu foco é inspirador!`);
  }, [gamification.streak, isAuthenticated, userRole]);

  // Persist gamification to localStorage + Supabase
  useEffect(() => {
    if (!isAuthenticated) return;
    localStorage.setItem('mm_gamification', JSON.stringify(useAppStore.getState().gamification));
    if (isSupabaseConfigured() && session) {
      supabaseRepository.saveGamification(useAppStore.getState().gamification).catch(() => {});
    }
  }, [gamification]);

  // Persist logs
  useEffect(() => {
    if (!isAuthenticated) return;
    localStorage.setItem('mm_logs', JSON.stringify(logs));
  }, [isAuthenticated, logs]);

  if (!isAuthenticated) {
    return (
      <>
        <ParticleCanvas />
        <AuthPage />
      </>
    );
  }

  if (userRole === 'educator') {
    return (
      <>
        <ParticleCanvas />
        <EducatorPage />
        <Toast />
      </>
    );
  }

  if (userRole === 'parent') {
    return (
      <>
        <ParticleCanvas />
        <ParentPage />
        <Toast />
      </>
    );
  }

  // Default: student
  return (
    <>
      <ParticleCanvas />
      <AppShell />
      <Toast />
      <OnboardingTour />
      <LevelUpOverlay open={levelUp !== null} level={levelUp ?? 1} onClose={() => setLevelUp(null)} />
    </>
  );
}
