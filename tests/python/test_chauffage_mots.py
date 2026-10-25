"""Le journal du planning de chauffe se lit dans les sept langues (plan 2, tache 3).

Le moteur (`chauffage.py`) ecrit son journal en francais, comme chaque module
(ADR 0070) ; l'ecran le traduit par la CLE francaise (`src/journalmots.js`) —
un mot fixe par son texte, un texte compose par son gabarit. Un mot sans cle
s'affiche en francais dans les six autres langues, et rien ne le verrait :
sur le modele du distributeur (`test_distributeurs.py`, « le journal se lit
dans les sept langues »).
"""
from __future__ import annotations

from conftest import COMPOSANT, RACINE, charger

# Tout ce que le moteur ecrit au journal : mots fixes et gabarits. Les mots
# partages avec d'autres modules (« planning », « retenu », « maison vide »…)
# y sont aussi : leur cle ne doit pas partir sans que ce test le dise.
MOTS_DU_JOURNAL = (
    # la regle : d'ou vient la decision (`voulu["source"]`), ou la maison
    "planning", "maison", "fenetre", "main",
    # quoi : le mode (`MOTS`), la consigne d'une reprise, la maison (`MOTS_MAISON`), la reprise
    "Confort", "Confort −1", "Confort −2", "Éco", "Hors-gel", "Arrêt", "{t} °C",
    "Planning", "Absence", "Vacances", "Été",
    "reprise en main", "reprendre le planning", "retenu",
    # pourquoi (motif)
    "planning {heure}", "fenêtre ouverte", "jusqu’à relance", "jusqu’à {heure}",
    "fin de la reprise en main", "fin des vacances", "maison vide", "retour",
    # ce qui s'est passe (detail)
    "appareil injoignable", "rattrapage au redémarrage", "nouvel échec, on attend",
    "commande refusee par Home Assistant", "geste fait ailleurs",
    # un ordre accepte que l'appareil n'a pas pris (relecture finale du 12/10, point 1)
    "non confirmé",
    # une pompe a chaleur qui refroidit : le planning attend (audit du 19/10)
    "il refroidit",
)


def test_chaque_mot_du_journal_du_chauffage_a_sa_cle_dans_chaque_langue():
    """Rouge tant que les catalogues ne les portent pas (plan 2, tache 3)."""
    source = (COMPOSANT / "chauffage.py").read_text(encoding="utf-8")
    for mot in MOTS_DU_JOURNAL:
        assert f'"{mot}"' in source, "plus ecrit par chauffage.py, a retirer d'ici : " + mot
    manquants = []
    for langue in ("en", "de", "nl", "it", "es", "pl"):
        catalogue = (RACINE / "src" / "langues" / (langue + ".js")).read_text(encoding="utf-8")
        manquants += [f"{langue} : {mot}" for mot in MOTS_DU_JOURNAL
                      if f"'{mot}':" not in catalogue and f'"{mot}":' not in catalogue]
    assert manquants == [], "sans cle, ces mots s'affichent en francais : " + ", ".join(manquants)


def test_un_mode_nouveau_rejoint_les_mots_du_journal():
    """Les mots les plus susceptibles de grandir sont ceux des modes et de la
    maison : un mode de plus dans `MOTS` ou `MOTS_MAISON` doit entrer ici, et
    donc aux six catalogues."""
    chauffage = charger("chauffage")
    nouveaux = (set(chauffage.MOTS.values()) | set(chauffage.MOTS_MAISON.values())) - set(MOTS_DU_JOURNAL)
    assert not nouveaux, "un mot du journal sans cle : " + ", ".join(sorted(nouveaux))
