import { useCallback, useEffect, useRef, useState } from 'react';
import {
  encerrarEscudo,
  escudoDisponivel,
  estadoEscudo,
  iniciarEscudo,
  ouvir,
  type EstadoEscudoNativo,
  type ModoEscudo,
  type ResultadoSessao,
} from './FocusShield';

/**
 * Hook do Escudo de Dopamina para o app nativo.
 *
 * COMO O TEMPO E MOSTRADO SEM O APP ESTAR VIVO
 * O JS congela em segundo plano, entao um setInterval contando segundos
 * mentiria: ao voltar, o cronometro estaria atrasado no tempo exato em
 * que o aluno esteve longe - ou seja, erraria justamente o que precisa
 * medir. Aqui o intervalo apenas PERGUNTA ao modulo nativo, que mantem
 * o acumulado com relogio monotonico. Enquanto o app dorme, ninguem
 * precisa contar nada.
 *
 * `creditar` recebe a funcao que fala com o servidor
 * (creditar_moedas_foco) - o hook nao conhece Supabase, o que o mantem
 * testavel e reaproveitavel.
 */
export interface UseFocusShield {
  disponivel: boolean;
  ativo: boolean;
  minutosOffline: number;
  interrupcoes: number;
  telaApagada: boolean;
  iniciar: (modo?: ModoEscudo) => Promise<void>;
  encerrar: () => Promise<{ moedas: number; minutos: number } | null>;
}

export function useFocusShield(
  creditar: (inicio: Date, fim: Date, interrupcoes: number, modo: ModoEscudo) => Promise<{ moedas: number; minutos: number }>,
): UseFocusShield {
  const [estado, setEstado] = useState<EstadoEscudoNativo | null>(null);
  const modoAtual = useRef<ModoEscudo>('enem');

  const sincronizar = useCallback(async () => {
    if (!escudoDisponivel()) return;
    try {
      setEstado(await estadoEscudo());
    } catch {
      // Sessao pode ter sido encerrada pelo sistema; o proximo iniciar
      // recomeca do zero.
    }
  }, []);

  useEffect(() => {
    if (!escudoDisponivel()) return;

    // Eventos do sistema atualizam na hora; o intervalo cobre o resto.
    const cancelar = [
      ouvir('focusShield:telaApagada', setEstado),
      ouvir('focusShield:retornou', setEstado),
      ouvir('focusShield:espiada', setEstado),
      ouvir('focusShield:saiu', setEstado),
    ];

    const timer = setInterval(sincronizar, 5000);
    void sincronizar();

    return () => {
      cancelar.forEach((c) => c());
      clearInterval(timer);
    };
  }, [sincronizar]);

  const iniciar = useCallback(async (modo: ModoEscudo = 'enem') => {
    modoAtual.current = modo;
    setEstado(await iniciarEscudo(modo));
  }, []);

  const encerrar = useCallback(async () => {
    if (!escudoDisponivel()) return null;

    const resultado: ResultadoSessao = await encerrarEscudo();
    setEstado(null);

    // O servidor recalcula os minutos pela janela informada. Se o
    // relogio do aparelho estiver adiantado, ele corta - e e por isso
    // que mandamos a janela, e nao o total ja contado.
    return creditar(
      new Date(resultado.inicioEpochMs),
      new Date(resultado.fimEpochMs),
      resultado.interrupcoes,
      resultado.modo,
    );
  }, [creditar]);

  return {
    disponivel: escudoDisponivel(),
    ativo: !!estado?.ativo,
    minutosOffline: estado?.minutosOffline ?? 0,
    interrupcoes: estado?.interrupcoes ?? 0,
    telaApagada: !!estado?.telaApagada,
    iniciar,
    encerrar,
  };
}
