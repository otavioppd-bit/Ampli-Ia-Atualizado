-- =====================================================================
-- Ampli-IA - MODULO DE BEM-ESTAR, MARKETPLACE E FOCO OFFLINE
--
-- Aditivo ao 003_schema_completo.sql. Nao derruba nada do que existe:
-- todas as tabelas aqui sao novas, e as poucas alteracoes em objetos
-- antigos (enum de papel, policies de leitura para responsavel) usam
-- "if not exists" / "drop policy if exists" para rodar duas vezes sem
-- quebrar.
--
-- Cobre as 7 funcionalidades:
--   1. Marketplace de psicologos + painel dos pais
--        psicologos, psicologo_disponibilidade, vinculos_responsavel,
--        alertas_saude_mental, agendamentos, notificacoes, push_assinaturas
--   2. Escudo de dopamina        -> sessoes_offline, carteira_foco
--   3. Predicao de fadiga        -> telemetria_estudo, indice_burnout
--   4. Pilulas de audio          -> modulos_audio, progresso_audio
--   5. Calendario adaptativo     -> revisoes_espacadas
--   6. Intervencao doomscrolling -> log_intervencoes_ia
--   7. Relatorio de descompressao-> relatorios_semanais
--
-- PRINCIPIO HERDADO DO 003: nada que valha dinheiro, moeda ou acesso a
-- dado de terceiro e escrito direto pelo cliente. Moeda de foco,
-- agendamento, pagamento e alerta passam por funcao SECURITY DEFINER que
-- confere quem esta chamando.
--
-- Rode uma vez no SQL Editor do Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensoes e tipos
-- ---------------------------------------------------------------------

-- btree_gist habilita o EXCLUDE por intervalo de tempo em agendamentos:
-- e o que impede dois responsaveis comprarem o MESMO horario do mesmo
-- psicologo em requisicoes concorrentes. Um "select ... where nao existe"
-- feito pelo cliente nao resolve corrida; a constraint resolve.
create extension if not exists btree_gist;

-- Psicologo e um papel novo (o enum ja tinha 4 valores).
-- Fora de bloco/transacao: em Postgres < 12 o valor novo de enum nao pode
-- ser usado na mesma transacao em que foi criado.
alter type public.papel_usuario add value if not exists 'psychologist';

do $$ begin
  create type public.status_vinculo as enum ('pendente','ativo','recusado','revogado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.severidade_alerta as enum ('info','atencao','alto','critico');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.status_alerta as enum ('aberto','visto','em_atendimento','resolvido');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.status_pagamento as enum ('pendente','pago','reembolsado','falhou','isento');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.status_agendamento as enum ('agendado','confirmado','concluido','cancelado','no_show');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.classe_burnout as enum ('saudavel','alerta','fadiga','esgotamento');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.canal_notificacao as enum ('email','push','in_app');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 1. Vinculo responsavel <-> aluno
--
--    O painel dos pais so vale lendo dado real do filho, e dado de menor
--    de idade nao pode ficar acessivel a quem digitar um e-mail. Entao o
--    responsavel PEDE o vinculo e o aluno APROVA; enquanto 'pendente', o
--    responsavel nao enxerga nada.
-- ---------------------------------------------------------------------
create table if not exists public.vinculos_responsavel (
  id              uuid primary key default gen_random_uuid(),
  responsavel_id  uuid not null references public.perfis(id) on delete cascade,
  aluno_id        uuid not null references public.perfis(id) on delete cascade,
  parentesco      text default 'responsavel',
  status          public.status_vinculo not null default 'pendente',
  criado_em       timestamptz not null default now(),
  respondido_em   timestamptz,
  unique (responsavel_id, aluno_id)
);
create index if not exists vinculos_resp_idx  on public.vinculos_responsavel (responsavel_id, status);
create index if not exists vinculos_aluno_idx on public.vinculos_responsavel (aluno_id, status);

-- SECURITY DEFINER pelo mesmo motivo de sou_membro_liga no 003: e usada
-- dentro de policies de OUTRAS tabelas e precisa ler vinculos sem
-- reaplicar a RLS de vinculos (senao: recursao, erro 42P17).
create or replace function public.sou_responsavel_de(p_aluno uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vinculos_responsavel
     where responsavel_id = (select auth.uid())
       and aluno_id = p_aluno
       and status = 'ativo'
  );
$$;

/*
 * A comparacao e por TEXTO, nao pelo literal do enum.
 *
 * Motivo concreto: 'psychologist' acabou de ser adicionado ao enum logo
 * acima. O corpo de uma funcao `language sql` e validado no momento da
 * criacao, e o Postgres recusa usar um valor de enum criado na MESMA
 * transacao ("unsafe use of new value"). Com ::text o script roda de uma
 * vez so - inclusive se alguem colar 010 e 011 juntos no editor.
 */
create or replace function public.sou_psicologo()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select papel::text = 'psychologist' from public.perfis where id = (select auth.uid())),
    false);
$$;

-- ---------------------------------------------------------------------
-- 2. Catalogo de psicologos e disponibilidade
-- ---------------------------------------------------------------------
create table if not exists public.psicologos (
  id                 uuid primary key references public.perfis(id) on delete cascade,
  crp                text not null,
  bio                text default '',
  especialidades     text[] not null default '{}',
  abordagem          text default '',
  valor_centavos     integer not null default 12000 check (valor_centavos between 0 and 100000),
  duracao_minutos    integer not null default 50 check (duracao_minutos between 20 and 120),
  foto_url           text,
  aceita_novos       boolean not null default true,
  atende_adolescente boolean not null default true,
  nota_media         numeric(3,2) not null default 5.00 check (nota_media between 0 and 5),
  total_atendimentos integer not null default 0,
  fuso               text not null default 'America/Sao_Paulo',
  criado_em          timestamptz not null default now()
);

-- Janelas semanais recorrentes. Os SLOTS concretos sao derivados delas
-- (no cliente por bookingEngine.ts, no banco por slots_livres()). Gravar
-- slot a slot geraria milhares de linhas mortas por semana.
create table if not exists public.psicologo_disponibilidade (
  id            bigint generated always as identity primary key,
  psicologo_id  uuid not null references public.psicologos(id) on delete cascade,
  dia_semana    smallint not null check (dia_semana between 0 and 6),  -- 0 = domingo
  hora_inicio   time not null,
  hora_fim      time not null,
  criado_em     timestamptz not null default now(),
  check (hora_fim > hora_inicio),
  unique (psicologo_id, dia_semana, hora_inicio)
);
create index if not exists disp_psico_idx on public.psicologo_disponibilidade (psicologo_id, dia_semana);

-- ---------------------------------------------------------------------
-- 3. Alertas de saude mental (gatilhos disparados)
-- ---------------------------------------------------------------------
create table if not exists public.alertas_saude_mental (
  id           uuid primary key default gen_random_uuid(),
  aluno_id     uuid not null references public.perfis(id) on delete cascade,
  tipo         text not null,                    -- burnout | ssc | humor | evasao | madrugada
  severidade   public.severidade_alerta not null default 'atencao',
  score        integer not null default 0 check (score between 0 and 100),
  gatilho      jsonb not null default '{}',      -- features que dispararam
  mensagem     text not null,
  status       public.status_alerta not null default 'aberto',
  criado_em    timestamptz not null default now(),
  visto_em     timestamptz,
  resolvido_em timestamptz
);
create index if not exists alertas_aluno_idx  on public.alertas_saude_mental (aluno_id, criado_em desc);
create index if not exists alertas_status_idx on public.alertas_saude_mental (status, criado_em desc);

-- ---------------------------------------------------------------------
-- 4. Agendamentos (Appointments)
-- ---------------------------------------------------------------------
create table if not exists public.agendamentos (
  id               uuid primary key default gen_random_uuid(),
  aluno_id         uuid not null references public.perfis(id) on delete cascade,
  responsavel_id   uuid references public.perfis(id) on delete set null,
  psicologo_id     uuid not null references public.psicologos(id) on delete cascade,
  alerta_id        uuid references public.alertas_saude_mental(id) on delete set null,
  inicio           timestamptz not null,
  fim              timestamptz not null,
  duracao_minutos  integer not null default 50,
  meeting_url      text,
  meeting_provider text default 'jitsi' check (meeting_provider in ('jitsi','google_meet','zoom','manual')),
  meeting_ref      text,
  valor_centavos   integer not null default 0 check (valor_centavos >= 0),
  status_pagamento public.status_pagamento not null default 'pendente',
  pagamento_ref    text,
  status           public.status_agendamento not null default 'agendado',
  observacoes      text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  check (fim > inicio)
);
create index if not exists agend_aluno_idx on public.agendamentos (aluno_id, inicio desc);
create index if not exists agend_psico_idx on public.agendamentos (psicologo_id, inicio desc);
create index if not exists agend_resp_idx  on public.agendamentos (responsavel_id, inicio desc);

-- Duas consultas sobrepostas para o mesmo psicologo passam a ser
-- impossiveis - inclusive sob concorrencia.
do $$ begin
  alter table public.agendamentos
    add constraint agendamentos_sem_sobreposicao
    exclude using gist (
      psicologo_id with =,
      tstzrange(inicio, fim) with &&
    ) where (status <> 'cancelado');
exception when duplicate_object then null; end $$;

-- Psicologo so enxerga o aluno se existir consulta entre os dois.
--
-- Definida AQUI, e nao junto das outras funcoes auxiliares la em cima:
-- o corpo de uma funcao `language sql` e validado na criacao, entao ela
-- precisa vir depois da tabela agendamentos existir.
create or replace function public.atendo_o_aluno(p_aluno uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.agendamentos
     where psicologo_id = (select auth.uid())
       and aluno_id = p_aluno
       and status <> 'cancelado'
  );
$$;

-- ---------------------------------------------------------------------
-- 5. Notificacoes (e-mail / push / in-app)
--
--    Uma FILA, nao um envio. O app insere e le; quem entrega e o worker
--    (server/worker.js -> POST /notify/drain) com service_role. Assim o
--    e-mail nao depende do navegador do responsavel estar aberto e uma
--    falha de SMTP nao perde o alerta.
-- ---------------------------------------------------------------------
create table if not exists public.notificacoes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.perfis(id) on delete cascade,
  canal        public.canal_notificacao not null default 'in_app',
  tipo         text not null,
  titulo       text not null,
  corpo        text not null,
  payload      jsonb not null default '{}',
  lida         boolean not null default false,
  enviada_em   timestamptz,
  tentativas   smallint not null default 0,
  criado_em    timestamptz not null default now()
);
create index if not exists notif_user_idx on public.notificacoes (user_id, criado_em desc);
create index if not exists notif_fila_idx on public.notificacoes (canal, enviada_em) where enviada_em is null;

create table if not exists public.push_assinaturas (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.perfis(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  criado_em   timestamptz not null default now()
);
create index if not exists push_user_idx on public.push_assinaturas (user_id);

-- ---------------------------------------------------------------------
-- 6. Escudo de dopamina: sessoes offline + carteira
-- ---------------------------------------------------------------------
create table if not exists public.sessoes_offline (
  id                 bigint generated always as identity primary key,
  user_id            uuid not null references public.perfis(id) on delete cascade,
  inicio             timestamptz not null,
  fim                timestamptz not null,
  minutos_offline    integer not null check (minutos_offline >= 0),
  interrupcoes       smallint not null default 0,
  modo               text not null default 'enem' check (modo in ('enem','leve','maratona')),
  moedas_creditadas  integer not null default 0,
  validada           boolean not null default true,
  criado_em          timestamptz not null default now(),
  check (fim >= inicio)
);
create index if not exists offline_user_idx on public.sessoes_offline (user_id, inicio desc);

create table if not exists public.carteira_foco (
  user_id       uuid primary key references public.perfis(id) on delete cascade,
  saldo         integer not null default 0 check (saldo >= 0),
  total_ganho   integer not null default 0,
  total_gasto   integer not null default 0,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.extrato_foco (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.perfis(id) on delete cascade,
  delta       integer not null,
  motivo      text not null,
  criado_em   timestamptz not null default now()
);
create index if not exists extrato_user_idx on public.extrato_foco (user_id, criado_em desc);

-- ---------------------------------------------------------------------
-- 7. Telemetria de estudo e indice de burnout
-- ---------------------------------------------------------------------
create table if not exists public.telemetria_estudo (
  id                   bigint generated always as identity primary key,
  user_id              uuid not null references public.perfis(id) on delete cascade,
  question_id          text not null,
  materia              text default '',
  dificuldade          text default 'media' check (dificuldade in ('facil','media','dificil')),
  tempo_gasto_segundos integer not null check (tempo_gasto_segundos >= 0),
  acertou              boolean not null,
  hora_local           smallint check (hora_local between 0 and 23),
  criado_em            timestamptz not null default now()
);
create index if not exists telemetria_user_idx on public.telemetria_estudo (user_id, criado_em desc);

create table if not exists public.indice_burnout (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.perfis(id) on delete cascade,
  data       date not null,
  score      integer not null check (score between 0 and 100),
  classe     public.classe_burnout not null default 'saudavel',
  features   jsonb not null default '{}',
  criado_em  timestamptz not null default now(),
  unique (user_id, data)
);
create index if not exists burnout_user_idx on public.indice_burnout (user_id, data desc);

-- ---------------------------------------------------------------------
-- 8. Pilulas de audio
-- ---------------------------------------------------------------------
create table if not exists public.modulos_audio (
  id               uuid primary key default gen_random_uuid(),
  materia          text not null,
  topico           text not null,
  titulo           text not null,
  resumo           text default '',
  roteiro          text not null,
  audio_url        text,
  duracao_segundos integer not null default 180,
  voz              text default 'pt-BR-Neural2-B',
  publico          boolean not null default true,
  criado_por       uuid references public.perfis(id) on delete set null,
  criado_em        timestamptz not null default now()
);
create index if not exists audio_materia_idx on public.modulos_audio (materia, topico);

create table if not exists public.progresso_audio (
  user_id          uuid not null references public.perfis(id) on delete cascade,
  modulo_id        uuid not null references public.modulos_audio(id) on delete cascade,
  segundos_ouvidos integer not null default 0 check (segundos_ouvidos >= 0),
  concluido        boolean not null default false,
  ouvido_em        timestamptz,
  atualizado_em    timestamptz not null default now(),
  primary key (user_id, modulo_id)
);

-- ---------------------------------------------------------------------
-- 9. Revisao espacada (curva de Ebbinghaus)
-- ---------------------------------------------------------------------
create table if not exists public.revisoes_espacadas (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.perfis(id) on delete cascade,
  topico_id       text not null,
  topico_nome     text not null,
  materia         text default '',
  nivel_memoria   smallint not null default 0 check (nivel_memoria between 0 and 5),
  intervalo_dias  smallint not null default 1,
  facilidade      numeric(3,2) not null default 2.50 check (facilidade between 1.30 and 3.00),
  ultima_nota     smallint check (ultima_nota between 0 and 100),
  revisoes_feitas smallint not null default 0,
  proxima_revisao date not null,
  ultima_revisao  date,
  criado_em       timestamptz not null default now(),
  unique (user_id, topico_id)
);
create index if not exists revisoes_prox_idx on public.revisoes_espacadas (user_id, proxima_revisao);

-- ---------------------------------------------------------------------
-- 10. Log de intervencoes da IA (doomscrolling e afins)
-- ---------------------------------------------------------------------
create table if not exists public.log_intervencoes_ia (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.perfis(id) on delete cascade,
  tipo          text not null,                 -- doomscroll | burnout | madrugada
  gatilho       jsonb not null default '{}',
  mensagem      text not null,
  aceita        boolean,
  respondida_em timestamptz,
  criado_em     timestamptz not null default now()
);
create index if not exists interv_user_idx on public.log_intervencoes_ia (user_id, criado_em desc);

-- ---------------------------------------------------------------------
-- 11. Relatorio de descompressao semanal
-- ---------------------------------------------------------------------
create table if not exists public.relatorios_semanais (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.perfis(id) on delete cascade,
  semana_inicio  date not null,
  texto_gerado   text not null,
  metricas       jsonb not null default '{}',
  gatilho_em     timestamptz not null default now(),
  lido           boolean not null default false,
  lido_em        timestamptz,
  unique (user_id, semana_inicio)
);
create index if not exists relatorios_user_idx on public.relatorios_semanais (user_id, semana_inicio desc);
