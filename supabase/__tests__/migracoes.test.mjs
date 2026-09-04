import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * As migracoes rodando num Postgres DE VERDADE (PGlite em WASM), com RLS
 * ligada e usuarios reais.
 *
 * POR QUE ISTO EXISTE
 * Teste de unidade em TypeScript nao alcanca nada do que mais importa
 * neste projeto: policy de RLS, constraint de exclusao, SECURITY DEFINER
 * e a formula de moedas que vive duplicada no banco. Na primeira
 * execucao, este arquivo pegou tres defeitos reais que passariam direto
 * no build e so apareceriam ao colar o SQL no Supabase:
 *
 *   1. uso de valor de enum recem-criado na mesma transacao;
 *   2. funcao SQL declarada antes da tabela que ela consulta;
 *   3. CASE devolvendo `text` para uma coluna de enum.
 *
 * O ambiente emula o minimo do Supabase: schema auth, auth.users,
 * auth.uid() lendo uma GUC, e os papeis anon/authenticated.
 */

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MIGRACOES = path.join(AQUI, '..', 'migrations');

const ARQUIVOS = [
  '003_schema_completo.sql',
  '004_fix_recursao_ligas.sql',
  '005_loja_compra_servidor.sql',
  '006_ligas_e_comunidade.sql',
  '007_entrada_por_codigo.sql',
  '008_corrige_nivel.sql',
  '009_tarefa_idempotente.sql',
  '010_bemestar_marketplace_foco.sql',
  '011_bemestar_funcoes_rls.sql',
  '012_persona_ativa_texto.sql',
  '013_redacao_por_foto.sql',
];

let db;
let aluno;
let responsavel;
let psicologo;
let estranho;

/** Executa como usuario comum: RLS aplicada e auth.uid() = uid. */
async function comoUsuario(uid, sql, params = []) {
  await db.exec('begin');
  try {
    await db.query(`select set_config('app.uid', $1, true)`, [uid]);
    await db.exec('set local role authenticated');
    const r = await db.query(sql, params);
    await db.exec('reset role');
    await db.exec('commit');
    return r;
  } catch (e) {
    await db.exec('rollback');
    throw e;
  }
}

const linhas = async (uid, sql, params) => (await comoUsuario(uid, sql, params)).rows;
const primeira = async (uid, sql, params) => (await comoUsuario(uid, sql, params)).rows[0];

beforeAll(async () => {
  db = await PGlite.create({ extensions: { btree_gist } });

  await db.exec(`
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key default gen_random_uuid(), email text unique,
      raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('app.uid', true), '')::uuid $$;
    do $$ begin create role anon; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role; exception when duplicate_object then null; end $$;
    grant usage on schema public to anon, authenticated, service_role;
  `);

  for (const arquivo of ARQUIVOS) {
    await db.exec(fs.readFileSync(path.join(MIGRACOES, arquivo), 'utf8'));
  }

  // No Supabase o papel authenticated ja vem com grant nas tabelas do
  // schema public; aqui isso e reproduzido depois das migracoes.
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage, select on all sequences in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    revoke insert, update, delete on public.gamificacao from authenticated;
    revoke insert, update, delete on public.carteira_foco from authenticated;
    revoke all on function public.confirmar_pagamento_consulta(uuid, text, text, text) from authenticated;
  `);

  const criar = async (email, nome) =>
    (await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1::text, jsonb_build_object('nome', $2::text)) returning id`,
      [email, nome],
    )).rows[0].id;

  aluno = await criar('aluno@test.br', 'Ana Aluna');
  responsavel = await criar('mae@test.br', 'Marta Mae');
  psicologo = await criar('psi@test.br', 'Dra. Paula');
  estranho = await criar('outro@test.br', 'Outro Aluno');

  await db.query(`update public.perfis set papel='parent' where id=$1`, [responsavel]);
  await db.query(
    `select public.registrar_psicologo('psi@test.br','CRP 06/12345','Atende adolescentes.', array['ansiedade'], 150)`,
  );
}, 120_000);

describe('estrutura', () => {
  it('cria as 17 tabelas do modulo', async () => {
    const esperadas = [
      'psicologos','psicologo_disponibilidade','vinculos_responsavel','alertas_saude_mental',
      'agendamentos','notificacoes','push_assinaturas','sessoes_offline','carteira_foco',
      'extrato_foco','telemetria_estudo','indice_burnout','modulos_audio','progresso_audio',
      'revisoes_espacadas','log_intervencoes_ia','relatorios_semanais',
    ];
    const r = await db.query(
      `select table_name from information_schema.tables where table_schema='public'`);
    const nomes = r.rows.map((x) => x.table_name);
    for (const t of esperadas) expect(nomes).toContain(t);
  });

  it('nenhuma tabela do schema public fica sem RLS', async () => {
    const r = await db.query(`
      select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`);
    expect(r.rows.map((x) => x.relname)).toEqual([]);
  });

  it('o trigger de signup cria perfil para cada conta', async () => {
    const r = await db.query('select count(*)::int n from public.perfis');
    expect(r.rows[0].n).toBe(4);
  });

  it('a persona ativa cabe em texto (professores embutidos tem id nao-numerico)', async () => {
    const r = await db.query(`
      select data_type from information_schema.columns
       where table_schema='public' and table_name='preferencias'
         and column_name='persona_ativa_id'`);
    expect(r.rows[0].data_type).toBe('text');

    // O caso que o bigint quebrava: gravar 'prof_matematica'.
    const [perfil] = (await db.query('select id from public.perfis limit 1')).rows;
    await db.query(
      `update public.preferencias set persona_ativa_id = 'prof_matematica' where user_id = $1`,
      [perfil.id]);
    const salvo = await db.query(
      'select persona_ativa_id from public.preferencias where user_id = $1', [perfil.id]);
    expect(salvo.rows[0].persona_ativa_id).toBe('prof_matematica');
  });

  it('redacoes ganha as colunas da correcao por foto', async () => {
    const r = await db.query(`
      select column_name, data_type from information_schema.columns
       where table_schema='public' and table_name='redacoes'
         and column_name in ('origem','imagem_path','transcricao','feedback_competencias')`);
    const cols = Object.fromEntries(r.rows.map((x) => [x.column_name, x.data_type]));

    expect(Object.keys(cols).sort()).toEqual(
      ['feedback_competencias', 'imagem_path', 'origem', 'transcricao'],
    );
    expect(cols.feedback_competencias).toBe('jsonb');

    // A mesma tabela guarda digitada e fotografada: e o que mantem o
    // historico do aluno num lugar so.
    const [perfil] = (await db.query('select id from public.perfis limit 1')).rows;
    await db.query(`
      insert into public.redacoes (user_id, tema, nota_final, competencia1, competencia2,
        competencia3, competencia4, competencia5, origem, imagem_path, transcricao, feedback_competencias)
      values ($1,'Inclusao digital',880,160,200,160,200,160,'foto','uid/x.jpg','texto',
              '{"competence_1":{"score":160}}'::jsonb)`, [perfil.id]);

    const salva = await db.query(
      `select origem, feedback_competencias->'competence_1'->>'score' as c1
         from public.redacoes where origem='foto'`);
    expect(salva.rows[0]).toEqual({ origem: 'foto', c1: '160' });
  });

  it('recusa origem fora do dominio conhecido', async () => {
    const [perfil] = (await db.query('select id from public.perfis limit 1')).rows;
    await expect(
      db.query(`
        insert into public.redacoes (user_id, nota_final, competencia1, competencia2,
          competencia3, competencia4, competencia5, origem)
        values ($1, 500, 100, 100, 100, 100, 100, 'inventada')`, [perfil.id]),
    ).rejects.toThrow();
  });

  it('traz o catalogo inicial de pilulas de audio', async () => {
    const r = await db.query('select count(*)::int n from public.modulos_audio');
    expect(r.rows[0].n).toBeGreaterThan(0);
  });
});

describe('marketplace', () => {
  it('o aluno ve o catalogo com nome, mas sem e-mail do profissional', async () => {
    const [ficha] = await linhas(aluno, 'select * from public.catalogo_psicologos');
    expect(ficha.nome).toBe('Dra. Paula');
    expect(ficha.valor_centavos).toBe(15000);
    expect(Object.keys(ficha)).not.toContain('email');
  });

  it('slots_livres deriva horarios das janelas semanais', async () => {
    const slots = await linhas(aluno, 'select * from public.slots_livres($1) limit 5', [psicologo]);
    expect(slots.length).toBeGreaterThan(0);
  });

  it('o vinculo so libera dados depois do aceite do aluno', async () => {
    const pedido = await primeira(responsavel, `select * from public.solicitar_vinculo('aluno@test.br','mae')`);
    expect(pedido.status).toBe('pendente');

    const antes = await primeira(responsavel,
      'select count(*)::int n from public.indice_burnout where user_id=$1', [aluno]);
    expect(antes.n).toBe(0);

    await comoUsuario(aluno, 'select public.responder_vinculo($1, true)', [pedido.id]);
    const depois = await db.query('select status from public.vinculos_responsavel');
    expect(depois.rows[0].status).toBe('ativo');
  });

  it('agenda, barra horario ocupado e barra quem nao tem vinculo', async () => {
    const slots = await linhas(responsavel, 'select * from public.slots_livres($1) limit 3', [psicologo]);
    const horario = slots[0].inicio;

    const consulta = await primeira(responsavel,
      'select * from public.agendar_consulta($1,$2,$3,null)', [psicologo, aluno, horario]);
    expect(consulta.status_pagamento).toBe('pendente');
    expect(consulta.meeting_url).toBeNull();
    expect(consulta.valor_centavos).toBe(15000);

    // EXCLUDE: e o unico jeito de impedir corrida entre dois cliques.
    await expect(
      comoUsuario(responsavel, 'select * from public.agendar_consulta($1,$2,$3,null)', [psicologo, aluno, horario]),
    ).rejects.toThrow();

    await expect(
      comoUsuario(responsavel,
        `select * from public.agendar_consulta($1,$2, now() + interval '10 days' + interval '3 hours', null)`,
        [psicologo, aluno]),
    ).rejects.toThrow(/indisponivel/);

    await expect(
      comoUsuario(estranho, 'select * from public.agendar_consulta($1,$2,$3,null)',
        [psicologo, aluno, slots[1].inicio]),
    ).rejects.toThrow(/permissao/);
  });

  it('so o webhook (service_role) confirma pagamento e cria a sala', async () => {
    const [consulta] = await db.query(
      `select id from public.agendamentos where status_pagamento='pendente' limit 1`).then((r) => r.rows);

    await expect(
      comoUsuario(responsavel, `select public.confirmar_pagamento_consulta($1,'x','https://meet','jitsi')`, [consulta.id]),
    ).rejects.toThrow();

    await db.query(
      `select public.confirmar_pagamento_consulta($1,'mp-123','https://meet.jit.si/ampli-abc','jitsi')`, [consulta.id]);

    const r = await db.query('select status_pagamento, meeting_url from public.agendamentos where id=$1', [consulta.id]);
    expect(r.rows[0].status_pagamento).toBe('pago');
    expect(r.rows[0].meeting_url).toMatch(/^https:\/\//);

    // Aluno, responsavel e psicologo sao avisados.
    const avisos = await db.query(`select count(*)::int n from public.notificacoes where tipo='consulta'`);
    expect(avisos.rows[0].n).toBe(3);
  });
});

describe('escudo de dopamina', () => {
  const creditar = (min, interrupcoes = 0, modo = 'enem') =>
    primeira(aluno,
      `select * from public.creditar_moedas_foco(now() - make_interval(mins => $1::int), now(), $2::int, $3)`,
      [min, interrupcoes, modo]);

  it('a formula do banco bate com a de focusShield.ts', async () => {
    expect((await creditar(25)).moedas_creditadas).toBe(31);
    expect((await creditar(60, 3)).moedas_creditadas).toBe(63);
    expect((await creditar(4)).moedas_creditadas).toBe(0);
  });

  it('recalcula os minutos pelo relogio do servidor', async () => {
    const r = await primeira(aluno,
      `select * from public.creditar_moedas_foco(now() - interval '10 minutes', now(), 0, 'maratona')`);
    expect(r.minutos).toBe(10);
  });

  it('recusa sessao no futuro', async () => {
    await expect(
      comoUsuario(aluno, `select * from public.creditar_moedas_foco(now(), now() + interval '2 hours', 0, 'enem')`),
    ).rejects.toThrow();
  });

  it('respeita o teto diario', async () => {
    await creditar(240, 0, 'maratona');
    const carteira = await primeira(aluno, 'select total_ganho from public.carteira_foco');
    expect(carteira.total_ganho).toBeLessThanOrEqual(500);
  });

  it('nao deixa gastar mais do que tem nem escrever o saldo direto', async () => {
    await expect(
      comoUsuario(aluno, `select public.gastar_moedas_foco(99999,'teste')`),
    ).rejects.toThrow(/insuficiente/);

    const antes = await primeira(aluno, 'select saldo from public.carteira_foco');
    await comoUsuario(aluno, `update public.carteira_foco set saldo = 999999 where user_id = $1`, [aluno])
      .catch(() => {});
    const depois = await primeira(aluno, 'select saldo from public.carteira_foco');
    expect(depois.saldo).toBe(antes.saldo);
  });
});

describe('burnout, alertas e privacidade', () => {
  it('dispara alerta em esgotamento e nao repete no mesmo dia', async () => {
    const primeiro = await primeira(aluno,
      `select * from public.registrar_burnout(85,'esgotamento','{"fracaoMadrugada":0.6}'::jsonb)`);
    expect(primeiro.alerta_id).toBeTruthy();

    const segundo = await primeira(aluno,
      `select * from public.registrar_burnout(88,'esgotamento','{}'::jsonb)`);
    expect(segundo.alerta_id).toBeNull();

    const indice = await db.query('select count(*)::int n from public.indice_burnout');
    expect(indice.rows[0].n).toBe(1);

    const avisos = await db.query(`select count(*)::int n from public.notificacoes where tipo='alerta_saude'`);
    expect(avisos.rows[0].n).toBe(3);
  });

  it('responsavel vinculado ve alerta e curva; estranho nao ve nada', async () => {
    expect(await linhas(responsavel, 'select * from public.alertas_saude_mental')).toHaveLength(1);
    expect(await linhas(responsavel, 'select * from public.indice_burnout where user_id=$1', [aluno])).toHaveLength(1);
    expect(await linhas(estranho, 'select * from public.alertas_saude_mental')).toHaveLength(0);
  });

  it('o responsavel NUNCA le conversa, anotacao ou humor do filho', async () => {
    await comoUsuario(aluno, `insert into public.chat_mensagens (user_id, papel, texto) values ($1,'user','privado')`, [aluno]);
    await comoUsuario(aluno, `insert into public.notas (user_id, texto) values ($1,'privado')`, [aluno]);
    await comoUsuario(aluno, `insert into public.humor_historico (user_id, humor) values ($1,'stress')`, [aluno]);

    expect(await linhas(responsavel, 'select * from public.chat_mensagens')).toHaveLength(0);
    expect(await linhas(responsavel, 'select * from public.notas')).toHaveLength(0);
    expect(await linhas(responsavel, 'select * from public.humor_historico')).toHaveLength(0);
  });

  it('telemetria de estudo e privada por aluno', async () => {
    await comoUsuario(aluno,
      `insert into public.telemetria_estudo (user_id, question_id, tempo_gasto_segundos, acertou)
       values ($1,'q1',90,true)`, [aluno]);
    expect(await linhas(estranho, 'select * from public.telemetria_estudo')).toHaveLength(0);
    expect(await linhas(aluno, 'select * from public.telemetria_estudo')).toHaveLength(1);
  });
});

describe('revisao espacada', () => {
  it('a curva do banco bate com a de srsEngine.ts', async () => {
    const alta = await primeira(aluno,
      `select * from public.registrar_revisao('bio:citologia','Citologia','Biologia',85)`);
    expect(alta.nivel_memoria).toBe(1);
    expect(alta.intervalo_dias).toBe(3);

    const baixa = await primeira(aluno,
      `select * from public.registrar_revisao('bio:citologia','Citologia','Biologia',50)`);
    expect(baixa.nivel_memoria).toBe(0);
    expect(baixa.intervalo_dias).toBe(1);
    expect(baixa.revisoes_feitas).toBe(2);

    const data = await primeira(aluno,
      'select proxima_revisao = current_date + 1 as amanha from public.revisoes_espacadas');
    expect(data.amanha).toBe(true);
  });
});

describe('intervencao e relatorio semanal', () => {
  it('registra a intervencao e a resposta do aluno', async () => {
    const r = await primeira(aluno,
      `select public.registrar_intervencao('doomscroll','Vamos fazer 3 questoes?','{"segundosVagando":135}'::jsonb) as id`);
    await comoUsuario(aluno, 'select public.responder_intervencao($1, true)', [r.id]);

    const log = await primeira(aluno, 'select aceita from public.log_intervencoes_ia');
    expect(log.aceita).toBe(true);
  });

  it('salva o relatorio e manda o mesmo texto ao responsavel', async () => {
    await comoUsuario(aluno,
      `select * from public.salvar_relatorio_semanal(date_trunc('week', current_date)::date,
        'Voce apareceu 4 dias.', '{"diasAtivos":4}'::jsonb)`);

    const doPai = await linhas(responsavel, 'select * from public.relatorios_semanais where user_id=$1', [aluno]);
    expect(doPai[0].texto_gerado).toContain('Voce apareceu');

    const avisos = await db.query(`select count(*)::int n from public.notificacoes where tipo='relatorio_semanal'`);
    expect(avisos.rows[0].n).toBe(3);
  });
});
