-- =====================================================================
-- Ampli-IA - SCHEMA COMPLETO
-- Cole this inteiro no Supabase SQL Editor e rode uma vez.
--
-- Substitui 001_schema.sql (nunca aplicado) e 002_app_tables.sql (aditivo).
-- Recria tudo do zero: as 4 tabelas que existiam no projeto estavam VAZIAS
-- (verificado via API: 0 linhas em perfis, escolas, assinaturas_escolas e
-- mensagens_comunidade), entao nao ha dado a perder.
--
-- Cobre 100% do que hoje vive em localStorage:
--   mm_users/mm_session -> Supabase Auth      mm_inventory      -> inventario
--   mm_gamification     -> gamificacao        mm_plan_<data>    -> planos_diarios
--   mm_logs             -> logs               mm_study_leagues  -> ligas
--   mm_notas            -> notas              mm_foco_historico -> sessoes_foco
--   mm_chat_messages    -> chat_mensagens     mm_challenge_*    -> desafios_redacao
--   mm_personas         -> personas           mm_escolas/turmas -> escolas/turmas
--   mm_color_blindness, mm_tutorial_*, mm_active_persona -> preferencias
--
-- Fica DE FORA de proposito:
--   mm_api_key           chave Gemini do proprio usuario; num banco
--                        compartilhado ela vira alvo. Continua local.
--   mm_quiz_topics_cache cache puro, reconstruivel.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Limpeza do schema antigo
-- ---------------------------------------------------------------------
-- As 4 que existiam no projeto (todas vazias)...
drop table if exists public.mensagens_comunidade  cascade;
drop table if exists public.assinaturas_escolas   cascade;
drop table if exists public.perfis                cascade;
drop table if exists public.escolas               cascade;

-- ...e as novas, para que rodar o script duas vezes nao quebre.
drop view  if exists public.ranking               cascade;
drop table if exists public.liga_membros          cascade;
drop table if exists public.ligas                 cascade;
drop table if exists public.inventario            cascade;
drop table if exists public.planos_diarios        cascade;
drop table if exists public.sessoes_foco          cascade;
drop table if exists public.humor_historico       cascade;
drop table if exists public.desafios_redacao      cascade;
drop table if exists public.redacoes              cascade;
drop table if exists public.quiz_resultados       cascade;
drop table if exists public.personas              cascade;
drop table if exists public.notas                 cascade;
drop table if exists public.chat_mensagens        cascade;
drop table if exists public.logs                  cascade;
drop table if exists public.gamificacao           cascade;
drop table if exists public.preferencias          cascade;
drop table if exists public.turmas                cascade;

drop function if exists public.get_user_escola_id()            cascade;
drop function if exists public.is_admin_escola()               cascade;
drop function if exists public.escola_tem_assinatura_ativa(uuid) cascade;

-- ---------------------------------------------------------------------
-- 2. Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type public.papel_usuario as enum ('student', 'educator', 'parent', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.humor_tipo as enum (
    'stress','anxiety','sadness','tired','demotivated',
    'focused','motivated','happy','energetic','neutral'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.log_tipo as enum (
    'atividade','exercicio','foco','quiz','essay','login','tutorial'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 3. Escolas e turmas
-- ---------------------------------------------------------------------
create table public.escolas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  cidade      text default '',
  cor         text default '#f59e0b',
  criado_em   timestamptz not null default now()
);

create table public.turmas (
  id          uuid primary key default gen_random_uuid(),
  escola_id   uuid not null references public.escolas(id) on delete cascade,
  nome        text not null,
  ano         text default '',
  criado_em   timestamptz not null default now()
);
create index turmas_escola_idx on public.turmas (escola_id);

-- ---------------------------------------------------------------------
-- 4. Perfis
--    id = auth.users.id. Sem coluna 'uid text' intermediaria: a posse e
--    conferida direto contra o JWT, entao nao existe identidade paralela
--    que o cliente possa forjar.
-- ---------------------------------------------------------------------
create table public.perfis (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text not null,
  nome                text not null,
  sobrenome           text default '',
  papel               public.papel_usuario not null default 'student',
  escola_id           uuid references public.escolas(id) on delete set null,
  turma_id            uuid references public.turmas(id) on delete set null,
  meta_estudo         text default '',
  email_responsaveis  text,
  avatar_url          text,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
create index perfis_escola_idx on public.perfis (escola_id);
create index perfis_turma_idx  on public.perfis (turma_id);

-- Preferencias de UI (substitui varias chaves soltas do localStorage)
create table public.preferencias (
  user_id            uuid primary key references public.perfis(id) on delete cascade,
  daltonismo         text    not null default 'none',
  tutorial_completo  boolean not null default false,
  desafio_tutorial   boolean not null default false,
  persona_ativa_id   bigint,
  mudo               boolean not null default false,
  atualizado_em      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. Assinaturas (monetizacao por escola - preservado do schema antigo)
-- ---------------------------------------------------------------------
create table public.assinaturas_escolas (
  id                uuid primary key default gen_random_uuid(),
  escola_id         uuid not null references public.escolas(id) on delete cascade,
  pagador_id        uuid references public.perfis(id) on delete set null,
  email_pagador     text not null,
  status_pagamento  text not null default 'pendente'
                    check (status_pagamento in ('pendente','ativa','cancelada','expirada')),
  expira_em         timestamptz,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
create index assinaturas_escola_idx on public.assinaturas_escolas (escola_id);

-- ---------------------------------------------------------------------
-- 6. Gamificacao
--    SEM policy de INSERT/UPDATE para o cliente: XP so entra pela funcao
--    registrar_xp() (secao 11). Com ranking valendo alguma coisa, deixar
--    a coluna gravavel e o mesmo que deixar o placar aberto.
-- ---------------------------------------------------------------------
create table public.gamificacao (
  user_id           uuid primary key references public.perfis(id) on delete cascade,
  xp                integer not null default 0   check (xp >= 0),
  level             integer not null default 1   check (level >= 1),
  streak            integer not null default 1   check (streak >= 0),
  ultimo_acesso     date,
  atualizado_em     timestamptz not null default now()
);

create table public.logs (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.perfis(id) on delete cascade,
  tipo        public.log_tipo not null,
  descricao   text not null,
  xp          integer not null default 0,
  criado_em   timestamptz not null default now()
);
create index logs_user_idx on public.logs (user_id, criado_em desc);

-- ---------------------------------------------------------------------
-- 7. Conteudo do aluno
-- ---------------------------------------------------------------------
create table public.chat_mensagens (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.perfis(id) on delete cascade,
  papel       text not null check (papel in ('user','assistant')),
  texto       text not null,
  humor       public.humor_tipo,
  imagem      text,
  criado_em   timestamptz not null default now()
);
create index chat_user_idx on public.chat_mensagens (user_id, criado_em);

create table public.notas (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.perfis(id) on delete cascade,
  texto       text not null,
  tag         text,
  criado_em   timestamptz not null default now()
);
create index notas_user_idx on public.notas (user_id, criado_em desc);

create table public.personas (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.perfis(id) on delete cascade,
  nome        text not null,
  icone       text default '🧠',
  cor         text default '#f59e0b',
  instrucao   text not null,
  criado_em   timestamptz not null default now()
);
create index personas_user_idx on public.personas (user_id);

create table public.quiz_resultados (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.perfis(id) on delete cascade,
  materia     text not null,
  acertos     integer not null check (acertos >= 0),
  total       integer not null check (total > 0),
  xp_ganho    integer not null default 0,
  criado_em   timestamptz not null default now(),
  constraint quiz_acertos_validos check (acertos <= total)
);
create index quiz_user_idx on public.quiz_resultados (user_id, criado_em desc);

create table public.redacoes (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.perfis(id) on delete cascade,
  tema            text,
  nota_final      integer not null check (nota_final between 0 and 1000),
  competencia1    integer not null check (competencia1 between 0 and 200),
  competencia2    integer not null check (competencia2 between 0 and 200),
  competencia3    integer not null check (competencia3 between 0 and 200),
  competencia4    integer not null check (competencia4 between 0 and 200),
  competencia5    integer not null check (competencia5 between 0 and 200),
  pontos_fortes   text[] not null default '{}',
  pontos_melhorar text[] not null default '{}',
  texto_original  text,
  criado_em       timestamptz not null default now()
);
create index redacoes_user_idx on public.redacoes (user_id, criado_em desc);

-- Desafio de redacao cronometrado (mm_challenge_results)
create table public.desafios_redacao (
  id                    bigint generated always as identity primary key,
  user_id               uuid not null references public.perfis(id) on delete cascade,
  tema                  text not null,
  nota_final            integer not null check (nota_final between 0 and 1000),
  competencia1          integer not null default 0,
  competencia2          integer not null default 0,
  competencia3          integer not null default 0,
  competencia4          integer not null default 0,
  competencia5          integer not null default 0,
  xp_ganho              integer not null default 0,
  tempo_usado_segundos  integer not null default 0,
  finalizado            boolean not null default false,
  criado_em             timestamptz not null default now()
);
create index desafios_user_idx on public.desafios_redacao (user_id, criado_em desc);

create table public.humor_historico (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.perfis(id) on delete cascade,
  humor       public.humor_tipo not null,
  texto       text,
  criado_em   timestamptz not null default now()
);
create index humor_user_idx on public.humor_historico (user_id, criado_em desc);

-- Pomodoro / foco (mm_foco_historico)
create table public.sessoes_foco (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references public.perfis(id) on delete cascade,
  tipo              text not null check (tipo in ('foco','pausa')),
  duracao_minutos   integer not null check (duracao_minutos > 0),
  criado_em         timestamptz not null default now()
);
create index foco_user_idx on public.sessoes_foco (user_id, criado_em desc);

-- Plano diario (mm_plan_<data>): 1 por usuario por dia
create table public.planos_diarios (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.perfis(id) on delete cascade,
  data        date not null,
  humor       public.humor_tipo,
  tarefas     jsonb not null default '[]',
  criado_em   timestamptz not null default now(),
  unique (user_id, data)
);

-- Loja (mm_inventory)
create table public.inventario (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.perfis(id) on delete cascade,
  item_id     text not null,
  equipado    boolean not null default false,
  criado_em   timestamptz not null default now(),
  unique (user_id, item_id)
);

-- ---------------------------------------------------------------------
-- 8. Social: comunidade e ligas
-- ---------------------------------------------------------------------
create table public.mensagens_comunidade (
  id          bigint generated always as identity primary key,
  turma_id    uuid references public.turmas(id) on delete cascade,
  escola_id   uuid references public.escolas(id) on delete cascade,
  autor_id    uuid not null references public.perfis(id) on delete cascade,
  conteudo    text not null check (length(conteudo) between 1 and 2000),
  criado_em   timestamptz not null default now()
);
create index mensagens_turma_idx on public.mensagens_comunidade (turma_id, criado_em desc);

create table public.ligas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  descricao   text default '',
  criador_id  uuid not null references public.perfis(id) on delete cascade,
  codigo      text unique not null default upper(substr(md5(random()::text), 1, 6)),
  criado_em   timestamptz not null default now()
);

create table public.liga_membros (
  liga_id     uuid not null references public.ligas(id) on delete cascade,
  user_id     uuid not null references public.perfis(id) on delete cascade,
  entrou_em   timestamptz not null default now(),
  primary key (liga_id, user_id)
);

-- ---------------------------------------------------------------------
-- 9. Funcoes auxiliares
--    STABLE + security definer: usadas dentro de policies, precisam ler
--    perfis sem cair na RLS da propria tabela (senao da recursao infinita).
-- ---------------------------------------------------------------------
create or replace function public.meu_papel()
returns public.papel_usuario
language sql stable security definer set search_path = public as $$
  select papel from public.perfis where id = (select auth.uid());
$$;

create or replace function public.minha_escola_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select escola_id from public.perfis where id = (select auth.uid());
$$;

create or replace function public.minha_turma_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select turma_id from public.perfis where id = (select auth.uid());
$$;

create or replace function public.sou_educador()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select papel in ('educator','admin') from public.perfis where id = (select auth.uid())),
    false);
$$;

-- Estas duas existem para QUEBRAR RECURSAO entre ligas e liga_membros.
-- Se a policy de ligas consultasse liga_membros direto (e vice-versa), o
-- Postgres entraria em ciclo e devolveria 42P17. Sendo SECURITY DEFINER,
-- a consulta roda como dono e nao reaplica a RLS da tabela consultada.
create or replace function public.sou_membro_liga(p_liga_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.liga_membros
     where liga_id = p_liga_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.sou_criador_liga(p_liga_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ligas
     where id = p_liga_id and criador_id = (select auth.uid())
  );
$$;

create or replace function public.escola_tem_assinatura_ativa(p_escola_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assinaturas_escolas
     where escola_id = p_escola_id
       and status_pagamento = 'ativa'
       and (expira_em is null or expira_em > now())
  );
$$;

-- ---------------------------------------------------------------------
-- 10. Signup: cria perfil, gamificacao e preferencias
--
--     SEGURANCA: o papel entra SEMPRE como 'student'. O raw_user_meta_data
--     vem do cliente no signUp; obedecer a ele deixaria qualquer pessoa se
--     cadastrar como admin. Promocao e ato administrativo (secao 12).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, email, nome, papel)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    'student'
  )
  on conflict (id) do nothing;

  insert into public.gamificacao (user_id) values (new.id) on conflict do nothing;
  insert into public.preferencias (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 11. XP no servidor
--     O cliente nao escreve em gamificacao. Manda o evento; o servidor
--     decide quanto vale, limita por chamada, recalcula o nivel e cuida
--     do streak. Sem isto o ranking e ficcao.
-- ---------------------------------------------------------------------
create or replace function public.registrar_xp(
  p_tipo public.log_tipo,
  p_descricao text,
  p_xp integer default 0
)
returns public.gamificacao
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := (select auth.uid());
  v_xp   integer := greatest(0, least(coalesce(p_xp, 0), 500));  -- teto por evento
  v_hoje date := (now() at time zone 'utc')::date;
  v_row  public.gamificacao;
begin
  if v_user is null then
    raise exception 'nao autenticado';
  end if;

  insert into public.logs (user_id, tipo, descricao, xp)
  values (v_user, p_tipo, left(coalesce(p_descricao, ''), 500), v_xp);

  -- Garante a linha: contas criadas antes do trigger (ou se ele falhar)
  -- nao teriam registro em gamificacao e o UPDATE abaixo viraria no-op,
  -- devolvendo null e perdendo o XP silenciosamente.
  insert into public.gamificacao (user_id) values (v_user)
    on conflict (user_id) do nothing;

  update public.gamificacao g
     set xp     = g.xp + v_xp,
         -- 100 XP por nivel
         level  = greatest(1, ((g.xp + v_xp) / 100) + 1),
         streak = case
                    when g.ultimo_acesso = v_hoje then g.streak
                    when g.ultimo_acesso = v_hoje - 1 then g.streak + 1
                    else 1
                  end,
         ultimo_acesso = v_hoje,
         atualizado_em = now()
   where g.user_id = v_user
   returning * into v_row;

  return v_row;
end $$;

-- Ranking.
--
-- Uma view roda com os privilegios do DONO, entao ela IGNORA a RLS das
-- tabelas de baixo. Aqui isso e proposital (ranking precisa enxergar
-- outros alunos), mas por isso o filtro de escopo tem de estar DENTRO da
-- view - e nao ser deixado a cargo do cliente.
--
-- Escopo: apenas colegas da MESMA escola. Um ranking global exporia nome
-- e escola de estudantes menores de idade para qualquer conta cadastrada.
-- Colunas: nenhuma PII alem do nome de exibicao (sem e-mail).
create or replace view public.ranking as
  select p.id, p.nome, p.avatar_url, p.escola_id, p.turma_id,
         e.nome as escola_nome, t.nome as turma_nome,
         g.xp, g.level, g.streak
    from public.perfis p
    join public.gamificacao g on g.user_id = p.id
    left join public.escolas e on e.id = p.escola_id
    left join public.turmas  t on t.id = p.turma_id
   where p.papel = 'student'
     and (
       p.id = (select auth.uid())                              -- sempre me vejo
       or (p.escola_id is not null
           and p.escola_id = public.minha_escola_id())          -- colegas de escola
       or exists (                                              -- colegas de liga
         select 1 from public.liga_membros m1
           join public.liga_membros m2 on m2.liga_id = m1.liga_id
          where m1.user_id = (select auth.uid()) and m2.user_id = p.id
       )
     );

-- ---------------------------------------------------------------------
-- 12. Promocao de papel - inacessivel ao app
--     Rode no SQL Editor:  select public.promover_usuario('x@y.com','educator');
-- ---------------------------------------------------------------------
create or replace function public.promover_usuario(p_email text, p_papel public.papel_usuario)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.perfis p set papel = p_papel, atualizado_em = now()
    from auth.users u where u.id = p.id and u.email = p_email;
  if not found then raise exception 'usuario nao encontrado: %', p_email; end if;
end $$;

revoke all on function public.promover_usuario(text, public.papel_usuario)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 13. RLS: liga em TODAS as tabelas
--     Tabela sem RLS + chave anon (que e publica, vai no bundle do front)
--     = tabela aberta na internet.
-- ---------------------------------------------------------------------
alter table public.escolas              enable row level security;
alter table public.turmas               enable row level security;
alter table public.perfis               enable row level security;
alter table public.preferencias         enable row level security;
alter table public.assinaturas_escolas  enable row level security;
alter table public.gamificacao          enable row level security;
alter table public.logs                 enable row level security;
alter table public.chat_mensagens       enable row level security;
alter table public.notas                enable row level security;
alter table public.personas             enable row level security;
alter table public.quiz_resultados      enable row level security;
alter table public.redacoes             enable row level security;
alter table public.desafios_redacao     enable row level security;
alter table public.humor_historico      enable row level security;
alter table public.sessoes_foco         enable row level security;
alter table public.planos_diarios       enable row level security;
alter table public.inventario           enable row level security;
alter table public.mensagens_comunidade enable row level security;
alter table public.ligas                enable row level security;
alter table public.liga_membros         enable row level security;

-- ---------------------------------------------------------------------
-- 14. Policies "dono faz tudo no que e seu"
--     Em laco: sao 12 tabelas com a MESMA regra. Escrever 48 policies na
--     mao e exatamente onde nasce o erro de copiar-colar que deixa uma
--     tabela aberta.
--
--     USING      -> quais linhas eu enxergo/altero
--     WITH CHECK -> como a linha pode ficar depois de gravar
--     Os dois sao necessarios: so USING no UPDATE deixaria transferir a
--     linha para outro dono.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'chat_mensagens','notas','personas','quiz_resultados','redacoes',
    'desafios_redacao','humor_historico','sessoes_foco','planos_diarios',
    'inventario','preferencias','logs'
  ]
  loop
    execute format('create policy %I on public.%I for select using ((select auth.uid()) = user_id)',            t||'_sel', t);
    execute format('create policy %I on public.%I for insert with check ((select auth.uid()) = user_id)',       t||'_ins', t);
    execute format('create policy %I on public.%I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t||'_upd', t);
    execute format('create policy %I on public.%I for delete using ((select auth.uid()) = user_id)',            t||'_del', t);
  end loop;
end $$;

-- logs tambem sao lidos pelo educador da turma (acompanhamento pedagogico)
create policy logs_educador_sel on public.logs for select using (
  public.sou_educador()
  and exists (select 1 from public.perfis p
               where p.id = logs.user_id and p.escola_id = public.minha_escola_id())
);

-- ---------------------------------------------------------------------
-- 15. Policies especificas
-- ---------------------------------------------------------------------

-- perfis
create policy perfis_sel_proprio on public.perfis
  for select using ((select auth.uid()) = id);
create policy perfis_sel_educador on public.perfis
  for select using (public.sou_educador() and escola_id = public.minha_escola_id());
create policy perfis_ins_proprio on public.perfis
  for insert with check ((select auth.uid()) = id);

create policy perfis_upd_proprio on public.perfis
  for update using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Trava de papel e escola.
--
-- Sem isto: PATCH /perfis?id=eq.<meu_id> {"papel":"admin"} -> virou admin
-- da escola, com acesso aos dados de todos os alunos.
--
-- Trigger em vez de WITH CHECK porque o trigger compara OLD com NEW de
-- forma explicita, sem depender de quando a policy avalia o snapshot.
-- auth.uid() nulo = chamada de service_role / SQL Editor, onde a troca e
-- justamente o que se quer (ver promover_usuario).
create or replace function public.trava_campos_perfil()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is not null then
    if new.papel is distinct from old.papel then
      raise exception 'papel do usuario nao pode ser alterado pelo app';
    end if;
    if new.escola_id is distinct from old.escola_id
       or new.turma_id is distinct from old.turma_id then
      raise exception 'escola/turma so mudam por acao administrativa';
    end if;
    if new.id is distinct from old.id then
      raise exception 'id do perfil e imutavel';
    end if;
  end if;
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists perfis_trava_campos on public.perfis;
create trigger perfis_trava_campos
  before update on public.perfis
  for each row execute function public.trava_campos_perfil();

-- gamificacao: leitura sim, escrita nao (so via registrar_xp)
create policy gamificacao_sel_propria on public.gamificacao
  for select using ((select auth.uid()) = user_id);
create policy gamificacao_sel_educador on public.gamificacao
  for select using (
    public.sou_educador()
    and exists (select 1 from public.perfis p
                 where p.id = gamificacao.user_id and p.escola_id = public.minha_escola_id())
  );

-- escolas / turmas: autenticado le (para escolher a sua); so admin escreve
create policy escolas_sel on public.escolas for select to authenticated using (true);
create policy turmas_sel  on public.turmas  for select to authenticated using (true);
create policy escolas_upd_admin on public.escolas for update
  using (public.meu_papel() = 'admin' and id = public.minha_escola_id())
  with check (public.meu_papel() = 'admin' and id = public.minha_escola_id());
create policy turmas_all_admin on public.turmas for all
  using (public.meu_papel() = 'admin' and escola_id = public.minha_escola_id())
  with check (public.meu_papel() = 'admin' and escola_id = public.minha_escola_id());

-- assinaturas: dado financeiro. Escrita fica com o webhook (service_role,
-- que ignora RLS) - o cliente nunca grava aqui.
create policy assinaturas_sel on public.assinaturas_escolas for select using (
  (select auth.uid()) = pagador_id
  or (public.meu_papel() = 'admin' and escola_id = public.minha_escola_id())
);

-- comunidade: mural da turma
create policy mensagens_sel on public.mensagens_comunidade
  for select using (turma_id = public.minha_turma_id() or escola_id = public.minha_escola_id());
create policy mensagens_ins on public.mensagens_comunidade
  for insert with check ((select auth.uid()) = autor_id and turma_id = public.minha_turma_id());
create policy mensagens_del on public.mensagens_comunidade
  for delete using ((select auth.uid()) = autor_id or public.sou_educador());

-- ligas: membro ve a liga; qualquer um cria; o criador administra
create policy ligas_sel on public.ligas for select using (
  criador_id = (select auth.uid())
  or public.sou_membro_liga(id)
);
create policy ligas_ins on public.ligas for insert
  with check ((select auth.uid()) = criador_id);
create policy ligas_upd on public.ligas for update
  using ((select auth.uid()) = criador_id) with check ((select auth.uid()) = criador_id);
create policy ligas_del on public.ligas for delete
  using ((select auth.uid()) = criador_id);

create policy liga_membros_sel on public.liga_membros for select using (
  user_id = (select auth.uid())
  or public.sou_criador_liga(liga_id)
);
create policy liga_membros_ins on public.liga_membros for insert
  with check ((select auth.uid()) = user_id);
create policy liga_membros_del on public.liga_membros for delete using (
  user_id = (select auth.uid())
  or public.sou_criador_liga(liga_id)
);

-- ---------------------------------------------------------------------
-- 16. Grants
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.ranking to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.registrar_xp(public.log_tipo, text, integer) to authenticated;

-- Defesa em profundidade no XP: a RLS ja nao tem policy de escrita em
-- gamificacao, e aqui o privilegio tambem sai. Sobra so registrar_xp().
revoke insert, update, delete on public.gamificacao from authenticated;

-- Placar e dado derivado: ninguem escreve na view.
revoke insert, update, delete on public.ranking from authenticated;

-- anon nao precisa de nada alem de autenticar
revoke all on all tables in schema public from anon;

commit;

-- =====================================================================
-- VERIFICACAO - rode depois e confira
--
-- (a) toda tabela com RLS ligado (rowsecurity deve ser true em todas):
select tablename, rowsecurity
  from pg_tables where schemaname = 'public' order by tablename;

-- (b) nenhuma tabela com RLS e ZERO policies (isso trava tudo em silencio):
select t.tablename, count(p.policyname) as policies
  from pg_tables t
  left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
 where t.schemaname = 'public'
 group by t.tablename having count(p.policyname) = 0;
-- =====================================================================
