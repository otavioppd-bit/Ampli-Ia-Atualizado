"""
Normaliza os PNGs limpos do Sagui para virarem quadros de animacao.

O problema de "conciliar" as imagens nao e so o fundo: cada arte veio numa
tela de tamanho diferente, com o personagem em escala e posicao diferentes.
Se voce troca <img src> entre elas, o mascote SALTA e MUDA DE TAMANHO.

A solucao aqui e ancorar tudo pela FACE:
  - a mancha de pele (laranja/pessego) e a unica cor daquele tom na paleta;
  - pego o maior componente conectado dessa mancha  -> e o rosto;
  - escalo cada arte para que o rosto tenha sempre a mesma altura;
  - posiciono o centro do rosto sempre no mesmo ponto da tela.

Resultado: trocar de pose vira um corte limpo, sem pulo. E o que permite
empilhar as poses em animacao estilo Duolingo.

Alem disso:
  - resize PREMULTIPLICADO (senao a borda pega franja escura no downscale);
  - COLOR BLEED total (RGB das areas invisiveis recebe a cor da borda,
    matando o halo quando o browser interpola).

Uso: python tools/normalize_mascots.py
Saida: public/mascot/512/*.png  e  public/mascot/256/*.png
"""

from __future__ import annotations

import colorsys
import glob
import json
import os
from collections import deque

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MDIR = os.path.join(ROOT, "public", "mascot")

CANVAS = 512
# altura alvo do rosto na tela de 512. Define o "tamanho" do personagem.
FACE_H = 132
# onde o centro do rosto fica ancorado (x, y) na tela de 512
ANCHOR = (256, 200)


# --------------------------------------------------------------------------
def skin_mask(rgba: np.ndarray) -> np.ndarray:
    """Mascara dos pixels de pele (rosto/focinho), opacos."""
    rgb = rgba[..., :3].astype(np.float32) / 255.0
    a = rgba[..., 3]
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    v = mx
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)

    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # matiz em [0,1) — formula padrao de HSV, vetorizada
    d = np.maximum(mx - mn, 1e-6)
    h = np.select(
        [mx == r, mx == g, mx == b],
        [((g - b) / d) % 6, ((b - r) / d) + 2, ((r - g) / d) + 4],
        default=0.0,
    ) / 6.0
    return (a > 200) & (h >= 0.03) & (h <= 0.12) & (s >= 0.30) & (v >= 0.62)


def largest_component(mask: np.ndarray) -> np.ndarray:
    """Maior componente 4-conectado da mascara (evita cauda/tufos poluirem)."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    best = None
    best_n = 0
    ys, xs = np.nonzero(mask)
    for sy, sx in zip(ys, xs):
        if seen[sy, sx]:
            continue
        comp = []
        dq = deque([(sy, sx)])
        seen[sy, sx] = True
        while dq:
            y, x = dq.popleft()
            comp.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    dq.append((ny, nx))
        if len(comp) > best_n:
            best_n = len(comp)
            best = comp
    out = np.zeros_like(mask)
    if best:
        idx = np.array(best)
        out[idx[:, 0], idx[:, 1]] = True
    return out


def face_metrics(im: Image.Image):
    """Devolve (centro_x, centro_y, altura) do rosto, em pixels da imagem."""
    small = im.copy()
    # trabalha reduzido: componente conectado e caro e a precisao basta
    scale = 1.0
    if max(small.size) > 420:
        scale = 420 / max(small.size)
        small = small.resize(
            (max(1, int(small.size[0] * scale)), max(1, int(small.size[1] * scale))),
            Image.LANCZOS,
        )
    arr = np.array(small.convert("RGBA"))
    m = skin_mask(arr)
    if m.sum() < 20:
        return None
    m = largest_component(m)
    ys, xs = np.nonzero(m)
    if len(ys) == 0:
        return None
    cx = (xs.min() + xs.max()) / 2 / scale
    cy = (ys.min() + ys.max()) / 2 / scale
    fh = (ys.max() - ys.min() + 1) / scale
    return cx, cy, fh


# --------------------------------------------------------------------------
def resize_premultiplied(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Redimensiona sem gerar franja: multiplica RGB pelo alpha antes."""
    arr = np.array(im.convert("RGBA")).astype(np.float32)
    a = arr[..., 3:4] / 255.0
    arr[..., :3] *= a
    pm = Image.fromarray(arr.astype(np.uint8), "RGBA").resize(size, Image.LANCZOS)
    out = np.array(pm).astype(np.float32)
    a2 = out[..., 3:4] / 255.0
    out[..., :3] = np.where(a2 > 0.0039, out[..., :3] / np.maximum(a2, 0.0039), 0)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def bleed_full(im: Image.Image) -> Image.Image:
    """Propaga a cor das bordas por TODA a area transparente.

    Elimina o halo em qualquer nivel de reducao/mipmap, porque nao existe
    mais pixel invisivel com cor estranha para a interpolacao pegar.
    """
    arr = np.array(im.convert("RGBA"))
    rgb = arr[..., :3].astype(np.float32)
    a = arr[..., 3]
    known = a > 8
    if known.all() or not known.any():
        return im

    out = rgb.copy()
    cur = known.copy()
    while not cur.all():
        # dilata 1px em 4 direcoes e faz media dos vizinhos ja conhecidos
        acc = np.zeros_like(out)
        cnt = np.zeros(cur.shape, dtype=np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(np.roll(out, dy, axis=0), dx, axis=1)
            shm = np.roll(np.roll(cur, dy, axis=0), dx, axis=1)
            acc += sh * shm[..., None]
            cnt += shm
        newly = (~cur) & (cnt > 0)
        if not newly.any():
            break
        out[newly] = acc[newly] / cnt[newly][..., None]
        cur |= newly

    res = np.dstack([np.clip(out, 0, 255).astype(np.uint8), a])
    return Image.fromarray(res, "RGBA")


# --------------------------------------------------------------------------
def measure(path: str, name: str):
    """Primeira passada: mede o rosto sem renderizar nada."""
    im = Image.open(path).convert("RGBA")
    fm = face_metrics(im)
    if not fm:
        print(f"  [!] {name}: rosto nao detectado — usando bbox como ancora")
        bb = im.split()[3].getbbox()
        cx, cy = (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2
        fh = (bb[3] - bb[1]) * 0.30
    else:
        cx, cy, fh = fm
    return {"path": path, "name": name, "cx": cx, "cy": cy, "fh": fh}


def normalize(m: dict, k: float, report: dict) -> None:
    path, name = m["path"], m["name"]
    im = Image.open(path).convert("RGBA")
    cx, cy, fh = m["cx"], m["cy"], m["fh"]
    new_size = (max(1, round(im.size[0] * k)), max(1, round(im.size[1] * k)))
    sc = resize_premultiplied(im, new_size)

    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    ox = round(ANCHOR[0] - cx * k)
    oy = round(ANCHOR[1] - cy * k)
    canvas.alpha_composite(sc, (ox, oy))

    canvas = bleed_full(canvas)

    for px in (512, 256):
        d = os.path.join(MDIR, str(px))
        os.makedirs(d, exist_ok=True)
        img = canvas if px == CANVAS else resize_premultiplied(canvas, (px, px))
        if px != CANVAS:
            img = bleed_full(img)
        img.save(os.path.join(d, f"{name}.png"), optimize=True)

    report[name] = {"faceH_src": round(fh, 1), "scale": round(k, 3), "src": os.path.relpath(path, ROOT).replace("\\", "/")}
    print(f"  {name:12} rosto={fh:6.1f}px  escala={k:5.2f}  -> 512 + 256")


CLAMP = 0.12  # tolerancia em torno da mediana do grupo


def run_group(paths: list[str], report: dict, clamp: bool) -> None:
    """Normaliza um grupo de imagens.

    clamp=True so vale para a folha de sprites: como todas as celulas saem
    da MESMA imagem, o rosto tem sempre o mesmo tamanho e qualquer desvio e
    erro de medicao (ex.: o sagui atras da placa, com o rosto cortado, mede
    um rosto menor e explodiria de tamanho). Ali a mediana e um alvo seguro.

    Nas 5 artes principais o clamp seria errado: sao arquivos de resolucoes
    diferentes, entao escalas diferentes (0.36 a 0.55) sao o resultado certo.
    """
    ms = [measure(p, os.path.splitext(os.path.basename(p))[0]) for p in paths]
    if not ms:
        return
    ks = sorted(FACE_H / m["fh"] for m in ms)
    med = ks[len(ks) // 2]
    lo, hi = med * (1 - CLAMP), med * (1 + CLAMP)
    for m in ms:
        k = FACE_H / m["fh"]
        if clamp and not (lo <= k <= hi):
            print(f"  [clamp] {m['name']}: escala {k:.2f} fora de [{lo:.2f},{hi:.2f}] -> {med:.2f}")
            k = med
        normalize(m, k, report)


def main() -> None:
    report: dict = {}
    print("poses principais (sem clamp: resolucoes de origem diferentes):")
    run_group(sorted(glob.glob(os.path.join(MDIR, "raw", "*.png"))), report, clamp=False)

    print("\nfolha de sprites (com clamp: mesma origem, mesma escala):")
    run_group(sorted(glob.glob(os.path.join(MDIR, "poses", "*.png"))), report, clamp=True)

    with open(os.path.join(MDIR, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(
            {"canvas": CANVAS, "faceHeight": FACE_H, "anchor": ANCHOR, "frames": report},
            fh,
            indent=2,
            ensure_ascii=False,
        )
    print(f"\n{len(report)} quadros normalizados. manifest em public/mascot/manifest.json")


if __name__ == "__main__":
    main()
