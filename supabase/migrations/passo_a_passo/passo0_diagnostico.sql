-- DIAGNOSTICO: o que ja entrou no banco.
-- Rode isto a qualquer momento e me mande o resultado.
select 'loja_itens'        as objeto, to_regclass('public.loja_itens')          is not null as existe
union all select 'turmas.codigo',      exists (select 1 from information_schema.columns
                                                where table_name='turmas' and column_name='codigo')
union all select 'ligas.dados',        exists (select 1 from information_schema.columns
                                                where table_name='ligas' and column_name='dados')
union all select 'mensagens.materia',  exists (select 1 from information_schema.columns
                                                where table_name='mensagens_comunidade' and column_name='materia')
union all select 'fn comprar_item',    to_regprocedure('public.comprar_item(text)')          is not null
union all select 'fn entrar_na_turma', to_regprocedure('public.entrar_na_turma(text)')       is not null
union all select 'fn nivel_por_xp',    to_regprocedure('public.nivel_por_xp(integer)')       is not null
union all select 'fn concluir_tarefa', to_regprocedure('public.concluir_tarefa(date,text)')  is not null;
