"""
Remove emojis do codigo, trocando por icones onde faz sentido.

Tres tratamentos diferentes, porque emoji aparece em tres papeis:

1. CAMPO DE DADO  (plannerEngine, storeCatalog, dropoutRisk)
   `emoji: '🧘'` vira `icon: 'respiracao'`. Quem renderiza usa <AppIcon />.

2. PROSA  (kbEnem, kbSearch, quizBank, mensagens de store)
   Sao strings exibidas como texto puro; nao da para injetar um componente
   no meio. Aqui o emoji e apagado e a pontuacao ao redor, normalizada.

3. JSX  (componentes)
   Tratado a mao, arquivo por arquivo, porque cada caso pede um icone e um
   tamanho especificos.

Uso: python tools/desemojizar.py
"""

from __future__ import annotations

import glob
import re

EMOJI = re.compile(
    '[\U0001F300-\U0001FAFF☀-➿⬀-⯿️←-⇿⤀-⥿]'
)

# emoji -> nome no registro do AppIcon
PARA_ICONE = {
    '🧘': 'respiracao', '📝': 'escrita', '🚶': 'passos', '📋': 'lista',
    '🎯': 'alvo', '🧠': 'mente', '☕': 'cafe', '📖': 'livro',
    '🎵': 'musica', '😴': 'sono', '💧': 'gota', '🎥': 'video',
    '⚡': 'raio', '🚀': 'foguete', '🔥': 'fogo', '🏆': 'trofeu',
    '📚': 'marcador', '💡': 'ideia', '🎉': 'festa', '⭐': 'estrela',
    '✅': 'certo', '❌': 'errado', '⚠️': 'alerta', '🔒': 'cadeado',
    '📅': 'calendario', '🌙': 'luaCheia', '💪': 'forca', '📊': 'bussola',
    '🥗': 'refeicao', '🎧': 'fone', '🧥': 'moletom', '👓': 'oculos',
    '📓': 'caderno', '🏅': 'medalha', '❤️': 'coracao', '🌅': 'amanhecer',
    '✨': 'brilho', '📈': 'subida', '⏱️': 'cronometro', '⏰': 'cronometro',
}

# arquivos de prosa: so apagar
PROSA = [
    'src/shared/lib/kbEnem.ts',
    'src/shared/lib/kbSearch.ts',
    'src/shared/lib/quizBank.ts',
    'src/shared/lib/contextMemory.ts',
    'src/shared/lib/aiService.ts',
    'src/stores/appStore.ts',
    'src/stores/mascotStore.ts',
    'src/App.tsx',
    'src/shared/storage/SupabaseRepository.ts',
]


def limpar_prosa(texto: str) -> str:
    """Apaga o emoji e arruma o espacamento que sobra."""
    texto = EMOJI.sub('', texto)
    # "'  Geometria" -> "'Geometria"   e   "texto  ." -> "texto."
    texto = re.sub(r"(['\"`])\s+", r'\1', texto)
    texto = re.sub(r'[ \t]{2,}', ' ', texto)
    texto = re.sub(r'\s+([,.;:!?])', r'\1', texto)
    texto = re.sub(r'\(\s+', '(', texto)
    texto = re.sub(r'\s+\)', ')', texto)
    return texto


def converter_campo_emoji(texto: str) -> str:
    """`emoji: '🧘'` -> `icon: 'respiracao'`."""
    def troca(m: re.Match) -> str:
        e = m.group(2)
        nome = PARA_ICONE.get(e) or PARA_ICONE.get(e.rstrip('️')) or 'brilho'
        return f"icon: {m.group(1)}{nome}{m.group(1)}"

    return re.sub(r"emoji:\s*(['\"])(.+?)\1", troca, texto)


def main() -> None:
    total_antes = total_depois = 0

    for caminho in sorted(glob.glob('src/**/*.ts*', recursive=True)):
        norm = caminho.replace('\\', '/')
        original = open(caminho, encoding='utf-8').read()
        antes = len(EMOJI.findall(original))
        if antes == 0:
            continue
        total_antes += antes

        novo = original
        # 1. campos de dado
        if 'emoji:' in novo:
            novo = converter_campo_emoji(novo)
        # 2. prosa e strings soltas
        if norm in PROSA or norm.endswith('plannerEngine.ts') or norm.endswith('dropoutRisk.ts') \
           or norm.endswith('storeCatalog.ts') or norm.endswith('rankingEngine.ts'):
            novo = limpar_prosa(novo)

        depois = len(EMOJI.findall(novo))
        total_depois += depois
        if novo != original:
            open(caminho, 'w', encoding='utf-8').write(novo)
            print(f'  {antes:4} -> {depois:4}  {norm}')

    print(f'\ntotal: {total_antes} -> {total_depois}')


if __name__ == '__main__':
    main()
