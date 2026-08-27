import { StudentMonthlyRecord } from '../../shared/lib/dropoutRisk';

export const STUDENT_NAME = 'Pedro Henrique';
export const STUDENT_TURMA = '3º Ano - Ensino Médio Noturno · Turma C';
export const STUDENT_SCHOOL = 'EE Prof. Ana Néri';

// Taxa de acerto nos exercícios de raciocínio lógico do app
export const LOGIC_ACCURACY = 78;

export const MONTH_LABEL: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr', '05': 'Mai', '06': 'Jun',
  '07': 'Jul', '08': 'Ago', '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
};

export function monthLabel(month: string): string {
  return MONTH_LABEL[month.slice(5, 7)] || month;
}

// Histórico mensal: nota escolar média, desempenho nos exercícios do app
// e tempo de uso em horas - últimos 12 meses.
export interface CognitiveRecord {
  month: string; // "YYYY-MM"
  notaEscolar: number; // 0-100
  notaApp: number; // 0-100
  tempoUso: number; // horas
}

export const cognitiveHistory: CognitiveRecord[] = [
  { month: '2025-03', notaEscolar: 74, notaApp: 66, tempoUso: 12.5 },
  { month: '2025-04', notaEscolar: 76, notaApp: 68, tempoUso: 13.2 },
  { month: '2025-05', notaEscolar: 75, notaApp: 71, tempoUso: 12.0 },
  { month: '2025-06', notaEscolar: 79, notaApp: 73, tempoUso: 13.8 },
  { month: '2025-07', notaEscolar: 78, notaApp: 71, tempoUso: 11.4 },
  { month: '2025-08', notaEscolar: 77, notaApp: 75, tempoUso: 12.1 },
  { month: '2025-09', notaEscolar: 74, notaApp: 73, tempoUso: 9.6 },
  { month: '2025-10', notaEscolar: 72, notaApp: 71, tempoUso: 8.4 },
  { month: '2025-11', notaEscolar: 69, notaApp: 70, tempoUso: 7.2 },
  { month: '2025-12', notaEscolar: 66, notaApp: 68, tempoUso: 6.1 },
  { month: '2026-01', notaEscolar: 64, notaApp: 66, tempoUso: 5.4 },
  { month: '2026-02', notaEscolar: 61, notaApp: 64, tempoUso: 4.9 },
];

export function toMonthlyRecord(records: CognitiveRecord[]): StudentMonthlyRecord[] {
  return records.map(r => ({ month: r.month, notaMedia: r.notaEscolar, tempoUso: r.tempoUso }));
}

// Horas estudadas por semana no último mês (Gráfico 1 - barras)
export const weeklyStudyHours = [
  { week: 'Semana 1', horas: 9.5 },
  { week: 'Semana 2', horas: 11.0 },
  { week: 'Semana 3', horas: 8.4 },
  { week: 'Semana 4', horas: 12.2 },
];

export type PeriodKey = 3 | 6 | 12; // meses

export const PERIOD_OPTIONS: { value: PeriodKey; label: string; short: string }[] = [
  { value: 3, label: 'Últimos 3 meses', short: '3M' },
  { value: 6, label: 'Últimos 6 meses', short: '6M' },
  { value: 12, label: 'Últimos 12 meses', short: '12M' },
];