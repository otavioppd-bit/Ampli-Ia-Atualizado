import { useState, useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import { Modal } from '../../shared/ui/Modal';
import { GlassCard } from '../../shared/ui/GlassCard';

type StudioTool = 'resumo' | 'mapa' | 'flashcards' | 'gaps';

export function NotebookStudioModal() {
  const { showNotebookStudio, setShowNotebookStudio, notas } = useAppStore();
  const [activeTool, setActiveTool] = useState<StudioTool>('resumo');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  const notasList = useMemo(() => notas, [notas]);

  function simulateLoad(fn: () => string) {
    setLoading(true); setResult('');
    setTimeout(() => { setResult(fn()); setLoading(false); }, 500);
  }

  function generateResumo(): string {
    if (notasList.length === 0) return 'Nenhuma nota salva ainda. Adicione notas ao Caderno para usar esta ferramenta.';
    const wordFreq: Record<string, number> = {};
    for (const nota of notasList) {
      for (const w of [...new Set(nota.text.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4))]) {
        wordFreq[w] = (wordFreq[w] || 0) + 1;
      }
    }
    const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);
    const recent = notasList.slice(-5).reverse();
    let out = '📋 **Resumo Executivo**\n\n**Palavras-chave:**\n' + topWords.map(w => `• ${w}`).join('\n') + '\n\n**Notas Recentes:**\n';
    return out + recent.map((n: any) => `• *${new Date(n.data).toLocaleDateString()}*: ${n.text.slice(0, 100)}${n.text.length > 100 ? '...' : ''}`).join('\n');
  }

  function generateMapa(): string {
    if (notasList.length === 0) return 'Nenhuma nota salva ainda.';
    const wordFreq: Record<string, number> = {};
    for (const nota of notasList) {
      for (const w of [...new Set(nota.text.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4))]) {
        wordFreq[w] = (wordFreq[w] || 0) + 1;
      }
    }
    const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);
    let mermaid = 'graph TD\n  A["📚 Meus Estudos"]\n';
    topWords.forEach((w, i) => { mermaid += `  N${i}["${w.charAt(0).toUpperCase() + w.slice(1)}"]\n  A --> N${i}\n`; });
    return '```mermaid\n' + mermaid + '\n```\n\n🧠 Mapa mental com ' + topWords.length + ' conexões geradas.';
  }

  function generateFlashcards(): string {
    const withContent = notasList.filter((n: any) => n.text.split(/\s+/).length > 3);
    if (withContent.length < 2) return 'Precisa de pelo menos 2 notas com conteúdo para gerar flashcards.';
    const selected = [...withContent].sort(() => Math.random() - 0.5).slice(0, 3);
    const questions: QuizQuestion[] = selected.map((nota: any, idx: number) => {
      const words = nota.text.split(/\s+/).filter((w: string) => w.length > 4);
      const keyword = words[Math.floor(Math.random() * words.length)] || 'conceito';
      const correct = keyword.charAt(0).toUpperCase() + keyword.slice(1);
      const distractors = withContent.filter((n: any) => n.id !== nota.id).flatMap((n: any) => n.text.split(/\s+/).filter((w: string) => w.length > 4 && w !== keyword)).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).slice(0, 3).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1));
      while (distractors.length < 3) distractors.push(`Opção ${distractors.length + 2}`);
      const alternatives = [correct, ...distractors].sort(() => Math.random() - 0.5);
      return { id: `flash_${Date.now()}_${idx}`, materia: 'Flashcards', enunciado: `Complete a lacuna: "A palavra ________ aparece na nota sobre..."`, alternativas: alternatives, correta: alternatives.indexOf(correct), explicacao: `Palavra-chave: "${correct}", extraída das suas anotações.` };
    });
    (window as any).__flashcardQuiz = questions;
    return questions.map((q, i) => `**${i + 1}.** ${q.alternativas[q.correta]}\n`).join('\n') + `\n\n✅ ${questions.length} flashcards gerados! Clique em "Ir para o Quiz" para respondê-los.`;
  }

  function generateGaps(): string {
    if (notasList.length === 0) return 'Nenhuma nota salva ainda.';
    const wordFreq: Record<string, { count: number; notes: string[] }> = {};
    for (const nota of notasList) {
      for (const w of [...new Set(nota.text.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4))]) {
        if (!wordFreq[w]) wordFreq[w] = { count: 0, notes: [] };
        wordFreq[w].count++;
        wordFreq[w].notes.push(nota.text.slice(0, 60));
      }
    }
    const gaps = Object.entries(wordFreq).filter(([, v]) => v.count >= 2).sort((a, b) => b[1].count - a[1].count);
    if (gaps.length === 0) return 'Nenhum gap identificado. Continue adicionando anotações!';
    let out = '🔍 **Análise de Gaps**\n\nPalavras recorrentes em múltiplas notas:\n\n';
    for (const [word, info] of gaps.slice(0, 6)) {
      out += `**${word}** (${info.count}x)\n`;
      for (const note of info.notes.slice(0, 2)) out += `  > "${note}..."\n`;
      out += '\n';
    }
    return out + '\n📖 Revise esses tópicos com prioridade.';
  }

  const tools: { id: StudioTool; label: string; icon: string }[] = [
    { id: 'resumo', label: 'Resumo', icon: '📋' },
    { id: 'mapa', label: 'Mapa Mental', icon: '🧠' },
    { id: 'flashcards', label: 'Flashcards', icon: '🃏' },
    { id: 'gaps', label: 'Análise de Gaps', icon: '🔍' },
  ];

  const actions: Record<StudioTool, () => string> = { resumo: generateResumo, mapa: generateMapa, flashcards: generateFlashcards, gaps: generateGaps };

  return (
    <Modal open={showNotebookStudio} onClose={() => setShowNotebookStudio(false)} title="🧠 Notebook AI Studio" fullScreen>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tools.map(t => (
          <button key={t.id} onClick={() => { setActiveTool(t.id); simulateLoad(actions[t.id]); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
              activeTool === t.id ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'glass-hover text-gray-400 border border-white/5'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <GlassCard className="mt-5">
        {notasList.length === 0 && !result && !loading && (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-2xl mx-auto mb-3">📝</div>
            <p className="text-gray-400">Nenhuma nota salva.</p>
            <p className="text-sm text-gray-500 mt-1">Adicione notas ao Caderno primeiro.</p>
          </div>
        )}
        {loading && (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400">Processando suas notas...</p>
          </div>
        )}
        {result && !loading && (
          <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed space-y-4">
            {result}
            {(window as any).__flashcardQuiz && (
              <button onClick={() => { setShowNotebookStudio(false); useAppStore.getState().setActiveTab('quiz'); }} className="btn-primary">
                🎯 Ir para o Quiz
              </button>
            )}
          </div>
        )}
        {!loading && !result && notasList.length > 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">Selecione uma ferramenta acima.</p>
          </div>
        )}
      </GlassCard>
    </Modal>
  );
}
