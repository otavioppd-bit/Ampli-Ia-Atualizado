-- =====================================================================
-- Ampli-IA - REDACAO MANUSCRITA (foto do caderno)
--
-- Duas coisas:
--   1. o bucket privado essay_scans, com policies por dono;
--   2. as colunas que a correcao por foto acrescenta a `redacoes`.
--
-- POR QUE A MESMA TABELA `redacoes`, E NAO UMA NOVA
-- A redacao digitada e a fotografada sao a mesma coisa para quem estuda:
-- um texto com nota e cinco competencias. Duas tabelas obrigariam a
-- unir tudo de novo em toda tela de historico e evolucao - e a primeira
-- consulta esquecida mostraria metade das redacoes do aluno.
--
-- Idempotente. Rode depois da 012.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Colunas novas
-- ---------------------------------------------------------------------
alter table public.redacoes
  add column if not exists origem text not null default 'digitada'
    check (origem in ('digitada', 'foto', 'desafio')),
  -- Caminho no bucket, nao URL: URL assinada expira, caminho nao.
  add column if not exists imagem_path text,
  -- A transcricao fica separada de texto_original de proposito: se o
  -- aluno editar o texto depois, ainda da para comparar com o que o OCR
  -- leu da folha - que e como se descobre erro de leitura.
  add column if not exists transcricao text,
  -- Feedback por competencia no formato devolvido pela IA
  -- (competence_1..5 com score e feedback).
  add column if not exists feedback_competencias jsonb not null default '{}',
  add column if not exists tema_detectado text;

create index if not exists redacoes_origem_idx on public.redacoes (user_id, origem, criado_em desc);

comment on column public.redacoes.origem is 'digitada | foto | desafio';
comment on column public.redacoes.imagem_path is 'Caminho em storage/essay_scans (<uid>/<uuid>.jpg). A URL e assinada na hora de exibir.';

-- ---------------------------------------------------------------------
-- 2. Bucket privado
--
--    O bloco so roda onde o schema `storage` existe (Supabase). Em um
--    Postgres puro - como o usado nos testes automatizados - ele e
--    pulado sem erro, em vez de derrubar a migracao inteira.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'schema storage ausente: bucket essay_scans nao criado (esperado fora do Supabase)';
    return;
  end if;

  -- PRIVADO. Foto de caderno tem nome, letra e as vezes o rosto de quem
  -- segura a folha; bucket publico aqui seria um vazamento por padrao.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'essay_scans', 'essay_scans', false, 8388608,
    array['image/jpeg','image/png','image/webp','image/heic','image/heif']
  )
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- Policies por DONO, deduzido da primeira pasta do caminho
  -- (<uid>/arquivo.jpg). E o padrao do Supabase Storage e o motivo de o
  -- worker montar o caminho comecando pelo id do usuario.
  drop policy if exists essay_scans_leitura on storage.objects;
  create policy essay_scans_leitura on storage.objects for select
    using (bucket_id = 'essay_scans' and (select auth.uid())::text = (storage.foldername(name))[1]);

  drop policy if exists essay_scans_envio on storage.objects;
  create policy essay_scans_envio on storage.objects for insert
    with check (bucket_id = 'essay_scans' and (select auth.uid())::text = (storage.foldername(name))[1]);

  drop policy if exists essay_scans_atualiza on storage.objects;
  create policy essay_scans_atualiza on storage.objects for update
    using (bucket_id = 'essay_scans' and (select auth.uid())::text = (storage.foldername(name))[1]);

  drop policy if exists essay_scans_apaga on storage.objects;
  create policy essay_scans_apaga on storage.objects for delete
    using (bucket_id = 'essay_scans' and (select auth.uid())::text = (storage.foldername(name))[1]);

  -- Nao ha policy para responsavel nem educador: o painel dos pais
  -- mostra nota e evolucao, nunca a folha escrita a mao. A fronteira e a
  -- mesma do resto do modulo de bem-estar - padrao, nao conteudo.
end $$;

commit;
