"""Volets : le planning du soleil, la protection solaire, la mise a l'abri.

Pourquoi ce module existe
─────────────────────────
La vue Volets de Loggia savait piloter un planning, mais pas le tenir : elle
lisait un `input_select` et des `input_boolean` que l'utilisateur avait crees
lui-meme, et c'est une automatisation YAML ecrite a la main qui faisait le
travail. Loggia n'etait qu'une telecommande posee sur le montage de quelqu'un
d'autre. Installer Loggia ne suffisait pas : il fallait encore ecrire
l'automatisation.

Ce module la porte. Quatre regles, chacune debrayable :

  planning   ouvrir au lever, fermer au coucher, avec un decalage en minutes
             de part et d'autre et le choix des jours.
  soleil     l'ete, quand le soleil frappe une facade, baisser les volets de
             ce cote-la, puis les remettre ou ils etaient quand il est passe.
             L'orientation se donne une fois par volet ; l'azimut et
             l'elevation viennent de `sun.sun`, que Home Assistant tient a
             jour. Cette regle ne fait que BAISSER : un volet deja plus bas
             que la consigne n'est pas touche.
  vent       au-dela d'un seuil, tout remonter. Un volet baisse dans une
             rafale est un volet plie, et cette regle PRIME sur les deux
             autres — sans quoi la protection solaire le rabaisserait dans la
             minute.
  baie       ne pas fermer un volet tant que la porte ou la fenetre devant
             lui est ouverte : la fermeture attend que la baie se referme,
             et tombe au matin si elle ne s'est pas refermee. Un capteur
             muet ne vaut ni ouvert ni ferme : on ferme, et le journal le
             dit (ADR 0010).

Ce que ce module n'est pas
──────────────────────────
Il n'ecrit pas dans `automations.yaml` et ne cree rien dans l'ecran
Automatisations de Home Assistant. Le prix a payer est clair : ces regles
vivent avec Loggia et disparaissent avec lui. En echange, elles ne dependent
d'aucun format d'editeur, ne peuvent pas etre ecrasees par une sauvegarde de
l'interface, et se reglent la ou l'on regarde ses volets.

La geometrie est ecrite en fonctions pures, testables sans Home Assistant :
c'est la que se joue « ce volet est-il au soleil », et c'est ce qu'on veut
pouvoir verifier sans lever le jour.
"""
from __future__ import annotations

import copy
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback

from .nombres import fini, lu
from .refus import RefusNomme
from .regles import MAX_JOURNAL, demarrer, niveau
from .textes import joindre
from .unites import depuis_celsius, unite_temperature
from .ouvrants import STORE_BANNE, est_fenetre_de_toit, est_volet, geste_au_vent, ouvre_et_ferme
from .volets_calcul import _mouvement, a_venir, cible_de, ecrire_instant, entier, regle_de, soleil_par_date

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_volets"
SOLEIL = "sun.sun"

# Le bit SET_POSITION de CoverEntityFeature. Un volet qui ne l'a pas ne connait
# que l'ouvert et le ferme : lui demander 30 % ne donnerait rien.
COVER_SET_POSITION = 4

# Combien de degres le soleil doit avoir quitte la facade avant qu'on rouvre.
# Sans cette garde, le volet battrait des qu'il longe le bord du cone.
HYSTERESE_DEG = 8.0

# Quand la protection relache (spec Volets 6.3) : on avance sur la grille des
# cinq minutes, sur vingt-quatre heures au plus, jusqu'a ce que le soleil sorte
# du cone avec l'hysterese de la regle.
PAS_PROTECTION = timedelta(minutes=5)
HORIZON_PROTECTION = timedelta(hours=24)

# Qui l'emporte quand deux regles visent le meme volet — declare ici, une fois,
# plutot qu'enfoui dans l'ordre des appels, et pris dans l'ECHELLE de la
# maison (`regles.ECHELLE`) pour valoir aussi face aux autres modules. Du plus
# fort au plus faible :
#
#   vent     surete : on remonte quoi qu'il arrive — un volet baisse dans une
#            rafale se plie ;
#   coucher  nuit : la nuit ferme, meme un volet que le soleil tenait — sans
#            quoi la protection, en rendant le volet, le rouvrait a la nuit
#            tombee ;
#   soleil   confort : le soleil protege, et le matin n'ouvre pas dans sa face ;
#   lever    confort : le reste du temps, le planning ouvre.
#
# Au-dessus de toutes : une main. Le geste manuel gele — voir `regles.py`.
PRIORITES = {"vent": niveau("surete", 10), "coucher": niveau("nuit"),
             "soleil": niveau("confort", 5), "lever": niveau("confort")}

# Ordre non abouti (ADR 0007) : deux minutes apres un ordre, un volet joignable
# doit avoir bouge. Sinon on redemande, `tentatives` fois, puis le journal le
# dit en rouge. La position se juge a cinq pres : un volet s'arrete rarement
# au pour cent exact.
VERIF_DELAI = 120
VERIF_TOLERANCE = 5
# Un volet qui a REPONDU a l'ordre sans etre arrive merite un tour de plus
# avant qu'on redemande, et au plus tant de tours : Netatmo bascule l'etat tout
# de suite et ne publie la position qu'une a trois minutes apres.
ATTENTES_MAX = 2
# Les manoeuvres d'un volet, pour l'historique de sa fiche (spec Volets 6.5) :
# au plus tant de lignes par reponse.
MANOEUVRES_MAX = 200
TENTATIVES_MIN, TENTATIVES_MAX, TENTATIVES_DEFAUT = 1, 3, 2
# Ce que le redemarrage effacait (audit du 19/10) : les ordres en attente et
# l'heure de la derniere sonnerie de chaque sens, dans un petit fichier a part
# de `.storage`. Une sonnerie manquee pendant que Home Assistant redemarrait se
# rattrape au demarrage, jamais plus de trois heures apres son heure.
CLE_MEMOIRE = "loggia_volets_memoire"
RATTRAPAGE_MAX_S = 3 * 3600
# Un anemometre muet ne tient pas l'abri pour toujours (audit du 19/10) : passe
# ce silence, l'abri se releve, le journal le dit, et le planning reprend.
VENT_MUET_S = 30 * 60
# L'abri ne se leve qu'apres un calme TENU (relecture du 19/10) : sous 0,85 x
# le seuil pendant tant de secondes. Sans lui, des rafales qui oscillent
# autour du seuil ouvraient puis refermaient toute la maison, la nuit.
CALME_S = 15 * 60
# La protection solaire ne rend un volet qu'un degre SOUS sa temperature : a
# 25 °C pile, un capteur qui oscille d'un dixieme la faisait battre.
HYSTERESE_TEMP = 1.0
# Le seuil « ferme » de l'ecran (V12, voletecran.js `SEUIL_FERME`), le meme que
# scenarios.py : deux pour cent.
SEUIL_FERME = 2
# Les decalages du planning, en minutes : ceux que l'ecran propose (voletsfiche.js,
# « de -120 a +240 »). Au-dela, le patch est refuse ; une valeur deja
# enregistree hors bornes se borne a la lecture.
DECALAGE_MIN, DECALAGE_MAX = -120, 240

DEFAUT: dict[str, Any] = {
    "planning": {"actif": False, "mode": "auto", "ouverture": {"decalage": 0},
                 "fermeture": {"decalage": 0}, "jours": [0, 1, 2, 3, 4, 5, 6], "volets": {}},
    "soleil": {"actif": False, "position": 30, "elevation_min": 15, "temp_min": 25,
               "temp_entite": "", "volets": {}},
    "vent": {"actif": False, "entite": "", "seuil": 50},
    # Les fenetres de toit (velux) : Loggia ne fait que les FERMER — au
    # coucher, par vent fort, dans un scenario qui ferme. Sur option : chacun
    # choisit (03/10, voir ouvrants.py).
    "velux": {"actif": False},
    # Volet bloque : la porte ou la fenetre devant chaque volet (ADR 0010).
    "baies": {"actif": False, "volets": {}},
    # Ordre non abouti : combien de fois redemander avant la ligne rouge (ADR 0007).
    "verification": {"tentatives": TENTATIVES_DEFAUT},
    # Observer sans agir : les regles notent ce qu'elles auraient fait.
    "simulation": {"actif": False},
}


def atteint(position, cible, tolerance: int = VERIF_TOLERANCE) -> bool:
    """Le volet est-il la ou l'ordre l'envoyait ? Sans position connue, on
    ne sait pas — et l'appelant ne conclut rien."""
    if position is None or cible is None:
        return False
    try:
        return abs(int(position) - int(cible)) <= tolerance
    except (TypeError, ValueError):
        return False


def sans_bascule(service: str, signature) -> bool:
    """Un ordre qui ne fait pas basculer l'etat publie : une position - de 100 a
    30, le volet reste `open` -, ou un etat deja celui qu'il vise - ouvrir un
    volet `open` arrete a 1 %, fermer un volet `closed`. Rien ne montre alors
    qu'il obeit avant sa position, qui arrive une a trois minutes apres l'ordre
    chez Netatmo. `signature` : ce que le volet publiait a l'ordre."""
    if service == "set_cover_position":
        return True
    etat = signature[0] if isinstance(signature, list) and signature else None
    return (service, etat) in (("open_cover", "open"), ("close_cover", "closed"))


def tentatives_valides(brut) -> int:
    """Le seul reglage de la verification : un entier de 1 a 3."""
    if isinstance(brut, bool) or not isinstance(brut, int):
        raise ValueError("tentatives : un nombre entier")
    if brut < TENTATIVES_MIN or brut > TENTATIVES_MAX:
        raise ValueError("tentatives : entre %d et %d" % (TENTATIVES_MIN, TENTATIVES_MAX))
    return brut


def decalage_valide(brut, nom: str):
    """Un decalage que l'ecran ecrit : un entier de DECALAGE_MIN a DECALAGE_MAX
    (des chiffres en chaine comptent, comme le moteur les lit). Refuse sinon,
    en nommant la cle (audit du 19/10)."""
    n = None if isinstance(brut, bool) else entier(brut)
    if n is None or n < DECALAGE_MIN or n > DECALAGE_MAX:
        raise RefusNomme("volets_decalage_hors_bornes",
                         "decalage illisible ou hors bornes (%+d a %+d min)" % (DECALAGE_MIN, DECALAGE_MAX), nom)
    return brut


def seuil_vent_valide(brut):
    """Le seuil du vent : un nombre fini, plus grand que zero. Nul, il mettait la
    maison a l'abri pour toujours - tout vent est >= 0 (audit du 19/10)."""
    valeur = fini(brut)
    if valeur is None or valeur <= 0:
        raise RefusNomme("volets_seuil_vent", "seuil de vent illisible ou nul", "vent.seuil")
    return brut


def meme_valeur(a, b) -> bool:
    """Une valeur que le patch ne CHANGE pas : la meme, et du meme type - `True`
    n'est pas le decalage 1, meme si Python les dit egaux."""
    return type(a) is type(b) and a == b


def borner_decalage(brut):
    """A la LECTURE : un decalage lisible hors bornes y est ramene ; le reste ne
    change pas (le moteur lit l'illisible comme avant)."""
    n = None if isinstance(brut, bool) else entier(brut)
    if n is None or DECALAGE_MIN <= n <= DECALAGE_MAX:
        return brut
    return max(DECALAGE_MIN, min(DECALAGE_MAX, n))


# ── La geometrie, en pur ───────────────────────────────────────────────────
def ecart_azimut(a, b) -> float:
    """Le plus petit angle entre deux azimuts, en degres (0 a 180).

    Un ecart brut se trompe au passage du nord : 350° et 10° sont voisins de
    20°, pas eloignes de 340°.
    """
    d = abs((float(a) - float(b)) % 360.0)
    return 360.0 - d if d > 180.0 else d


def au_soleil(azimut, elevation, orientation, ouverture=90.0, elevation_min=15.0, marge=0.0) -> bool:
    """Le soleil frappe-t-il une facade orientee ainsi ?

    `ouverture` est la demi-largeur du cone vise, de part et d'autre de
    l'orientation : 90° couvre tout ce que la facade peut voir, moins la
    resserre autour du plein axe. `marge` sert a l'hysterese — on exige un peu
    plus pour rouvrir que pour fermer.
    """
    if azimut is None or elevation is None or orientation is None:
        return False
    try:
        if float(elevation) < float(elevation_min):
            return False
        return ecart_azimut(azimut, orientation) <= max(0.0, float(ouverture) - float(marge))
    except (TypeError, ValueError):
        return False


def fin_protection(position_soleil, orientation, ouverture, elevation_min, maintenant):
    """Quand la protection solaire relachera ce volet : le premier instant de la
    grille des cinq minutes, apres `maintenant` et dans les 24 h, ou le soleil a
    quitte la facade AVEC l'hysterese de la regle - `au_soleil(..., marge=
    HYSTERESE_DEG)` faux, ce que `_async_soleil` exige pour rendre le volet.

    `position_soleil(instant)` rend (azimut, hauteur) pour un instant UTC. La
    temperature qui retombe n'est pas prevue : c'est une heure « vers ». None
    quand le soleil ne sort pas dans les 24 h, ou que sa position est
    illisible."""
    pas = int(PAS_PROTECTION.total_seconds())
    t = (int(maintenant.timestamp()) // pas + 1) * pas
    fin = maintenant.timestamp() + HORIZON_PROTECTION.total_seconds()
    while t <= fin:
        instant = datetime.fromtimestamp(t, tz=timezone.utc)
        try:
            azimut, hauteur = position_soleil(instant)
        except Exception:  # noqa: BLE001 — astral, ou une doublure : on ne sait pas
            return None
        if azimut is None or hauteur is None:
            return None
        if not au_soleil(azimut, hauteur, orientation, ouverture, elevation_min, marge=HYSTERESE_DEG):
            return instant
        t += pas
    return None


def volets_du_jour(plan, cibles, sens: str, quand) -> list:
    """Parmi `cibles`, ceux que leurs jours autorisent aujourd'hui.

    Le filtre par jour ne peut pas vivre a la programmation. `_async_reprogrammer`
    ne tourne qu'au demarrage et a l'enregistrement, tandis que les rendez-vous
    poses, eux, sonnent TOUS LES JOURS. Filtrer a la pose figeait donc la
    decision : une chambre reglee sur le week-end, configuree un mardi, n'aurait
    jamais recu de rendez-vous — et ne se serait plus ouverte du tout. Configuree
    un samedi, elle se serait ouverte aussi le lundi. On filtre donc quand la
    cloche sonne.

    Les jours propres d'un volet « Heures a lui » (`regle_de` : « perso »)
    REMPLACENT ceux de la maison pour ce sens (chantier Volets, V5). Ils ne
    faisaient que les restreindre : une chambre reglee sur le week-end, dans
    une maison reglee du lundi au vendredi, ne s'ouvrait jamais. Sans jours
    propres - ou sans « Heures a lui » -, le volet suit ceux de la maison.
    """
    par_volet = plan.get("volets") or {}
    garde = []
    for haid in cibles:
        reglage = par_volet.get(haid) if isinstance(par_volet, dict) else None
        jours = (reglage.get("jours_" + sens)
                 if isinstance(reglage, dict) and regle_de(plan, haid) == "perso" else None)
        if not isinstance(jours, list):
            # Les jours de la maison : absents, tous ; une liste vide, aucun.
            if jour_actif(plan.get("jours"), quand):
                garde.append(haid)
            continue
        # Sept jours decoches donne [] : c'est « jamais », pas « toujours » -
        # comme pour les jours de la maison depuis le 19/10 (`jour_actif`).
        #
        # Les jours viennent du stockage, que rien n'oblige a contenir des
        # entiers. Des chaines feraient echouer le test d'appartenance en
        # silence, et le volet ne bougerait plus jamais sans que rien ne
        # l'explique. Le reste du fichier caste partout ; ici aussi.
        propres = set()
        for j in jours:
            try:
                propres.add(int(j))
            except (TypeError, ValueError):
                pass
        if quand.weekday() in propres:
            garde.append(haid)
    return garde


def groupes_horaires(plan, covers, sens: str) -> dict:
    """Les volets ranges par decalage, pour un sens donne.

    Le planning n'a longtemps connu qu'une heure pour toute la maison. Or on
    ne veut pas que la chambre s'ouvre au lever du soleil comme le salon. Un
    volet peut donc porter son propre decalage, qui REMPLACE le general, ou
    se retirer entierement du planning.

    Les JOURS ne se jugent pas ici : quand la cloche sonne, par
    `volets_du_jour` (V5). Le filtre par jour qui vivait ici, derriere un
    argument `quand` qu'aucun appel ne passait plus, est parti le 19/10.

    Renvoie {minutes: [entity_id]} — un rendez-vous par valeur distincte,
    plutot qu'un rendez-vous par volet.
    """
    # `plan[sens]` doit etre un dict — mais rien ne l'y oblige. La MEME cle
    # porte deux formes selon le niveau : ici `{"decalage": N}`, et un entier nu
    # dans `plan["volets"][haid]`. Un patch qui applique la seconde forme au
    # premier niveau remplace le dict par un entier ou une chaine, et `.get`
    # levait alors une `AttributeError` que le `except` ne rattrapait pas.
    #
    # Le degat ne s'arretait pas la : `async_enregistrer` persiste AVANT de
    # reprogrammer, si bien que la configuration fautive etait deja ecrite quand
    # le plantage survenait — et se reproduisait a chaque demarrage jusqu'a une
    # correction a la main dans `.storage`.
    section = plan.get(sens)
    if not isinstance(section, dict):
        section = {}
    try:
        general = int(section.get("decalage") or 0)
    except (TypeError, ValueError):
        general = 0
    par_volet = plan.get("volets") or {}
    groupes: dict = {}
    for haid in covers:
        reglage = par_volet.get(haid) if isinstance(par_volet, dict) else None
        if isinstance(reglage, dict):
            if reglage.get("exclu"):
                continue
            propre = reglage.get(sens)
            if propre not in (None, ""):
                try:
                    groupes.setdefault(int(propre), []).append(haid)
                    continue
                except (TypeError, ValueError):
                    pass
        groupes.setdefault(general, []).append(haid)
    return groupes


def decalages_du_plan(plan, sens: str) -> set:
    """Les decalages DISTINCTS d'un sens, tires de la CONFIGURATION seule.

    C'est le coeur d'un defaut qui a laisse les regles mortes sans un mot.

    L'armement lisait la liste des volets pour former ses groupes. Or Loggia
    demarre en meme temps que MQTT et Zigbee2MQTT : a cet instant, les `cover.*`
    peuvent ne pas exister encore. `groupes_horaires` rendait alors un
    dictionnaire VIDE, la boucle qui pose les rendez-vous ne tournait pas une
    seule fois, et plus rien ne se declenchait — ni le matin, ni le soir —
    jusqu'au prochain enregistrement de la configuration. Aucune erreur nulle
    part : il n'y avait simplement rien a faire, ce jour-la.

    Les decalages, eux, viennent du reglage. Ils existent avant les entites et
    ne dependent d'aucun ordre de demarrage. On arme donc sur eux, et l'on
    resout les volets QUAND LA CLOCHE SONNE — moment ou l'installation est,
    elle, entierement chargee.
    """
    section = plan.get(sens)
    if not isinstance(section, dict):
        section = {}
    try:
        general = int(section.get("decalage") or 0)
    except (TypeError, ValueError):
        general = 0
    valeurs = {general}
    par_volet = plan.get("volets") or {}
    if isinstance(par_volet, dict):
        for reglage in par_volet.values():
            if not isinstance(reglage, dict) or reglage.get("exclu"):
                continue
            propre = reglage.get(sens)
            if propre in (None, ""):
                continue
            try:
                valeurs.add(int(propre))
            except (TypeError, ValueError):
                pass
    return valeurs


# Les trois positions du mode, reprises de celles que les installations
# ecrivaient a la main dans un `input_select`. `actif` dit si la regle existe ;
# le mode dit ce qu'elle fait aujourd'hui, et c'est lui qu'on change au
# quotidien depuis la vue Volets.
MODES = ("auto", "nuit", "manuel")


def planning_agit(mode, sens: str) -> bool:
    """Le planning doit-il bouger, dans ce mode et dans ce sens ?

    auto     ferme le soir et ouvre le matin.
    nuit     ferme le soir, mais laisse les volets fermes au matin — pour une
             chambre d'ami, un depart, une grasse matinee qui dure.
    manuel   ne touche a rien, sans qu'on ait a defaire les reglages.
    """
    m = str(mode or "auto").lower()
    if m not in MODES:
        m = "auto"
    if m == "manuel":
        return False
    if m == "nuit":
        return sens == "fermer"
    return True


def jour_actif(jours, quand) -> bool:
    """Les jours de la maison, indexes lundi = 0 comme `datetime.weekday()`.

    Absents (ou illisibles) : tous les jours. Une liste VIDE : aucun (audit du
    19/10). Elle repondait « tous », quand Parametres affichait « aucun jour » et
    que les jours propres d'un volet lisaient deja [] comme « jamais » : sept
    cases decochees faisaient bouger la maison chaque jour."""
    if not isinstance(jours, list):
        return True
    return quand.weekday() in jours


def degres(valeur) -> int | None:
    """Une orientation lisible, ramenee de 0 a 359 ; None sinon. Le moteur la
    lit par `float` (`au_soleil`) : « 225 » ecrit en chaine compte aussi."""
    v = lu(valeur)
    return int(v) % 360 if v is not None else None


def instant_de(horodatage, fuseau) -> str | None:
    """Un horodatage (secondes depuis 1970) ecrit a l'heure de la maison, comme
    tous les instants de l'etat ; None s'il est illisible."""
    if isinstance(horodatage, bool) or not isinstance(horodatage, (int, float)):
        return None
    try:
        return ecrire_instant(datetime.fromtimestamp(horodatage, tz=fuseau))
    except (OverflowError, OSError, ValueError):
        return None


def nomme(texte, haid) -> bool:
    """Le texte nomme-t-il ce volet ? Son identifiant entier, jamais un morceau
    d'un autre : « cover.salon » n'est pas nomme dans « cover.salon_2 »."""
    if not isinstance(texte, str) or not isinstance(haid, str) or not haid:
        return False
    return re.search(r"(?<![\w.])" + re.escape(haid) + r"(?!\w)", texte) is not None


def etat_baie(etats, capteur) -> str:
    """Ce que dit la baie devant un volet.

    `ouverte`, `fermee`, ou `muette` quand le capteur ne repond pas — et
    `aucune` si rien n'est designe. Un capteur d'ouverture dit `on` quand la
    baie est ouverte ; une porte pilotee (`cover`) dit `open`. Muette n'est
    ni l'un ni l'autre : c'est a la regle de decider, et de le dire.
    """
    if not capteur:
        return "aucune"
    st = etats.get(capteur)
    if st is None or st.state in ("unavailable", "unknown"):
        return "muette"
    return "ouverte" if st.state in ("on", "open") else "fermee"


def renommer_dans_volets(cfg: Any, ancien: str, neuf: str) -> bool:
    """Remplace `ancien` par `neuf` dans la configuration des volets, EN PLACE ;
    rend vrai si quelque chose a change (sa demande du 25/10).

    Les reglages d'un volet sont ranges par son entity_id : renomme dans Home
    Assistant, il les perdait en silence et suivait la maison - sa chambre, reglee
    pour ne jamais s'ouvrir seule, se serait ouverte chaque matin. Suivent aussi
    la porte devant un volet, le thermometre et l'anemometre choisis."""
    if not isinstance(cfg, dict) or not ancien or not neuf or ancien == neuf:
        return False
    change = False
    for section in ("planning", "soleil", "baies"):
        table = (cfg.get(section) or {}).get("volets") if isinstance(cfg.get(section), dict) else None
        if not isinstance(table, dict):
            continue
        if ancien in table and neuf not in table:
            table[neuf] = table.pop(ancien)
            change = True
        if section == "baies":
            for haid, capteur in list(table.items()):
                if capteur == ancien:
                    table[haid] = neuf
                    change = True
    for section, champ in (("soleil", "temp_entite"), ("vent", "entite")):
        bloc = cfg.get(section)
        if isinstance(bloc, dict) and bloc.get(champ) == ancien:
            bloc[champ] = neuf
            change = True
    return change


class LoggiaVolets:
    """Tient les regles de volets : planning, soleil, mise a l'abri, volet bloque."""

    # Les pannes deja dites au journal de Home Assistant : une panne se dit UNE
    # fois, pas a chaque sondage de l'ecran (spec Volets 6.2). Immuable, et
    # remplacee a chaque changement : partagee par la classe, elle ne peut pas
    # passer d'une instance a l'autre.
    _pannes_dites: frozenset = frozenset()
    # L'ecoute des volets en cours de verification (audit du 19/10) : un geste
    # hors de Home Assistant se voit a ce que le volet publie ENTRE deux tours.
    _defait_verifs = None
    # Le fichier de ce qui survit au redemarrage, et ce qu'il garde des
    # sonneries : {"ouvrir": epoque, "fermer": epoque} (audit du 19/10).
    _depot_memoire = None
    _derniere: dict | None = None
    _defait_demarre = None
    # L'abri (audit du 19/10) : depuis quand il tient - pour rejouer, a sa levee,
    # ce que le planning a manque -, depuis quand l'anemometre se tait, et le
    # rendez-vous qui releve l'abri au bout de ce silence.
    _abri_depuis: float | None = None
    _vent_muet_depuis: float | None = None
    _defait_vent_muet = None
    # Le calme qui leve l'abri, et les volets que l'abri a REELLEMENT bouges :
    # eux seuls retrouvent le planning a sa levee (relecture du 19/10).
    _calme_depuis = None
    _defait_calme = None
    _abrites: frozenset = frozenset()
    # L'ecoute du registre des entites : un volet renomme (sa demande du 25/10).
    _ecoute_registre = None
    # Pose par `async_arreter` : une tache encore en vol au dechargement ne
    # rearme plus ni minuteur, ni ecoute, ni rendez-vous, et ne commande plus.
    _arrete = False

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles=None) -> None:
        self.hass = hass
        self.store = store
        # Le socle commun : journal unifie et respect du geste manuel.
        # Toute commande passe par lui — voir `regles.py`.
        self.regles = regles
        self.cfg: dict[str, Any] = {}
        # Ce que la derniere evaluation a decide, volet par volet. Sert a ne
        # pas renvoyer dix fois la meme commande, et a savoir quoi rouvrir.
        # Les volets que la protection solaire a baisses, et la position
        # qu'ils avaient AVANT. Un simple ensemble ne suffisait pas : a la
        # sortie du cone, tout remontait a 100, quelle que soit la hauteur
        # d'ou l'on venait.
        self.abaisses: dict[str, Any] = {}
        self.a_l_abri = False
        self._defait: list[Any] = []
        self._defait_soleil: list[Any] = []
        # Ce que la derniere programmation a REELLEMENT arme, par sens :
        # {decalage: [entity_id]}. Sans cela, une regle qui ne se declenche
        # pas ne se distingue pas d'une regle qui n'a jamais ete posee — et
        # c'est exactement la question qu'on se pose quand rien ne bouge.
        self.armes: dict[str, dict] = {"ouverture": {}, "fermeture": {}}
        # Pourquoi rien n'est arme, quand rien ne l'est.
        self.raison: str = "jamais programme"
        # Les ordres qui n'ont pas pu partir, faute de volet joignable.
        # {entity_id: {"sens": "ouvrir"|"fermer", "expire": horodatage}}
        self.attente: dict[str, Any] = {}
        self._defait_attente = None
        # Les ordres partis qu'il reste a VERIFIER (ADR 0007) :
        # {entity_id: {"service", "extra", "cible", "essais", ..., "annule"}}
        self._verifs: dict[str, Any] = {}
        # Ce que l'etat garde d'un sondage a l'autre (spec Volets 6.1 et 6.3) :
        # l'ecran sonde toutes les cinq secondes. La fin de la protection de
        # chaque volet baisse, tant qu'elle n'est pas passee - {entity_id:
        # (reglages, fin)} -, et les heures du soleil de la journee - (cle, jours).
        self._fins: dict[str, Any] = {}
        self._jours_soleil: Any = None
        demarrer(hass, self, self._async_demarrer(), "volets")

    async def _async_demarrer(self) -> None:
        self.cfg = await self.async_config()
        await self._async_reprogrammer()
        self._reabonner_etat()
        # L'attente revient tout de suite : son ecoute se declenche quand le
        # volet reparait. Le rattrapage des sonneries attend que Home Assistant
        # ait fini de demarrer — avant, les volets n'existent peut-etre pas.
        await self._async_charger_memoire(sonneries=False)
        # Un volet, une porte, un thermometre ou un anemometre RENOMME dans Home
        # Assistant : la configuration et la memoire le suivent (25/10).
        bus = getattr(self.hass, "bus", None)
        if bus is not None and not self._arrete:
            self._ecoute_registre = bus.async_listen("entity_registry_updated", self._sur_registre)
        try:
            from homeassistant.helpers.start import async_at_started

            @callback
            def demarre(_hass) -> None:
                self._defait_demarre = None
                if not self._arrete:
                    self.hass.async_create_task(self._async_rattraper_sonneries())

            if not self._arrete:
                self._defait_demarre = async_at_started(self.hass, demarre)
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia volets : rattrapage au demarrage impossible", exc_info=True)

    # ── Ce qui survit au redemarrage (audit du 19/10) ──────────────────────
    def _store_memoire(self):
        if self._depot_memoire is None:
            from homeassistant.helpers.storage import Store

            self._depot_memoire = Store(self.hass, 1, CLE_MEMOIRE)
        return self._depot_memoire

    async def _async_ecrire_memoire(self) -> None:
        try:
            await self._store_memoire().async_save(
                {"attente": dict(self.attente), "derniere": dict(self._derniere or {})})
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia volets : attente non enregistree", exc_info=True)

    def _memoriser(self) -> None:
        self.hass.async_create_task(self._async_ecrire_memoire())

    async def _async_charger_memoire(self, maintenant=None, sonneries: bool = True) -> None:
        """Relit l'attente (sans ce qui a expire) et l'heure des sonneries."""
        try:
            brut = await self._store_memoire().async_load()
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia volets : attente illisible", exc_info=True)
            brut = None
        brut = brut if isinstance(brut, dict) else {}
        d = brut.get("derniere")
        self._derniere = {k: float(t) for k, t in d.items()
                          if k in ("ouvrir", "fermer") and isinstance(t, (int, float)) and not isinstance(t, bool)
                          } if isinstance(d, dict) else {}
        maintenant_s = time.time()
        attente = brut.get("attente")
        for haid, o in (attente.items() if isinstance(attente, dict) else ()):
            expire = o.get("expire") if isinstance(o, dict) else None
            if (isinstance(haid, str) and haid not in self.attente and o.get("sens") in ("ouvrir", "fermer")
                    and isinstance(expire, (int, float)) and not isinstance(expire, bool) and expire > maintenant_s):
                self.attente[haid] = {"sens": o["sens"], "expire": float(expire),
                                      "motif": str(o.get("motif") or "volet injoignable")}
        if self.attente:
            self._suivre_attente()
            await self._async_rattraper()
        if sonneries:
            await self._async_rattraper_sonneries(maintenant)
        self._memoriser()

    async def _async_rattraper_sonneries(self, maintenant=None, depuis: float | None = None,
                                         seulement=None) -> None:
        """Le lever ou le coucher passe pendant que Home Assistant redemarrait.

        Pour chaque volet, son DERNIER mouvement prevu : s'il est passe depuis
        moins de RATTRAPAGE_MAX_S et que la derniere sonnerie de ce sens est plus
        ancienne, il n'a pas eu lieu - on le rejoue, par le planning, qui garde
        ses regles (mode, jours, baie, vent). Rien de note - un premier
        demarrage - : Loggia ne devine pas.

        `depuis` (epoque) : la levee de l'abri (audit du 19/10). La sonnerie a
        bien eu lieu - et l'abri l'a retenue : la borne est alors le debut de
        l'abri, et non trois heures ni la derniere sonnerie notee. Le motif le
        dit : « apres le vent »."""
        from homeassistant.util import dt as dt_util

        plan = self.cfg.get("planning") or {}
        derniere = self._derniere or {}
        if not plan.get("actif") or (depuis is None and not derniere):
            return
        maintenant = maintenant or dt_util.now()
        t0 = maintenant.timestamp()
        jours = soleil_par_date(self._soleil_jours(maintenant)).values()
        par_sens = {"ouverture": set(self._ouvrants("ouverture")), "fermeture": set(self._ouvrants("fermeture"))}
        manques: dict[str, list] = {"ouvrir": [], "fermer": []}
        for haid in sorted(par_sens["ouverture"] | par_sens["fermeture"]):
            if seulement is not None and haid not in seulement:
                continue
            dernier = None
            for jour in jours:
                for sens_long, ids in par_sens.items():
                    lu = _mouvement(plan, haid, jour, sens_long) if haid in ids else None
                    t = lu[0].timestamp() if lu else None
                    if t is not None and t <= t0 and (dernier is None or t > dernier[0]):
                        dernier = (t, sens_long)
            if dernier is None:
                continue
            court = "ouvrir" if dernier[1] == "ouverture" else "fermer"
            if depuis is not None:
                # A la levee de l'abri, le dernier mouvement prevu se rejoue
                # MEME s'il precede l'abri (sa decision du 19/10) : un coup de
                # vent apres le coucher a rouvert les volets, la nuit les veut
                # fermes. Un store banne replie par le vent ne se redeploie pas
                # pour autant : la rafale peut revenir (relecture du 19/10).
                if court == "ouvrir" and self._classe(haid) == STORE_BANNE:
                    continue
                manques[court].append(haid)
                continue
            vu = derniere.get(court)
            if vu is not None and dernier[0] > vu and t0 - dernier[0] <= RATTRAPAGE_MAX_S:
                manques[court].append(haid)
        motif = "rattrape au demarrage" if depuis is None else "apres le vent"
        for court, cibles in manques.items():
            if cibles:
                await self._async_planifie(court, cibles=cibles, rattrape=motif)

    def _reabonner_etat(self) -> None:
        """Suit le soleil et l'anemometre CHOISI MAINTENANT.

        Le soleil bouge : Home Assistant reecrit `sun.sun` regulierement, et
        chaque ecriture est une occasion de reevaluer. Le vent a sa propre
        entite, suivie par la meme fonction.

        Rappele a chaque enregistrement (audit du 03/10) : l'abonnement n'etait
        pose qu'au demarrage. Un anemometre choisi ou change dans les reglages
        n'etait suivi qu'au redemarrage suivant — l'ancien, pour rien, en
        attendant.
        """
        from homeassistant.helpers.event import async_track_state_change_event

        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia volets : desabonnement sans effet")
        self._defait.clear()
        if self._arrete:
            return
        surveillees = [SOLEIL]
        vent = (self.cfg.get("vent") or {}).get("entite")
        if vent:
            surveillees.append(vent)
        self._defait.append(
            async_track_state_change_event(self.hass, surveillees, self._sur_etat)
        )

    # ── Le planning ────────────────────────────────────────────────────────
    async def _async_reprogrammer(self) -> None:
        """(Re)pose les rendez-vous du lever et du coucher.

        Les decalages font partie du rendez-vous lui-meme : les changer oblige
        a tout reposer, d'ou cette fonction rappelee a chaque enregistrement.
        """
        for defaire in self._defait_soleil:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia volets : rendez-vous deja retire")
        self._defait_soleil.clear()

        self.armes = {"ouverture": {}, "fermeture": {}}
        if self._arrete:
            return
        plan = self.cfg.get("planning") or {}
        if not plan.get("actif"):
            self.raison = "planning desactive"
            return
        from homeassistant.helpers.event import async_track_sunrise, async_track_sunset

        # Un rendez-vous par decalage DISTINCT, et non un par volet : trois
        # chambres qui s'ouvrent une heure plus tard partagent le leur.
        #
        # Les decalages viennent de la CONFIGURATION, jamais des entites — voir
        # `decalages_du_plan`. Lire les volets ici laissait les regles mortes
        # quand ils n'etaient pas encore la.
        for sens, poser in (("ouverture", async_track_sunrise), ("fermeture", async_track_sunset)):
            valeurs = decalages_du_plan(plan, sens)
            for decalage in sorted(valeurs):
                self._defait_soleil.append(
                    poser(self.hass, self._rendezvous(sens, decalage), timedelta(minutes=decalage))
                )
                self.armes[sens][str(decalage)] = True
            _LOGGER.info("Loggia volets : %s armee en %d groupe(s)", sens, len(valeurs))
        total = sum(len(g) for g in self.armes.values())
        self.raison = "" if total else "aucun decalage : le planning ne dit rien"

    def _rendezvous(self, sens: str, decalage: int):
        """Le rappel d'un groupe.

        Il ne porte PAS la liste des volets : elle serait celle du demarrage,
        et un volet ajoute depuis n'en ferait jamais partie. Il porte son
        decalage, et la liste se recalcule au moment ou il sonne.
        """
        quoi = "ouvrir" if sens == "ouverture" else "fermer"

        @callback
        def sonne(*_):
            self.hass.async_create_task(self._async_planifie(quoi, decalage=decalage))

        return sonne

    async def _async_planifie(self, sens: str, cibles=None, decalage=None, rattrape: bool | str = False) -> None:
        """`rattrape` : le mot du rattrapage joint au motif - vrai vaut
        « rattrape au demarrage » ; « apres le vent » a la levee de l'abri."""
        from homeassistant.util import dt as dt_util

        # Une SONNERIE (son decalage la porte) : son heure se garde, meme si le
        # planning n'agit pas — elle a eu lieu (audit du 19/10).
        if decalage is not None:
            if self._derniere is None:
                self._derniere = {}
            self._derniere[sens] = time.time()
            self._memoriser()
        plan = self.cfg.get("planning") or {}
        # Les jours - ceux de la maison, ou ceux d'un volet « Heures a lui » -
        # se jugent volet par volet, plus bas (`volets_du_jour`, V5).
        if not plan.get("actif"):
            return
        if not planning_agit(plan.get("mode"), sens):
            return
        sens_long = "ouverture" if sens == "ouvrir" else "fermeture"
        if cibles is not None:
            cibles = list(cibles)
        elif decalage is not None:
            # Les volets de CE decalage, resolus maintenant : l'installation est
            # chargee depuis longtemps quand la cloche sonne.
            #
            # Une liste vide veut dire « aucun volet a cette heure », jamais
            # « tous ». Le repli general applique ici faisait bouger toute la
            # maison a une heure que plus personne n'avait demandee — un
            # decalage arme dont on avait retire le dernier volet.
            cibles = list(
                groupes_horaires(plan, self._ouvrants(sens_long), sens_long).get(decalage, [])
            )
        else:
            cibles = self._ouvrants(sens_long)
        # Les jours de chaque volet, evalues MAINTENANT.
        cibles = volets_du_jour(plan, cibles, 'ouverture' if sens == 'ouvrir' else 'fermeture', dt_util.now())
        if not cibles:
            return
        # « lever du soleil +30 min » : le mot du soleil, distinct du coucher
        # de la maison — chaque mot du journal a sa cle traduite (ADR 0070).
        # Le gabarit s'ecrit EN ENTIER, c'est sa cle au catalogue : recompose a
        # partir du moment, il n'etait ecrit nulle part, ni donc traduit, et
        # l'ecran montrait « lever du soleil +15 min » en francais dans les
        # sept langues (relecture du 03/10).
        moment = "lever du soleil" if sens == "ouvrir" else "coucher du soleil"
        gabarit = "lever du soleil {d} min" if sens == "ouvrir" else "coucher du soleil {d} min"
        motif = (gabarit, {"d": "%+d" % int(decalage)}) if decalage else moment
        if rattrape:
            motif = joindre(motif, rattrape if isinstance(rattrape, str) else "rattrape au demarrage")
        # Mise a l'abri en cours : on ne redescend rien, et on ne « rouvre »
        # pas ce qui est deja ouvert pour cette raison. UNE ligne le dit (audit
        # du 19/10) : le planning se taisait sans rien noter, et une fermeture
        # du soir manquee ne se lisait nulle part. La levee de l'abri la rejoue.
        if self.a_l_abri:
            await self._noter(sens, "planning", 0, motif=motif, detail="a l'abri du vent")
            return
        # Ce que le planning commande maintenant, il ne l'attend plus dans
        # l'autre sens (audit du 19/10) : une ouverture restee en attente depuis
        # le matin repartait le soir, juste apres la fermeture.
        opposes = [h for h in cibles
                   if isinstance(self.attente.get(h), dict) and self.attente[h].get("sens") != sens]
        for h in opposes:
            self.attente.pop(h, None)
        if opposes:
            self._suivre_attente()
        # Un volet indisponible n'obeit pas, et rien ne le dit.
        #
        # Mesure du 10/09/2026 : le rendez-vous du matin a sonne a la seconde
        # exacte, la commande est partie, et le volet n'a pas bouge — il etait
        # `unavailable` depuis dix-neuf minutes et l'est reste cinq heures. Le
        # journal notait pourtant « ouvrir 1 ». Une integration qui decroche
        # mangeait donc la regle en silence, chaque fois.
        joignables = [h for h in cibles if self._joignable(h)]
        absents = [h for h in cibles if h not in joignables]
        # Volet bloque (§1) : on ne ferme pas sur une baie ouverte — quelqu'un
        # est peut-etre dehors. L'ordre attend qu'elle se referme, jamais
        # au-dela du matin. Un capteur muet ne retient rien : on ferme, et on
        # le dit (ADR 0010). L'ouverture, elle, ne bloque personne.
        retenus, muets = [], []
        if sens == "fermer":
            retenus, muets = self._baies_ouvertes(joignables)
            joignables = [h for h in joignables if h not in retenus]
        partis = []
        if joignables:
            partis = await self._async_service(
                "open_cover" if sens == "ouvrir" else "close_cover", joignables,
                regle="planning", quoi=sens, motif=motif,
                priorite=PRIORITES["lever" if sens == "ouvrir" else "coucher"])
        if absents:
            self._mettre_en_attente(absents, sens)
        if retenus:
            self._mettre_en_attente(retenus, sens, motif="baie ouverte")
        # Ce que le planning a pris, la protection ne le rendra pas. Le reste —
        # ce que le soleil tient encore, et que le matin n'a donc pas ouvert —
        # elle le garde.
        for h in partis:
            self.abaisses.pop(h, None)
        # Une ligne de plus SEULEMENT si quelque chose manque : `agir` a deja
        # note ce qui est parti. Deux lignes pour un meme ordre se liraient mal.
        manque: list = []
        if absents:
            manque.append(("{n} en attente", {"n": len(absents)}))
        if retenus:
            manque.append(("{n} devant une baie ouverte", {"n": len(retenus)}))
        if muets:
            manque.append(("capteur indisponible : {noms}", {"noms": ", ".join(muets)}))
        if manque or not joignables:
            await self._noter(sens, "planning", len(partis), motif=motif, detail=manque)

    # ── Le soleil et le vent ───────────────────────────────────────────────
    @callback
    def _sur_etat(self, _event) -> None:
        self.hass.async_create_task(self._async_evaluer())

    async def _async_evaluer(self) -> None:
        """Met a l'abri si le vent l'exige, sinon protege du soleil."""
        # On declare ici les volets au socle, et non a la programmation : les
        # entites peuvent ne pas exister au demarrage — c'est le defaut qui a
        # laisse le planning muet pendant des jours. Le soleil, lui, bouge
        # toutes les quelques minutes, et cette fonction avec lui. `suivre`
        # ne fait rien quand la liste n'a pas change.
        if self._arrete:
            return
        self.regles.suivre("volets", self._tous_les_covers() + self._fenetres_de_toit())
        if await self._async_vent():
            return
        await self._async_soleil()

    async def _async_vent(self) -> bool:
        """Renvoie vrai si la mise a l'abri commande — et alors elle prime."""
        v = self.cfg.get("vent") or {}
        if not v.get("actif") or not v.get("entite"):
            if self.a_l_abri:
                await self._async_lever_abri()
            self.a_l_abri = False
            self.regles.relacher("volets", "vent")
            self._vent_reparle()
            return False
        valeur = self._nombre(v.get("entite"))
        if valeur is None:
            # Un anemometre muet ne dit ni calme ni tempete (audit du 19/10).
            # L'abri tenait alors pour toujours, et le planning se taisait sans
            # fin. Il tient encore VENT_MUET_S - une coupure de quelques minutes
            # ne rabaisse rien dans la tempete -, puis se releve, et le dit.
            if not self.a_l_abri:
                return False
            maintenant = time.time()
            if self._vent_muet_depuis is None:
                self._vent_muet_depuis = maintenant
                self._armer_vent_muet()
            if maintenant - self._vent_muet_depuis < VENT_MUET_S:
                return True
            await self._noter("abri relache", "vent", 0, motif="anemometre muet")
            await self._async_lever_abri()
            return False
        self._vent_reparle()
        try:
            seuil = float(v.get("seuil") or 0)
        except (TypeError, ValueError):
            return False
        if valeur >= seuil:
            if not self.a_l_abri:
                # L'abri se pose AVANT les ordres (audit du 19/10) : une seconde
                # mise a jour du vent, arrivee pendant qu'ils partent, les
                # renvoyait toutes. Le debut de l'abri sert a sa levee.
                self.a_l_abri = True
                self._abri_depuis = time.time()
                self.abaisses.clear()
                # Chacun selon ce qu'il est (ouvrants.py) : le volet se
                # remonte, le store banne se replie, la fenetre de toit se
                # ferme — et le garage, le portail, la porte ne bougent pas.
                velux = bool((self.cfg.get("velux") or {}).get("actif"))
                gestes: dict[str, list] = {}
                for haid in self._commandables(self._tous_les_covers() + self._fenetres_de_toit()):
                    service = geste_au_vent(self._classe(haid), velux)
                    if service:
                        gestes.setdefault(service, []).append(haid)
                abrites: set = set()
                for service, quoi in (("open_cover", "ouvrir"), ("close_cover", "fermer")):
                    if gestes.get(service):
                        partis = await self._async_service(service, gestes[service], regle="vent",
                                                           quoi=quoi,
                                                           motif=("vent {v}", {"v": valeur}),
                                                           priorite=PRIORITES["vent"], tenir=True)
                        abrites.update(partis or [])
                # Ce que l'abri a bouge : un volet sous la main n'en est pas.
                self._abrites = frozenset(abrites)
            self._oublier_calme()
            return True
        # On ne redescend qu'une fois nettement repasse sous le seuil, et
        # qu'apres un calme TENU (CALME_S) : une rafale qui oscille autour
        # ferait autrement battre les volets.
        if self.a_l_abri:
            if valeur >= seuil * 0.85:
                self._oublier_calme()
                return True
            maintenant = time.time()
            if self._calme_depuis is None:
                self._calme_depuis = maintenant
                self._armer_calme()
            if maintenant - self._calme_depuis < CALME_S:
                return True
            await self._async_lever_abri()
        return self.a_l_abri

    def _oublier_calme(self) -> None:
        self._calme_depuis = None
        if self._defait_calme is not None:
            try:
                self._defait_calme()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia volets : attente du calme deja retiree")
            self._defait_calme = None

    def _armer_calme(self) -> None:
        """Un anemometre qui se tait une fois le vent tombe ne reevaluerait
        plus rien : un rendez-vous, au bout du calme, s'en assure."""
        if self._arrete or self._defait_calme is not None:
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now) -> None:
            self._defait_calme = None
            if not self._arrete:
                self.hass.async_create_task(self._async_evaluer())

        self._defait_calme = async_call_later(self.hass, CALME_S + 1, echu)

    async def _async_lever_abri(self) -> None:
        """Le vent rend les volets : les regles plus faibles reprennent, et le
        dernier mouvement prevu du planning se rejoue (audit du 19/10) - la
        fermeture du soir, retenue par la tempete ou defaite par elle, n'avait
        jamais lieu. Seulement sur les volets que l'abri a BOUGES, et jamais un
        store banne qui se redeploierait (relecture du 19/10) : un volet sous la
        main, ou que le vent n'a pas touche, reste comme il est."""
        depuis = self._abri_depuis
        abrites = self._abrites
        self.a_l_abri = False
        self._abri_depuis = None
        self._abrites = frozenset()
        self._oublier_calme()
        self._vent_reparle()
        self.regles.relacher("volets", "vent")
        if depuis is not None and abrites:
            await self._async_rattraper_sonneries(depuis=depuis, seulement=abrites)

    def _vent_reparle(self) -> None:
        """L'anemometre repond (ou l'abri n'est plus) : son silence s'oublie."""
        self._vent_muet_depuis = None
        if self._defait_vent_muet is not None:
            try:
                self._defait_vent_muet()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia volets : attente du vent deja retiree")
            self._defait_vent_muet = None

    def _armer_vent_muet(self) -> None:
        """Le soleil seul reevalue l'abri, et la nuit il se met a jour rarement :
        un rendez-vous, au bout du silence, s'en assure."""
        if self._arrete or self._defait_vent_muet is not None:
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now) -> None:
            self._defait_vent_muet = None
            if not self._arrete:
                self.hass.async_create_task(self._async_evaluer())

        self._defait_vent_muet = async_call_later(self.hass, VENT_MUET_S + 1, echu)

    async def _async_soleil(self) -> None:
        s = self.cfg.get("soleil") or {}
        if not s.get("actif"):
            return
        par_volet = s.get("volets") or {}
        if not isinstance(par_volet, dict) or not par_volet:
            return
        st = self.hass.states.get(SOLEIL)
        attrs = (st.attributes if st else {}) or {}
        azimut = attrs.get("azimuth")
        elevation = attrs.get("elevation")
        if azimut is None or elevation is None:
            return

        # La condition de saison : une temperature exterieure plutot qu'un mois,
        # parce qu'une journee de septembre a 30 °C merite la meme protection
        # qu'une de juillet. Lue a chaque passage : le journal la note aussi.
        #
        # Avec une hysterese d'un degre (audit du 19/10) : un volet baisse n'est
        # rendu que sous `temp_min - 1`, et entre les deux, rien de neuf ne se
        # baisse - un capteur qui oscille autour du seuil faisait battre la
        # protection a chaque dixieme.
        temp_min = s.get("temp_min")
        dehors = self._nombre(s.get("temp_entite"))
        chaud = True
        if temp_min not in (None, ""):
            if dehors is None:
                return
            try:
                if dehors < float(temp_min) - HYSTERESE_TEMP:
                    await self._async_rouvrir_proteges()
                    return
                chaud = dehors >= float(temp_min)
            except (TypeError, ValueError):
                return

        try:
            position = int(s.get("position", 30))
            elev_min = float(s.get("elevation_min", 15))
        except (TypeError, ValueError):
            return

        for haid, reglage in par_volet.items():
            if not isinstance(reglage, dict):
                continue
            orientation = reglage.get("orientation")
            ouverture = reglage.get("ouverture", 90)
            deja = haid in self.abaisses
            # Hysterese : il faut sortir franchement du cone pour rouvrir.
            frappe = au_soleil(azimut, elevation, orientation, ouverture, elev_min,
                               marge=HYSTERESE_DEG if deja else 0.0)
            if frappe and not deja:
                if not chaud:
                    continue
                # Volet bloque (§1) : pas de protection sur une baie ouverte.
                # Rien a rejouer : le soleil repasse a la prochaine minute.
                baie = etat_baie(self.hass.states, self._baie_de(haid))
                if baie == "ouverte":
                    continue
                # Sous la main de quelqu'un, ou tenu par une regle plus forte :
                # l'ordre serait retenu, et le journal noterait « proteger 0 »
                # a chaque mise a jour du soleil (audit du 19/10). On ne retente
                # pas ; la regle repasse quand la main ou la tenue sont levees.
                if self.regles.gele(haid) or self.regles.tenu_par_plus_fort(
                        "volets", "soleil", haid, PRIORITES["soleil"]):
                    continue
                # Un volet « tilt seul » ne se baisse ni ne se place.
                if not self._sait_se_placer(haid) and not self._commandables([haid]):
                    continue
                # La position que Netatmo n'a pas encore mise a jour ne vaut
                # rien ici (`_position_pour_proteger`).
                avant = self._position_pour_proteger(haid)
                # Une protection qui OUVRE n'en est pas une.
                #
                # « Descendre a 30 % » etait envoye tel quel. Un volet ferme
                # pour la nuit — une chambre reglee pour se fermer chaque
                # soir et ne jamais se rouvrir seule — se retrouvait donc
                # OUVERT a 30 % au premier soleil de midi, sur une regle
                # dont le nom promet l'inverse.
                #
                # Position INCONNUE : on ne fait rien non plus. Un volet
                # indisponible ou en plein mouvement n'en dit rien, et
                # baisser a l'aveugle est exactement ce qui a ouvert la
                # chambre. La regle repasse a la prochaine minute de
                # soleil ; on ne perd qu'un peu d'ombre, jamais le
                # sommeil de quelqu'un.
                #
                # Un STORE BANNE, lui, protege en se DEPLOYANT (sa demande du
                # 25/10) : « baisse a 30 % », il se repliait a moitie en plein
                # soleil. Il se deploie en entier, s'il ne l'est pas deja.
                store = self._classe(haid) == STORE_BANNE
                cible = 100 if store else position
                if avant is None or (avant >= 100 - SEUIL_FERME if store else avant <= position):
                    continue
                partis = await self._async_position(haid, cible, regle="soleil",
                                                    quoi="proteger",
                                                    motif=joindre(("soleil a {a}°", {"a": round(azimut)}),
                                                                  "capteur de baie indisponible" if baie == "muette" else None),
                                                    priorite=PRIORITES["soleil"], tenir=True,
                                                    orientation=degres(orientation), dehors=dehors)
                # Ne retenir que ce qui est vraiment parti. Un volet sous la
                # main de quelqu'un, ou tenu par plus fort, n'a pas ete baisse :
                # le « rendre » plus tard le deplacerait pour rien.
                if partis:
                    self.abaisses[haid] = avant
            elif not frappe and deja:
                await self._async_rendre(haid)

    async def _async_rendre(self, haid: str, motif: str = "soleil parti") -> None:
        """Remet un volet la ou la protection l'a pris.

        Elle le remontait a 100. Un volet entrouvert a 40 le matin se
        retrouvait grand ouvert le soir, sans que rien ne l'ait demande :
        la regle rendait plus qu'elle n'avait pris. On ne connait pas
        toujours la position de depart — un volet qui ne sait pas se placer
        n'en publie pas — et 100 reste alors le seul repli raisonnable.
        """
        avant = self.abaisses.pop(haid, None)
        # Le rendre SEULEMENT si on le tient encore. La fermeture du soir, le
        # vent ou une main ont pu le prendre depuis ; le rendre les
        # contredirait. C'est ainsi que la protection rouvrait un volet ferme
        # pour la nuit, au moment ou le soleil quittait la facade.
        if not self.regles.tient("volets", "soleil", haid):
            return
        s = self.cfg.get("soleil") or {}
        reglage = (s.get("volets") or {}).get(haid) if isinstance(s.get("volets"), dict) else None
        # Sans position d'avant : un volet se rouvre, un store banne se replie
        # (le laisser deploye, c'est exposer sa toile ; 25/10).
        repli = 0 if self._classe(haid) == STORE_BANNE else 100
        await self._async_position(haid, repli if avant is None else int(avant),
                                   regle="soleil", quoi="rouvrir",
                                   motif=motif, priorite=PRIORITES["soleil"],
                                   orientation=degres(reglage.get("orientation")) if isinstance(reglage, dict) else None,
                                   dehors=self._nombre(s.get("temp_entite")))

    async def _async_rouvrir_proteges(self) -> None:
        for haid in list(self.abaisses):
            await self._async_rendre(haid)

    # ── Les commandes ──────────────────────────────────────────────────────
    def _covers(self) -> list:
        try:
            return sorted(self.hass.states.async_entity_ids("cover"))
        except Exception:  # noqa: BLE001
            # Un garde-fou muet ne garde rien : sans cette ligne, « aucun
            # decalage arme » se lisait comme un jour sans rien a faire.
            _LOGGER.warning("Loggia volets : volets illisibles pour le moment", exc_info=True)
            return []

    def _classe(self, haid: str):
        st = self.hass.states.get(haid)
        return (getattr(st, "attributes", None) or {}).get("device_class") if st is not None else None

    def _tous_les_covers(self) -> list:
        """Tous les VOLETS de l'installation — et rien d'autre.

        Le planning les prend tous — un volet ajoute apres coup suit sans
        qu'on ait a le declarer — et la table par volet dit lesquels s'en
        ecartent. La protection solaire, elle, ne touche que ceux a qui on a
        donne une orientation : ce sont deux notions distinctes, et les
        confondre faisait suivre au planning les seuls volets orientes.

        UN VOLET SE RECONNAIT A SA CLASSE (audit du 03/10, ouvrants.py). Cette
        liste prenait tous les `cover.*` : le vent et le lever du soleil
        ouvraient la porte de garage et le portail. Une classe absente n'est
        pas un volet : c'est le choix fait le 03/10.
        """
        return [h for h in self._covers() if est_volet(self._classe(h))]

    def _fenetres_de_toit(self) -> list:
        """Les fenetres de toit, si l'option est prise — sinon aucune."""
        if not (self.cfg.get("velux") or {}).get("actif"):
            return []
        return [h for h in self._covers() if est_fenetre_de_toit(self._classe(h))]

    def _ouvrants(self, sens_long: str) -> list:
        """Ce que le planning bouge dans ce sens : les volets, et — a la
        fermeture seulement — les fenetres de toit. Loggia n'ouvre jamais une
        fenetre."""
        if sens_long == "fermeture":
            return self._commandables(self._tous_les_covers() + self._fenetres_de_toit())
        return self._commandables(self._tous_les_covers())

    def _commandables(self, haids: list) -> list:
        """Ceux qui recoivent `open_cover` / `close_cover` (audit du 19/10) : un
        volet « tilt seul » faisait refuser l'appel GROUPE entier, et aucun
        volet ne bougeait. Il reste un volet - l'etat le publie, la fiche le
        montre -, hors des ordres groupes."""
        garde = []
        for haid in haids:
            st = self.hass.states.get(haid)
            features = (getattr(st, "attributes", None) or {}).get("supported_features") if st else None
            # Un volet qui ne sait que se PLACER reste : `_async_service` lui
            # traduit l'ordre en position (relecture du 19/10).
            if ouvre_et_ferme(features) or self._sait_se_placer(haid):
                garde.append(haid)
        return garde

    def _place_seulement(self, haid: str) -> bool:
        """Ni OPEN ni CLOSE, mais SET_POSITION : il se commande par sa position."""
        st = self.hass.states.get(haid)
        features = (getattr(st, "attributes", None) or {}).get("supported_features") if st else None
        return not ouvre_et_ferme(features) and self._sait_se_placer(haid)

    # ── Les ordres qui attendent leur volet ────────────────────────────────
    def _baie_de(self, haid: str):
        """Le capteur de la porte ou de la fenetre devant ce volet, s'il y en a un."""
        b = self.cfg.get("baies") or {}
        if not b.get("actif"):
            return None
        capteur = (b.get("volets") or {}).get(haid)
        return capteur if isinstance(capteur, str) and capteur else None

    def _baies_ouvertes(self, covers: list) -> tuple[list, list]:
        """Parmi ces volets, ceux dont la baie est ouverte — et les capteurs muets."""
        retenus, muets = [], []
        for haid in covers:
            capteur = self._baie_de(haid)
            quoi = etat_baie(self.hass.states, capteur)
            if quoi == "ouverte":
                retenus.append(haid)
            elif quoi == "muette":
                muets.append(capteur)
        return retenus, muets

    def _joignable(self, haid: str) -> bool:
        """Le volet repond-il ? Une entite absente ou indisponible n'obeit pas."""
        st = self.hass.states.get(haid)
        return st is not None and st.state not in ("unavailable", "unknown")

    def _expiration(self, sens: str) -> float:
        """Jusqu'a quand un ordre en attente reste valable.

        JAMAIS au-dela du moment ou l'ordre inverse viendrait. Ouvrir les
        volets a vingt-trois heures parce que l'integration est enfin revenue
        serait pire que de n'avoir rien fait : on rattraperait le matin en
        pleine nuit.
        """
        try:
            from homeassistant.helpers.sun import get_astral_event_next
            from homeassistant.const import SUN_EVENT_SUNRISE, SUN_EVENT_SUNSET
            evenement = SUN_EVENT_SUNSET if sens == "ouvrir" else SUN_EVENT_SUNRISE
            return get_astral_event_next(self.hass, evenement).timestamp()
        except Exception:  # noqa: BLE001
            # Sans le soleil, une demi-journee : assez pour rattraper un
            # decrochage, trop court pour agir a contretemps. On le DIT : un
            # ordre qui expire douze heures plus tard au lieu du prochain
            # lever ou coucher ne se devine pas (24/09, plan M10).
            _LOGGER.warning(
                "Loggia volets : heure du soleil illisible, l'ordre en attente "
                "expirera dans 12 h au lieu du prochain %s",
                "coucher" if sens == "ouvrir" else "lever", exc_info=True)
            return time.time() + 12 * 3600

    def _mettre_en_attente(self, cibles: list, sens: str, motif: str = "volet injoignable") -> None:
        expire = self._expiration(sens)
        for haid in cibles:
            self.attente[haid] = {"sens": sens, "expire": expire, "motif": motif}
        self._suivre_attente()

    def _suivre_attente(self) -> None:
        """(Re)pose l'ecoute sur les seuls volets qu'on attend. Toute
        modification de l'attente passe par ici : elle s'enregistre aussi, pour
        survivre au redemarrage (audit du 19/10)."""
        self._memoriser()
        if self._defait_attente is not None:
            try:
                self._defait_attente()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia volets : ecoute d'attente deja retiree")
            self._defait_attente = None
        if not self.attente or self._arrete:
            return
        from homeassistant.helpers.event import async_track_state_change_event

        # Les volets attendus, et la baie de chacun : c'est elle qui se
        # referme, et le volet, lui, ne bougera peut-etre pas de la soiree.
        suivis = set(self.attente)
        for haid in self.attente:
            capteur = self._baie_de(haid)
            if capteur:
                suivis.add(capteur)
        self._defait_attente = async_track_state_change_event(
            self.hass, sorted(suivis), self._sur_retour)

    @callback
    def _sur_retour(self, _event) -> None:
        self.hass.async_create_task(self._async_rattraper())

    async def _async_purger_attente(self) -> bool:
        """Jette les ordres en attente qui ont expire, chacun avec sa ligne au
        journal ; rend vrai s'il en est parti un. Appelee aussi en publiant
        l'etat (audit du 19/10) : une attente perimee y restait publiee tant
        qu'aucun volet ne bougeait - aucune ecoute ne tournait pour la jeter."""
        maintenant = time.time()
        jetes = False
        for haid, ordre in list(self.attente.items()):
            if maintenant <= ordre.get("expire", 0):
                continue
            # `pop` : deux rattrapages peuvent courir ensemble — deux volets
            # revenus au meme instant — et l'autre a pu passer avant.
            if self.attente.pop(haid, None) is None:
                continue
            jetes = True
            await self._noter(ordre.get("sens", "?"), "attente expiree", 0,
                              detail=haid, motif="ordre perime")
        return jetes

    async def _async_rattraper(self) -> None:
        """Applique les ordres dont le volet est revenu, jette ceux qui ont expire."""
        await self._async_purger_attente()
        for haid, ordre in list(self.attente.items()):
            if not self._joignable(haid):
                continue
            # L'ordre n'a de sens que si le planning le donnerait ENCORE
            # (audit du 03/10) : passe en « Manuel » — « Ne touche a rien » —,
            # coupe, ou en « Fermeture nuit » pour une ouverture, il est jete.
            # Une mise a l'abri en cours le retient : le vent prime.
            plan = self.cfg.get("planning") or {}
            if not plan.get("actif") or not planning_agit(plan.get("mode"), ordre.get("sens", "")):
                if self.attente.pop(haid, None) is not None:
                    await self._noter(ordre.get("sens", "?"), "attente abandonnee", 0,
                                      detail=haid, motif="planning en manuel ou coupe")
                continue
            if self.a_l_abri:
                continue
            # Une baie encore ouverte retient toujours la fermeture ; muette,
            # elle ne retient plus rien (ADR 0010).
            baie = etat_baie(self.hass.states, self._baie_de(haid)) if ordre.get("sens") == "fermer" else "aucune"
            if baie == "ouverte":
                continue
            if ordre.get("motif") == "baie ouverte":
                pourquoi = "capteur indisponible" if baie == "muette" else "baie refermee"
            else:
                pourquoi = "volet revenu"
            if self.attente.pop(haid, None) is None:
                continue
            await self._async_service(
                "open_cover" if ordre.get("sens") == "ouvrir" else "close_cover", [haid],
                regle="rattrapage", quoi=ordre.get("sens", "?"),
                motif=pourquoi,
                # Le rattrapage rejoue un ordre du planning : il en a le rang.
                priorite=PRIORITES["lever" if ordre.get("sens") == "ouvrir" else "coucher"])
        self._suivre_attente()

    def _nombre(self, haid):
        if not haid:
            return None
        st = self.hass.states.get(haid)
        if st is None:
            return None
        # « nan », « inf » se lisent en float (28/10, ADR 0280) : un vent a
        # « nan » rendait `valeur >= seuil` toujours faux, et la mise a l'abri
        # ne partait jamais. Un nombre qui n'en est pas un ne se lit pas.
        return lu(st.state)

    def _position_actuelle(self, haid: str):
        """Ou en est ce volet : 0 ferme, 100 ouvert, None si l'on ne sait pas.

        `current_position` quand le volet le publie ; sinon l'etat suffit a
        distinguer les deux extremes, qui sont les seuls qu'un volet sans
        positionnement puisse prendre. Un volet en mouvement, ou
        indisponible, ne rend rien : mieux vaut ne pas savoir que se tromper.
        """
        st = self.hass.states.get(haid)
        if st is None:
            return None
        pos = (st.attributes or {}).get("current_position")
        if isinstance(pos, (int, float)) and not isinstance(pos, bool):
            return int(pos)
        if st.state == "closed":
            return 0
        if st.state == "open":
            return 100
        return None

    def _position_pour_proteger(self, haid: str):
        """La position, pour la PROTECTION seulement (audit du 19/10).

        Netatmo bascule l'etat d'abord et publie la position une a trois minutes
        apres : `closed` avec la position d'avant (100) se lisait « en haut », et
        la protection l'aurait OUVERT a 30 %. Ferme au-dessus du seuil ferme,
        la position est perimee : inconnue, et la protection ne fait rien. La
        verification garde `_position_actuelle` : elle compare ce qui est publie."""
        st = self.hass.states.get(haid)
        position = self._position_actuelle(haid)
        if st is not None and st.state == "closed" and position is not None and position > SEUIL_FERME:
            return None
        return position

    def _sait_se_placer(self, haid: str) -> bool:
        st = self.hass.states.get(haid)
        f = (st.attributes.get("supported_features") if st else None) or 0
        try:
            return bool(int(f) & COVER_SET_POSITION)
        except (TypeError, ValueError):
            return False

    async def _async_position(self, haid: str, position: int, *, regle: str = "",
                              quoi: str = "", motif: str = "", priorite: int = 0,
                              tenir: bool = False, orientation: int | None = None,
                              dehors: float | None = None) -> list:
        """Place un volet, ou l'ouvre / le ferme s'il ne sait pas se placer.
        `orientation` et `dehors` vont au journal (spec Volets 6.4)."""
        if self._sait_se_placer(haid):
            return await self._async_service("set_cover_position", [haid],
                                             {"position": position},
                                             regle=regle, quoi=quoi, motif=motif,
                                             priorite=priorite, tenir=tenir,
                                             orientation=orientation, dehors=dehors)
        return await self._async_service(
            "open_cover" if position >= 50 else "close_cover", [haid],
            regle=regle, quoi=quoi, motif=motif,
            priorite=priorite, tenir=tenir, orientation=orientation, dehors=dehors)

    async def _async_service(self, service: str, cibles: list, extra=None, *,
                             regle: str = "", quoi: str = "", motif: str = "",
                             priorite: int = 0, tenir: bool = False,
                             essai: int = 0, orientation: int | None = None,
                             dehors: float | None = None) -> list:
        """Commande, par le socle commun.

        C'est lui qui ecarte ce que quelqu'un tient dans la main et qui tient
        le journal. Avant, chaque module appelait le service directement et
        notait ce qu'il AVAIT DEMANDE : le journal disait « ferme 2 » quand un
        seul volet avait bouge.

        Ce qui est parti sera VERIFIE deux minutes plus tard (ADR 0007) ;
        `essai` compte les reprises deja faites pour ce meme ordre.

        Un module arrete ne commande plus rien (audit du 19/10) : une tache
        encore en vol au dechargement doublait l'ordre de l'instance suivante.

        Un volet qui ne sait que se placer (SET_POSITION sans OPEN ni CLOSE)
        recoit `set_cover_position` 100 ou 0 a part (relecture du 19/10) : dans
        l'appel groupe, il le ferait refuser en entier.
        """
        if self._arrete:
            return []
        if service in ("open_cover", "close_cover") and not extra:
            places = [h for h in cibles if self._place_seulement(h)]
            if places:
                autres = [h for h in cibles if h not in places]
                commun = dict(regle=regle, quoi=quoi, motif=motif, priorite=priorite, tenir=tenir,
                              essai=essai, orientation=orientation, dehors=dehors)
                partis = list(await self._async_service("set_cover_position", places,
                                                        {"position": 100 if service == "open_cover" else 0},
                                                        **commun) or [])
                if autres:
                    partis += list(await self._async_service(service, autres, extra, **commun) or [])
                return partis
        partis = await self.regles.agir("volets", regle, "cover", service, cibles, extra,
                                        quoi=quoi or service, motif=motif,
                                        priorite=priorite, tenir=tenir,
                                        simuler=self._simule(),
                                        orientation=orientation, dehors=dehors)
        if partis and not self._simule():
            self._programmer_verif(partis, service, extra, regle=regle, quoi=quoi or service,
                                   motif=motif, priorite=priorite, tenir=tenir, essai=essai,
                                   orientation=orientation, dehors=dehors)
        return partis

    # ── Ordre non abouti (ADR 0007) ────────────────────────────────────────
    def _tentatives(self) -> int:
        try:
            return tentatives_valides((self.cfg.get("verification") or {}).get("tentatives"))
        except ValueError:
            return TENTATIVES_DEFAUT

    def _programmer_verif(self, partis: list, service: str, extra, *, regle: str,
                          quoi: str, motif: str, priorite: int, tenir: bool, essai: int,
                          orientation: int | None = None, dehors: float | None = None) -> None:
        """Deux minutes apres un ordre parti, on ira voir si le volet a bouge.

        `depuis` : l'heure de l'ordre. Tant que la verification attend, l'etat
        publie la manoeuvre en cours (spec Volets 6.1) : l'ecran joue la course
        meme quand Home Assistant se tait. `orientation` et `dehors` suivent la
        reprise, qui est une ligne de la meme regle."""
        cible = cible_de(service, extra)
        if cible is None or self._arrete:
            return
        for haid in partis:
            self._annuler_verif(haid)
            self._verifs[haid] = {
                "service": service, "extra": dict(extra or {}), "cible": cible,
                "essais": essai, "regle": regle, "quoi": quoi, "motif": motif,
                "priorite": priorite, "tenir": tenir, "depuis": time.time(),
                "orientation": orientation, "dehors": dehors,
                # Ce que le volet publiait a l'ordre, et les tours deja
                # attendus : une reponse se voit a ce qui change (`_a_repondu`).
                "signature": self._signature(haid), "attentes": 0,
                "annule": self._armer_verif(haid),
            }
        self._suivre_verifs()

    def _suivre_verifs(self) -> None:
        """(Re)pose l'ecoute sur les seuls volets en cours de verification.

        Audit du 19/10 : la verification ne regardait le volet qu'a ses
        rendez-vous de 120 s. Netatmo arrive en bas vers 135 s ; rouvert a la
        main depuis son appli - aucun utilisateur Home Assistant, donc rien ne
        gele -, il etait vu en haut au tour suivant, pris pour un volet
        immobile, et referme. Entre deux tours, ce qu'il publie tranche
        (`_sur_verif`)."""
        if self._defait_verifs is not None:
            try:
                self._defait_verifs()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia volets : ecoute des verifications deja retiree")
            self._defait_verifs = None
        if not self._verifs or self._arrete:
            return
        from homeassistant.helpers.event import async_track_state_change_event

        self._defait_verifs = async_track_state_change_event(
            self.hass, sorted(self._verifs), self._sur_verif)

    @callback
    def _sur_verif(self, event) -> None:
        """Un volet verifie publie : arrive, la verification s'arrete la ; parti
        vers sa cible puis reparti dans l'autre sens, c'est une main."""
        haid = (getattr(event, "data", None) or {}).get("entity_id")
        v = self._verifs.get(haid)
        if v is None:
            return
        position = self._position_actuelle(haid)
        if position is None:
            return
        cible = v["cible"]
        if atteint(position, cible):
            self._annuler_verif(haid)
            self._suivre_verifs()
            return
        ecart = abs(position - cible)
        sig = v.get("signature")
        depart = sig[1] if isinstance(sig, list) and len(sig) > 1 else None
        depart = abs(int(depart) - cible) if isinstance(depart, (int, float)) and not isinstance(depart, bool) else None
        proche = v.get("proche")
        if (proche is not None and depart is not None and proche < depart - VERIF_TOLERANCE
                and ecart > proche + VERIF_TOLERANCE):
            self._abandonner_verif(haid, v, "reparti dans l'autre sens")
            return
        v["proche"] = ecart if proche is None else min(proche, ecart)

    def _abandonner_verif(self, haid: str, v: dict, motif: str) -> None:
        """Quelqu'un a repris le volet : on n'y touche plus, et le journal le dit."""
        self._annuler_verif(haid)
        self._suivre_verifs()
        self.hass.async_create_task(
            self._noter(v.get("quoi") or v.get("service", "?"), "repris a la main", 0, detail=haid, motif=motif))

    def _armer_verif(self, haid: str):
        """Le rendez-vous de la verification, VERIF_DELAI plus tard ; rend ce
        qui l'annule."""
        if self._arrete:
            return None
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now) -> None:
            if not self._arrete:
                self.hass.async_create_task(self._async_verifier(haid))

        return async_call_later(self.hass, VERIF_DELAI, echu)

    def _signature(self, haid: str):
        """Ce que le volet publie et qu'une reponse change : son etat et sa
        position. None s'il n'existe pas."""
        st = self.hass.states.get(haid)
        if st is None:
            return None
        return [st.state, (st.attributes or {}).get("current_position")]

    def _a_repondu(self, haid: str, avant) -> bool:
        """Le volet a-t-il repondu depuis l'ordre ? En mouvement (`opening`,
        `closing`), ou son etat ou sa position ne sont plus ceux de l'ordre. Un
        volet vraiment immobile ne change rien : il garde la regle de l'ADR 0007.
        Injoignable, inconnu ou absent a l'ordre, il n'avait rien publie qui se
        compare : son retour change sa signature sans qu'il ait bouge - le vent ne
        l'ecarte pas -, et seul le mouvement compte alors."""
        st = self.hass.states.get(haid)
        if st is None:
            return False
        if st.state in ("opening", "closing"):
            return True
        if not isinstance(avant, list) or not avant or avant[0] in ("unavailable", "unknown"):
            return False
        return self._signature(haid) != avant

    def _annuler_verif(self, haid: str) -> None:
        v = self._verifs.pop(haid, None)
        if v and v.get("annule"):
            try:
                v["annule"]()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia volets : verification deja passee")

    async def _async_verifier(self, haid: str) -> None:
        """Un tour de verification ; l'ecoute suit ensuite les volets qui
        restent a verifier (audit du 19/10)."""
        try:
            await self._async_verifier_un_tour(haid)
        finally:
            self._suivre_verifs()

    async def _async_verifier_un_tour(self, haid: str) -> None:
        """Le volet est-il la ou l'ordre l'envoyait ? Sinon : injoignable, on
        l'attend (l'autre cause du meme defaut) ; joignable mais immobile, on
        redemande, puis le journal le dit en rouge."""
        v = self._verifs.pop(haid, None)
        if v is None:
            return
        if not self._joignable(haid):
            # Un ordre du PLANNING (ou de son rattrapage) attend le retour du
            # volet, comme s'il n'etait jamais parti. Le vent et le soleil ne
            # s'attendent pas (audit du 19/10) : ils se reevaluent d'eux-memes,
            # et une remontee du vent rejouee au retour du volet, la tempete
            # passee et le planning referme, le rouvrait en pleine nuit.
            if v["service"] in ("open_cover", "close_cover") and v.get("regle") in ("planning", "rattrapage"):
                self._mettre_en_attente([haid], "ouvrir" if v["service"] == "open_cover" else "fermer")
            return
        position = self._position_actuelle(haid)
        if position is None:
            # En mouvement, ou sans position : on ne sait pas, on ne se trompe pas.
            return
        if atteint(position, v["cible"]):
            return
        # Il a REPONDU sans etre arrive : un tour de plus, sans compter d'essai
        # ni redonner l'ordre. A deux minutes, l'ancienne regle redonnait l'ordre
        # a un volet Netatmo qui obeissait - sa position arrive une a trois
        # minutes apres la bascule de l'etat (mesure du 22/09 au 12/10 sur une
        # installation Netatmo : 83 ordres redonnes sur 119). Au plus
        # ATTENTES_MAX tours par ordre, puis la regle de l'ADR 0007 reprend ;
        # l'heure de l'ordre ne bouge pas, et la manoeuvre reste publiee.
        #
        # Un ordre qui ne fait rien basculer - une position, un etat deja celui
        # qu'il vise (`sans_bascule`) - ne peut pas montrer sa reponse avant la
        # position : son premier tour s'accorde sans elle, le second en exige
        # une. Une reprise (un essai) n'y a pas droit : apres les tours de
        # l'ordre, l'ADR 0007 tel quel.
        #
        # Arrete EN CHEMIN (audit du 19/10) : une position publiee, ni celle de
        # l'ordre ni la cible, et la meme qu'au tour d'avant. Le moteur ne
        # court plus : quelqu'un l'a arrete depuis l'appli ou l'interrupteur, et
        # redonner l'ordre le contredirait. La position perimee de Netatmo,
        # elle, est encore celle de l'ordre : elle garde la regle ci-dessous.
        sig = v.get("signature")
        a_l_ordre = sig[1] if isinstance(sig, list) and len(sig) > 1 else None
        st = self.hass.states.get(haid)
        immobile = st is not None and st.state not in ("opening", "closing")
        if immobile and v.get("vu") == position and a_l_ordre is not None and position != a_l_ordre:
            await self._noter(v.get("quoi") or v["service"], "repris a la main", 0, detail=haid,
                              motif="arrete en chemin")
            return
        v = {**v, "vu": position}
        attentes = v.get("attentes", 0)
        if attentes < ATTENTES_MAX and (
                self._a_repondu(haid, v.get("signature"))
                or (attentes == 0 and not v.get("essais") and sans_bascule(v["service"], v.get("signature")))):
            self._verifs[haid] = {**v, "attentes": attentes + 1, "annule": self._armer_verif(haid)}
            return
        n = self._tentatives()
        if v["essais"] < n:
            # Par le socle : une main posee entre-temps arrete tout, en silence.
            await self._async_service(v["service"], [haid], v["extra"] or None,
                                      regle=v["regle"], quoi=v["quoi"],
                                      motif=joindre(v["motif"] or v["regle"],
                                                    ("immobile, essai {k}/{n}", {"k": v["essais"] + 1, "n": n})),
                                      priorite=v["priorite"], tenir=v["tenir"],
                                      essai=v["essais"] + 1, orientation=v.get("orientation"),
                                      dehors=v.get("dehors"))
            return
        await self._noter(v["quoi"], "non abouti", 0, detail=haid,
                          motif=("immobile apres {n} essai" if n == 1 else "immobile apres {n} essais", {"n": n}),
                          echec=True)

    async def _noter(self, quoi: str, regle: str, combien: int, detail: str = "",
                     motif: str = "", echec: bool = False) -> None:
        """Une ligne de journal, dans le journal COMMUN.

        Il vivait ici, en memoire, et repartait a zero a chaque redemarrage —
        au point qu'une regle muette pendant la nuit ne laissait rien a lire
        le lendemain.
        """
        await self.regles.noter("volets", regle, quoi, n=combien,
                                detail=detail, motif=motif, echec=echec)

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    def _simule(self) -> bool:
        """Observer sans agir : les regles notent, rien ne bouge."""
        return bool((self.cfg.get("simulation") or {}).get("actif"))

    def _repartir_de_zero(self) -> None:
        """Du simule au reel, ou l'inverse : les regles repartent de ce que la
        maison EST, pas de ce qu'elles ont imagine.

        Sans cela, une mise a l'abri simulee laissait `a_l_abri` vrai : le vrai
        vent, ensuite, ne remontait rien — la regle croyait l'avoir fait.
        """
        self.abaisses.clear()
        self.a_l_abri = False
        self._abri_depuis = None
        self._abrites = frozenset()
        self._oublier_calme()
        self._vent_reparle()
        self.attente.clear()
        self._suivre_attente()
        for haid in list(self._verifs):
            self._annuler_verif(haid)
        self.regles.relacher("volets")

    async def async_config(self) -> dict[str, Any]:
        return self._config_de(await self.store.async_get_shared(CLE, None))

    def _config_de(self, brut: Any) -> dict[str, Any]:
        """La configuration, defauts compris. Synchrone : `async_enregistrer`
        la rebatit sous le verrou du magasin (lot 15 de l'audit du 03/10)."""
        cfg = {k: dict(v) for k, v in DEFAUT.items()}
        # Le seuil par defaut (25) est pense en Celsius ; sur une installation
        # jamais configuree et reglee en Fahrenheit, 25 est trop froid de loin
        # (la regle croirait alors qu'il gele en permanence et remonterait
        # tout). Un seuil deja enregistre vient de `brut` plus bas et n'est
        # jamais touche ici : le frontend l'a deja ecrit dans l'unite reelle
        # du capteur choisi.
        if unite_temperature(self.hass) == "F":
            cfg["soleil"]["temp_min"] = round(depuis_celsius(cfg["soleil"]["temp_min"], "F"))
        if isinstance(brut, dict):
            for section, valeurs in brut.items():
                if section in cfg and isinstance(valeurs, dict):
                    cfg[section].update(valeurs)
        self._borner(cfg)
        return cfg

    @staticmethod
    def _borner(cfg: dict[str, Any]) -> None:
        """Ce qu'un patch ne peut plus ecrire (audit du 19/10), ramene a la
        LECTURE quand c'etait deja enregistre : un decalage lisible hors bornes,
        un seuil de vent nul ou illisible - nul, il mettait la maison a l'abri
        pour toujours. Ce qui est ramene s'ecrit au prochain enregistrement. Le
        reste ne change pas : le moteur lit l'illisible comme avant."""
        plan = cfg["planning"]
        for sens in ("ouverture", "fermeture"):
            section = plan.get(sens)
            if isinstance(section, dict) and "decalage" in section:
                plan[sens] = {**section, "decalage": borner_decalage(section["decalage"])}
        par_volet = plan.get("volets")
        if isinstance(par_volet, dict):
            table = {}
            for haid, reglage in par_volet.items():
                if isinstance(reglage, dict):
                    reglage = {**reglage, **{s: borner_decalage(reglage[s])
                                             for s in ("ouverture", "fermeture") if s in reglage}}
                table[haid] = reglage
            plan["volets"] = table
        try:
            seuil_vent_valide(cfg["vent"].get("seuil"))
        except ValueError:
            cfg["vent"]["seuil"] = DEFAUT["vent"]["seuil"]

    async def async_etat(self) -> dict[str, Any]:
        from homeassistant.util import dt as dt_util

        st = self.hass.states.get(SOLEIL)
        attrs = (st.attributes if st else {}) or {}
        cfg = self.cfg or await self.async_config()
        if await self._async_purger_attente():
            self._suivre_attente()
        # Les instants publies s'ecrivent a l'heure de la maison, comme ceux du
        # chauffage : l'ecran lit l'heure dans la partie murale de la chaine.
        maintenant = dt_util.now()
        # Les heures du soleil des la VEILLE du lundi : `a_venir` en a besoin (une
        # fermeture tardive du dimanche sonne le lundi apres minuit). L'etat les
        # publie a partir du lundi (spec 6.1).
        jours = self._soleil_jours(maintenant)
        return {
            "config": cfg,
            "soleil": {"azimut": attrs.get("azimuth"), "elevation": attrs.get("elevation")},
            "abaisses": sorted(self.abaisses),
            "a_l_abri": self.a_l_abri,
            "journal": await self.regles.journal(limite=40, module="volets"),
            # Qui l'emporte, du plus fort au plus faible, et qui tient quel
            # volet en ce moment : que l'ecran le dise plutot que le laisser
            # deviner.
            "priorites": [r for r, _ in sorted(PRIORITES.items(), key=lambda x: -x[1])],
            "tenues": self.regles.tenues("volets"),
            # Ce qui est ARME, et quand cela sonnera. Une regle qu'on ne peut
            # pas inspecter ne se debogue pas : quand rien ne bouge le matin, la
            # premiere question est de savoir si le rendez-vous existe.
            "armes": {s: self._volets_armes(s) for s in self.armes},
            "attente": {h: dict(o) for h, o in self.attente.items()},
            "raison": self.raison,
            # `prochains` n'est plus publie (audit du 19/10) : plus aucun ecran
            # ne le lisait, la carte dit `volets[...].a_venir`.
            # Ce que la carte et la fiche d'un volet disent (spec 6.1).
            "maintenant": ecrire_instant(maintenant),
            "soleil_jours": jours[1:],
            "volets": self._volets_etat(cfg, maintenant, jours),
        }

    def _dire_une_fois(self, panne: str, message: str) -> None:
        """Ecrit une panne au journal de Home Assistant, une fois : l'ecran sonde
        l'etat toutes les cinq secondes, et le journal ne doit pas s'en remplir.
        A appeler dans le `except` qui l'a vue : la trace part avec."""
        if panne in self._pannes_dites:
            return
        self._pannes_dites = self._pannes_dites | {panne}
        _LOGGER.warning(message, exc_info=True)

    def _plus_de_panne(self, panne: str) -> None:
        """La panne est passee : si elle revient, elle se dira de nouveau."""
        if panne in self._pannes_dites:
            self._pannes_dites = self._pannes_dites - {panne}

    def _lieu(self) -> tuple:
        """L'emplacement de la maison - latitude, longitude, altitude -, dont
        dependent les heures et la position du soleil : ce que Home Assistant en
        garde dans sa configuration."""
        conf = getattr(self.hass, "config", None)
        return tuple(getattr(conf, cle, None) for cle in ("latitude", "longitude", "elevation"))

    def _soleil_jours(self, maintenant) -> list[dict[str, Any]]:
        """Le lever et le coucher de chaque jour, de la VEILLE du lundi de la
        semaine en cours a aujourd'hui + 7 jours, a l'heure de la maison :
        [{"date", "lever", "coucher"}]. L'etat publie la liste a partir du lundi
        (spec 6.1) ; la veille ne sert qu'a `a_venir` - une fermeture tardive du
        dimanche, qui passe minuit, est encore a venir le lundi a 00:30.

        Chaque evenement se range sous sa date LOCALE. `get_astral_event_date` rend
        celui de la date UTC qu'on lui donne : loin de l'UTC - en Asie, en Amerique
        l'ete -, il appartient a la date locale voisine. On demande donc aussi la
        veille et le lendemain des dates voulues, et chaque evenement se range a la
        date de son heure dans la maison.

        Un jour sans lever ou sans coucher - au-dela du cercle polaire - le dit par
        None, comme Home Assistant. Illisibles - pas de `helpers.sun`, ou une
        erreur qu'il laisse passer (il avale ValueError, et rend alors None comme
        pour un jour sans lever) - : une liste vide, et le journal de Home
        Assistant le dit une fois. Gardees pour la journee : elles ne se
        redemandent qu'a un autre jour, un autre fuseau ou un autre emplacement de
        la maison. Sans appel reseau : astral calcule, Home Assistant garde
        l'emplacement en cache."""
        aujourd_hui = maintenant.date()
        cle = (aujourd_hui, maintenant.tzinfo, self._lieu())
        if isinstance(self._jours_soleil, tuple) and self._jours_soleil[0] == cle:
            return self._jours_soleil[1]
        veille = aujourd_hui - timedelta(days=aujourd_hui.weekday() + 1)
        dates = [veille + timedelta(days=i) for i in range(aujourd_hui.weekday() + 9)]
        locaux: dict[tuple, str] = {}
        try:
            from homeassistant.const import SUN_EVENT_SUNRISE, SUN_EVENT_SUNSET
            from homeassistant.helpers.sun import get_astral_event_date

            for i in range(-1, len(dates) + 1):
                jour = veille + timedelta(days=i)
                for nom, evenement in (("lever", SUN_EVENT_SUNRISE), ("coucher", SUN_EVENT_SUNSET)):
                    instant = get_astral_event_date(self.hass, evenement, jour)
                    if instant is not None:
                        local = instant.astimezone(maintenant.tzinfo)
                        locaux.setdefault((local.date(), nom), ecrire_instant(local))
        except Exception:  # noqa: BLE001
            self._dire_une_fois("soleil", "Loggia volets : heures du soleil illisibles, "
                                          "les prochains mouvements ne se calculent pas")
            return []
        self._plus_de_panne("soleil")
        jours = [{"date": d.isoformat(), "lever": locaux.get((d, "lever")),
                  "coucher": locaux.get((d, "coucher"))} for d in dates]
        self._jours_soleil = (cle, jours)
        return jours

    def _volets_etat(self, cfg: dict[str, Any], maintenant, soleil_jours: list) -> dict[str, Any]:
        """Chaque volet, pour sa carte et sa fiche (spec 6.1). Les volets au sens
        de `_tous_les_covers()` - par leur classe - : les fenetres de toit n'y
        sont pas. Tout se calcule en memoire, sans appel reseau. `soleil_jours`
        commence a la veille du lundi : `a_venir` en a besoin.

        `porte` se lit meme quand la regle « Volet bloque » est coupee : l'ecran
        dit alors qu'elle l'est, au lieu de taire la porte choisie."""
        plan = cfg.get("planning") or {}
        soleil = cfg.get("soleil") or {}
        orientes = soleil.get("volets") if isinstance(soleil.get("volets"), dict) else {}
        portes = (cfg.get("baies") or {}).get("volets")
        portes = portes if isinstance(portes, dict) else {}
        iso = ecrire_instant(maintenant)
        # La protection ne se publie que si elle rendra le volet : coupee, elle ne
        # rend plus rien (`_async_soleil` s'arrete) ; un volet repris - une main,
        # le vent, les alertes - ne se rend pas (`_async_rendre` exige qu'elle le
        # tienne encore). Sans quoi l'ecran promettrait une remontee qui
        # n'arrivera pas.
        proteges = ({h for h in self.abaisses if self.regles.tient("volets", "soleil", h)}
                    if soleil.get("actif") else set())
        # Ce qu'on garde de la fin d'un volet qui n'est plus baisse s'en va avec lui.
        self._fins = {h: garde for h, garde in self._fins.items() if h in self.abaisses}
        # La position du soleil ne se demande que si un volet est protege.
        position = self._position_soleil() if proteges else None
        sortie: dict[str, Any] = {}
        for haid in self._tous_les_covers():
            reglage = orientes.get(haid) if isinstance(orientes.get(haid), dict) else {}
            capteur = portes.get(haid)
            ordre = self.attente.get(haid)
            sortie[haid] = {
                "regle": regle_de(plan, haid),
                "a_venir": a_venir(plan, haid, soleil_jours, iso),
                "protection": self._protection(haid, reglage, soleil, position, maintenant)
                              if haid in proteges else None,
                "abri": bool(self.a_l_abri),
                "attente": {"sens": ordre.get("sens"), "motif": ordre.get("motif"),
                            "expire": instant_de(ordre.get("expire"), maintenant.tzinfo)}
                           if isinstance(ordre, dict) else None,
                "porte": {"entite": capteur, "etat": etat_baie(self.hass.states, capteur)}
                         if isinstance(capteur, str) and capteur else None,
                "orientation": degres(reglage.get("orientation")),
                "manoeuvre": self._manoeuvre(haid, maintenant),
            }
        return sortie

    def _manoeuvre(self, haid: str, maintenant) -> dict[str, Any] | None:
        """L'ordre que la verification attend encore (ADR 0007) : sa cible,
        l'heure de l'ordre et la regle. None une fois la verification passee - et
        des que le volet a ete repris : par une main (le gel), ou par une autre
        regle qui le TIENT, d'un autre module comme les alertes. La verification
        peut attendre encore, mais cette course n'est plus celle que fait le
        volet, et l'ecran ne doit plus la jouer."""
        v = self._verifs.get(haid)
        if not isinstance(v, dict):
            return None
        if self.regles.gele(haid):
            return None
        if haid in self.regles.tenues_toutes() and not self.regles.tient("volets", v.get("regle") or "", haid):
            return None
        return {"cible": v.get("cible"), "depuis": instant_de(v.get("depuis"), maintenant.tzinfo),
                "regle": v.get("regle") or ""}

    def _position_soleil(self):
        """La position du soleil a un instant donne, par l'astral de Home
        Assistant - `get_astral_location`, celui de l'entite `sun.sun` -, ou None
        s'il est illisible (le journal de Home Assistant le dit une fois)."""
        try:
            from homeassistant.helpers.sun import get_astral_location

            lieu, altitude = get_astral_location(self.hass)
        except Exception:  # noqa: BLE001
            self._dire_une_fois("position", "Loggia volets : position du soleil illisible, "
                                            "l'heure ou la protection relache ne se calcule pas")
            return None
        self._plus_de_panne("position")

        def position(instant):
            return lieu.solar_azimuth(instant, altitude), lieu.solar_elevation(instant, altitude)

        return position

    def _protection(self, haid: str, reglage: dict, soleil: dict, position, maintenant) -> dict[str, Any]:
        """La protection en cours sur ce volet (spec 6.3) : `jusqu_a`, quand elle
        relachera - None si on ne sait pas le dire -, `position`, ou elle le rendra
        alors - sa position d'avant, 100 si elle n'etait pas connue, comme
        `_async_rendre` -, et `orientation`, la facade qui l'a declenchee.

        La fin se garde d'un sondage a l'autre, par volet et par reglages - la
        facade, l'ouverture du cone, la hauteur minimale, l'emplacement de la
        maison -, tant qu'elle n'est pas passee : la grille des cinq minutes est
        fixe, et le soleil ne sort pas plus tot qu'on ne l'a calcule. La chercher
        coute jusqu'a 288 pas, et l'ecran sonde toutes les cinq secondes. Une fin
        inconnue ne se garde pas."""
        avant = self.abaisses.get(haid)
        orientation = degres(reglage.get("orientation"))
        ouverture = reglage.get("ouverture", 90)
        try:
            elevation_min = float(soleil.get("elevation_min", 15))
        except (TypeError, ValueError):
            elevation_min = None
        reglages = (orientation, ouverture, elevation_min, self._lieu())
        garde = self._fins.get(haid)
        if garde is not None and garde[0] == reglages and maintenant < garde[1]:
            fin = garde[1]
        else:
            fin = None
            if position is not None and orientation is not None and elevation_min is not None:
                fin = fin_protection(position, orientation, ouverture, elevation_min, maintenant)
            if fin is not None:
                self._fins[haid] = (reglages, fin)
            else:
                self._fins.pop(haid, None)
        return {"jusqu_a": ecrire_instant(fin.astimezone(maintenant.tzinfo)) if fin else None,
                "position": 100 if avant is None else int(avant), "orientation": orientation}

    async def async_manoeuvres(self, haid: str, depuis: float, user: Any = None) -> dict[str, Any]:
        """`loggia/volets/manoeuvres` (spec 6.5) : les lignes du journal qui
        parlent de ce volet depuis `depuis` (secondes depuis 1970), de TOUS les
        modules - celles dont `cibles` le contient, ou dont `detail` le nomme -,
        les plus recentes d'abord, MANOEUVRES_MAX au plus.

        Sous les droits de LECTURE du compte (`_lecture_autorisee`, la garde de
        l'etat du chauffage ; audit du 19/10) : une entite que ce compte ne
        peut pas lire est refusee (PermissionError), exactement comme le
        journal d'une lampe. Sans compte, ou sans restriction : tout.

        `couvre_depuis` : l'heure de la plus vieille ligne du journal ENTIER -
        ou, quand la reponse est coupee a MANOEUVRES_MAX, celle de sa plus
        vieille ligne. Avant elle, la reponse ne sait plus rien - le journal
        garde MAX_JOURNAL lignes pour toute la maison - et l'ecran ne dit pas
        « a la main » sans le savoir. None : le journal est vide."""
        from .discovery import _lecture_autorisee

        lecture = _lecture_autorisee(user)
        if lecture is not None and not lecture(haid):
            raise PermissionError("pas le droit de lire %s" % haid)
        toutes = await self.regles.journal(limite=MAX_JOURNAL)
        heures = [e["ts"] for e in toutes
                  if isinstance(e.get("ts"), (int, float)) and not isinstance(e.get("ts"), bool)]
        lignes = []
        for e in toutes:
            ts = e.get("ts")
            if isinstance(ts, bool) or not isinstance(ts, (int, float)) or ts < depuis:
                continue
            cibles = e.get("cibles")
            if (isinstance(cibles, list) and haid in cibles) or nomme(e.get("detail"), haid):
                lignes.append(e)
                if len(lignes) >= MANOEUVRES_MAX:
                    break
        couvre = min(heures) if heures else None
        if len(lignes) >= MANOEUVRES_MAX:
            # Coupee : ce qui est plus vieux que sa derniere ligne n'y est pas,
            # meme si le journal, lui, remonte plus loin.
            couvre = max(couvre, lignes[-1]["ts"])
        return {"lignes": lignes, "couvre_depuis": couvre}

    def _volets_armes(self, sens: str) -> dict[str, Any]:
        """Quels volets chaque decalage arme commanderait, s'il sonnait la.

        Resolu MAINTENANT et non a l'armement : c'est le sens meme de la
        correction, et l'etat doit dire ce qui se passerait vraiment.
        """
        plan = self.cfg.get("planning") or {}
        groupes = groupes_horaires(plan, self._ouvrants(sens), sens)
        return {d: list(groupes.get(int(d), [])) for d in self.armes.get(sens, {})}

    def _poser_patch(self, cfg: dict[str, Any], patch: dict[str, Any]) -> None:
        """Le patch de l'ecran, pose sur `cfg`. Synchrone : sous le verrou.
        Une section se fusionne au premier niveau ; ses tables PAR VOLET
        (`planning.volets`, `soleil.volets`, `baies.volets`) se fusionnent volet
        par volet, et `None` en retire un (sa demande du 25/10). Elles arrivaient
        entieres et remplacaient l'ancienne : deux ecrans qui reglaient deux
        volets presque ensemble, et le second effacait le reglage du premier.

        Les decalages du planning et le seuil du vent se valident AVANT (audit
        du 19/10), et seulement ce que le patch CHANGE : une valeur deja la -
        bornee a la lecture - ne fait pas refuser l'enregistrement d'un voisin."""
        self._valider_patch(cfg, patch or {})
        for section, valeurs in (patch or {}).items():
            if section in cfg and isinstance(valeurs, dict):
                par_volet = valeurs.get("volets") if section in ("planning", "soleil", "baies") else None
                cfg[section].update({k: v for k, v in valeurs.items() if not (k == "volets" and isinstance(par_volet, dict))})
                if isinstance(par_volet, dict):
                    table = dict(cfg[section].get("volets") or {}) if isinstance(cfg[section].get("volets"), dict) else {}
                    for haid, reglage in par_volet.items():
                        if reglage is None:
                            table.pop(haid, None)
                        else:
                            table[haid] = reglage
                    cfg[section]["volets"] = table
        # Le seul reglage de la verification, borne (ADR 0007).
        cfg["verification"]["tentatives"] = tentatives_valides(cfg["verification"].get("tentatives"))

    @staticmethod
    def _valider_patch(cfg: dict[str, Any], patch: dict[str, Any]) -> None:
        """Refuse, en le NOMMANT (refus.py), un decalage hors de -120 a +240 min
        - maison et volet par volet - et un seuil de vent nul ou illisible."""
        plan = patch.get("planning")
        if isinstance(plan, dict):
            actuel = cfg["planning"]
            for sens in ("ouverture", "fermeture"):
                if sens not in plan:
                    continue
                section = plan[sens]
                if not isinstance(section, dict):
                    raise RefusNomme("volets_decalage_hors_bornes", "section illisible", "planning." + sens)
                if "decalage" in section:
                    avant = (actuel.get(sens) or {}).get("decalage") if isinstance(actuel.get(sens), dict) else None
                    if not meme_valeur(section["decalage"], avant):
                        decalage_valide(section["decalage"], "planning.%s.decalage" % sens)
            par_volet = plan.get("volets")
            if isinstance(par_volet, dict):
                anciens = actuel.get("volets") if isinstance(actuel.get("volets"), dict) else {}
                for haid, reglage in par_volet.items():
                    if not isinstance(reglage, dict):
                        continue
                    ancien = anciens.get(haid) if isinstance(anciens.get(haid), dict) else {}
                    for sens in ("ouverture", "fermeture"):
                        brut = reglage.get(sens)
                        if brut in (None, "") or (sens in ancien and meme_valeur(ancien[sens], brut)):
                            continue
                        decalage_valide(brut, "planning.volets.%s.%s" % (haid, sens))
        vent = patch.get("vent")
        if isinstance(vent, dict) and "seuil" in vent and not meme_valeur(vent["seuil"], cfg["vent"].get("seuil")):
            seuil_vent_valide(vent["seuil"])

    async def async_enregistrer(self, patch: dict[str, Any]) -> dict[str, Any]:
        # D'un seul tenant, sous le verrou du magasin (lot 15 de l'audit du
        # 03/10 ; voir store.async_modifier_shared).
        simulait = False

        def changer(brut: Any) -> dict[str, Any]:
            nonlocal simulait
            cfg = self._config_de(brut)
            simulait = bool((cfg.get("simulation") or {}).get("actif"))
            self._poser_patch(cfg, patch)
            return cfg

        cfg = await self.store.async_modifier_shared(CLE, changer)
        self.cfg = cfg
        if bool((cfg.get("simulation") or {}).get("actif")) != simulait:
            self._repartir_de_zero()
            self.hass.async_create_task(self._async_evaluer())
        # Planning coupe ou passe en « Manuel » : les ordres en attente d'une
        # baie ou d'un volet revenu n'ont plus de raison d'etre (audit du 03/10).
        plan = cfg.get("planning") or {}
        if self.attente and (not plan.get("actif") or str(plan.get("mode") or "auto").lower() == "manuel"):
            self.attente.clear()
            self._suivre_attente()
        await self._async_rendre_non_couverts(cfg)
        # Les rendez-vous portent les decalages : les changer oblige a les
        # reposer, sinon l'ancienne heure resterait armee jusqu'au redemarrage.
        await self._async_reprogrammer()
        # L'anemometre aussi : choisi ou change ici, il est suivi tout de suite.
        self._reabonner_etat()
        return cfg

    async def _async_rendre_non_couverts(self, cfg: dict[str, Any]) -> None:
        """La protection coupee, ou la facade d'un volet retiree (audit du
        19/10) : ce qu'elle avait baisse et ne couvre plus est rendu - remis a
        sa position d'avant - et sa tenue relachee. `_async_soleil` ne repassait
        plus sur ces volets-la : ils restaient baisses, tenus douze heures."""
        s = cfg.get("soleil") or {}
        par_volet = s.get("volets") if isinstance(s.get("volets"), dict) else {}
        couverts = ({h for h, r in par_volet.items()
                     if isinstance(r, dict) and degres(r.get("orientation")) is not None}
                    if s.get("actif") else set())
        partis = [h for h in self.abaisses if h not in couverts]
        for haid in partis:
            await self._async_rendre(haid, motif="protection coupee")
        if partis:
            self.regles.relacher("volets", "soleil", cibles=partis)

    @callback
    # ── Un volet renomme (sa demande du 25/10) ──────────────────────────────
    def _connait(self, haid: str) -> bool:
        """La configuration ou la memoire du module nomment-elles cette entite ?
        (Le renommage d'une COPIE le dit, sans rien changer.)"""
        return (renommer_dans_volets(copy.deepcopy(self.cfg or {}), haid, haid + "#")
                or haid in self.attente or haid in self.abaisses or haid in self._abrites)

    @callback
    def _sur_registre(self, event) -> None:
        d = getattr(event, "data", None) or {}
        ancien, neuf = d.get("old_entity_id"), d.get("entity_id")
        if d.get("action") != "update" or not ancien or not neuf or ancien == neuf or self._arrete:
            return
        if self._connait(ancien):
            self.hass.async_create_task(self._async_renommer(ancien, neuf))

    async def _async_renommer(self, ancien: str, neuf: str) -> None:
        def changer(brut: Any) -> dict[str, Any]:
            cfg = self._config_de(brut)
            renommer_dans_volets(cfg, ancien, neuf)
            return cfg

        vent_avant = (self.cfg.get("vent") or {}).get("entite")
        self.cfg = await self.store.async_modifier_shared(CLE, changer)
        # Ce que le module tient en memoire suit aussi : l'ordre en attente, la
        # position d'avant la protection, ce que le vent a bouge, et les tenues.
        if ancien in self.attente:
            self.attente[neuf] = self.attente.pop(ancien)
        if ancien in self.abaisses:
            self.abaisses[neuf] = self.abaisses.pop(ancien)
        if ancien in self._abrites:
            self._abrites = frozenset(neuf if h == ancien else h for h in self._abrites)
        for regle in ("soleil", "vent"):
            if self.regles.tient("volets", regle, ancien):
                self.regles.relacher("volets", regle, cibles=[ancien])
                self.regles.tenir("volets", regle, [neuf], priorite=PRIORITES[regle])
        self._suivre_attente()
        if (self.cfg.get("vent") or {}).get("entite") != vent_avant:
            self._reabonner_etat()

    def async_arreter(self) -> None:
        if self._ecoute_registre is not None:
            try:
                self._ecoute_registre()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia volets : ecoute du registre deja retiree")
            self._ecoute_registre = None
        self._arrete = True
        self._vent_reparle()
        self._oublier_calme()
        for haid in list(self._verifs):
            self._annuler_verif(haid)
        self._suivre_verifs()
        if self._defait_demarre is not None:
            try:
                self._defait_demarre()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia volets : attente du demarrage deja retiree")
            self._defait_demarre = None
        if self._defait_attente is not None:
            try:
                self._defait_attente()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia volets : ecoute d'attente deja retiree")
            self._defait_attente = None
        for source in (self._defait, self._defait_soleil):
            for defaire in source:
                try:
                    defaire()
                except Exception:  # noqa: BLE001
                    _LOGGER.debug("Loggia volets : desabonnement sans effet")
            source.clear()
