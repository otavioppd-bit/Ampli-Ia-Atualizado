-- =====================================================================
-- Correcao: recursao infinita nas policies de ligas
--
-- Sintoma real (via API, com a chave anon):
--   GET /rest/v1/ligas        -> 500
--   {"code":"42P17","message":"infinite recursion detected in policy
--    for relation \"ligas\""}
--
-- Causa: as duas policies se chamavam em ciclo.
--   ligas_sel        consultava liga_membros
--     -> dispara liga_membros_sel, que consultava ligas
--        -> dispara ligas_sel ... sem fim.
--
-- Correcao: mover cada consulta cruzada para uma funcao SECURITY DEFINER.
-- Ela roda com os privilegios do dono e por isso NAO aplica a RLS da
-- tabela consultada - o ciclo se rompe. E o mesmo padrao ja usado em
-- meu_papel() / minha_escola_id() / sou_educador().
--
-- Rode este arquivo no SQL Editor. Nao mexe em dado nenhum.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Funcoes que quebram o ciclo
-- ---------------------------------------------------------------------
create or replace function public.sou_membro_liga(p_liga_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.liga_membros
     where liga_id = p_liga_id
       and user_id = (select auth.uid())
  );
$$;

create or replace function public.sou_criador_liga(p_liga_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ligas
     where id = p_liga_id
       and criador_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------
-- Policies reescritas - mesma regra de negocio, sem o ciclo
-- ---------------------------------------------------------------------

-- ligas: vejo a liga que criei ou aquelas de que participo
drop policy if exists ligas_sel on public.ligas;
create policy ligas_sel on public.ligas for select using (
  criador_id = (select auth.uid())
  or public.sou_membro_liga(id)
);

-- liga_membros: vejo minha propria filiacao; o criador ve a lista toda
drop policy if exists liga_membros_sel on public.liga_membros;
create policy liga_membros_sel on public.liga_membros for select using (
  user_id = (select auth.uid())
  or public.sou_criador_liga(liga_id)
);

-- sair da liga (proprio) ou remover membro (criador)
drop policy if exists liga_membros_del on public.liga_membros;
create policy liga_membros_del on public.liga_membros for delete using (
  user_id = (select auth.uid())
  or public.sou_criador_liga(liga_id)
);

commit;

-- =====================================================================
-- Verificacao: as duas devem devolver [] e nao 500.
--   GET /rest/v1/ligas?select=*&limit=1
--   GET /rest/v1/liga_membros?select=*&limit=1
-- =====================================================================
