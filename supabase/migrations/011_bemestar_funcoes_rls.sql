-- =====================================================================
-- Ampli-IA - FUNCOES, RLS E SEEDS DO MODULO DE BEM-ESTAR
--
-- Roda DEPOIS de 010_bemestar_marketplace_foco.sql (o 010 cria as
-- tabelas e o valor 'psychologist' do enum; um valor novo de enum nao
-- pode ser usado na mesma transacao em que foi criado, por isso a
-- divisao em dois arquivos).
--
-- Estrutura:
--   1. Helper de notificacao (fila)
--   2. Vinculo responsavel <-> aluno
--   3. Marketplace: slots, agendamento, pagamento, sala de video
--   4. Alertas de saude mental e indice de burnout
--   5. Escudo de dopamina (moedas de foco)
--   6. Revisao espacada
--   7. Relatorio semanal e intervencoes da IA
--   8. RLS + policies
--   9. Seeds de demonstracao (psicologos e pilulas de audio)
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Fila de notificacao
--
--    Interna: nao ha grant para authenticated. Quem chama sao as funcoes
--    de agendamento e de alerta. Se o cliente pudesse inserir aqui,
--    qualquer conta mandaria e-mail em nome da plataforma.
-- ---------------------------------------------------------------------
create or replace function public.enfileirar_notificacao(
  p_user    uuid,
  p_canal   public.canal_notificacao,
  p_tipo    text,
  p_titulo  text,
  p_corpo   text,
  p_payload jsonb default '{}'
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.notificacoes (user_id, canal, tipo, titulo, corpo, payload)
  values (p_user, p_canal, p_tipo, left(p_titulo, 160), left(p_corpo, 2000), coalesce(p_payload, '{}'))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.enfileirar_notificacao(uuid, public.canal_notificacao, text, text, text, jsonb)
  from public, anon, authenticated;

-- Avisa TODOS os responsaveis ativos de um aluno, por e-mail e push.
create or replace function public.notificar_responsaveis(
  p_aluno   uuid,
  p_tipo    text,
  p_titulo  text,
  p_corpo   text,
  p_payload jsonb default '{}'
)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_resp uuid; v_n integer := 0;
begin
  for v_resp in
    select responsavel_id from public.vinculos_responsavel
     where aluno_id = p_aluno and status = 'ativo'
  loop
    perform public.enfileirar_notificacao(v_resp, 'email',  p_tipo, p_titulo, p_corpo, p_payload);
    perform public.enfileirar_notificacao(v_resp, 'push',   p_tipo, p_titulo, p_corpo, p_payload);
    perform public.enfileirar_notificacao(v_resp, 'in_app', p_tipo, p_titulo, p_corpo, p_payload);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke all on function public.notificar_responsaveis(uuid, text, text, text, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Vinculo responsavel <-> aluno
-- ---------------------------------------------------------------------

-- O responsavel pede pelo e-mail do aluno. Nao devolve se o e-mail
-- existe ou nao com mensagens diferentes: isso viraria um verificador de
-- cadastro para quem quisesse sondar a base.
create or replace function public.solicitar_vinculo(p_email_aluno text, p_parentesco text default 'responsavel')
returns public.vinculos_responsavel
language plpgsql security definer set search_path = public as $$
declare
  v_resp  uuid := (select auth.uid());
  v_aluno uuid;
  v_row   public.vinculos_responsavel;
begin
  if v_resp is null then raise exception 'nao autenticado'; end if;

  select id into v_aluno from public.perfis
   where lower(email) = lower(trim(p_email_aluno)) and papel = 'student';

  if v_aluno is null then
    raise exception 'Nao encontramos um estudante com esse e-mail.';
  end if;
  if v_aluno = v_resp then
    raise exception 'Nao da para se vincular a si mesmo.';
  end if;

  insert into public.vinculos_responsavel (responsavel_id, aluno_id, parentesco)
  values (v_resp, v_aluno, coalesce(nullif(trim(p_parentesco), ''), 'responsavel'))
  on conflict (responsavel_id, aluno_id) do update
    -- Casts explicitos: sem eles os literais do CASE viram `text` e o
    -- Postgres recusa atribuir a uma coluna de enum (42804).
    set status = case
                   when public.vinculos_responsavel.status = 'ativo'
                     then 'ativo'::public.status_vinculo
                   else 'pendente'::public.status_vinculo
                 end
  returning * into v_row;

  perform public.enfileirar_notificacao(
    v_aluno, 'in_app', 'vinculo',
    'Pedido de acompanhamento',
    'Um responsavel pediu para acompanhar seu progresso. Voce decide se aceita.',
    jsonb_build_object('vinculo_id', v_row.id)
  );

  return v_row;
end $$;

-- Quem aceita e o ALUNO. E o unico jeito honesto: o dado e dele.
create or replace function public.responder_vinculo(p_id uuid, p_aceitar boolean)
returns public.vinculos_responsavel
language plpgsql security definer set search_path = public as $$
declare v_row public.vinculos_responsavel;
begin
  update public.vinculos_responsavel
     set status = case when p_aceitar then 'ativo'::public.status_vinculo else 'recusado'::public.status_vinculo end,
         respondido_em = now()
   where id = p_id and aluno_id = (select auth.uid())
   returning * into v_row;

  if v_row.id is null then raise exception 'vinculo nao encontrado'; end if;

  perform public.enfileirar_notificacao(
    v_row.responsavel_id, 'in_app', 'vinculo',
    case when p_aceitar then 'Acompanhamento liberado' else 'Pedido recusado' end,
    case when p_aceitar then 'O estudante liberou o acompanhamento do progresso.'
         else 'O estudante nao liberou o acompanhamento por enquanto.' end,
    jsonb_build_object('vinculo_id', v_row.id)
  );
  return v_row;
end $$;

-- ---------------------------------------------------------------------
-- 3. Marketplace
-- ---------------------------------------------------------------------

-- Slots livres derivados das janelas semanais, ja descontando o que
-- estiver ocupado. STABLE: nao escreve nada, so calcula.
create or replace function public.slots_livres(
  p_psicologo uuid,
  p_de        date default (now() at time zone 'America/Sao_Paulo')::date,
  p_ate       date default ((now() at time zone 'America/Sao_Paulo')::date + 14)
)
returns table (inicio timestamptz, fim timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_dur  integer;
  v_fuso text;
begin
  select duracao_minutos, fuso into v_dur, v_fuso from public.psicologos where id = p_psicologo;
  if v_dur is null then return; end if;

  return query
  with dias as (
    select d::date as dia from generate_series(p_de, least(p_ate, p_de + 60), interval '1 day') d
  ),
  janelas as (
    select dias.dia, disp.hora_inicio, disp.hora_fim
      from dias
      join public.psicologo_disponibilidade disp
        on disp.psicologo_id = p_psicologo
       and disp.dia_semana = extract(dow from dias.dia)::smallint
  ),
  candidatos as (
    select
      ((janelas.dia + janelas.hora_inicio) at time zone v_fuso)
        + make_interval(mins => g * v_dur) as ini,
      ((janelas.dia + janelas.hora_inicio) at time zone v_fuso)
        + make_interval(mins => (g + 1) * v_dur) as f
      from janelas,
           generate_series(
             0,
             greatest(0, (extract(epoch from (janelas.hora_fim - janelas.hora_inicio)) / 60 / v_dur)::int - 1)
           ) as g
  )
  select c.ini, c.f
    from candidatos c
   where c.ini > now() + interval '2 hours'          -- nada de consulta "para daqui a 5 minutos"
     and not exists (
       select 1 from public.agendamentos a
        where a.psicologo_id = p_psicologo
          and a.status <> 'cancelado'
          and tstzrange(a.inicio, a.fim) && tstzrange(c.ini, c.f)
     )
   order by c.ini;
end $$;

-- Cria a consulta com pagamento PENDENTE. A sala de video e o
-- pagamento so entram depois, por webhook (confirmar_pagamento_consulta).
create or replace function public.agendar_consulta(
  p_psicologo uuid,
  p_aluno     uuid,
  p_inicio    timestamptz,
  p_alerta    uuid default null
)
returns public.agendamentos
language plpgsql security definer set search_path = public as $$
declare
  v_quem   uuid := (select auth.uid());
  v_dur    integer;
  v_valor  integer;
  v_aceita boolean;
  v_row    public.agendamentos;
  v_resp   uuid;
begin
  if v_quem is null then raise exception 'nao autenticado'; end if;

  -- Quem paga e agenda: o proprio aluno ou um responsavel ATIVO dele.
  if v_quem <> p_aluno and not public.sou_responsavel_de(p_aluno) then
    raise exception 'sem permissao para agendar por este estudante';
  end if;
  v_resp := case when v_quem = p_aluno then null else v_quem end;

  select duracao_minutos, valor_centavos, aceita_novos
    into v_dur, v_valor, v_aceita
    from public.psicologos where id = p_psicologo;

  if v_dur is null then raise exception 'psicologo nao encontrado'; end if;
  if not v_aceita then raise exception 'este profissional nao esta aceitando novos pacientes'; end if;
  if p_inicio < now() + interval '1 hour' then raise exception 'escolha um horario com pelo menos 1 hora de antecedencia'; end if;

  -- O horario tem de estar dentro de uma janela declarada. Sem isso, um
  -- POST direto no PostgREST marcaria consulta as 3h da manha.
  if not exists (
    select 1 from public.slots_livres(p_psicologo, (p_inicio at time zone 'America/Sao_Paulo')::date - 1,
                                                   (p_inicio at time zone 'America/Sao_Paulo')::date + 1) s
     where s.inicio = p_inicio
  ) then
    raise exception 'horario indisponivel';
  end if;

  insert into public.agendamentos (
    aluno_id, responsavel_id, psicologo_id, alerta_id,
    inicio, fim, duracao_minutos, valor_centavos, status_pagamento, status
  ) values (
    p_aluno, v_resp, p_psicologo, p_alerta,
    p_inicio, p_inicio + make_interval(mins => v_dur), v_dur, v_valor, 'pendente', 'agendado'
  )
  returning * into v_row;

  if p_alerta is not null then
    update public.alertas_saude_mental
       set status = 'em_atendimento'
     where id = p_alerta and aluno_id = p_aluno;
  end if;

  return v_row;
end $$;

-- Chamada pelo WEBHOOK do provedor de pagamento (service_role), nunca
-- pelo navegador: e ela que marca "pago" e libera a sala. Se estivesse
-- exposta ao cliente, a consulta seria de graca.
create or replace function public.confirmar_pagamento_consulta(
  p_agendamento uuid,
  p_ref         text,
  p_meeting_url text,
  p_provider    text default 'jitsi'
)
returns public.agendamentos
language plpgsql security definer set search_path = public as $$
declare
  v_row  public.agendamentos;
  v_nome text;
  v_quando text;
begin
  update public.agendamentos
     set status_pagamento = 'pago',
         pagamento_ref    = p_ref,
         meeting_url      = p_meeting_url,
         meeting_provider = coalesce(p_provider, 'jitsi'),
         status           = 'confirmado',
         atualizado_em    = now()
   where id = p_agendamento
   returning * into v_row;

  if v_row.id is null then raise exception 'agendamento nao encontrado'; end if;

  select nome into v_nome from public.perfis where id = v_row.psicologo_id;
  v_quando := to_char(v_row.inicio at time zone 'America/Sao_Paulo', 'DD/MM "as" HH24:MI');

  perform public.enfileirar_notificacao(
    v_row.aluno_id, 'email', 'consulta',
    'Sua consulta esta confirmada',
    format('Consulta com %s em %s. Link da sala: %s', coalesce(v_nome, 'seu psicologo'), v_quando, p_meeting_url),
    jsonb_build_object('agendamento_id', v_row.id, 'meeting_url', p_meeting_url, 'inicio', v_row.inicio));

  perform public.enfileirar_notificacao(
    v_row.psicologo_id, 'email', 'consulta',
    'Nova consulta agendada',
    format('Voce tem uma consulta em %s. Link da sala: %s', v_quando, p_meeting_url),
    jsonb_build_object('agendamento_id', v_row.id, 'meeting_url', p_meeting_url, 'inicio', v_row.inicio));

  if v_row.responsavel_id is not null then
    perform public.enfileirar_notificacao(
      v_row.responsavel_id, 'email', 'consulta',
      'Pagamento confirmado',
      format('A consulta de %s esta confirmada. Link da sala: %s', v_quando, p_meeting_url),
      jsonb_build_object('agendamento_id', v_row.id, 'meeting_url', p_meeting_url));
  end if;

  return v_row;
end $$;

revoke all on function public.confirmar_pagamento_consulta(uuid, text, text, text)
  from public, anon, authenticated;

create or replace function public.cancelar_consulta(p_id uuid, p_motivo text default null)
returns public.agendamentos
language plpgsql security definer set search_path = public as $$
declare v_row public.agendamentos; v_quem uuid := (select auth.uid());
begin
  update public.agendamentos a
     set status = 'cancelado',
         observacoes = coalesce(p_motivo, a.observacoes),
         atualizado_em = now()
   where a.id = p_id
     and (a.aluno_id = v_quem or a.responsavel_id = v_quem or a.psicologo_id = v_quem)
     and a.status in ('agendado','confirmado')
   returning * into v_row;

  if v_row.id is null then raise exception 'consulta nao encontrada ou ja encerrada'; end if;
  return v_row;
end $$;

-- ---------------------------------------------------------------------
-- 4. Burnout e alertas
-- ---------------------------------------------------------------------

-- O SCORE vem do modelo que roda no cliente (burnoutModel.ts). O que o
-- banco garante e o resto: 1 linha por dia, faixa 0-100, e o alerta aos
-- pais disparado no maximo uma vez por dia por tipo - senao uma tarde
-- ruim viraria 40 e-mails.
create or replace function public.registrar_burnout(
  p_score    integer,
  p_classe   public.classe_burnout,
  p_features jsonb default '{}'
)
returns table (indice_id bigint, alerta_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := (select auth.uid());
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_score  integer := greatest(0, least(coalesce(p_score, 0), 100));
  v_idx    bigint;
  v_alerta uuid := null;
  v_nome   text;
  v_sev    public.severidade_alerta;
begin
  if v_user is null then raise exception 'nao autenticado'; end if;

  insert into public.indice_burnout (user_id, data, score, classe, features)
  values (v_user, v_hoje, v_score, p_classe, coalesce(p_features, '{}'))
  on conflict (user_id, data) do update
    set score = excluded.score, classe = excluded.classe, features = excluded.features
  returning id into v_idx;

  if p_classe in ('fadiga','esgotamento') then
    -- Um alerta por dia por aluno: reabrir o app nao pode reenviar.
    if not exists (
      select 1 from public.alertas_saude_mental
       where aluno_id = v_user and tipo = 'burnout'
         and criado_em >= v_hoje::timestamptz
    ) then
      select nome into v_nome from public.perfis where id = v_user;
      v_sev := case when p_classe = 'esgotamento' then 'critico'::public.severidade_alerta
                    else 'alto'::public.severidade_alerta end;

      insert into public.alertas_saude_mental (aluno_id, tipo, severidade, score, gatilho, mensagem)
      values (v_user, 'burnout', v_sev, v_score, coalesce(p_features, '{}'),
              format('Sinais de %s detectados nos ultimos dias de estudo de %s.',
                     case when p_classe = 'esgotamento' then 'esgotamento' else 'fadiga acumulada' end,
                     coalesce(v_nome, 'seu filho(a)')))
      returning id into v_alerta;

      perform public.notificar_responsaveis(
        v_user, 'alerta_saude',
        'Sinal de esgotamento no estudo',
        format('A curva de estresse de %s subiu (indice %s/100). Vale conversar - e, se fizer sentido, agendar um atendimento pelo painel.',
               coalesce(v_nome, 'seu filho(a)'), v_score),
        jsonb_build_object('alerta_id', v_alerta, 'score', v_score, 'classe', p_classe));
    end if;
  end if;

  return query select v_idx, v_alerta;
end $$;

create or replace function public.marcar_alerta(p_id uuid, p_status public.status_alerta)
returns public.alertas_saude_mental
language plpgsql security definer set search_path = public as $$
declare v_row public.alertas_saude_mental;
begin
  update public.alertas_saude_mental a
     set status = p_status,
         visto_em     = case when p_status = 'visto'     then now() else a.visto_em end,
         resolvido_em = case when p_status = 'resolvido' then now() else a.resolvido_em end
   where a.id = p_id
     and (a.aluno_id = (select auth.uid()) or public.sou_responsavel_de(a.aluno_id))
   returning * into v_row;
  if v_row.id is null then raise exception 'alerta nao encontrado'; end if;
  return v_row;
end $$;

-- ---------------------------------------------------------------------
-- 5. Escudo de dopamina - moedas de foco
--
--    O cliente informa inicio, fim e interrupcoes; o servidor RECALCULA
--    os minutos pelo relogio dele e aplica o mesmo formulario de
--    focusShield.ts. Aceitar "minutos" do cliente seria aceitar saldo
--    infinito de um fetch no console.
-- ---------------------------------------------------------------------
create or replace function public.creditar_moedas_foco(
  p_inicio       timestamptz,
  p_fim          timestamptz,
  p_interrupcoes integer default 0,
  p_modo         text default 'enem'
)
returns table (saldo integer, moedas_creditadas integer, minutos integer)
language plpgsql security definer set search_path = public as $$
declare
  v_user      uuid := (select auth.uid());
  v_min       integer;
  v_int       integer := greatest(0, least(coalesce(p_interrupcoes, 0), 50));
  v_modo      text := case when p_modo in ('enem','leve','maratona') then p_modo else 'enem' end;
  v_mult_modo numeric;
  v_mult_faixa numeric;
  v_moedas    integer;
  v_hoje_total integer;
  v_saldo     integer;
  TETO_DIARIO constant integer := 500;
begin
  if v_user is null then raise exception 'nao autenticado'; end if;
  if p_fim <= p_inicio then raise exception 'intervalo invalido'; end if;
  if p_fim > now() + interval '2 minutes' then raise exception 'sessao no futuro'; end if;
  if p_inicio < now() - interval '24 hours' then raise exception 'sessao antiga demais'; end if;

  -- Minutos reais, com teto de 4h por sessao.
  v_min := least(240, floor(extract(epoch from (p_fim - p_inicio)) / 60)::int);

  -- Espelha TIERS em src/shared/lib/focusShield.ts
  v_mult_faixa := case
    when v_min < 5  then 0
    when v_min < 15 then 0.5
    when v_min < 25 then 1.0
    when v_min < 50 then 1.25
    when v_min < 90 then 1.5
    else 1.75 end;

  v_mult_modo := case v_modo when 'leve' then 0.8 when 'maratona' then 1.2 else 1.0 end;

  v_moedas := floor(
    v_min * v_mult_faixa * v_mult_modo * greatest(0.4, 1 - 0.1 * v_int)
  )::int;

  -- Teto diario: o resto da sessao ainda e registrado, mas nao paga.
  select coalesce(sum(s.moedas_creditadas), 0) into v_hoje_total
    from public.sessoes_offline s
   where s.user_id = v_user
     and s.inicio >= (now() at time zone 'America/Sao_Paulo')::date::timestamptz;

  v_moedas := greatest(0, least(v_moedas, TETO_DIARIO - v_hoje_total));

  insert into public.sessoes_offline (user_id, inicio, fim, minutos_offline, interrupcoes, modo, moedas_creditadas)
  values (v_user, p_inicio, p_fim, v_min, v_int, v_modo, v_moedas);

  insert into public.carteira_foco (user_id) values (v_user) on conflict (user_id) do nothing;

  update public.carteira_foco c
     set saldo = c.saldo + v_moedas,
         total_ganho = c.total_ganho + v_moedas,
         atualizado_em = now()
   where c.user_id = v_user
   returning c.saldo into v_saldo;

  if v_moedas > 0 then
    insert into public.extrato_foco (user_id, delta, motivo)
    values (v_user, v_moedas, format('%s min offline (%s)', v_min, v_modo));
  end if;

  return query select v_saldo, v_moedas, v_min;
end $$;

create or replace function public.gastar_moedas_foco(p_quantidade integer, p_motivo text)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_user uuid := (select auth.uid()); v_saldo integer; v_q integer := greatest(1, coalesce(p_quantidade, 0));
begin
  if v_user is null then raise exception 'nao autenticado'; end if;

  -- O CHECK (saldo >= 0) da tabela e a rede de seguranca real; este
  -- update condicional so devolve um erro legivel antes de esbarrar nela.
  update public.carteira_foco c
     set saldo = c.saldo - v_q,
         total_gasto = c.total_gasto + v_q,
         atualizado_em = now()
   where c.user_id = v_user and c.saldo >= v_q
   returning c.saldo into v_saldo;

  if v_saldo is null then raise exception 'saldo insuficiente'; end if;

  insert into public.extrato_foco (user_id, delta, motivo) values (v_user, -v_q, left(p_motivo, 120));
  return v_saldo;
end $$;

-- ---------------------------------------------------------------------
-- 6. Revisao espacada (mesma matematica de src/shared/lib/srsEngine.ts)
-- ---------------------------------------------------------------------
create or replace function public.registrar_revisao(
  p_topico_id   text,
  p_topico_nome text,
  p_materia     text,
  p_nota        integer
)
returns public.revisoes_espacadas
language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid := (select auth.uid());
  v_hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  v_atual public.revisoes_espacadas;
  v_nivel smallint;
  v_ef    numeric(3,2);
  v_q     numeric;
  v_int   smallint;
  v_base  constant smallint[] := array[1,3,7,21,45,90];
  v_row   public.revisoes_espacadas;
begin
  if v_user is null then raise exception 'nao autenticado'; end if;

  select * into v_atual from public.revisoes_espacadas
   where user_id = v_user and topico_id = p_topico_id;

  v_nivel := coalesce(v_atual.nivel_memoria, 0);
  v_ef    := coalesce(v_atual.facilidade, 2.50);
  v_q     := round(greatest(0, least(coalesce(p_nota, 0), 100)) / 20.0);  -- 0..5, escala SM-2

  -- Fator de facilidade (SM-2). Piso 1.30: abaixo disso o intervalo
  -- encolhe tanto que o topico volta todo dia e o aluno desiste dele.
  v_ef := greatest(1.30, least(3.00, v_ef + (0.1 - (5 - v_q) * (0.08 + (5 - v_q) * 0.02))));

  if p_nota >= 80 then
    v_nivel := least(5, v_nivel + 1);
  elsif p_nota < 60 then
    v_nivel := 0;   -- errou feio: a curva reinicia
  end if;

  v_int := greatest(1, round(v_base[v_nivel + 1] * (v_ef / 2.5))::int);
  if p_nota < 60 then v_int := 1; end if;

  insert into public.revisoes_espacadas (
    user_id, topico_id, topico_nome, materia, nivel_memoria,
    intervalo_dias, facilidade, ultima_nota, revisoes_feitas, proxima_revisao, ultima_revisao
  ) values (
    v_user, p_topico_id, left(p_topico_nome, 120), coalesce(p_materia, ''), v_nivel,
    v_int, v_ef, p_nota, 1, v_hoje + v_int, v_hoje
  )
  on conflict (user_id, topico_id) do update set
    topico_nome     = excluded.topico_nome,
    materia         = excluded.materia,
    nivel_memoria   = excluded.nivel_memoria,
    intervalo_dias  = excluded.intervalo_dias,
    facilidade      = excluded.facilidade,
    ultima_nota     = excluded.ultima_nota,
    revisoes_feitas = public.revisoes_espacadas.revisoes_feitas + 1,
    proxima_revisao = excluded.proxima_revisao,
    ultima_revisao  = excluded.ultima_revisao
  returning * into v_row;

  return v_row;
end $$;

-- ---------------------------------------------------------------------
-- 7. Relatorio semanal e intervencoes da IA
-- ---------------------------------------------------------------------
create or replace function public.salvar_relatorio_semanal(
  p_semana_inicio date,
  p_texto         text,
  p_metricas      jsonb default '{}'
)
returns public.relatorios_semanais
language plpgsql security definer set search_path = public as $$
declare v_user uuid := (select auth.uid()); v_row public.relatorios_semanais;
begin
  if v_user is null then raise exception 'nao autenticado'; end if;

  insert into public.relatorios_semanais (user_id, semana_inicio, texto_gerado, metricas)
  values (v_user, p_semana_inicio, p_texto, coalesce(p_metricas, '{}'))
  on conflict (user_id, semana_inicio) do update
    set texto_gerado = excluded.texto_gerado,
        metricas     = excluded.metricas,
        gatilho_em   = now()
  returning * into v_row;

  -- O responsavel tambem recebe a versao positiva da semana. O painel
  -- dele nao pode ser so alerta vermelho.
  perform public.notificar_responsaveis(
    v_user, 'relatorio_semanal', 'Resumo da semana',
    left(p_texto, 400),
    jsonb_build_object('semana', p_semana_inicio));

  return v_row;
end $$;

create or replace function public.registrar_intervencao(
  p_tipo     text,
  p_mensagem text,
  p_gatilho  jsonb default '{}'
)
returns bigint
language plpgsql security definer set search_path = public as $$
declare v_user uuid := (select auth.uid()); v_id bigint;
begin
  if v_user is null then raise exception 'nao autenticado'; end if;
  insert into public.log_intervencoes_ia (user_id, tipo, mensagem, gatilho)
  values (v_user, p_tipo, left(p_mensagem, 1000), coalesce(p_gatilho, '{}'))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.responder_intervencao(p_id bigint, p_aceita boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.log_intervencoes_ia
     set aceita = p_aceita, respondida_em = now()
   where id = p_id and user_id = (select auth.uid());
end $$;

-- ---------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------
alter table public.vinculos_responsavel      enable row level security;
alter table public.psicologos                enable row level security;
alter table public.psicologo_disponibilidade enable row level security;
alter table public.alertas_saude_mental      enable row level security;
alter table public.agendamentos              enable row level security;
alter table public.notificacoes              enable row level security;
alter table public.push_assinaturas          enable row level security;
alter table public.sessoes_offline           enable row level security;
alter table public.carteira_foco             enable row level security;
alter table public.extrato_foco              enable row level security;
alter table public.telemetria_estudo         enable row level security;
alter table public.indice_burnout            enable row level security;
alter table public.modulos_audio             enable row level security;
alter table public.progresso_audio           enable row level security;
alter table public.revisoes_espacadas        enable row level security;
alter table public.log_intervencoes_ia       enable row level security;
alter table public.relatorios_semanais       enable row level security;

-- Tabelas 100% do aluno: mesma regra do 003, em laco.
do $$
declare t text;
begin
  foreach t in array array[
    'sessoes_offline','extrato_foco','telemetria_estudo',
    'progresso_audio','revisoes_espacadas','log_intervencoes_ia'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t||'_sel', t);
    execute format('drop policy if exists %I on public.%I', t||'_ins', t);
    execute format('drop policy if exists %I on public.%I', t||'_upd', t);
    execute format('drop policy if exists %I on public.%I', t||'_del', t);
    execute format('create policy %I on public.%I for select using ((select auth.uid()) = user_id)', t||'_sel', t);
    execute format('create policy %I on public.%I for insert with check ((select auth.uid()) = user_id)', t||'_ins', t);
    execute format('create policy %I on public.%I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t||'_upd', t);
    execute format('create policy %I on public.%I for delete using ((select auth.uid()) = user_id)', t||'_del', t);
  end loop;
end $$;

-- Carteira: o aluno LE, mas nao escreve. Saldo so muda por RPC.
drop policy if exists carteira_sel on public.carteira_foco;
create policy carteira_sel on public.carteira_foco for select using ((select auth.uid()) = user_id);

-- Indice de burnout: aluno le o proprio; responsavel ativo le o do filho.
-- Escrita so por registrar_burnout().
drop policy if exists burnout_sel on public.indice_burnout;
create policy burnout_sel on public.indice_burnout for select
  using ((select auth.uid()) = user_id or public.sou_responsavel_de(user_id));

-- Relatorio semanal: mesma logica (o pai ve o texto positivo).
drop policy if exists relatorios_sel on public.relatorios_semanais;
create policy relatorios_sel on public.relatorios_semanais for select
  using ((select auth.uid()) = user_id or public.sou_responsavel_de(user_id));
drop policy if exists relatorios_upd on public.relatorios_semanais;
create policy relatorios_upd on public.relatorios_semanais for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Vinculos: cada lado enxerga os seus.
drop policy if exists vinculos_sel on public.vinculos_responsavel;
create policy vinculos_sel on public.vinculos_responsavel for select
  using ((select auth.uid()) in (responsavel_id, aluno_id));
drop policy if exists vinculos_del on public.vinculos_responsavel;
create policy vinculos_del on public.vinculos_responsavel for delete
  using ((select auth.uid()) in (responsavel_id, aluno_id));
-- INSERT/UPDATE so por solicitar_vinculo/responder_vinculo.

-- Catalogo publico para quem esta logado; o profissional edita a propria ficha.
drop policy if exists psicologos_sel on public.psicologos;
create policy psicologos_sel on public.psicologos for select to authenticated using (true);
drop policy if exists psicologos_upd on public.psicologos;
create policy psicologos_upd on public.psicologos for update
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists psicologos_ins on public.psicologos;
create policy psicologos_ins on public.psicologos for insert
  with check ((select auth.uid()) = id and public.sou_psicologo());

drop policy if exists disp_sel on public.psicologo_disponibilidade;
create policy disp_sel on public.psicologo_disponibilidade for select to authenticated using (true);
drop policy if exists disp_all on public.psicologo_disponibilidade;
create policy disp_all on public.psicologo_disponibilidade for all
  using ((select auth.uid()) = psicologo_id) with check ((select auth.uid()) = psicologo_id);

-- Alertas: aluno, responsavel ativo e o psicologo que atende.
drop policy if exists alertas_sel on public.alertas_saude_mental;
create policy alertas_sel on public.alertas_saude_mental for select using (
  (select auth.uid()) = aluno_id
  or public.sou_responsavel_de(aluno_id)
  or public.atendo_o_aluno(aluno_id)
);
-- Escrita apenas por registrar_burnout()/marcar_alerta().

-- Agendamentos: as tres pontas leem; escrita so por RPC.
drop policy if exists agendamentos_sel on public.agendamentos;
create policy agendamentos_sel on public.agendamentos for select using (
  (select auth.uid()) in (aluno_id, responsavel_id, psicologo_id)
);

drop policy if exists notif_sel on public.notificacoes;
create policy notif_sel on public.notificacoes for select using ((select auth.uid()) = user_id);
drop policy if exists notif_upd on public.notificacoes;
create policy notif_upd on public.notificacoes for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists push_all on public.push_assinaturas;
create policy push_all on public.push_assinaturas for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Pilulas de audio: catalogo publico, criacao so por educador/admin.
drop policy if exists audio_sel on public.modulos_audio;
create policy audio_sel on public.modulos_audio for select to authenticated
  using (publico or criado_por = (select auth.uid()));
drop policy if exists audio_ins on public.modulos_audio;
create policy audio_ins on public.modulos_audio for insert
  with check (public.sou_educador() and criado_por = (select auth.uid()));
drop policy if exists audio_upd on public.modulos_audio;
create policy audio_upd on public.modulos_audio for update
  using (criado_por = (select auth.uid())) with check (criado_por = (select auth.uid()));

-- Catalogo publico de psicologos.
--
-- POR QUE UMA VIEW, E NAO UM JOIN NO CLIENTE
-- A ficha do profissional vive em `psicologos`, mas o NOME vive em
-- `perfis` - e a RLS de perfis (com razao) nao deixa um aluno ler a
-- linha de outra pessoa. Um embed PostgREST devolveria nome nulo e, com
-- !inner, catalogo vazio.
--
-- Uma view roda com os privilegios do DONO e por isso enxerga perfis.
-- Mesmo padrao da view `ranking` do 003. O filtro de exposicao fica
-- DENTRO dela: so psicologos, e so nome e avatar - nunca e-mail.
create or replace view public.catalogo_psicologos as
  select ps.id, p.nome, p.avatar_url,
         ps.crp, ps.bio, ps.especialidades, ps.abordagem,
         ps.valor_centavos, ps.duracao_minutos, ps.foto_url,
         ps.aceita_novos, ps.atende_adolescente, ps.nota_media,
         ps.total_atendimentos, ps.fuso
    from public.psicologos ps
    join public.perfis p on p.id = ps.id
   where p.papel::text = 'psychologist';   -- ::text: ver nota em sou_psicologo() no 010

grant select on public.catalogo_psicologos to authenticated;

-- Perfis: o responsavel precisa ver nome/e-mail do filho vinculado, e o
-- psicologo o de quem ele atende. Sem isto o painel mostra um uuid.
drop policy if exists perfis_sel_responsavel on public.perfis;
create policy perfis_sel_responsavel on public.perfis for select
  using (public.sou_responsavel_de(id) or public.atendo_o_aluno(id));

-- E o aluno precisa ver QUEM pediu para acompanha-lo - decidir sobre um
-- pedido anonimo nao e decidir.
create or replace function public.pediu_vinculo_comigo(p_pessoa uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vinculos_responsavel
     where responsavel_id = p_pessoa
       and aluno_id = (select auth.uid())
       and status in ('pendente','ativo')
  );
$$;

drop policy if exists perfis_sel_solicitante on public.perfis;
create policy perfis_sel_solicitante on public.perfis for select
  using (public.pediu_vinculo_comigo(id));

-- Gamificacao e sessoes de foco: leitura para o responsavel vinculado.
-- E o que sustenta os cards de "constancia" e "tempo offline" do painel.
drop policy if exists gamificacao_sel_responsavel on public.gamificacao;
create policy gamificacao_sel_responsavel on public.gamificacao for select
  using (public.sou_responsavel_de(user_id));

drop policy if exists foco_sel_responsavel on public.sessoes_foco;
create policy foco_sel_responsavel on public.sessoes_foco for select
  using (public.sou_responsavel_de(user_id));

drop policy if exists offline_sel_responsavel on public.sessoes_offline;
create policy offline_sel_responsavel on public.sessoes_offline for select
  using (public.sou_responsavel_de(user_id));

drop policy if exists quiz_sel_responsavel on public.quiz_resultados;
create policy quiz_sel_responsavel on public.quiz_resultados for select
  using (public.sou_responsavel_de(user_id));

-- NAO ha policy de responsavel em chat_mensagens, notas nem
-- humor_historico: o painel dos pais mostra TENDENCIA, nao o diario do
-- filho. Ler a conversa com o mentor quebraria a confianca que faz o
-- aluno escrever ali.

-- ---------------------------------------------------------------------
-- 9. Seeds de demonstracao
--
--    Os psicologos de exemplo NAO tem conta em auth.users, e a tabela
--    referencia perfis. Entao o seed abaixo so cria pilulas de audio
--    (que nao dependem de usuario) e deixa pronta a funcao que registra
--    um profissional a partir de uma conta ja existente.
-- ---------------------------------------------------------------------
create or replace function public.registrar_psicologo(
  p_email       text,
  p_crp         text,
  p_bio         text default '',
  p_espec       text[] default '{}',
  p_valor_reais numeric default 120
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.perfis where lower(email) = lower(p_email);
  if v_id is null then raise exception 'crie a conta % pelo app antes de registra-la como psicologo', p_email; end if;

  update public.perfis set papel = 'psychologist' where id = v_id;

  insert into public.psicologos (id, crp, bio, especialidades, valor_centavos)
  values (v_id, p_crp, p_bio, p_espec, (p_valor_reais * 100)::int)
  on conflict (id) do update
    set crp = excluded.crp, bio = excluded.bio,
        especialidades = excluded.especialidades, valor_centavos = excluded.valor_centavos;

  -- Agenda padrao: seg a sex, 14h-20h (turno que combina com aluno do
  -- noturno). O profissional ajusta depois na propria tela.
  insert into public.psicologo_disponibilidade (psicologo_id, dia_semana, hora_inicio, hora_fim)
  select v_id, d, time '14:00', time '20:00' from generate_series(1,5) d
  on conflict do nothing;

  return v_id;
end $$;

revoke all on function public.registrar_psicologo(text, text, text, text[], numeric)
  from public, anon, authenticated;

insert into public.modulos_audio (materia, topico, titulo, resumo, roteiro, duracao_segundos)
select * from (values
  ('Biologia', 'Citologia', 'Organelas em 3 minutos',
   'O essencial de mitocondria, ribossomo e complexo golgiense.',
   'Se a celula fosse uma cidade, a mitocondria seria a usina de energia... [roteiro completo gerado pela IA no primeiro play]', 180),
  ('Historia', 'Era Vargas', 'Era Vargas sem decoreba',
   'Os tres periodos e o que o ENEM costuma cobrar de cada um.',
   'Getulio chega ao poder em 1930 e fica quinze anos... [roteiro completo gerado pela IA no primeiro play]', 190),
  ('Quimica', 'Estequiometria', 'Mol: o que e, afinal',
   'A ideia de quantidade de materia explicada pelo cotidiano.',
   'Mol e so um jeito de contar coisas muito pequenas... [roteiro completo gerado pela IA no primeiro play]', 170),
  ('Matematica', 'Funcao do 1o grau', 'Funcao afim no supermercado',
   'Coeficiente angular e linear com exemplo de conta de luz.',
   'Toda vez que voce paga uma taxa fixa mais um valor por unidade... [roteiro completo gerado pela IA no primeiro play]', 165),
  ('Redacao', 'Repertorio', 'Tres repertorios coringa',
   'Referencias que servem em quase qualquer tema social.',
   'Guarde estes tres: a Constituicao de 88, o conceito de nao-lugar de Auge... [roteiro completo gerado pela IA no primeiro play]', 200)
) as seed(materia, topico, titulo, resumo, roteiro, duracao_segundos)
where not exists (select 1 from public.modulos_audio);

commit;
