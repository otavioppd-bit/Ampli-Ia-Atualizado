import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useStoreStore } from '../../stores/storeStore';
import { getStoreItem } from '../../shared/lib/storeCatalog';

const FOCUS_MIN = 25;
const CYCLE_XP = 5;

const SAGUI_FOCUS = '/assets/sagui%20estudando%20com%20o%20caderno%20e%20um%20lapis_2.png';
const SAGUI_REST = '/workspaces/Ampli-IA/ChatGPT Image 10 de ago. de 2026, 16_03_53.png';
const SAGUI_FOCUS_FALLBACK = '/assets/sagui_estudando_2.png';
const SAGUI_REST_FALLBACK = '/assets/sagui_meditando_2.png';

type Phase = 'idle' | 'focus' | 'rest';

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function FocusCompanion() {
  const { addXP, addLog, setToast } = useAppStore();
  const inventory = useStoreStore(s => s.inventory);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(FOCUS_MIN * 60);
  const [showRestAlert, setShowRestAlert] = useState(false);
  const [imgErrored, setImgErrored] = useState<Record<string, boolean> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reseta o flag de erro a cada troca de fase, garantindo a re-tentativa do asset oficial
  useEffect(() => {
    setImgErrored(null);
  }, [phase]);

  const handleImgError = (key: 'focus' | 'rest') => {
    setImgErrored(prev => ({ ...(prev ?? {}), [key]: true }));
  };

  const sprite = phase === 'focus' ? SAGUI_FOCUS : SAGUI_REST;
  const spriteAlt = phase === 'focus' ? SAGUI_FOCUS_FALLBACK : SAGUI_REST_FALLBACK;
  const resolvedSprite = imgErrored?.[phase] ? spriteAlt : sprite;

  // Item equipado na Loja -> acessório exibido junto ao Sagui
  const equippedId = Object.entries(inventory).find(([, v]) => v.purchased && v.equipped)?.[0] ?? null;
  const equippedItem = equippedId ? getStoreItem(equippedId) : null;

  // Timer (1s)
  useEffect(() => {
    if (phase !== 'focus') return;
    timerRef.current = setInterval(() => {
      setSeconds(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  // Ciclo chega a zero
  useEffect(() => {
    if (phase === 'focus' && seconds === 0) {
      clearInterval(timerRef.current!);
      timerRef.current = null;
      setPhase('rest');
      setShowRestAlert(true);
      addXP(CYCLE_XP);
      addLog({ timestamp: Date.now(), type: 'foco', description: `Ciclo de foco completo na Companhia (${FOCUS_MIN}min)`, xp: CYCLE_XP });
      setToast(`+${CYCLE_XP} XP — ciclo completo! 🎉`, 'success');
    }
  }, [phase, seconds, addXP, addLog, setToast]);

  function startFocus() {
    setShowRestAlert(false);
    setSeconds(FOCUS_MIN * 60);
    setPhase('focus');
  }

  function stopFocus(rest: boolean) {
    clearInterval(timerRef.current!);
    timerRef.current = null;
    setShowRestAlert(rest);
    setPhase('rest');
    if (rest) setToast('Hora de descansar a mente e recuperar as energias 🧘', 'info');
  }

  const progresso = phase === 'idle' ? 0 : ((FOCUS_MIN * 60 - seconds) / (FOCUS_MIN * 60)) * 100;

  return (
    <div className="fixed z-[80] right-3 md:right-6 bottom-36 md:bottom-8 w-[calc(100vw-1.5rem)] max-w-[300px]">
      {!open ? (
        /* FAB colapsado */
        <button
          onClick={() => setOpen(true)}
          className="ml-auto flex items-center gap-2.5 glass rounded-2xl border border-emerald-500/15 hover:border-emerald-500/30 px-3 py-2.5 transition-all group"
          aria-label="Abrir Companhia de Foco"
        >
          <span className="relative shrink-0">
            <img
              src={phase === 'focus' ? resolvedSprite : SAGUI_REST}
              alt="Sagui companheiro"
              draggable={false}
              onError={() => handleImgError(phase as 'focus' | 'rest')}
              className="w-10 h-10 object-contain mascot-assist-idle"
            />
            {phase === 'focus' && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0b1120]" />
            )}
          </span>
          <span className="text-left">
            <span className="block text-xs font-semibold text-white">
              {phase === 'focus' ? 'Estudando com você' : phase === 'rest' ? 'Hora de descansar' : 'Companhia de Foco'}
            </span>
            <span className="block text-[10px] text-emerald-400 tabular-nums font-medium">{formatTime(seconds)}</span>
          </span>
        </button>
      ) : (
        /* Painel expandido */
        <div className="glass rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-scale-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <span className="text-sm">⏱️</span>
              <p className="text-sm font-bold text-white">Companhia de Foco</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
              aria-label="Recolher"
            >
              ▾
            </button>
          </div>

          <div className="p-4">
            {/* Sagui + acessório equipado */}
            <div className="relative flex justify-center mt-1 mb-3">
              <img
                src={resolvedSprite}
                alt={phase === 'focus' ? 'Sagui estudando junto com você' : 'Sagui meditando para descansar'}
                draggable={false}
                onError={() => handleImgError(phase as 'focus' | 'rest')}
                className={`w-28 h-28 object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)] transition-all duration-500 ${
                  phase === 'focus' ? 'mascot-anim-typing' : 'mascot-anim-idle'
                }`}
              />
              {equippedItem && (
                <span
                  key={equippedItem.id}
                  className="absolute -top-1 right-[18%] text-2xl select-none drop-shadow-lg animate-bounce"
                  title={`Acessório equipado: ${equippedItem.name}`}
                  aria-label={`Acessório equipado: ${equippedItem.name}`}
                >
                  {equippedItem.emoji}
                </span>
              )}
              <span className={`absolute bottom-2 left-[18%] text-[9px] font-bold px-2 py-0.5 rounded-full ${
                phase === 'focus' ? 'bg-emerald-500/90 text-emerald-950' : 'bg-violet-500/20 text-violet-300 border border-violet-500/25'
              }`}>
                {phase === 'focus' ? '✍️ FOCADO' : phase === 'rest' ? '🧘 DESCANSO' : '🌙 PRONTO'}
              </span>
            </div>

            {/* Timer */}
            <div className="relative w-32 h-32 mx-auto mb-3">
              <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
                <circle
                  cx="60" cy="60" r="52" fill="none"
                  stroke={phase === 'focus' ? '#10b981' : phase === 'rest' ? '#f59e0b' : '#475569'}
                  strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${(progresso / 100) * 326.7} 326.7`}
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-extrabold tabular-nums text-white tracking-tight">{formatTime(seconds)}</span>
                <span className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider">
                  {phase === 'idle' && 'Pronto'}
                  {phase === 'focus' && 'Foco'}
                  {phase === 'rest' && 'Descanso'}
                </span>
              </div>
            </div>

            {/* Status e alerta amigável */}
            {phase === 'focus' ? (
              <p className="text-center text-xs text-emerald-300/90 bg-emerald-500/10 border border-emerald-500/15 rounded-xl px-3 py-2.5 mb-3">
                📚 O Sagui está estudando junto com você. Continue firme!
              </p>
            ) : showRestAlert ? (
              <p className="text-center text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/15 rounded-xl px-3 py-2.5 mb-3 animate-fade-up">
                🧘 Ciclo concluído! Hora de descansar a mente e recuperar as energias. Aproveite 5 minutinhos longe da tela.
              </p>
            ) : null}

            {/* Controles */}
            <div className="flex items-center justify-center gap-2.5">
              {phase === 'focus' ? (
                <button onClick={() => stopFocus(true)} className="btn-secondary !px-4 !py-2.5 text-sm flex-1">
                  ⏸ Terminar Ciclo
                </button>
              ) : (
                <button onClick={startFocus} className="btn-primary flex-1 !py-2.5 text-sm">
                  ▶ Iniciar Foco ({FOCUS_MIN} min)
                </button>
              )}
            </div>

            {phase === 'rest' && (
              <button
                onClick={() => { setShowRestAlert(false); startFocus(); }}
                className="w-full mt-2 text-xs text-gray-500 hover:text-amber-300 transition-colors"
              >
                Sentiram falta do companheiro? Voltar a estudar →
              </button>
            )}

            <p className="text-center text-[10px] text-gray-600 mt-3">
              +{CYCLE_XP} XP por ciclo completo · Tutor IA recomenda pausas breves para fixar o conteúdo.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}