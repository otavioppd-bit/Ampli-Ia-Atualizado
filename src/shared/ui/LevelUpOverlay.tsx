import { useEffect, useMemo, useRef } from 'react';

const CONFETTI_COLORS = ['#fbbf24', '#f59e0b', '#a78bfa', '#34d399', '#f472b6', '#60a5fa', '#38bdf8'];

interface Confetti { left: number; mx: number; my: number; rot: number; color: string; delay: number; }

function makeConfetti(n: number): Confetti[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const dist = 50 + Math.random() * 110;
    return {
      left: 15 + Math.random() * 70,
      mx: Math.cos(angle) * dist,
      my: Math.sin(angle) * dist + 30,
      rot: (Math.random() * 2 - 1) * 360,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 0.4,
    };
  });
}

interface LevelUpOverlayProps {
  open: boolean;
  level: number;
  onClose: () => void;
}

export function LevelUpOverlay({ open, level, onClose }: LevelUpOverlayProps) {
  const confetti = useMemo(() => (open ? makeConfetti(30) : []), [open]);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(onClose, 3200);
    }
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="levelup-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Parabéns! Level Up"
    >
      {confetti.map((c, i) => (
        <span
          key={i}
          className="levelup-confetti"
          style={{
            top: '42%',
            left: `${c.left}%`,
            background: c.color,
            animationDelay: `${c.delay}s`,
            ['--mx' as never]: `${c.mx}px`,
            ['--my' as never]: `${c.my}px`,
            ['--rot' as never]: `${c.rot}deg`,
          }}
        />
      ))}

      <div className="levelup-inner" onClick={(e) => e.stopPropagation()}>
        <div className="levelup-badge">NÍVEL {level}</div>

        <div className="levelup-mascot">
          <div className="levelup-glow" />
          <img
            src="/assets/sagui_pulando_2.png"
            alt="Sagui pulando de alegria"
            draggable={false}
          />
        </div>

        <h2 className="levelup-title">Parabéns! Level Up! 🎉</h2>
        <p className="levelup-sub">Seu foco te levou mais alto! Continue assim.</p>

        <button onClick={onClose} className="btn-primary levelup-btn">
          Continuar 🚀
        </button>
      </div>
    </div>
  );
}