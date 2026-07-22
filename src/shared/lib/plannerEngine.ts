import { MoodType, MicroTask, DailyPlan } from '../types';

/**
 * Engine de planejamento adaptativo baseado em humor.
 * 100% local, baseado em tabela fixa de estratégias.
 * Substituir por recomendação ML quando disponível.
 */

interface Strategy {
  mood: MoodType;
  tasks: Omit<MicroTask, 'id' | 'completed'>[];
}

const STRATEGIES: Strategy[] = [
  {
    mood: 'stress',
    tasks: [
      { titulo: '🧘 Pausa Respiratória', descricao: '5 minutos de respiração 4-7-8 para acalmar o sistema nervoso', emoji: '🧘' },
      { titulo: '📝 Revisão Leve', descricao: 'Folhear resumos antigos sem pressão de aprender algo novo', emoji: '📝' },
      { titulo: '🚶 Caminhada Curta', descricao: '10 minutos andando para liberar tensão', emoji: '🚶' },
    ],
  },
  {
    mood: 'anxiety',
    tasks: [
      { titulo: '📋 Lista de Prioridades', descricao: 'Escrever 3 tarefas pequenas e realizáveis para hoje', emoji: '📋' },
      { titulo: '🎯 Micro Meta de 5 min', descricao: 'Estudar um tópico fácil por apenas 5 minutos', emoji: '🎯' },
      { titulo: '🧠 Exercício de Aterramento', descricao: 'Técnica 5-4-3-2-1: nomeie 5 coisas que vê, 4 que toca...', emoji: '🧠' },
    ],
  },
  {
    mood: 'sadness',
    tasks: [
      { titulo: '☕ Pausa Autocompaixão', descricao: 'Tome uma bebida quente e escreva algo bom sobre você', emoji: '☕' },
      { titulo: '📖 Leitura Inspiradora', descricao: 'Leia um texto curto e inspirador sobre superação', emoji: '📖' },
      { titulo: '🎵 Estudo com Música', descricao: 'Escolha uma playlist calma e revise um assunto fácil', emoji: '🎵' },
    ],
  },
  {
    mood: 'tired',
    tasks: [
      { titulo: '😴 Power Nap', descricao: '15-20 minutos de cochilo para recarregar as energias', emoji: '😴' },
      { titulo: '💧 Hidratação + Lanche', descricao: 'Beba água e coma algo leve antes de continuar', emoji: '💧' },
      { titulo: '🎥 Vídeo Aula Curta', descricao: 'Assista a uma videoaula de no máximo 15 minutos', emoji: '🎥' },
    ],
  },
  {
    mood: 'demotivated',
    tasks: [
      { titulo: '✨ Tarefa Mais Fácil', descricao: 'Comece pela tarefa mais trivial que você precisa fazer', emoji: '✨' },
      { titulo: '🏆 Meta Ridícula', descricao: 'Estude por apenas 2 minutos — depois pode parar se quiser', emoji: '🏆' },
      { titulo: '📸 Registre o Progresso', descricao: 'Tire print do que já estudou esta semana — você fez mais do que lembra', emoji: '📸' },
    ],
  },
  {
    mood: 'focused',
    tasks: [
      { titulo: '⏱️ Sessão Rota Ultra', descricao: 'Ciclo de 10 minutos de foco total em uma única matéria', emoji: '⏱️' },
      { titulo: '📚 Matéria Mais Difícil', descricao: 'Aproveite o foco para encarar o tópico mais desafiador', emoji: '📚' },
      { titulo: '✍️ Resumo Ativo', descricao: 'Escreva um resumo do que aprendeu sem consultar o material', emoji: '✍️' },
    ],
  },
  {
    mood: 'motivated',
    tasks: [
      { titulo: '🚀 Sessão Extra', descricao: 'Faça um ciclo extra de estudo além do planejado', emoji: '🚀' },
      { titulo: '📝 Quiz Desafiador', descricao: 'Tente responder questões mais difíceis da matéria atual', emoji: '📝' },
      { titulo: '📖 Ensine Alguém', descricao: 'Explique o que aprendeu em voz alta como se estivesse ensinando', emoji: '📖' },
    ],
  },
  {
    mood: 'happy',
    tasks: [
      { titulo: '🌟 Compartilhe', descricao: 'Conte para alguém o que te fez feliz hoje', emoji: '🌟' },
      { titulo: '🎨 Estudo Criativo', descricao: 'Faça um mapa mental ou desenho sobre o assunto estudado', emoji: '🎨' },
      { titulo: '🏅 Revisão Gamificada', descricao: 'Transforme a revisão em um jogo: pontue cada acerto', emoji: '🏅' },
    ],
  },
  {
    mood: 'energetic',
    tasks: [
      { titulo: '⚡ Sessão Intensa', descricao: 'Aproveite a energia para um ciclo de estudo profundo', emoji: '⚡' },
      { titulo: '🏃 Exercício + Estudo', descricao: 'Ouça um podcast educacional enquanto se exercita', emoji: '🏃' },
      { titulo: '🎯 Desafio de Questões', descricao: 'Tente bater seu recorde de questões em 20 minutos', emoji: '🎯' },
    ],
  },
  {
    mood: 'neutral',
    tasks: [
      { titulo: '📚 Revisão Geral', descricao: 'Revise o resumo da semana anterior', emoji: '📚' },
      { titulo: '📝 Exercícios Padrão', descricao: 'Resolva 5 questões de matemática e 5 de português', emoji: '📝' },
      { titulo: '🗂️ Organize os Estudos', descricao: 'Atualize seu cronograma e organize os materiais', emoji: '🗂️' },
    ],
  },
];

export function generatePlan(mood: MoodType): Omit<DailyPlan, 'date'> {
  const strategy = STRATEGIES.find(s => s.mood === mood) || STRATEGIES[STRATEGIES.length - 1];
  const tasks: MicroTask[] = strategy.tasks.map(t => ({
    ...t,
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    completed: false,
  }));

  return { mood, tasks };
}

export const XP_PER_TASK = 20;
