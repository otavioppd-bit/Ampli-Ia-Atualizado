import { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { GlassCard } from '../../shared/ui/GlassCard';
import { correctEssay } from '../../shared/lib/essayCorrector';
import { playCorrect, playError } from '../../shared/lib/sfx';

export function EssayPage() {
  const [text, setText] = useState('');
  const [isCorrecting, setIsCorrecting] = useState(false);
  const { lastCorrection, setLastCorrection, addXP, addLog, isMuted } = useAppStore();

  function handleCorrect() {
    if (text.trim().length < 50) return;
    setIsCorrecting(true);
    setTimeout(() => {
      const correction = correctEssay(text);
      setLastCorrection(correction);
      setIsCorrecting(false);
      const xpGain = correction.notaFinal >= 600 ? 100 : 50;
      addXP(xpGain);
      addLog({ timestamp: Date.now(), type: 'essay', description: `Redação corrigida: ${correction.notaFinal}/1000`, xp: xpGain });
      if (!isMuted) {
        if (correction.notaFinal >= 600) playCorrect(); else playError();
      }
    }, 800);
  }

  function getNotaColor(nota: number): string {
    if (nota >= 700) return '#10b981';
    if (nota >= 400) return '#f59e0b';
    return '#ef4444';
  }

  const competencias = [
    { key: 'competencia1' as const, label: 'C1 — Norma Culta' },
    { key: 'competencia2' as const, label: 'C2 — Compreensão do Tema' },
    { key: 'competencia3' as const, label: 'C3 — Argumentação' },
    { key: 'competencia4' as const, label: 'C4 — Coesão' },
    { key: 'competencia5' as const, label: 'C5 — Proposta de Intervenção' },
  ];

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-white">Redação 1000</h1>
        <p className="text-sm text-gray-500 mt-0.5">Treine sua redação ENEM com correção automática.</p>
      </div>

      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-300">Sua Redação</h2>
          {wordCount > 0 && (
            <span className={`badge ${wordCount >= 150 ? 'badge-emerald' : 'badge-red'}`}>
              {wordCount} palavras
            </span>
          )}
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Digite sua redação aqui..."
          rows={8}
          className="w-full bg-transparent resize-none text-sm text-white leading-relaxed placeholder-gray-600 focus:outline-none md:rows-12"
        />
        <div className="flex justify-end mt-4">
          <button onClick={handleCorrect} disabled={text.trim().length < 50 || isCorrecting} className="btn-primary">
            {isCorrecting ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" /> Corrigindo...</>
            ) : 'Corrigir Redação'}
          </button>
        </div>
      </GlassCard>

      {lastCorrection && (
        <GlassCard>
          <h2 className="text-sm font-semibold text-gray-300 mb-5">Resultado da Correção</h2>

          <div className="flex flex-col items-center mb-8">
            <div className="relative w-36 h-36 mb-3">
              <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
                <circle
                  cx="60" cy="60" r="52" fill="none"
                  stroke={getNotaColor(lastCorrection.notaFinal)}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${(lastCorrection.notaFinal / 1000) * 326.7} 326.7`}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-extrabold tabular-nums" style={{ color: getNotaColor(lastCorrection.notaFinal) }}>
                  {lastCorrection.notaFinal}
                </span>
                <span className="text-xs text-gray-500">/ 1000</span>
              </div>
            </div>
            <span className={`badge ${
              lastCorrection.notaFinal >= 700 ? 'badge-emerald' :
              lastCorrection.notaFinal >= 400 ? 'badge-amber' :
              'badge-red'
            }`}>
              {lastCorrection.notaFinal >= 700 ? 'Excelente' : lastCorrection.notaFinal >= 400 ? 'Bom' : 'Continue praticando'}
            </span>
          </div>

          <div className="space-y-3 mb-6">
            {competencias.map(c => {
              const val = lastCorrection[c.key];
              return (
                <div key={c.key}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-gray-400">{c.label}</span>
                    <span className="text-white font-medium tabular-nums">{val}/200</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full xp-bar"
                      style={{
                        width: `${(val / 200) * 100}%`,
                        backgroundColor: getNotaColor(val * 5),
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {lastCorrection.pontosFortes.length > 0 && (
              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                <h3 className="text-xs font-semibold text-emerald-400 mb-3 uppercase tracking-wider">Pontos Fortes</h3>
                <ul className="space-y-1.5">
                  {lastCorrection.pontosFortes.map((p, i) => (
                    <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                      <span className="text-emerald-500 mt-0.5">•</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {lastCorrection.pontosMelhorar.length > 0 && (
              <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                <h3 className="text-xs font-semibold text-amber-400 mb-3 uppercase tracking-wider">A Melhorar</h3>
                <ul className="space-y-1.5">
                  {lastCorrection.pontosMelhorar.map((p, i) => (
                    <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5">•</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
