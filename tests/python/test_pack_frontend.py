"""Le filet N-1 du paquet : la page d'avant garde TOUS ses fichiers.

Audit du 03/10. L'ADR 0072 promet qu'une page restee ouverte pendant une mise a
jour HACS retrouve ses fichiers : la generation du jour ET celle d'avant. Sur
les huit derniers passages d'une release a la suivante (v3.77.0 -> v3.84.0),
sept ont fait perdre a la page precedente 10 a 17 de ses 28 fichiers, dont son
`boot` et son entree. La retenue triait par date - un checkout pose tout a la
meme seconde -, la regle 4 rasait ce que ce tirage avait troue, et le tout
comptait les passages du pack, pas les releases.

`scripts/pack_frontend.py` n'est pas un module du composant : on le charge par
son chemin, et l'on pointe `RACINE`, `DIST` et `CIBLE` sur un depot simule. Git
est remplace par deux doublures : aucun test ne doit dependre des tags du depot
ou il tourne. Elles sont posees sans exiger que le script les porte
(`raising=False`) : sur l'ancien code, ces tests echouent sur leurs
assertions, pas sur la fixture.
"""
from __future__ import annotations

import importlib.util
import os
import re
from pathlib import Path

import pytest

DEPOT = Path(__file__).resolve().parents[2]
REL = "custom_components/loggia/frontend"
# Une date de checkout : tous les fichiers du paquet en place la partagent.
T = 1_700_000_000
FEUILLE = "export const x=1;"


def chunk(*tire, images=()):
    """Un chunk tel que Vite l'emet : la liste `__vite__mapDeps`, un import a la
    demande par module, et les images par `new URL(..., import.meta.url)`."""
    deps = ",".join('"./%s"' % f for f in tire)
    corps = "const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=[%s])))=>i.map(i=>d[i]);" % deps
    corps += "".join('const m%d=()=>import("./%s");' % (k, f)
                     for k, f in enumerate(tire) if f.endswith(".js"))
    corps += "".join('new URL("%s",import.meta.url);' % f for f in images)
    return corps


def generation(g, wx3d, voix, snow, robot=None):
    """Les fichiers d'une compilation.

    `index` tire `boot`, qui tire `wx3d`, `voix`, sa feuille, une image et, s'il
    existe encore, `robot` ; `wx3d` tire `three`. Un nom repris d'une
    generation a l'autre est un module qui n'a pas bouge : il garde son
    empreinte pendant que `boot` change a chaque fois (ADR 0106).
    """
    css = "index-%s.css" % g
    tire = [wx3d, voix, css] + ([robot] if robot else [])
    fichiers = {
        "index-%s.js" % g: chunk("boot-%s.js" % g),
        "boot-%s.js" % g: chunk(*tire, images=[snow]),
        wx3d: chunk("three-T1aaaaaa.js"),
        "three-T1aaaaaa.js": FEUILLE,
        voix: FEUILLE,
        css: ".a{color:red}",
        snow: "<svg/>",
    }
    if robot:
        fichiers[robot] = FEUILLE
    return fichiers


# L'avant-veille, la veille (la page qu'ont les clients), le jour. `robot`
# disparait avec le build du jour : sans protection, la regle 3 le jugerait mort
# et la page de la veille perdrait un module.
G1 = generation("G1aaaaaa", "wx3d-W1aaaaaa.js", "voix-V1aaaaaa.js", "snow-S1aaaaaa.svg", "robot-R1aaaaaa.js")
G2 = generation("G2aaaaaa", "wx3d-W1aaaaaa.js", "voix-V2aaaaaa.js", "snow-S1aaaaaa.svg", "robot-R2aaaaaa.js")
G3 = generation("G3aaaaaa", "wx3d-W3aaaaaa.js", "voix-V2aaaaaa.js", "snow-S3aaaaaa.svg")


def page_dist(g):
    """`dist/index.html` tel que Vite l'ecrit : l'entree et sa feuille."""
    return ('<!DOCTYPE html><html><head>\n'
            '<script type="module" crossorigin src="./assets/index-%s.js"></script>\n'
            '<link rel="stylesheet" crossorigin href="./assets/index-%s.css">\n'
            '</head><body><div id="root"></div></body></html>\n') % (g, g)


def page_paquet(g):
    """L'`index.html` tel que le pack le laisse : la feuille est inline."""
    return ('<!DOCTYPE html><html><head>\n'
            '<script type="module" crossorigin src="./assets/index-%s.js"></script>\n'
            '<style>.a{color:red}</style>\n'
            '</head><body><div id="root"></div></body></html>\n') % g


def poser(dossier, fichiers, quand=T):
    os.makedirs(dossier, exist_ok=True)
    for nom, texte in fichiers.items():
        chemin = os.path.join(dossier, nom)
        with open(chemin, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(texte)
        os.utime(chemin, (quand, quand))


def faux_git(releases):
    """`git cat-file` sur des releases simulees : {tag: (page, fichiers)}."""
    def lire(racine, objet):
        tag, _, chemin = objet.partition(":")
        if tag not in releases:
            return None
        page, fichiers = releases[tag]
        if chemin == REL + "/index.html":
            return page.encode("utf-8")
        nom = chemin.rpartition("/")[2]
        if chemin == REL + "/assets/" + nom and nom in fichiers:
            return fichiers[nom].encode("utf-8")
        return None
    return lire


def renvois_pendants(assets):
    """Ce qu'un fichier du paquet reclame et qui n'y est pas : un 404 chez l'utilisateur."""
    presents = set(os.listdir(assets))
    trous = []
    for f in sorted(presents):
        if f.endswith((".js", ".css")):
            texte = Path(assets, f).read_text(encoding="utf-8")
            trous += ["%s -> %s" % (f, r) for r in re.findall(r"\./([A-Za-z0-9._-]+\.(?:js|css))", texte)
                      if r not in presents]
    return trous


@pytest.fixture
def pack(tmp_path, monkeypatch):
    """Le script, pointe sur un depot simule ; sans git tant qu'un test n'en pose pas."""
    spec = importlib.util.spec_from_file_location(
        "pack_frontend_sous_test", DEPOT / "scripts" / "pack_frontend.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "RACINE", str(tmp_path))
    monkeypatch.setattr(module, "DIST", str(tmp_path / "dist"))
    monkeypatch.setattr(module, "CIBLE", str(tmp_path / REL))
    monkeypatch.setattr(module, "tags_publies", lambda racine: [], raising=False)
    monkeypatch.setattr(module, "git_lire", lambda racine, objet: None, raising=False)
    # Le build du jour, compile APRES le checkout : ses fichiers sont les plus
    # recents, et `copy2` garde leur date.
    poser(tmp_path / "dist" / "assets", G3, T + 100)
    poser(tmp_path / "dist", {"index.html": page_dist("G3aaaaaa")}, T + 100)
    return module


def test_la_page_d_avant_garde_tous_ses_fichiers_et_l_avant_veille_part(pack, tmp_path):
    assets = tmp_path / REL / "assets"
    poser(assets, G2)
    # L'avant-veille un peu PLUS recente que la veille : a dates presque
    # egales, l'ancien tri la gardait, elle, et coupait le `boot` de la veille.
    poser(assets, {f: t for f, t in G1.items() if f not in G2}, T + 10)
    poser(tmp_path / REL, {"index.html": page_paquet("G2aaaaaa")})

    assert pack.main() == 0

    reste = set(os.listdir(assets))
    assert sorted(set(G2) - reste) == [], "la page d'avant a perdu des fichiers"
    assert sorted(set(G3) - reste) == []
    # Rien d'autre : ni l'avant-veille (regles 2 et 3), ni sa feuille `voix`,
    # que la regle 2 gardait comme deuxieme de sa famille (regle 5).
    assert sorted(reste - set(G2) - set(G3)) == []
    assert renvois_pendants(assets) == []


def test_un_second_passage_ne_touche_a_rien(pack, tmp_path):
    """La CI rebatit et re-packe sans les tags (clone a plat), puis exige un
    `git diff` vide : elle doit retrouver la meme page d'avant que le poste."""
    assets = tmp_path / REL / "assets"
    poser(assets, G2)
    poser(tmp_path / REL, {"index.html": page_paquet("G2aaaaaa")})
    assert pack.main() == 0
    avant = {f: Path(assets, f).read_bytes() for f in os.listdir(assets)}
    html = Path(tmp_path, REL, "index.html").read_bytes()

    assert pack.main() == 0

    assert {f: Path(assets, f).read_bytes() for f in os.listdir(assets)} == avant
    assert Path(tmp_path, REL, "index.html").read_bytes() == html
    assert set(avant) == set(G2) | set(G3)


def test_la_release_l_emporte_sur_un_pack_de_travail(pack, tmp_path, monkeypatch):
    """Deux packs dans une meme branche : la page en place est celle du premier,
    que personne n'a jamais recue. Les clients ont celle de la release."""
    gb = generation("Gbaaaaaa", "wx3d-Wbaaaaaa.js", "voix-V2aaaaaa.js", "snow-S3aaaaaa.svg")
    assets = tmp_path / REL / "assets"
    poser(assets, G2)
    poser(assets, {f: t for f, t in gb.items() if f not in G2}, T + 10)
    poser(tmp_path / REL, {"index.html": page_paquet("Gbaaaaaa")}, T + 10)
    monkeypatch.setattr(pack, "tags_publies", lambda racine: ["v3.0.0"], raising=False)
    monkeypatch.setattr(pack, "git_lire", faux_git({"v3.0.0": (page_paquet("G2aaaaaa"), G2)}), raising=False)

    assert pack.main() == 0

    reste = set(os.listdir(assets))
    assert sorted(reste ^ (set(G2) | set(G3))) == []


def test_un_dossier_vide_retrouve_la_page_d_avant_depuis_sa_release(pack, tmp_path, monkeypatch):
    """Le paquet en place a disparu - dossier vide, ou rase par un pack d'avant
    ce correctif. La derniere release porte deja le build du jour (une release
    sans changement d'ecran) : la page d'avant est celle de la release d'avant,
    restauree depuis son tag a l'octet pres."""
    monkeypatch.setattr(pack, "tags_publies", lambda racine: ["v3.1.0", "v3.0.0"], raising=False)
    monkeypatch.setattr(pack, "git_lire", faux_git({
        "v3.1.0": (page_paquet("G3aaaaaa"), G3),
        "v3.0.0": (page_paquet("G2aaaaaa"), G2),
    }), raising=False)

    assert pack.main() == 0

    assets = tmp_path / REL / "assets"
    assert set(os.listdir(assets)) == set(G2) | set(G3)
    for f, texte in G2.items():
        assert Path(assets, f).read_text(encoding="utf-8") == texte, f


def test_une_page_d_avant_trouee_n_est_pas_protegee(pack, tmp_path):
    """Une N-1 trouee ne sert personne : la proteger garderait ses 404. Le pack
    retombe alors sur les regles 2 a 4, comme avant."""
    assets = tmp_path / REL / "assets"
    poser(assets, {f: t for f, t in G2.items() if not f.startswith("boot-")})
    poser(tmp_path / REL, {"index.html": page_paquet("G2aaaaaa")})

    assert pack.main() == 0

    reste = set(os.listdir(assets))
    assert "index-G2aaaaaa.js" not in reste
    assert sorted(set(G3) - reste) == []
    assert renvois_pendants(assets) == []
