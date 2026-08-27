"""
Substitui emojis em componentes .tsx por icones lucide.

O emoji aparece em dois contextos dentro de um .tsx, e cada um pede um
tratamento diferente:

  TEXTO JSX   <span>🔥 Sequencia</span>
              Da para injetar um componente -> vira <Flame ... />.

  STRING      setToast('🎉 Comprado!')
              E uma string em runtime; nao aceita JSX. O emoji e apagado.

A heuristica de contexto e simples e conservadora: se o emoji estiver
entre '>' e '<' na mesma linha, e texto JSX. Fora disso, trata como
string. Casos ambiguos ficam como remocao, que nunca quebra o build.

IMPORTANTE: este script nao mexe em espaco em branco fora do ponto exato
do emoji. A primeira versao normalizava espacos no arquivo inteiro e
fundiu linhas de codigo; aqui a substituicao e cirurgica.

Uso: python tools/emoji_jsx.py
"""

from __future__ import annotations

import glob
import re

EMOJI = re.compile('[\U0001F300-\U0001FAFF☀-➿⬀-⯿️←-⇿⤀-⥿]+️?')

# emoji -> (componente lucide, tamanho, classe extra)
MAPA = {
    '🔥': ('Flame', 16, 'text-amber-400'),
    '⚡': ('Zap', 16, 'text-amber-400'),
    '🧠': ('Brain', 16, 'text-violet-400'),
    '📝': ('PenLine', 16, 'text-amber-400'),
    '📚': ('BookMarked', 16, 'text-amber-400'),
    '📖': ('BookOpen', 16, 'text-amber-400'),
    '📓': ('NotebookPen', 16, 'text-amber-400'),
    '🎯': ('Target', 16, 'text-emerald-400'),
    '🏆': ('Trophy', 16, 'text-amber-400'),
    '🥇': ('Medal', 16, 'text-amber-400'),
    '🥈': ('Medal', 16, 'text-gray-300'),
    '🥉': ('Medal', 16, 'text-orange-700'),
    '📊': ('BarChart3', 16, 'text-cyan-400'),
    '📈': ('TrendingUp', 16, 'text-emerald-400'),
    '📉': ('TrendingDown', 16, 'text-red-400'),
    '🚀': ('Rocket', 16, 'text-amber-400'),
    '💪': ('BicepsFlexed', 16, 'text-amber-400'),
    '💡': ('Lightbulb', 16, 'text-amber-400'),
    '🎉': ('PartyPopper', 16, 'text-amber-400'),
    '🎊': ('PartyPopper', 16, 'text-amber-400'),
    '⭐': ('Star', 16, 'text-amber-400'),
    '🌟': ('Star', 16, 'text-amber-400'),
    '✅': ('CheckCircle2', 16, 'text-emerald-400'),
    '✔': ('Check', 16, 'text-emerald-400'),
    '✓': ('Check', 16, 'text-emerald-400'),
    '❌': ('XCircle', 16, 'text-red-400'),
    '⚠': ('TriangleAlert', 16, 'text-amber-400'),
    '🔒': ('Lock', 16, 'text-gray-500'),
    '🔓': ('LockOpen', 16, 'text-emerald-400'),
    '📅': ('Calendar', 16, 'text-gray-400'),
    '🌙': ('Moon', 16, 'text-amber-400'),
    '☕': ('Coffee', 16, 'text-amber-400'),
    '🎵': ('Music', 16, 'text-violet-400'),
    '🎧': ('Headphones', 16, 'text-emerald-400'),
    '💧': ('Droplet', 16, 'text-cyan-400'),
    '🎥': ('Video', 16, 'text-violet-400'),
    '🧘': ('Wind', 16, 'text-cyan-400'),
    '🚶': ('Footprints', 16, 'text-emerald-400'),
    '📋': ('ClipboardList', 16, 'text-gray-400'),
    '🏫': ('School', 16, 'text-amber-400'),
    '🎓': ('GraduationCap', 16, 'text-amber-400'),
    '👥': ('Users', 16, 'text-cyan-400'),
    '👤': ('User', 16, 'text-gray-400'),
    '💬': ('MessageCircle', 16, 'text-cyan-400'),
    '🔍': ('Search', 16, 'text-gray-400'),
    '🔔': ('Bell', 16, 'text-amber-400'),
    '⏱': ('Timer', 16, 'text-cyan-400'),
    '⏰': ('AlarmClock', 16, 'text-amber-400'),
    '🕐': ('Clock', 16, 'text-gray-400'),
    '❤': ('Heart', 16, 'text-red-400'),
    '💛': ('Heart', 16, 'text-amber-400'),
    '🧪': ('FlaskConical', 16, 'text-violet-400'),
    '🔬': ('Microscope', 16, 'text-cyan-400'),
    '🌍': ('Globe', 16, 'text-emerald-400'),
    '📐': ('Ruler', 16, 'text-cyan-400'),
    '✨': ('Sparkles', 16, 'text-amber-400'),
    '🎁': ('Gift', 16, 'text-violet-400'),
    '🛒': ('ShoppingBag', 16, 'text-violet-400'),
    '🏅': ('Award', 16, 'text-amber-400'),
    '😴': ('Moon', 16, 'text-violet-400'),
    '😩': ('Frown', 16, 'text-orange-400'),
    '🥗': ('Salad', 16, 'text-emerald-400'),
    '🤖': ('Bot', 16, 'text-cyan-400'),
    '🧐': ('Search', 16, 'text-gray-400'),
}


def main() -> None:
    usados_por_arquivo: dict[str, set[str]] = {}
    restantes = 0

    for caminho in sorted(glob.glob('src/**/*.tsx', recursive=True)):
        original = open(caminho, encoding='utf-8').read()
        if not EMOJI.search(original):
            continue

        usados: set[str] = set()
        linhas = original.split('\n')
        saida = []

        for linha in linhas:
            def troca(m: re.Match) -> str:
                bruto = m.group(0)
                base = bruto.rstrip('️')
                inicio = m.start()
                antes = linha[:inicio]
                depois = linha[m.end():]
                # texto JSX: ha um '>' aberto antes e um '<' depois
                em_jsx = ('>' in antes and antes.rindex('>') > max(antes.rfind("'"), antes.rfind('"'), antes.rfind('`'))
                          and '<' in depois)
                info = MAPA.get(base) or MAPA.get(base[:1])
                if em_jsx and info:
                    comp, tam, cls = info
                    usados.add(comp)
                    return f'<{comp} size={{{tam}}} className="inline-block align-[-0.15em] {cls}" />'
                return ''  # string ou emoji sem mapa: remove

            saida.append(EMOJI.sub(troca, linha))

        novo = '\n'.join(saida)
        # limpa apenas espaco duplo deixado exatamente onde o emoji saiu
        novo = re.sub(r'(>)\s{2,}([A-Za-zÀ-ÿ])', r'\1 \2', novo)

        if novo != original:
            open(caminho, 'w', encoding='utf-8').write(novo)
            if usados:
                usados_por_arquivo[caminho] = usados
            sobrou = len(EMOJI.findall(novo))
            restantes += sobrou
            print(f'  {caminho}: {len(EMOJI.findall(original))} -> {sobrou}'
                  + (f'  (icones: {", ".join(sorted(usados))})' if usados else ''))

    print('\n--- imports lucide a adicionar ---')
    for caminho, comps in usados_por_arquivo.items():
        print(f'{caminho}: {", ".join(sorted(comps))}')
    print(f'\nemojis restantes em .tsx: {restantes}')


if __name__ == '__main__':
    main()
