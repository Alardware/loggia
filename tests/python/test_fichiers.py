"""Un fichier s'ecrit d'un seul tenant, un temporaire par envoi (lot 8 de l'audit du 28/10, B5).

Le plan 3D et la photo de fond passaient par un temporaire au nom fixe : deux
envois simultanes se marchaient dessus. TESTS AJOUTES (30/10).
"""
from __future__ import annotations

import os
import sys
import threading

import pytest

from conftest import COMPOSANT, charger
from test_fond import JPEG
from test_plan import glb


@pytest.fixture
def fichiers():
    return charger("fichiers")


def test_chaque_envoi_a_son_temporaire_dans_le_meme_dossier(fichiers, tmp_path, monkeypatch):
    vus = []
    vrai = os.replace

    def noter(source, cible):
        vus.append((source, cible))
        vrai(source, cible)

    monkeypatch.setattr(os, "replace", noter)
    cible = tmp_path / "rdc.glb"
    fichiers.ecrire_d_un_tenant(cible, b"un")
    fichiers.ecrire_d_un_tenant(cible, b"deux")
    assert vus[0][0] != vus[1][0], "deux envois, un seul temporaire"
    for source, arrivee in vus:
        assert os.path.dirname(source) == str(tmp_path), "le temporaire quitte le dossier : os.replace n'est plus atomique"
        assert arrivee == cible
    assert cible.read_bytes() == b"deux"
    assert sorted(p.name for p in tmp_path.iterdir()) == ["rdc.glb"]


def test_un_renommage_rate_garde_l_ancien_et_ne_laisse_rien(fichiers, tmp_path, monkeypatch):
    cible = tmp_path / "compte.jpg"
    cible.write_bytes(b"ancien")

    def refuser(source, arrivee):
        raise OSError("disque plein")

    monkeypatch.setattr(os, "replace", refuser)
    with pytest.raises(OSError):
        fichiers.ecrire_d_un_tenant(cible, b"nouveau")
    assert cible.read_bytes() == b"ancien"
    assert sorted(p.name for p in tmp_path.iterdir()) == ["compte.jpg"], "le temporaire est reste"


@pytest.mark.parametrize("module, ecrire, lire, nom, contenus", [
    ("plan", "ecrire_plan", "lire_plan", "maison", [glb(b"a" * 4096), glb(b"b" * 8192)]),
    ("fond", "ecrire_fond", "lire_fond", "u1", [JPEG, b"\xff\xd8\xff\xe0" + b"autre" * 1000 + b"\xff\xd9"]),
])
def test_des_envois_simultanes_laissent_un_fichier_entier(tmp_path, module, ecrire, lire, nom, contenus):
    """Vingt envois en meme temps du meme etage, de la meme photo : aucun ne
    leve, et le fichier final est l'un d'eux, entier.

    Sous Windows seulement, deux renommages simultanes vers la meme cible
    peuvent etre refuses par le systeme (« acces refuse ») : l'envoi echoue
    alors proprement, sans temporaire laisse. Home Assistant tourne sous
    Linux, ou `os.replace` remplace toujours."""
    m = charger(module)
    erreurs = []

    def envoyer(octets):
        try:
            getattr(m, ecrire)(tmp_path, nom, octets)
        except Exception as err:  # noqa: BLE001
            erreurs.append(err)

    fils = [threading.Thread(target=envoyer, args=(contenus[i % 2],)) for i in range(20)]
    for f in fils:
        f.start()
    for f in fils:
        f.join()
    tolerees = (PermissionError,) if sys.platform == "win32" else ()
    assert [e for e in erreurs if not isinstance(e, tolerees)] == []
    assert len(erreurs) < len(fils)
    assert getattr(m, lire)(tmp_path, nom) in contenus
    assert not list(tmp_path.glob("*.tmp"))


def test_le_plan_et_la_photo_passent_par_l_ecriture_commune():
    for module, ancien in (("plan.py", '".glb.tmp"'), ("fond.py", '".jpg.tmp"')):
        source = (COMPOSANT / module).read_text(encoding="utf-8")
        assert ancien not in source and "ecrire_d_un_tenant(cible, octets)" in source, module
