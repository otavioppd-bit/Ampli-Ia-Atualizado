-- =====================================================================
-- Loja: preco no banco e compra validada no servidor
--
-- Por que isto e necessario:
--   registrar_xp() so SOMA (clampa negativos em zero), entao a loja, que
--   DEDUZ XP, nao podia passar por ela. E deixar o cliente mandar o custo
--   seria pior ainda: bastaria enviar custo=0 para levar tudo de graca.
--
--   Com o catalogo no banco, o servidor le o preco, confere o saldo e
--   debita - o cliente so diz QUAL item quer.
--
-- Rode no SQL Editor. Idempotente.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Catalogo (espelha src/shared/lib/storeCatalog.ts)
-- ---------------------------------------------------------------------
create table if not exists public.loja_itens (
  id          text primary key,
  nome        text not null,
  preco       integer not null check (preco >= 0),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

insert into public.loja_itens (id, nome, preco) values
  ('moletom', 'Moletom Midnight',     500),
  ('oculos',  'Oculos de Cientista',  300),
  ('fones',   'Fones de Foco',        400)
on conflict (id) do update
  set nome = excluded.nome, preco = excluded.preco;

alter table public.loja_itens enable row level security;

drop policy if exists loja_itens_sel on public.loja_itens;
create policy loja_itens_sel on public.loja_itens
  for select to authenticated using (ativo);

-- Catalogo e so leitura para o app: preco nao se negocia pelo cliente.
revoke insert, update, delete on public.loja_itens from authenticated;

-- ---------------------------------------------------------------------
-- Compra atomica
--
-- Tudo numa transacao: se qualquer passo falhar, nada acontece. Sem isso
-- daria para receber o item e nao pagar (ou pagar e nao receber) numa
-- falha no meio do caminho.
-- ---------------------------------------------------------------------
create or replace function public.comprar_item(p_item_id text)
returns public.gamificacao
language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid := (select auth.uid());
  v_preco integer;
  v_nome  text;
  v_xp    integer;
  v_row   public.gamificacao;
begin
  if v_user is null then
    raise exception 'nao autenticado';
  end if;

  -- preco vem do BANCO, nunca do cliente
  select preco, nome into v_preco, v_nome
    from public.loja_itens where id = p_item_id and ativo;
  if not found then
    raise exception 'item inexistente ou inativo: %', p_item_id;
  end if;

  if exists (select 1 from public.inventario
              where user_id = v_user and item_id = p_item_id) then
    raise exception 'item ja adquirido';
  end if;

  -- trava a linha ate o fim da transacao: sem isso, duas compras
  -- simultaneas leriam o mesmo saldo e passariam as duas
  select xp into v_xp from public.gamificacao
   where user_id = v_user for update;

  if v_xp is null then
    raise exception 'gamificacao nao encontrada';
  end if;
  if v_xp < v_preco then
    raise exception 'saldo insuficiente: tem % XP, precisa de %', v_xp, v_preco;
  end if;

  update public.gamificacao
     set xp = xp - v_preco, atualizado_em = now()
   where user_id = v_user
   returning * into v_row;

  insert into public.inventario (user_id, item_id) values (v_user, p_item_id);

  insert into public.logs (user_id, tipo, descricao, xp)
  values (v_user, 'atividade',
          format('Comprou %s na Loja do Sagui (-%s XP)', v_nome, v_preco),
          -v_preco);

  return v_row;
end $$;

grant execute on function public.comprar_item(text) to authenticated;

-- ---------------------------------------------------------------------
-- Equipar: um acessorio por vez, resolvido no servidor
-- ---------------------------------------------------------------------
create or replace function public.equipar_item(p_item_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'nao autenticado'; end if;
  if not exists (select 1 from public.inventario
                  where user_id = v_user and item_id = p_item_id) then
    raise exception 'item nao adquirido';
  end if;
  update public.inventario set equipado = (item_id = p_item_id)
   where user_id = v_user;
end $$;

grant execute on function public.equipar_item(text) to authenticated;

commit;

-- =====================================================================
-- Verificacao:
--   select * from public.loja_itens;             -- 3 itens
--   select public.comprar_item('oculos');        -- erra se faltar saldo
-- =====================================================================
