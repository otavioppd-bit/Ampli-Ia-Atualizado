import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { Nota } from '../../shared/types';
import { playClick } from '../../shared/lib/sfx';
import { supabaseRepository } from '../../shared/storage/SupabaseRepository';

export function NotebookPage() {
  const { notas, setNotas, addNota, setShowNotebookStudio } = useAppStore();
  const [newText, setNewText] = useState('');
  const [newTag, setNewTag] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('mm_notas');
    if (saved) { try { setNotas(JSON.parse(saved)); } catch { /* */ } }
  }, []);

  function persist(updated: Nota[]) { localStorage.setItem('mm_notas', JSON.stringify(updated)); }

  function handleAdd() {
    if (!newText.trim()) return;
    playClick();
    const nota: Nota = { id: `nota_${Date.now()}`, text: newText.trim(), data: new Date().toISOString(), tag: newTag.trim() || undefined };
    addNota(nota);
    persist([nota, ...notas]);
    setNewText(''); setNewTag('');
  }

  function handleDelete(id: string) {
    const updated = notas.filter(n => n.id !== id);
    setNotas(updated); persist(updated);
    supabaseRepository.deleteNota(id).catch(() => {});
  }

  function handleEdit(id: string) { const nota = notas.find(n => n.id === id); if (nota) { setEditingId(id); setEditText(nota.text); } }

  function handleSaveEdit(id: string) {
    if (!editText.trim()) return;
    const updated = notas.map(n => n.id === id ? { ...n, text: editText.trim() } : n);
    setNotas(updated); persist(updated); setEditingId(null); setEditText('');
  }

  const tagColors: Record<string, string> = {
    chat: 'border-l-blue-500/40', erro: 'border-l-red-500/40', resumo: 'border-l-emerald-500/40',
    revisao: 'border-l-purple-500/40', redacao: 'border-l-amber-500/40',
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/15 to-amber-600/10 flex items-center justify-center text-lg">
            📓
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white">Caderno de Estudos</h1>
            <p className="text-sm text-gray-500 mt-0.5">{notas.length} anotações</p>
          </div>
        </div>
        <button onClick={() => setShowNotebookStudio(true)} className="btn-secondary text-sm px-4 py-2">
          🧠 AI Studio
        </button>
      </div>

      {/* Add note */}
      <div className="glass rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Nova Anotação</h2>
        <textarea
          value={newText}
          onChange={e => setNewText(e.target.value)}
          placeholder="Digite sua anotação..."
          rows={3}
          className="w-full resize-none text-sm mb-3"
        />
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              placeholder="Tag (opcional) — chat, erro, resumo, revisão..."
              className="w-full text-sm pr-8"
            />
            {newTag && (
              <button onClick={() => setNewTag('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs">
                ✕
              </button>
            )}
          </div>
          <button onClick={handleAdd} disabled={!newText.trim()} className="btn-primary shrink-0">
            + Adicionar
          </button>
        </div>
      </div>

      {/* Notes grid */}
      {notas.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 flex items-center justify-center text-3xl mx-auto mb-4">
            📓
          </div>
          <p className="text-gray-400 font-medium">Nenhuma nota ainda</p>
          <p className="text-sm text-gray-500 mt-1">Salve respostas do chat ou crie resumos aqui.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {notas.map(nota => {
            const borderColor = tagColors[nota.tag?.toLowerCase() || ''] || 'border-l-gray-500/30';
            return (
              <div key={nota.id} className={`glass rounded-2xl p-5 flex flex-col animate-slide-up border-l-4 ${borderColor}`}>
                {editingId === nota.id ? (
                  <div className="space-y-3">
                    <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={4} className="w-full resize-none text-sm" />
                    <div className="flex gap-2">
                      <button onClick={() => handleSaveEdit(nota.id)} className="btn-primary text-xs py-1.5">Salvar</button>
                      <button onClick={() => setEditingId(null)} className="btn-secondary text-xs py-1.5">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed flex-1">{nota.text}</p>
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.03]">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-600 tabular-nums">{new Date(nota.data).toLocaleDateString()}</span>
                        {nota.tag && <span className="badge badge-amber">{nota.tag}</span>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => handleEdit(nota.id)} className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all text-sm">
                          ✏️
                        </button>
                        <button onClick={() => handleDelete(nota.id)} className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all text-sm">
                          🗑️
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
