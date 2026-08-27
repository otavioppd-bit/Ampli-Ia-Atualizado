-- PASSO 4 de 5: nivel
-- Cole SOZINHO numa aba NOVA do SQL Editor (Ctrl+A antes de colar,
-- para nao sobrar nada do script anterior no buffer).
-- Espere "Success" antes de ir para o proximo passo.

-- =====================================================================
-- Correcao: formula de nivel divergente entre cliente e servidor
--
-- BUG (introduzido por mim no 003):
--   cliente  src/shared/lib/utils.ts -> calcLevel()
--     custo PROGRESSIVO: nivel 2 custa 100, nivel 3 custa +200,
--     nivel 4 custa +300. Acumulado para alcancar o nivel L = 50*L*(L-1).
--
--   servidor registrar_xp() no 003
--     custo FIXO: level = xp/100 + 1.
--
--   Com 550 XP o servidor dizia nivel 6 e a barra lateral, nivel 3.
--   Pior: o LevelUpOverlay dispara pelo valor do SERVIDOR, entao o aluno
--   via "subiu para o nivel 6" com a interface mostrando 3.
--
--   A formula progressiva e a do desenho original do jogo e esta espalhada
--   pela interface (sidebar, top bar, loja). Quem estava errado era o
--   servidor.
--
-- Rode no SQL Editor. Nao apaga dado: recalcula o nivel de quem ja existe.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Espelha calcLevel() do cliente, laco por laco.
--
-- Usei laco em vez da forma fechada
--   floor((1 + sqrt(1 + 0.08*xp)) / 2)
-- porque nas fronteiras exatas (xp = 100, 300, 600) o arredondamento de
-- ponto flutuante pode cair para o nivel de baixo. Aqui a aritmetica e
-- inteira e o resultado e identico ao do cliente por construcao.
-- ---------------------------------------------------------------------
create or replace function public.nivel_por_xp(p_xp integer)
returns integer
language plpgsql immutable as $$
declare
  v_nivel integer := 1;
  v_resto integer := greatest(0, coalesce(p_xp, 0));
begin
  while v_resto >= 100 * v_nivel loop
    v_resto := v_resto - 100 * v_nivel;
    v_nivel := v_nivel + 1;
  end loop;
  return v_nivel;
end $$;

-- ---------------------------------------------------------------------
-- registrar_xp() passa a usar a funcao acima
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

  insert into public.gamificacao (user_id) values (v_user)
    on conflict (user_id) do nothing;

  update public.gamificacao g
     set xp     = g.xp + v_xp,
         level  = public.nivel_por_xp(g.xp + v_xp),
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

-- ---------------------------------------------------------------------
-- Conserta quem ja tem nivel gravado errado
-- ---------------------------------------------------------------------
update public.gamificacao
   set level = public.nivel_por_xp(xp)
 where level is distinct from public.nivel_por_xp(xp);

-- =====================================================================
-- Verificacao: as duas colunas devem bater em todas as linhas.
--   select xp, level, public.nivel_por_xp(xp) as esperado
--     from public.gamificacao
--    where level <> public.nivel_por_xp(xp);
--
-- Conferencia rapida da tabela de niveis:
--   select x, public.nivel_por_xp(x)
--     from unnest(array[0,99,100,299,300,599,600,1000]) as x;
--   esperado: 1, 1, 2, 2, 3, 3, 4, 4
-- =====================================================================
