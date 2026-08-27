-- PASSO 3 de 5: turma
-- Cole SOZINHO numa aba NOVA do SQL Editor (Ctrl+A antes de colar,
-- para nao sobrar nada do script anterior no buffer).
-- Espere "Success" antes de ir para o proximo passo.

-- =====================================================================
-- Entrada em turma por codigo
--
-- Problema que isto resolve:
--   escola_id e turma_id definem o que o aluno enxerga (ranking da escola,
--   mural da turma). Se o proprio aluno pudesse gravar esses campos, ele
--   escolheria qualquer escola e leria o mural de estudantes que nao
--   conhece. Por isso o trigger trava_campos_perfil() os bloqueia.
--
--   Mas travar sem alternativa deixa o aluno sem forma de entrar na turma
--   dele. A saida e a mesma do Google Classroom: o professor passa um
--   codigo, o aluno digita, e o SERVIDOR faz a associacao.
--
-- Rode no SQL Editor. Idempotente.
-- =====================================================================

-- Codigo curto e legivel, unico por turma.
alter table public.turmas
  add column if not exists codigo text unique
  default upper(substr(md5(random()::text), 1, 6));

update public.turmas
   set codigo = upper(substr(md5(random()::text), 1, 6))
 where codigo is null;

-- ---------------------------------------------------------------------
-- Trava de perfil, agora com uma porta controlada
--
-- O trigger continua bloqueando papel/escola/turma vindos do app. A
-- excecao e uma flag TRANSACIONAL que so entrar_na_turma() liga. Como o
-- PostgREST nao executa SQL arbitrario, o cliente nao tem como acender
-- essa flag por conta propria.
--
-- Evitei session_replication_role: desligar triggers exige superusuario,
-- que o papel do Supabase nao tem.
-- ---------------------------------------------------------------------
create or replace function public.trava_campos_perfil()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is not null
     and coalesce(current_setting('app.matricula_em_curso', true), '') <> 'on' then
    if new.papel is distinct from old.papel then
      raise exception 'papel do usuario nao pode ser alterado pelo app';
    end if;
    if new.escola_id is distinct from old.escola_id
       or new.turma_id is distinct from old.turma_id then
      raise exception 'entre na turma pelo codigo fornecido pelo professor';
    end if;
    if new.id is distinct from old.id then
      raise exception 'id do perfil e imutavel';
    end if;
  end if;
  new.atualizado_em := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- entrar_na_turma()
-- ---------------------------------------------------------------------
create or replace function public.entrar_na_turma(p_codigo text)
returns public.perfis
language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := (select auth.uid());
  v_turma  public.turmas;
  v_perfil public.perfis;
begin
  if v_user is null then
    raise exception 'nao autenticado';
  end if;

  select * into v_turma from public.turmas
   where upper(codigo) = upper(trim(p_codigo));
  if not found then
    raise exception 'codigo invalido';
  end if;

  -- vale so ate o fim desta transacao
  perform set_config('app.matricula_em_curso', 'on', true);

  update public.perfis
     set escola_id = v_turma.escola_id,
         turma_id  = v_turma.id
   where id = v_user
   returning * into v_perfil;

  perform set_config('app.matricula_em_curso', 'off', true);

  if v_perfil.id is null then
    raise exception 'perfil nao encontrado';
  end if;
  return v_perfil;
end $$;

grant execute on function public.entrar_na_turma(text) to authenticated;

-- ---------------------------------------------------------------------
-- Criacao de escola/turma continua fora do alcance do app.
-- Para cadastrar, rode no SQL Editor:
--
--   insert into public.escolas (nome, cidade) values ('Escola X', 'Recife')
--     returning id;
--   insert into public.turmas (escola_id, nome, ano)
--     values ('<id-da-escola>', '3A', '2026') returning id, codigo;
--
-- O 'codigo' devolvido e o que o professor passa para os alunos.
-- ---------------------------------------------------------------------

-- =====================================================================
-- Verificacao:
--   select id, nome, codigo from public.turmas;
--   select public.entrar_na_turma('ABC123');
-- =====================================================================
