"""La page nomme aussi son boot : le re-pack de la CI retrouve encore sa N-1.

Lot 14 de l'audit du 03/10. Le greffon `loggia-precharger-boot`
(vite.config.js) ajoute a `index.html` un `<link rel="modulepreload">` pour le
boot et `vendor` : ils se telechargent avec la page au lieu d'attendre le
catalogue de langue. Or `generation_precedente` reconnaissait l'entree d'avant
- troisieme source, le re-pack de la CI qui clone sans tags - aux prefixes de
TOUT ce que la page nomme : `index-`, puis `boot-` et `vendor-`. Il trouvait
alors deux « autres » (l'entree et le boot d'avant) au lieu d'une, ne protegeait
plus rien, et la regle 3 retirait un module que seule la page d'avant reclame -
puis la regle 4 son boot et son entree : la CI voyait un `git diff`.
"""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path

import pytest

DEPOT = Path(__file__).resolve().parents[2]
REL = "custom_components/loggia/frontend"
T = 1_700_000_000


def chunk(*tire):
    """Un chunk qui en reclame d'autres, comme `__vite__mapDeps`."""
    return "const d=[%s];" % ",".join('"./%s"' % f for f in tire)


def generation(g, robot=None):
    """`index` tire `boot`, qui tire `vendor` (inchange d'une generation a
    l'autre) et, s'il existe encore, `robot`."""
    fichiers = {
        "index-%s.js" % g: chunk("boot-%s.js" % g),
        "boot-%s.js" % g: chunk("vendor-Vaaaaaaa.js", *([robot] if robot else [])),
        "vendor-Vaaaaaaa.js": "export const r=1;",
    }
    if robot:
        fichiers[robot] = "export const x=1;"
    return fichiers


def page(g, inline=False, src_d_abord=False):
    """La page telle que Vite l'ecrit depuis le lot 14 : l'entree, PUIS le boot
    et `vendor` en `modulepreload` ; dans le paquet, la feuille est inline.
    `src_d_abord` : l'entree aux attributs dans l'autre ordre."""
    feuille = ('<style>.a{}</style>' if inline
               else '<link rel="stylesheet" crossorigin href="./assets/index-%s.css">' % g)
    entree = (('<script src="./assets/index-%s.js" crossorigin type="module"></script>' if src_d_abord
               else '<script type="module" crossorigin src="./assets/index-%s.js"></script>') % g)
    return ('<!DOCTYPE html><html><head>\n%s\n'
            '<link rel="modulepreload" crossorigin href="./assets/boot-%s.js">\n'
            '<link rel="modulepreload" crossorigin href="./assets/vendor-Vaaaaaaa.js">\n'
            '%s\n</head><body><div id="root"></div></body></html>\n') % (entree, g, feuille)


def poser(dossier, fichiers, quand=T):
    os.makedirs(dossier, exist_ok=True)
    for nom, texte in fichiers.items():
        chemin = os.path.join(dossier, nom)
        with open(chemin, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(texte)
        os.utime(chemin, (quand, quand))


# La page d'avant reclame `robot`, que le build du jour ne produit plus.
G2 = generation("G2aaaaaa", robot="robot-R2aaaaaa.js")
# Le build du jour, avec sa feuille : le pack l'inline dans la page.
G3 = dict(generation("G3aaaaaa"), **{"index-G3aaaaaa.css": ".a{}"})


@pytest.fixture
def pack(tmp_path, monkeypatch):
    """Le script pointe sur un depot simule, sans git ni tags : la CI."""
    spec = importlib.util.spec_from_file_location(
        "pack_frontend_lot14", DEPOT / "scripts" / "pack_frontend.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "RACINE", str(tmp_path))
    monkeypatch.setattr(module, "DIST", str(tmp_path / "dist"))
    monkeypatch.setattr(module, "CIBLE", str(tmp_path / REL))
    monkeypatch.setattr(module, "tags_publies", lambda racine: [], raising=False)
    monkeypatch.setattr(module, "git_lire", lambda racine, objet: None, raising=False)
    poser(tmp_path / "dist" / "assets", G3, T + 100)
    poser(tmp_path / "dist", {"index.html": page("G3aaaaaa")}, T + 100)
    return module


@pytest.mark.parametrize("src_d_abord", [False, True])
def test_le_re_pack_sans_tags_garde_la_page_d_avant(pack, tmp_path, capsys, src_d_abord):
    poser(tmp_path / "dist", {"index.html": page("G3aaaaaa", src_d_abord=src_d_abord)}, T + 100)
    assets = tmp_path / REL / "assets"
    poser(assets, G2)
    poser(tmp_path / REL, {"index.html": page("G2aaaaaa", inline=True, src_d_abord=src_d_abord)})
    # Le poste : la page en place est celle d'avant (deuxieme source).
    assert pack.main() == 0
    avant = {f: Path(assets, f).read_bytes() for f in os.listdir(assets)}
    assert set(avant) == set(G2) | set(G3)
    html = Path(tmp_path, REL, "index.html").read_text(encoding="utf-8")
    # Le pack garde les balises du greffon, telles quelles.
    assert '<link rel="modulepreload" crossorigin href="./assets/boot-G3aaaaaa.js">' in html
    capsys.readouterr()

    # La CI : meme build, page en place = celle du jour, pas de tags.
    assert pack.main() == 0

    assert "page N-1 protegee   : paquet en place (index-G2aaaaaa.js)" in capsys.readouterr().out
    assert {f: Path(assets, f).read_bytes() for f in os.listdir(assets)} == avant
