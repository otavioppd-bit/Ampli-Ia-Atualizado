import { useEffect, useRef } from 'react';
import { Mascot } from './Mascot';
import { mascotStore } from '../../stores/mascotStore';

const FAB_TIPS = [
  '💡 Tente encher a barra de XP com um quiz rápido!',
  '🔥 Mantenha seu streak acessando todos os dias.',
  '📝 A redação vale até 1000 pontos — não pule!',
  '🧠 Um plano de estudo focado rende mais que horas soltas.',
  '⚡ Modo Foco te ajuda a render melhor no Pomodoro.',
  '💚 Está cansado? Priorize descanso e retome amanhã.',
  '🎯 Nada acertou? Entenda o porquê de cada erro e evolua!',
];

/**
 * Mascote flutuante (canto da tela).
 * Espelha a máquina de estados global (idle/typing/loading/success/error)
 * alimentada pelo app — ex.: Quiz, level up, streak. O clique dá dicas
 * com um balão transitório via `say()`.
 */
export function MascotFab() {
  const indexRef = useRef(Math.floor(Math.random() * FAB_TIPS.length));

  useEffect(() => {
    const t = setTimeout(() => {
      mascotStore.getState().say(FAB_TIPS[indexRef.current], 5000);
    }, 1400);
    return () => clearTimeout(t);
  }, []);

  const handleClick = () => {
    indexRef.current = (indexRef.current + 1) % FAB_TIPS.length;
    mascotStore.getState().say(FAB_TIPS[indexRef.current], 4500);
  };

  return (
    <div
      className="fixed z-[80] bottom-28 md:bottom-16 md:right-8 right-3 cursor-pointer"
      onClick={handleClick}
      role="button"
      aria-label="Mascote — dicas e reações"
    >
      <Mascot size={84} variant="floating" />
    </div>
  );
}