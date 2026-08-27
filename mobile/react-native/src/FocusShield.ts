import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

/**
 * Ponte JS do Escudo de Dopamina.
 *
 * A conta de moedas NAO acontece aqui - ela e a mesma do app web
 * (src/shared/lib/focusShield.ts) e a autoridade continua sendo o
 * servidor (creditar_moedas_foco). O que este arquivo faz e entregar,
 * ao fim da sessao, os tres numeros que o servidor precisa: inicio, fim
 * e interrupcoes.
 *
 * O modulo nativo devolve tambem `minutosOffline`, medido pelo relogio
 * monotonico do aparelho. Ele NAO e enviado como verdade: serve para a
 * tela mostrar o valor certo mesmo quando o app dormiu, e para detectar
 * divergencia (aparelho com relogio adiantado, por exemplo).
 */

const { FocusShield: Nativo } = NativeModules;

export type ModoEscudo = 'leve' | 'enem' | 'maratona';

export interface EstadoEscudoNativo {
  ativo: boolean;
  minutosOffline: number;
  minutosSessao: number;
  interrupcoes: number;
  /** Android: acendeu a tela sem desbloquear. */
  espiadas?: number;
  /** iOS: saiu do app sem bloquear (nao conta como offline). */
  saidas?: number;
  modo: ModoEscudo;
  telaApagada: boolean;
}

export interface ResultadoSessao {
  minutosOffline: number;
  minutosSessao: number;
  interrupcoes: number;
  modo: ModoEscudo;
  inicioEpochMs: number;
  fimEpochMs: number;
  /** iOS: falso quando o aparelho nao tem senha e a medicao e por background. */
  medicaoPorBloqueio?: boolean;
}

export const escudoDisponivel = (): boolean => !!Nativo;

const emissor = Nativo ? new NativeEventEmitter(Nativo) : null;

export type EventoEscudo =
  | 'focusShield:telaApagada'
  | 'focusShield:retornou'
  | 'focusShield:espiada'
  | 'focusShield:saiu';

export function ouvir(evento: EventoEscudo, callback: (estado: EstadoEscudoNativo) => void) {
  if (!emissor) return () => {};
  const inscricao = emissor.addListener(evento, callback);
  return () => inscricao.remove();
}

export async function iniciarEscudo(modo: ModoEscudo = 'enem'): Promise<EstadoEscudoNativo> {
  if (!Nativo) throw new Error('Modulo nativo do escudo indisponivel nesta plataforma.');
  return Nativo.iniciar(modo);
}

export async function encerrarEscudo(): Promise<ResultadoSessao> {
  if (!Nativo) throw new Error('Modulo nativo do escudo indisponivel nesta plataforma.');
  return Nativo.encerrar();
}

export async function estadoEscudo(): Promise<EstadoEscudoNativo> {
  if (!Nativo) throw new Error('Modulo nativo do escudo indisponivel nesta plataforma.');
  return Nativo.estado();
}

/**
 * Texto de instrucao por plataforma.
 *
 * No Android a contagem depende de a TELA apagar; no iOS, de o aparelho
 * ser BLOQUEADO. A diferenca muda o que se pede ao usuario - e pedir a
 * coisa errada faz o recurso "nao funcionar" sem motivo aparente.
 */
export function instrucaoDoAparelho(): string {
  return Platform.OS === 'ios'
    ? 'Bloqueie o aparelho (botao lateral). O tempo conta enquanto ele estiver bloqueado.'
    : 'Apague a tela e deixe o aparelho de lado. Acender para ver a hora nao encerra a sessao.';
}
