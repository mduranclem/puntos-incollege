"""
Genera los archivos de marca que usa la web, a partir de los originales.

Se corre a mano y sólo cuando cambia el logo o la mascota (D-037); lo que la
aplicación usa son los archivos ya generados, que viajan en el repositorio. Por
eso Pillow y SciPy no son dependencias del proyecto:

    pip install pillow scipy
    python marca/generar.py

Qué hace, y por qué no es un simple "achicar":

  - El logo viene como una calcomanía sobre un fondo gris con resplandor. Ese
    fondo hay que sacarlo o queda un recuadro gris sobre el azul de la app. El
    recorte no se puede hacer por color: el contorno negro del logo y el fondo
    oscuro son casi el mismo color. Se hace por forma — la calcomanía es una
    sola pieza conectada y es la única que tiene borde blanco.

  - La mascota se recorta a la cara. El buzo dice "EGRESADOS XXVII · PROMO 27",
    y egresados no participa de este programa (D-003): mostrarlo prometería algo
    que el sistema no hace. Recortada a la cara no queda nada de ese texto.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

AQUI = Path(__file__).parent
PUBLICO = AQUI.parent / "web" / "public"

MARINO = (15, 45, 82)  # --color-marino


def recortar_logo() -> Image.Image:
    """Saca el fondo de la calcomanía y devuelve el logo con transparencia."""
    im = Image.open(AQUI / "logo-original.png").convert("RGB")
    a = np.asarray(im).astype(np.int16)
    mx, mn = a.max(axis=2), a.min(axis=2)
    sat = np.where(mx == 0, 0, (mx - mn) / np.maximum(mx, 1))

    # Lo que se ve del logo: el turquesa y el borde blanco. El contorno negro no
    # entra acá porque es indistinguible del fondo oscuro; aparece solo al
    # rellenar el interior de la pieza.
    marcas = (sat > 0.25) | (mx >= 240)
    etiquetas, cuantas = ndimage.label(marcas, structure=np.ones((3, 3)))

    # La pieza del logo no es la más grande —el resplandor del fondo lo es—,
    # pero es la única con borde blanco.
    borde_blanco = ndimage.sum(mx >= 240, etiquetas, range(1, cuantas + 1))
    pieza = etiquetas == (int(np.argmax(borde_blanco)) + 1)

    mascara = ndimage.binary_fill_holes(pieza)
    # Dos píxeles adentro: el borde exacto arrastra fondo oscuro y sobre blanco
    # se ve como un fleco sucio.
    mascara = ndimage.binary_erosion(mascara, np.ones((3, 3)), iterations=2)

    alpha = np.where(mascara, 255, 0).astype(np.uint8)
    logo = Image.fromarray(np.dstack([np.asarray(im), alpha]), "RGBA")
    logo.putalpha(logo.getchannel("A").filter(ImageFilter.GaussianBlur(0.7)))
    return logo.crop(logo.getchannel("A").getbbox())


def cara_de_la_mascota() -> Image.Image:
    """La cara, sin nada del buzo de egresados."""
    m = Image.open(AQUI / "mascota-original.png").convert("RGB")
    return m.crop((160, 0, 840, 680))


def icono(cara: Image.Image, lado: int) -> Image.Image:
    """
    La cara sobre el azul de la marca, con los bordes desvanecidos.

    El original tiene un fondo gris de estudio que sobre el azul de la app
    cantaría como un parche. En vez de recortar el pelo —que es imposible de
    hacer bien, son miles de pelitos— se desvanece hacia el azul.
    """
    base = Image.new("RGB", (lado, lado), MARINO)
    foto = cara.resize((lado, lado), Image.LANCZOS)

    # Máscara redonda y suave: llena en el centro, transparente en los bordes.
    mascara = Image.new("L", (lado, lado), 0)
    ImageDraw.Draw(mascara).ellipse(
        (-lado * 0.08, -lado * 0.08, lado * 1.08, lado * 1.08), fill=255
    )
    mascara = mascara.filter(ImageFilter.GaussianBlur(lado * 0.06))

    base.paste(foto, (0, 0), mascara)
    return base


def icono_recortable(cara: Image.Image, lado: int) -> Image.Image:
    """
    Versión `maskable`: Android le recorta los bordes con la forma que quiera,
    así que la cara va más chica y centrada, con azul alrededor.
    """
    base = Image.new("RGB", (lado, lado), MARINO)
    dentro = int(lado * 0.62)
    foto = cara.resize((dentro, dentro), Image.LANCZOS)

    mascara = Image.new("L", (dentro, dentro), 0)
    ImageDraw.Draw(mascara).ellipse((0, 0, dentro, dentro), fill=255)
    mascara = mascara.filter(ImageFilter.GaussianBlur(dentro * 0.04))

    borde = (lado - dentro) // 2
    base.paste(foto, (borde, borde), mascara)
    return base


def main() -> None:
    PUBLICO.mkdir(parents=True, exist_ok=True)

    logo = recortar_logo()
    # 900 de ancho alcanza para pantallas densas y pesa poco.
    ancho = 900
    logo = logo.resize((ancho, round(logo.height * ancho / logo.width)), Image.LANCZOS)
    logo.save(PUBLICO / "logo-incollege.png", optimize=True)
    print(f"  logo-incollege.png        {logo.width}x{logo.height}")

    cara = cara_de_la_mascota()
    cara.save(AQUI / "mascota-cara.png", optimize=True)

    for archivo, imagen in [
        ("icono-192.png", icono(cara, 192)),
        ("icono-512.png", icono(cara, 512)),
        ("apple-touch-icon.png", icono(cara, 180)),
        ("icono-maskable-512.png", icono_recortable(cara, 512)),
        ("favicon-64.png", icono(cara, 64)),
    ]:
        imagen.save(PUBLICO / archivo, optimize=True)
        print(f"  {archivo:<25} {imagen.width}x{imagen.height}")


if __name__ == "__main__":
    main()
