"""Un refus PREVISIBLE se dit par son CODE (audit du 03/10).

Le composant repondait ses refus en francais sans accents — « trop de
scenarios (24 au plus) », « valeur trop volumineuse pour la cle … » —, et
l'ecran les affichait tels quels, dans les sept langues ; le toast reconnaissait
meme le passage refuse vers un profil Admin a une expression sur ce francais.

Un refus qu'un geste ordinaire peut provoquer — un plafond du magasin, une
limite de scenarios, d'actions, de plannings — porte desormais un code a lui,
que l'ecran traduit (`src/refus.js`). Son message reste ecrit pour le journal
de Home Assistant. Ce qu'il NOMME — une cle, une limite — suit les
deux-points, comme le fait deja `not_admin` (store.py) : c'est le seul repere
que l'ecran lise dans le message.

Un `ValueError` : qui attrapait deja le refus l'attrape toujours, et les
commandes WebSocket en relaient le code (`_relayer`, websocket_api.py).
"""
from __future__ import annotations


class RefusNomme(ValueError):
    """Un refus qui porte son code, et ce qu'il nomme apres les deux-points."""

    def __init__(self, code: str, motif: str, nomme: object = "") -> None:
        self.code = code
        self.motif = motif
        self.nomme = str(nomme)
        super().__init__(motif + (" : " + self.nomme if self.nomme else ""))

    def __reduce__(self):
        # Une copie se refait depuis ses trois parties, pas depuis le message.
        return (type(self), (self.code, self.motif, self.nomme))
