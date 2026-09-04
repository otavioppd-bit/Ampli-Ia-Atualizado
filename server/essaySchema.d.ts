/** Tipos de essaySchema.js (compartilhado entre worker e app). */

export type ChaveCompetencia =
  | 'competence_1'
  | 'competence_2'
  | 'competence_3'
  | 'competence_4'
  | 'competence_5';

export interface NotaCompetencia {
  /** 0, 40, 80, 120, 160 ou 200 - a grade discreta do INEP. */
  score: number;
  feedback: string;
}

/** O contrato devolvido por /api/essays/upload-and-grade. */
export interface CorrecaoFoto {
  transcription: string;
  detected_theme: string;
  scores: Record<ChaveCompetencia, NotaCompetencia>;
  total_score: number;
  strengths: string[];
  actionable_improvements: string[];
}

export interface DefinicaoCompetencia {
  chave: ChaveCompetencia;
  titulo: string;
  guia: string;
}

export declare const COMPETENCIAS: DefinicaoCompetencia[];
export declare const NOTAS_VALIDAS: number[];
export declare const ESQUEMA_CORRECAO: Record<string, unknown>;
export declare const MIMES_ACEITOS: string[];
export declare const TAMANHO_MAXIMO_BYTES: number;

export declare function promptCorrecaoFoto(temaInformado?: string): string;
export declare function ajustarParaGrade(valor: unknown): number;
export declare function normalizarCorrecao(bruto: unknown): CorrecaoFoto;
export declare function pareceFotoIlegivel(correcao: CorrecaoFoto | null | undefined): boolean;
