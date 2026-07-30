# 🌙 Midnight Mentor — Mentor ENEM

Plataforma inteligente de estudos para o ENEM com IA, gamificação, análise emocional,
ligas colaborativas e dashboards multi-perfil (aluno, educacional, pais).

---

## Tech Stack

| Camada       | Tecnologia                                         |
| ------------ | -------------------------------------------------- |
| **Frontend** | React 19, TypeScript 6, Vite 8, Tailwind CSS 3     |
| **Estado**   | Zustand 5 (persistência local + sincronização remota) |
| **IA**       | Google Gemini 2.0 Flash (API key do usuário)       |
| **Diagramas**| Mermaid 11 (`mindmap`, `graph TD`)                 |
| **CSV**      | PapaParse 5 (worker + chunking para arquivos grandes) |
| **Backend**  | Supabase (auth + banco relacional — opcional)      |
| **Testes**   | Vitest 4                                           |
| **Lint**     | Oxlint                                             |

---

## Funcionalidades

### 👨‍🎓 Aluno
- **Central de Comando** — Dashboard com plano do dia, SSC (sono/cansaço/humor), streak, progresso XP
- **Mentor IA** — Chat com personas customizáveis, reconhecimento emocional, busca na base ENEM
- **Quiz Adaptativo** — Questões geradas por IA por matéria/tópico, flashcards do Caderno
- **Redação** — Corretor offline com 5 competências ENEM (0–1000)
- **Ligas de Estudo** — Salas colaborativas com chat WhatsApp, desafios diários, metas e ranking
- **Caderno de Estudos** — Anotações com Notebook AI Studio (resumo, mapa mental Mermaid, flashcards, gaps)
- **Ranking** — Por turma, escola ou geral com gamificação (XP, nível, streak)
- **Modo Foco** — Timer Pomodoro com integração emocional
- **Relatório Semanal** — Análise de desempenho com gráficos

### 🏫 Educacional
- Painel exclusivo com upload de CSV (alunos)
- Suporte a arquivos grandes com PapaParse (worker + chunking)
- Preview dos dados antes do envio
- Webhook N8N para criação automática de contas
- Colunas esperadas: `Nome do Aluno`, `Sala`, `Email do Responsável`, `Telefone do Responsável`

### 👪 Pais / Responsáveis
- Dashboard de acompanhamento pedagógico
- Cards de desempenho e alertas

---

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

---

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

---

## Scripts

| Comando              | Ação                             |
| -------------------- | -------------------------------- |
| `npm run dev`        | Inicia servidor de desenvolvimento |
| `npm run build`      | Compila TS + Vite para produção   |
| `npm run preview`    | Serve o build localmente          |
| `npm run lint`       | Verifica código com Oxlint        |
| `npm test`           | Roda testes unitários (Vitest)    |
| `npm run test:watch` | Roda testes em modo watch         |

---

## Gamificação

- **XP** por atividades: quiz (+30/acerto), mensagens (+5), ligas (+35–40), redação, foco
- **Níveis** a cada 100 × level XP
- **Streak** por acesso diário consecutivo
- **SSC Score** (0–100) — Sono, Stress, Cansaço — calculado com base em inputs + emoção detectada

---

## Liga de Estudos

- Cada liga tem: disciplina, metas, desafio diário, chat em tempo real, XP
- Limite de 2 ligas por usuário
- Sala da liga com chat estilo WhatsApp:
  - Bolhas próprias à direita (verde)
  - Bolhas de outros à esquerda (cinza, com nome)
  - Notificações de entrada centralizadas
  - Auto-scroll para mensagens novas

---

## Quiz Adaptativo

- Geração exclusiva por **Gemini API** (sem banco local de questões)
- 10 matérias × 10 tópicos cada
- Flashcards vindos do Notebook AI Studio
- Histórico de desempenho por matéria

---

## API de IA

O app usa **Google Gemini 2.0 Flash**. O usuário configura sua própria chave no Perfil.

```ts
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={API_KEY}
```

Usos:
- Geração de questões de quiz
- Resumo e mapa mental (Notebook AI Studio)
- Chat com persona do Mentor
- Análise de gaps de aprendizado

---

## Deploy

Build estático (Vite). Compatível com:

- Vercel, Netlify, Cloudflare Pages, GitHub Pages
- Serve a pasta `dist/` como conteúdo estático

```bash
npm run build
# dist/ → deploy
```

---

## Licença

Projeto educacional de código aberto.
