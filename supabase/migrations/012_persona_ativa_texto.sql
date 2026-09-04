-- =====================================================================
-- Ampli-IA - a persona ativa passa a ser TEXTO
--
-- O BUG
--   preferencias.persona_ativa_id era `bigint`, mas os professores
--   embutidos do app tem id em texto ('prof_matematica', 'prof_humanas',
--   'mentor_enem'). Sobrou ao cliente um teste numerico que gravava NULL
--   para todos eles:
--
--     savePreferencias({ persona_ativa_id: /^\d+$/.test(id) ? Number(id) : null })
--
--   Efeito para quem usa: escolher o Prof. Matematica funcionava na
--   sessao, mas nao sobrevivia a um F5 - o app reabria no Mentor geral,
--   sem aviso. Quem tinha criado professores proprios (esses sim com id
--   numerico, vindo da tabela personas) nao via o problema, o que
--   explica ele ter passado batido.
--
-- A CORRECAO
--   A coluna vira text e passa a guardar o id como ele e. Os dois tipos
--   de persona - embutida (texto) e criada pelo usuario (numero vindo de
--   personas.id) - cabem na mesma coluna, que e como o cliente sempre
--   tratou o campo (activePersonaId e string).
--
--   Nao ha FK para personas.id de proposito: os professores embutidos
--   nao existem naquela tabela, e uma FK impediria justamente o caso
--   comum.
--
-- Idempotente: rodar duas vezes nao quebra.
-- =====================================================================

begin;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'preferencias'
       and column_name  = 'persona_ativa_id'
       and data_type    = 'bigint'
  ) then
    alter table public.preferencias
      alter column persona_ativa_id type text using persona_ativa_id::text;
  end if;
end $$;

comment on column public.preferencias.persona_ativa_id is
  'Id do professor selecionado no chat. Texto para caber tanto nos embutidos (prof_matematica) quanto nos criados pelo usuario (personas.id numerico).';

commit;
