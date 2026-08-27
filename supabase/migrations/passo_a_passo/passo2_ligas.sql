-- PASSO 2 de 5: ligas
-- Cole SOZINHO numa aba NOVA do SQL Editor (Ctrl+A antes de colar,
-- para nao sobrar nada do script anterior no buffer).
-- Espere "Success" antes de ir para o proximo passo.

-- =====================================================================
-- Ligas de estudo e mural da comunidade
--
-- O modelo de liga do app (StudyLeague) tem metas, mensagens, disciplina,
-- codigo de convite e listas de participantes. Normalizar isso em cinco
-- tabelas seria trabalho grande para um formato que ainda muda; guardar o
-- payload em jsonb preserva o modelo exato e mantem em coluna propria
-- apenas o que precisa de indice, chave estrangeira ou policy.
--
-- Rode no SQL Editor. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ligas
-- ---------------------------------------------------------------------
alter table public.ligas add column if not exists dados      jsonb not null default '{}';
alter table public.ligas add column if not exists disciplina text;
alter table public.ligas add column if not exists xp_premio  integer not null default 0;
alter table public.ligas add column if not exists privada    boolean not null default false;

-- Progresso de cada membro nas metas da liga.
alter table public.liga_membros add column if not exists progresso jsonb not null default '{}';

-- Liga privada so aparece para quem tem o codigo; a publica, para a escola
-- toda. A policy anterior so mostrava as proprias, o que deixava o mural
-- de ligas vazio para todo mundo.
drop policy if exists ligas_sel on public.ligas;
create policy ligas_sel on public.ligas for select using (
  criador_id = (select auth.uid())
  or public.sou_membro_liga(id)
  or (not privada and exists (
        select 1 from public.perfis p
         where p.id = ligas.criador_id
           and p.escola_id is not distinct from public.minha_escola_id()
      ))
);

-- ---------------------------------------------------------------------
-- Mural da turma
--
-- O app agrupa as mensagens por turma. escola_id fica desnormalizado na
-- linha para a policy nao precisar de join a cada leitura.
--
-- Nota: o codigo do front apontava para uma tabela `community_messages`
-- que nunca existiu neste banco (heranca do 001_schema.sql). O nome certo
-- e mensagens_comunidade; estas colunas completam o modelo que a tela usa.
-- ---------------------------------------------------------------------
alter table public.mensagens_comunidade add column if not exists materia     text;
alter table public.mensagens_comunidade add column if not exists moderada    boolean not null default true;
alter table public.mensagens_comunidade add column if not exists motivo_mod  text;
alter table public.mensagens_comunidade add column if not exists responde_a  bigint references public.mensagens_comunidade(id) on delete set null;
alter table public.mensagens_comunidade add column if not exists curtido_por uuid[] not null default '{}';

-- Curtir e a unica alteracao que um terceiro pode fazer na mensagem.
-- Sem policy de UPDATE ninguem curte; com uma policy aberta, qualquer um
-- reescreveria o texto alheio. Por isso o UPDATE exige que o conteudo
-- permaneca igual.
drop policy if exists mensagens_upd_curtida on public.mensagens_comunidade;
create policy mensagens_upd_curtida on public.mensagens_comunidade
  for update
  using (turma_id = public.minha_turma_id())
  with check (turma_id = public.minha_turma_id());

create or replace function public.trava_texto_mensagem()
returns trigger
language plpgsql as $$
begin
  if new.conteudo is distinct from old.conteudo
     or new.autor_id is distinct from old.autor_id then
    raise exception 'so a curtida pode ser alterada';
  end if;
  return new;
end $$;

drop trigger if exists mensagens_trava_texto on public.mensagens_comunidade;
create trigger mensagens_trava_texto
  before update on public.mensagens_comunidade
  for each row execute function public.trava_texto_mensagem();

create or replace function public.preencher_escola_mensagem()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.escola_id is null then
    select escola_id into new.escola_id from public.perfis where id = new.autor_id;
  end if;
  return new;
end $$;

drop trigger if exists mensagens_preenche_escola on public.mensagens_comunidade;
create trigger mensagens_preenche_escola
  before insert on public.mensagens_comunidade
  for each row execute function public.preencher_escola_mensagem();

-- =====================================================================
-- Verificacao:
--   select column_name from information_schema.columns
--    where table_name = 'ligas' order by ordinal_position;
-- =====================================================================
