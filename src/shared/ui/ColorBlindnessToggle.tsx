import { useState, useEffect, useCallback } from 'react';

type ColorBlindnessType = 'normal' | 'protanopia' | 'protanomaly' | 'deuteranopia' | 'deuteranomaly' | 'tritanopia' | 'tritanomaly' | 'achromatopsia' | 'achromatomaly';

interface GroupOption {
  type: ColorBlindnessType;
  label: string;
  group: string;
}

const OPTIONS: GroupOption[] = [
  { type: 'normal', label: 'Sem filtro', group: '' },
  { type: 'protanopia', label: 'Protanopia (ausência de vermelho)', group: 'Vermelho-Verde' },
  { type: 'protanomaly', label: 'Protanomalia (dificuldade com vermelho)', group: 'Vermelho-Verde' },
  { type: 'deuteranopia', label: 'Deuteranopia (ausência de verde)', group: 'Vermelho-Verde' },
  { type: 'deuteranomaly', label: 'Deuteranomalia (dificuldade com verde)', group: 'Vermelho-Verde' },
  { type: 'tritanopia', label: 'Tritanopia (ausência de azul)', group: 'Azul-Amarelo' },
  { type: 'tritanomaly', label: 'Tritanomalia (dificuldade com azul)', group: 'Azul-Amarelo' },
  { type: 'achromatopsia', label: 'Acromatopsia (monocromático total)', group: 'Completo' },
  { type: 'achromatomaly', label: 'Acromatomalia (monocromático parcial)', group: 'Completo' },
];

/*
 * Unica preferencia que fica em localStorage de proposito.
 *
 * O filtro de daltonismo precisa valer JA na tela de login, antes de haver
 * sessao para consultar. E uma configuracao de acessibilidade do
 * dispositivo, sem dado pessoal, entao guardar local e o comportamento
 * certo: quem usa o computador da escola nao herda o ajuste da conta.
 */
const STORAGE_KEY = 'mm_color_blindness';

function getInitialType(): ColorBlindnessType {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && OPTIONS.some(o => o.type === saved)) return saved as ColorBlindnessType;
  } catch { /* ignore */ }
  return 'normal';
}

const GROUP_ORDER = ['', 'Vermelho-Verde', 'Azul-Amarelo', 'Completo'];

export function ColorBlindnessToggle() {
  const [isOpen, setIsOpen] = useState(false);
  const [current, setCurrent] = useState<ColorBlindnessType>(getInitialType);

  const applyFilter = useCallback((type: ColorBlindnessType) => {
    if (type === 'normal') {
      document.documentElement.style.filter = '';
    } else {
      document.documentElement.style.filter = `url(#cb-${type})`;
    }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, current); } catch { /* ignore */ }
    applyFilter(current);
  }, [current, applyFilter]);

  function handleSelect(type: ColorBlindnessType) {
    setCurrent(type);
    setIsOpen(false);
  }

  return (
    <div className="fixed top-4 right-4 z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`glass-light rounded-xl px-3 py-2 text-xs border transition-all flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] ${
          current !== 'normal'
            ? 'border-amber-500/30 text-amber-400 hover:border-amber-500/50'
            : 'border-white/5 text-gray-500 hover:text-gray-300 hover:border-white/10'
        }`}
        title="Acessibilidade para daltonismo"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
          <line x1="4.93" y1="4.93" x2="9.17" y2="9.17" />
          <line x1="14.83" y1="14.83" x2="19.07" y2="19.07" />
          <line x1="4.93" y1="19.07" x2="9.17" y2="14.83" />
          <line x1="14.83" y1="9.17" x2="19.07" y2="4.93" />
        </svg>
        <span className="hidden sm:inline">Daltonismo</span>
        {current !== 'normal' && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 glass rounded-2xl p-1.5 min-w-[260px] border border-white/5 shadow-xl animate-fade-up overflow-hidden">
            {GROUP_ORDER.map(group => {
              const items = group === '' ? OPTIONS.filter(o => o.group === '') : OPTIONS.filter(o => o.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group || 'normal'}>
                  {group && (
                    <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-gray-600 font-semibold">
                      {group}
                    </div>
                  )}
                  {items.map(({ type, label }) => (
                    <button
                      key={type}
                      onClick={() => handleSelect(type)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-3 ${
                        current === type
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                        current === type
                          ? 'border-amber-400 bg-amber-400/20'
                          : 'border-gray-600'
                      }`}>
                        {current === type && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        )}
                      </span>
                      {label}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
