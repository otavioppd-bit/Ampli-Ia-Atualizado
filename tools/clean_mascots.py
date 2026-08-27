"""
Limpeza dos PNGs do mascote (Sagui) para uso em animacoes.

Resolve tres problemas distintos encontrados nos arquivos originais:

1. XADREZ PINTADO  (sagui_aprovacao_2, sagui_meditando_2)
   Sao RGB sem canal alpha, com o padrao de transparencia (quadriculado
   claro/cinza ~242/254) gravado nos proprios pixels. Precisa recortar
   de verdade.

2. RGB SUJO EM AREA TRANSPARENTE  (sagui_estudando_2, sagui_pulando_2, mascot)
   O alpha esta correto, mas os pixels invisiveis guardam o fundo antigo
   (cinza/preto). Ao escalar/animar, o filtro bilinear do browser mistura
   esse lixo na borda -> halo escuro. Corrige com color bleed.

3. FRANJA ESCURA NA BORDA
   Pixels semi-transparentes ficaram pre-misturados com o fundo escuro.
   Corrige com decontaminacao (unpremultiply em direcao a cor interna).

Uso:  python tools/clean_mascots.py
Saida: public/mascot/raw/<nome>.png  (recorte limpo, sem normalizar)
"""

from __future__ import annotations

import os
from collections import deque

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "mascot", "raw")

# nome_saida -> caminho_origem
SOURCES = {
    "aprovacao": "public/assets/sagui_aprovacao_2.png",
    "meditando": "public/assets/sagui_meditando_2.png",
    "estudando": "public/assets/sagui_estudando_2.png",
    "pulando": "public/assets/sagui_pulando_2.png",
    "acenando": "public/workspaces/Ampli-IA/ChatGPT Image 10 de ago. de 2026, 16_03_53.png",
}


# --------------------------------------------------------------------------
# 1. Deteccao de fundo por flood fill a partir das bordas
# --------------------------------------------------------------------------
def background_mask_flood(im: Image.Image, tol: int = 26, sat_max: int = 26):
    """Marca como fundo os pixels claros e dessaturados conectados a borda.

    O flood fill a partir da borda e essencial: o personagem tem tufos de
    orelha brancos que, num filtro global de "remover branco", sumiriam.
    Estando cercados pelo corpo escuro, o fill nunca os alcanca.
    """
    w, h = im.size
    px = im.convert("RGB").load()
    bg = bytearray(w * h)  # 1 = fundo
    seen = bytearray(w * h)
    dq = deque()

    def is_bglike(x: int, y: int) -> bool:
        r, g, b = px[x, y]
        # claro o suficiente e praticamente sem cor (branco ou cinza do xadrez)
        return min(r, g, b) >= 255 - tol - 24 and (max(r, g, b) - min(r, g, b)) <= sat_max

    for x in range(w):
        for y in (0, h - 1):
            if not seen[y * w + x] and is_bglike(x, y):
                seen[y * w + x] = 1
                dq.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y * w + x] and is_bglike(x, y):
                seen[y * w + x] = 1
                dq.append((x, y))

    while dq:
        x, y = dq.popleft()
        bg[y * w + x] = 1
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                i = ny * w + nx
                if not seen[i] and is_bglike(nx, ny):
                    seen[i] = 1
                    dq.append((nx, ny))

    mask = Image.frombytes("L", (w, h), bytes(bytearray(255 if v else 0 for v in bg)))
    return mask


def alpha_from_checkerboard(im: Image.Image) -> Image.Image:
    """Gera alpha para imagens com o quadriculado gravado nos pixels."""
    bgmask = background_mask_flood(im)
    # alpha = inverso do fundo
    alpha = Image.eval(bgmask, lambda v: 255 - v)
    # suaviza 1px para nao ficar serrilhado (o recorte vem duro do flood fill)
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.7))
    # reforca o miolo opaco: tudo acima de 200 vira 255
    alpha = Image.eval(alpha, lambda v: 255 if v > 200 else (0 if v < 24 else v))
    return alpha


# --------------------------------------------------------------------------
# 2. Color bleed: elimina o halo ao escalar
# --------------------------------------------------------------------------
def bleed_edges(rgb: Image.Image, alpha: Image.Image, passes: int = 12) -> Image.Image:
    """Empurra a cor das bordas visiveis para dentro da area transparente.

    Sem isso, o browser interpola RGB(lixo escuro) com a borda do
    personagem e desenha uma auréola. Com o bleed, o RGB invisivel tem a
    mesma cor da borda -> a interpolacao some.
    """
    w, h = rgb.size
    cur = rgb.copy()
    known = Image.eval(alpha, lambda v: 255 if v > 8 else 0)

    for _ in range(passes):
        if known.getextrema()[0] == 255:
            break
        # dilata cor e area conhecida em 1px
        grown_rgb = cur.filter(ImageFilter.MaxFilter(3))
        blurred = cur.filter(ImageFilter.BoxBlur(1))
        grown_known = known.filter(ImageFilter.MaxFilter(3))
        # onde ainda nao se conhecia a cor mas o vizinho ja conhece -> usa o blur
        newly = Image.composite(
            Image.new("L", (w, h), 255),
            Image.new("L", (w, h), 0),
            Image.eval(known, lambda v: 255 - v),
        )
        newly = Image.composite(newly, Image.new("L", (w, h), 0), grown_known)
        cur = Image.composite(blurred, cur, newly)
        known = grown_known
        del grown_rgb

    return cur


# --------------------------------------------------------------------------
# 3. Decontaminacao da franja escura
# --------------------------------------------------------------------------
def decontaminate(rgb: Image.Image, alpha: Image.Image, strength: float = 0.85) -> Image.Image:
    """Remove a cor de fundo pre-misturada nos pixels semi-transparentes.

    Pixel de borda foi gravado como  c = a*obj + (1-a)*fundo_escuro.
    Reconstroi obj = (c - (1-a)*fundo) / a, aproximando 'fundo' pela cor
    ja limpa da vizinhanca transparente.
    """
    w, h = rgb.size
    r, g, b = rgb.split()
    a = alpha
    ap = a.load()
    rp, gp, bp = r.load(), g.load(), b.load()

    for y in range(h):
        for x in range(w):
            av = ap[x, y]
            if 12 < av < 250:
                f = av / 255.0
                # divide pela cobertura -> desfaz a mistura com o fundo
                k = 1.0 / max(f, 0.25)
                k = 1.0 + (k - 1.0) * strength
                rp[x, y] = min(255, int(rp[x, y] * k))
                gp[x, y] = min(255, int(gp[x, y] * k))
                bp[x, y] = min(255, int(bp[x, y] * k))

    return Image.merge("RGB", (r, g, b))


# --------------------------------------------------------------------------
def process(name: str, rel: str) -> None:
    path = os.path.join(ROOT, rel)
    im = Image.open(path)
    has_alpha = "A" in im.mode
    print(f"[{name}] {im.mode} {im.size} alpha={'sim' if has_alpha else 'NAO (xadrez pintado)'}")

    if has_alpha:
        rgba = im.convert("RGBA")
        alpha = rgba.split()[3]
        rgb = rgba.convert("RGB")
    else:
        rgb = im.convert("RGB")
        alpha = alpha_from_checkerboard(rgb)

    rgb = decontaminate(rgb, alpha)
    rgb = bleed_edges(rgb, alpha)

    out = rgb.convert("RGBA")
    out.putalpha(alpha)

    bbox = alpha.getbbox()
    if bbox:
        out = out.crop(bbox)
        print(f"         recorte -> {out.size}")

    os.makedirs(OUT_DIR, exist_ok=True)
    dest = os.path.join(OUT_DIR, f"{name}.png")
    out.save(dest)
    cov = sum(out.split()[3].histogram()[250:]) / (out.size[0] * out.size[1])
    print(f"         salvo em public/mascot/raw/{name}.png  (opaco={cov*100:.0f}%)")


if __name__ == "__main__":
    for n, p in SOURCES.items():
        process(n, p)
    print("\nOK. Confira public/mascot/raw/ antes de normalizar.")
