# 🌙 Midnight Mentor - Mentor ENEM

Plataforma inteligente de estudos para o ENEM com IA, gamificação, análise emocional,
ligas colaborativas e dashboards multi-perfil (aluno, educacional, pais).

 - 

## Tech Stack

| Camada       | Tecnologia                                         |
| ------------ | -------------------------------------------------- |
| **Frontend** | React 19, TypeScript 6, Vite 8, Tailwind CSS 3     |
| **Estado**   | Zustand 5 (persistência local + sincronização remota) |
| **IA**       | Google Gemini 2.0 Flash (API key do usuário)       |
| **Diagramas**| Mermaid 11 (`mindmap`, `graph TD`)                 |
| **CSV**      | PapaParse 5 (worker + chunking para arquivos grandes) |
| **Backend**  | Supabase (auth + banco relacional - opcional)      |
| **Testes**   | Vitest 4                                           |
| **Lint**     | Oxlint                                             |

 - 

## Funcionalidades

### 👨‍🎓 Aluno
- **Central de Comando** - Dashboard com plano do dia, SSC (sono/cansaço/humor), streak, progresso XP
- **Mentor IA** - Chat com 5 modos temáticos (ENEM Geral, Exatas, Natureza, Humanas, Vestibulares), busca em provas oficiais com badge de fonte consultada, método socrático e densidade adaptada ao horário
- **Redação por foto** - Fotografe a folha do caderno: OCR da letra manuscrita + correção pelas 5 competências, com imagem e transcrição lado a lado
- **Quiz Adaptativo** - Questões geradas por IA por matéria/tópico, flashcards do Caderno
- **Redação** - Corretor offline com 5 competências ENEM (0–1000)
- **Ligas de Estudo** - Salas colaborativas com chat WhatsApp, desafios diários, metas e ranking
- **Caderno de Estudos** - Anotações com Notebook AI Studio (resumo, mapa mental Mermaid, flashcards, gaps)
- **Ranking** - Por turma, escola ou geral com gamificação (XP, nível, streak)
- **Modo Foco** - Timer Pomodoro com integração emocional
- **Escudo de Dopamina** - Modo ENEM: o app conta o tempo de tela bloqueada e converte em moedas de foco (faixas por duração, penalidade por interrupção, teto diário)
- **Pílulas de Áudio** - Micro-podcasts de 3 min gerados por IA + TTS, para estudar de fone no transporte com a tela apagada
- **Calendário Adaptativo** - Revisão espaçada (Ebbinghaus/SM-2): a nota do quiz define o dia exato da próxima revisão, sem montar cronograma
- **Índice de Fadiga** - Modelo de classificação sobre a telemetria silenciosa (erro, tempo em questão fácil, madrugada, sono); em fadiga, o app encolhe o conteúdo denso
- **Intervenção de Doomscrolling** - Rolagem sem decidir por 2 min congela a interface e a IA propõe uma tarefa mínima
- **Rede de Apoio** - Consultas com psicólogo, aprovação de acompanhamento pelos pais e avisos
- **Relatório de Descompressão** - Toda sexta, um parágrafo de validação sobre sono, tempo offline e constância - não sobre acertos

### 🏫 Educacional
- Painel exclusivo com upload de CSV (alunos)
- Suporte a arquivos grandes com PapaParse (worker + chunking)
- Preview dos dados antes do envio
- Webhook N8N para criação automática de contas
- Colunas esperadas: `Nome do Aluno`, `Sala`, `Email do Responsável`, `Telefone do Responsável`

### 👪 Pais / Responsáveis
- Dashboard de acompanhamento pedagógico
- Cards de desempenho e alertas
- **Curva de estresse** do estudante (índice diário de fadiga, 30 dias)
- **Alertas de saúde mental** disparados pelo modelo, com ação direta no próprio card
- **Marketplace de psicólogos** - catálogo com CRP e valor visível, agenda, pagamento e criação automática da sala de videochamada
- **Vínculo aprovado pelo estudante**: enquanto ele não aceita, o painel não mostra nada. E nunca mostra conversas, anotações ou registros de humor - só padrão de estudo

### 🧑‍⚕️ Psicólogos
- Painel próprio ao entrar: agenda com link da sala + janelas semanais de disponibilidade
- Papel `psychologist` (criado por `registrar_psicologo()` no banco, após conferência do CRP)
- Ficha pública com especialidades, abordagem e valor
- Janelas semanais de disponibilidade; os horários concretos são derivados delas
- Agenda com link da sala, sem sobreposição (garantida por constraint no banco)

 - 

## Arquitetura

```
src/
├── app/
│   └── AppShell.tsx            # Shell com sidebar + bottom nav mobile
├── features/
│   ├── atmo/                   # Partículas animadas de fundo
│   ├── auth/                   # Login multi-perfil (aluno/educador/pais)
│   ├── chat/                   # Mentor IA com personas
│   ├── comunidade/             # Mural comunitário + Ligas de estudo
│   ├── dashboard/              # Central de comando
│   ├── educator/               # Painel educacional (CSV upload)
│   ├── essay/                  # Corretor de redação
│   ├── foco/                   # Modo foco Pomodoro
│   ├── notebook/               # Caderno de estudos
│   ├── overlays/               # Modais (Crise, Relatório Semanal, AI Studio)
│   ├── parent/                 # Painel dos pais
│   ├── profile/                # Perfil do usuário
│   ├── quiz/                   # Quiz adaptativo IA
│   └── ranking/                # Ranking gamificado
├── shared/
│   ├── hooks/                  # Custom hooks
│   ├── lib/                    # Engines (SSC, emoção, KB, planner, etc.)
│   ├── storage/                # Repositories (localStorage + Supabase)
│   ├── ui/                     # Componentes reutilizáveis (Modal, Toast, GlassCard)
│   └── types.ts                # Tipos compartilhados
├── stores/
│   └── appStore.ts             # Zustand store global
└── styles/
    └── index.css               # Tailwind + estilos globais
```

### Roteamento

Sem React Router. A navegação é feita por estado Zustand (`activeTab` + `userRole`):

- `App.tsx` renderiza `AppShell` (aluno), `EducatorPage` ou `ParentPage` conforme `userRole`
- `AppShell` renderiza a página ativa via `switch (activeTab)`
- Tabs fixas na sidebar (desktop) e bottom nav (mobile)

 - 

## Getting Started

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

| Variável                  | Obrigatória | Descrição                                |
| ------------------------- | ----------- | ---------------------------------------- |
| `VITE_SUPABASE_URL`       | Não         | URL do projeto Supabase                  |
| `VITE_SUPABASE_ANON_KEY`  | Não         | Chave anônima do Supabase                |
| `VITE_N8N_WEBHOOK_URL`    | Não         | Webhook para criação de contas (professor) |

Sem Supabase o app funciona em **modo offline** com localStorage.
Sem webhook o envio de CSV é simulado.

### 3. Iniciar dev server

```bash
npm run dev
# → http://localhost:5173/
```

### 4. Build produção

```bash
npm run build
npm run preview
```

 - 

## Scripts

| Comando              | Ação                             |
| -------------------- | -------------------------------- |
| `npm run dev`        | Inicia servidor de desenvolvimento |
| `npm run build`      | Compila TS + Vite para produção   |
| `npm run preview`    | Serve o build localmente          |
| `npm run lint`       | Verifica código com Oxlint        |
| `npm test`           | Roda testes unitários (Vitest)    |
| `npm run test:watch` | Roda testes em modo watch         |

 - 

## Gamificação

- **XP** por atividades: quiz (+30/acerto), mensagens (+5), ligas (+35–40), redação, foco
- **Níveis** a cada 100 × level XP
- **Streak** por acesso diário consecutivo
- **SSC Score** (0–100) - Sono, Stress, Cansaço - calculado com base em inputs + emoção detectada

 - 

## Liga de Estudos

- Cada liga tem: disciplina, metas, desafio diário, chat em tempo real, XP
- Limite de 2 ligas por usuário
- Sala da liga com chat estilo WhatsApp:
  - Bolhas próprias à direita (verde)
  - Bolhas de outros à esquerda (cinza, com nome)
  - Notificações de entrada centralizadas
  - Auto-scroll para mensagens novas

 - 

## Quiz Adaptativo

- Geração exclusiva por **Gemini API** (sem banco local de questões)
- 10 matérias × 10 tópicos cada
- Flashcards vindos do Notebook AI Studio
- Histórico de desempenho por matéria

 - 

## API de IA

O app usa **Google Gemini 2.0 Flash** (camada gratuita).

### Modo 1 - Proxy serverless grátis (recomendado: sem chave para o usuário)

A chave fica no **seu** servidor, protegida. O estudante não precisa digitar nada.

1. Crie uma chave **grátis**: https://aistudio.google.com/apikey
2. Deploy do proxy em `server/worker.js` (Cloudflare Workers):
   ```bash
   npx wrangler login
   npx wrangler deploy server/worker.js --name midnight-mentor-ia
   npx wrangler secret put GEMINI_API_KEY   # cole sua chave grátis
   npx wrangler secret put API_TOKEN        # opcional: senha anti-abuso
   ```
3. Configure no `.env`:
   ```
   VITE_AI_BASE_URL=https://seu-worker.workers.dev
   VITE_AI_PROXY_TOKEN=seu-token            # mesmo valor do API_TOKEN
   ```
4. Build + deploy normal. Pronto: **todos** os alunos usam a IA na sua cota grátis.

### Modo 2 - Chave do próprio usuário

Sem `VITE_AI_BASE_URL`, cada aluno cola a própria chave grátis no **Perfil**.

- Sem nenhuma das opções, o app funciona **offline** (fallback local em chat/quiz/redação).

Usos:
- Geração de questões de quiz
- Resumo e mapa mental (Notebook AI Studio)
- Chat com persona do Mentor
- Análise de gaps de aprendizado

 - 

## Módulo de bem-estar (marketplace, foco offline, fadiga)

As 7 funcionalidades novas dependem de duas migrações, rodadas **nesta
ordem** no SQL Editor do Supabase:

```
supabase/migrations/010_bemestar_marketplace_foco.sql   # tabelas
supabase/migrations/011_bemestar_funcoes_rls.sql        # funções, RLS, seeds
supabase/migrations/012_persona_ativa_texto.sql         # persona ativa em texto
supabase/migrations/013_redacao_por_foto.sql            # bucket essay_scans + colunas da foto
```

Para cadastrar um profissional (a conta precisa existir no app antes):

```sql
select public.registrar_psicologo(
  'psicologa@exemplo.com', 'CRP 06/123456',
  'Atende adolescentes, foco em ansiedade de desempenho.',
  array['ansiedade','vestibular'], 120
);
```

Sem `MP_ACCESS_TOKEN` no worker, o pagamento entra em **modo
demonstração**: a consulta é confirmada na hora e a sala é criada, sem
cobrança. Confira em `GET /health` antes de publicar — em produção, essa
chave vazia é consulta de graça.

As migrações são verificadas automaticamente: `npm test` executa
`supabase/__tests__/migracoes.test.mjs`, que aplica os 9 arquivos SQL num
Postgres real (PGlite/WASM), cria usuários e confere RLS, constraints e
as fórmulas duplicadas entre banco e cliente. O worker tem o mesmo
tratamento em `server/__tests__/worker.test.mjs`.

Detalhes de arquitetura e das decisões: [`docs/modulo-bem-estar.md`](docs/modulo-bem-estar.md)
e [`docs/chat-tematico-e-redacao-por-foto.md`](docs/chat-tematico-e-redacao-por-foto.md).
App nativo do Escudo de Dopamina: [`mobile/react-native/`](mobile/react-native/README.md).

 - 

## Deploy

Build estático (Vite). Compatível com:

- Vercel, Netlify, Cloudflare Pages, GitHub Pages
- Serve a pasta `dist/` como conteúdo estático

```bash
npm run build
# dist/ → deploy
```

 - 

## Licença

Projeto educacional de código aberto.
