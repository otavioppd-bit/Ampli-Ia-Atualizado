-- =====================================================================
-- Correcao: XP infinito marcando e desmarcando tarefa do Plano do Dia
--
-- COMO ERA EXPLORADO
--   O aluno marcava e desmarcava o mesmo item, e cada ciclo creditava
--   20 XP. Em um minuto da para chegar a qualquer nivel, o que esvazia o
--   ranking, as ligas e a loja de uma vez.
--
-- DUAS FALHAS SOMADAS
--   1. No cliente, completeTask lia o estado DEPOIS de inverter o
--      checkbox, entao a condicao premiava a transicao errada.
--   2. No servidor, nada registrava que aquela tarefa ja tinha pago.
--      registrar_xp aceita qualquer chamada, quantas vezes vierem.
--
--   Corrigir so o item 1 nao resolve: bastaria chamar registrar_xp pelo
--   console. A idempotencia precisa morar no banco.
--
-- DECISAO DE PRODUTO
--   Tarefa concluida nao volta atras. E o padrao de meta diaria (Duolingo
--   faz assim) e elimina a classe inteira do problema, em vez de tentar
--   equilibrar credito e estorno. O checkbox fica desabilitado depois de
--   marcado.
--
-- Rode no SQL Editor.
-- =====================================================================

begin;

create or replace function public.concluir_tarefa(p_data date, p_task_id text)
returns public.gamificacao
language plpgsql security definer set search_path = public as $$
declare
  v_user    uuid := (select auth.uid());
  v_tarefas jsonb;
  v_idx     integer;
  v_ja      boolean;
  v_titulo  text;
  v_row     public.gamificacao;
  v_xp      constant integer := 20;   -- espelha XP_PER_TASK no cliente
begin
  if v_user is null then
    raise exception 'nao autenticado';
  end if;

  -- FOR UPDATE trava a linha ate o fim da transacao. Sem isso, dois
  -- cliques quase simultaneos leriam ambos "ainda nao concluida" e
  -- pagariam duas vezes: e o mesmo padrao usado em comprar_item.
  select tarefas into v_tarefas
    from public.planos_diarios
   where user_id = v_user and data = p_data
     for update;

  if v_tarefas is null then
    raise exception 'plano do dia nao encontrado';
  end if;

  select (ord - 1), coalesce((elem ->> 'completed')::boolean, false), elem ->> 'titulo'
    into v_idx, v_ja, v_titulo
    from jsonb_array_elements(v_tarefas) with ordinality as t(elem, ord)
   where elem ->> 'id' = p_task_id;

  if v_idx is null then
    raise exception 'tarefa nao encontrada no plano de hoje';
  end if;

  -- Marca sempre; a operacao e idempotente por natureza.
  update public.planos_diarios
     set tarefas = jsonb_set(tarefas, array[v_idx::text, 'completed'], 'true'::jsonb)
   where user_id = v_user and data = p_data;

  -- Ja tinha pago: devolve o estado atual sem creditar de novo.
  if v_ja then
    select * into v_row from public.gamificacao where user_id = v_user;
    return v_row;
  end if;

  return public.registrar_xp(
    'atividade',
    'Concluiu: ' || coalesce(nullif(v_titulo, ''), 'tarefa do dia'),
    v_xp
  );
end $$;

grant execute on function public.concluir_tarefa(date, text) to authenticated;

commit;

-- =====================================================================
-- Verificacao: chamar duas vezes a mesma tarefa deve creditar UMA vez.
--
--   select xp from public.gamificacao where user_id = auth.uid();
--   select public.concluir_tarefa(current_date, '<id-da-tarefa>');
--   select public.concluir_tarefa(current_date, '<id-da-tarefa>');
--   select xp from public.gamificacao where user_id = auth.uid();
--   -- diferenca esperada: exatamente 20
-- =====================================================================
