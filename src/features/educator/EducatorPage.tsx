import { useState, useRef } from 'react';
import { ClipboardList, LogOut, Moon, Sparkles, TriangleAlert, Users } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import Papa from 'papaparse';

const WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || '';

interface CSVRow {
  'Nome do Aluno': string;
  'Sala': string;
  'Email do Responsável': string;
  'Telefone do Responsável': string;
}

export function EducatorPage() {
  const { session, logout } = useAppStore();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<CSVRow[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setError('');
    setSent(false);
    setParsedData([]);
    if (!file.name.endsWith('.csv')) {
      setError('Formato inválido. Envie apenas arquivos .csv');
      return;
    }
    setFile(file);

    Papa.parse<CSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      worker: file.size > 512 * 1024,
      chunkSize: 1024 * 1024,
      preview: 1,
      complete(results) {
        const rows = results.data
          .filter((row: any) => row['Nome do Aluno'] && row['Nome do Aluno'].trim())
          .map((row: any) => ({
            'Nome do Aluno': String(row['Nome do Aluno'] || '').trim(),
            'Sala': String(row['Sala'] || '').trim(),
            'Email do Responsável': String(row['Email do Responsável'] || '').trim(),
            'Telefone do Responsável': String(row['Telefone do Responsável'] || '').trim(),
          }));
        if (rows.length === 0) {
          setError('Nenhum dado encontrado. Verifique se o CSV tem as colunas: Nome do Aluno, Sala, Email do Responsável, Telefone do Responsável');
          return;
        }
        setParsedData(rows);
      },
      error(err) {
        setError('Erro ao ler o arquivo: ' + err.message);
      },
    });
  }

  async function sendToWebhook() {
    if (parsedData.length === 0) return;
    setSending(true);
    setError('');
    try {
      const payload = {
        turma: parsedData[0]?.Sala || 'Não informada',
        alunos: parsedData,
        enviadoEm: new Date().toISOString(),
        remetente: session?.nome || 'Educador',
      };

      if (WEBHOOK_URL) {
        const res = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Webhook retornou ${res.status}`);
      } else {
        // Simulate when no webhook configured
        await new Promise(r => setTimeout(r, 1500));
      }
      setSent(true);
      setFile(null);
      setParsedData([]);
    } catch (e: any) {
      setError(e.message || 'Erro ao enviar para o webhook');
    }
    setSending(false);
  }

  return (
    <div className="min-h-screen" style={{ background: '#0b1120' }}>
      {/* Header */}
      <header className="glass border-b border-white/[0.03]">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <Moon size={20} className="text-gray-900" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-white">
                <span className="text-gradient">Midnight Mentor</span>
              </h1>
              <p className="text-[10px] text-gray-500 tracking-wide uppercase">Painel Educacional</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 hidden md:block">{session?.nome}</span>
            <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-medium border border-emerald-500/20"> Educacional
            </span>
            <button onClick={logout} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Sair">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-8 py-8 space-y-6 animate-fade-up">
        {/* Welcome */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/15 to-cyan-600/10 flex items-center justify-center text-lg">
            <Users size={20} className="text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Onboarding de Turmas</h2>
            <p className="text-sm text-gray-500 mt-0.5">Faça upload da lista de alunos para criar as contas automaticamente.</p>
          </div>
        </div>

        {/* Instructions */}
        <div className="glass rounded-2xl p-5 text-sm text-gray-400 space-y-1">
          <p className="text-amber-400 font-medium mb-2"><ClipboardList size={16} className="inline-block align-[-0.15em] text-gray-400" /> Formato do CSV</p>
          <p>O arquivo deve conter as colunas (nesta ordem):</p>
          <code className="block bg-black/30 rounded-lg px-3 py-2 text-xs text-gray-300 mt-2"> Nome do Aluno,Sala,Email do Responsável,Telefone do Responsável
          </code>
          <p className="text-xs text-gray-500 mt-2"> Ex: <code className="bg-white/5 px-1 rounded">João Silva,3A,joao.responsavel@email.com,(11) 99999-8888</code>
          </p>
        </div>

        {/* Upload Area */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => fileInputRef.current?.click()}
          className={`glass rounded-2xl p-8 text-center cursor-pointer transition-all border-2 border-dashed ${
            dragOver ? 'border-emerald-400/40 bg-emerald-500/5' : 'border-white/5 hover:border-white/10'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            className="hidden"
          />
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <p className="text-sm text-gray-300 font-medium">
            {file ? file.name : 'Arraste o CSV aqui ou clique para selecionar'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Formatos aceitos: .csv</p>
        </div>

        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 rounded-xl px-4 py-3 border border-red-500/10 flex items-center gap-2">
            <span><TriangleAlert size={16} className="inline-block align-[-0.15em] text-amber-400" /></span>
            <span>{error}</span>
          </div>
        )}

        {/* Preview */}
        {parsedData.length > 0 && !sent && (
          <div className="glass rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Pré-visualização</h3>
                <p className="text-xs text-gray-500">{parsedData.length} aluno{parsedData.length !== 1 ? 's' : ''} encontrado{parsedData.length !== 1 ? 's' : ''}</p>
              </div>
              <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400"> Sala: {parsedData[0]?.Sala || '-'}
              </span>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {parsedData.slice(0, 10).map((row, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-gray-400 py-1.5 px-2 rounded-lg hover:bg-white/[0.02]">
                  <span className="text-gray-600 w-5">{i + 1}.</span>
                  <span className="text-gray-200 flex-1">{row['Nome do Aluno']}</span>
                  <span className="text-gray-500 w-32 truncate">{row['Email do Responsável']}</span>
                </div>
              ))}
              {parsedData.length > 10 && (
                <p className="text-xs text-gray-600 text-center pt-1">...e mais {parsedData.length - 10} aluno{parsedData.length - 10 !== 1 ? 's' : ''}</p>
              )}
            </div>
            <button onClick={sendToWebhook} disabled={sending} className="btn-primary w-full flex items-center justify-center gap-2">
              {sending ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enviando...</>
              ) : (
                <><Sparkles size={16} /> Enviar para processamento</>
              )}
            </button>
          </div>
        )}

        {/* Success */}
        {sent && (
          <div className="glass rounded-2xl p-8 text-center animate-scale-in border border-emerald-500/20">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Contas em processamento!</h3>
            <p className="text-sm text-gray-400 mb-6">
              {parsedData.length} aluno{parsedData.length !== 1 ? 's' : ''} enviado{parsedData.length !== 1 ? 's' : ''} para a fila de criação de contas.
            </p>
            <button onClick={() => { setSent(false); setFile(null); setParsedData([]); }} className="btn-secondary"> Enviar outra turma
            </button>
          </div>
        )}

        {!WEBHOOK_URL && (
          <div className="rounded-xl bg-amber-500/5 border border-amber-500/10 p-3 text-xs text-amber-400 flex items-center gap-2">
            <TriangleAlert size={14} className="shrink-0" />
            <span>Webhook não configurado. Defina <code className="bg-black/30 px-1 rounded">VITE_N8N_WEBHOOK_URL</code> no .env para enviar os dados.</span>
          </div>
        )}
      </main>
    </div>
  );
}
