"""
Fatia a folha de sprites public/mascot.png (20 poses) em PNGs individuais.

Nao assume grade fixa: detecta as calhas vazias projetando o canal alpha
nos eixos X e Y. Assim o corte acompanha o desenho, mesmo que as celulas
nao sejam exatamente iguais.

Uso: python tools/slice_sheet.py
Saida: public/mascot/poses/pose_XX.png
"""

from __future__ import annotations

import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "mascot.png")
OUT = os.path.join(ROOT, "public", "mascot", "poses")


def gaps(proj: list[int], thresh: int, min_run: int) -> list[tuple[int, int]]:
    """Devolve as faixas (inicio, fim) onde ha conteudo."""
    runs, start = [], None
    for i, v in enumerate(proj):
        if v > thresh and start is None:
            start = i
        elif v <= thresh and start is not None:
            if i - start >= min_run:
                runs.append((start, i))
            start = None
    if start is not None and len(proj) - start >= min_run:
        runs.append((start, len(proj)))
    return runs


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    a = im.split()[3]
    ap = a.load()

    # projecao: quantos pixels opacos por linha / coluna
    rows = [sum(1 for x in range(w) if ap[x, y] > 40) for y in range(h)]
    cols = [sum(1 for y in range(h) if ap[x, y] > 40) for x in range(w)]

    row_bands = gaps(rows, thresh=int(w * 0.004), min_run=60)
    print(f"folha {w}x{h} -> {len(row_bands)} linhas")

    os.makedirs(OUT, exist_ok=True)
    n = 0
    for ri, (y0, y1) in enumerate(row_bands):
        # colunas precisam ser detectadas DENTRO da faixa da linha: uma
        # projecao global soma todas as linhas e tapa as calhas verticais.
        band_h = y1 - y0
        bcols = [sum(1 for y in range(y0, y1) if ap[x, y] > 40) for x in range(w)]
        col_bands = gaps(bcols, thresh=max(1, int(band_h * 0.012)), min_run=40)
        print(f"  linha {ri+1} (y {y0}-{y1}): {len(col_bands)} colunas -> {col_bands}")
        for ci, (x0, x1) in enumerate(col_bands):
            cell = im.crop((x0, y0, x1, y1))
            bb = cell.split()[3].getbbox()
            if not bb:
                continue
            cell = cell.crop(bb)
            # descarta fragmentos (respingos soltos entre celulas)
            if cell.size[0] < 80 or cell.size[1] < 80:
                continue
            n += 1
            cell.save(os.path.join(OUT, f"pose_{n:02d}.png"))
            print(f"  pose_{n:02d}.png  {cell.size}  (linha {ri+1}, col {ci+1})")

    print(f"\n{n} poses salvas em public/mascot/poses/")


if __name__ == "__main__":
    main()
