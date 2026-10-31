"""Ecrire un fichier d'un seul tenant (lot 8 de l'audit du 28/10, B5).

Le plan 3D d'un etage et la photo de fond d'un compte s'ecrivaient par un
fichier temporaire au nom FIXE (`<etage>.glb.tmp`, `<compte>.jpg.tmp`), puis
un renommage. Deux envois simultanes ecrivaient dans le meme temporaire : le
premier renommage emportait un fichier que le second etait encore en train
d'ecrire, et le second echouait faute de temporaire. Chaque envoi a desormais
son temporaire a lui, dans le MEME dossier - `os.replace` n'est atomique qu'au
sein d'un meme systeme de fichiers -, et le dernier renommage gagne, entier.

Synchrone : les appelants passent par l'executor.
"""
from __future__ import annotations

import contextlib
import os
import tempfile
from pathlib import Path


def ecrire_d_un_tenant(cible: Path, octets: bytes) -> None:
    """`cible` recoit `octets` entiers, ou garde son contenu d'avant - jamais un fichier a moitie ecrit."""
    descripteur, temporaire = tempfile.mkstemp(dir=cible.parent, prefix=cible.name + ".", suffix=".tmp")
    try:
        with os.fdopen(descripteur, "wb") as fichier:
            fichier.write(octets)
        # `mkstemp` cree en 0600 ; `write_bytes` creait selon l'umask, 0644
        # avec celui de Home Assistant (022) : le fichier reste lisible comme
        # avant. Un temporaire laisse par un arret brutal garde son nom
        # aleatoire ; rien ne liste ces dossiers, et la vue ne le sert pas.
        os.chmod(temporaire, 0o644)
        os.replace(temporaire, cible)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(temporaire)
        raise
