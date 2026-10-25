"""Ce qu'il y a au bout d'une prise, et ce qu'est une prise (chantier Prises, spec 6.2 et 6.4).

Le jumeau Python de deux regles de l'ecran :
  * `type_de_prise` : `typeDePrise` de src/prises.js, avec SA table de mots
    (`MOTS_PRISE`), recopiee telle quelle — les mots polonais de Seba882
    compris (PR #14, ADR 0118). Le serveur en a besoin pour savoir quelles
    prises sont de l'electromenager (P3) ;
  * `est_prise` : la regle « est une prise » (P1), que l'ecran ecrit de son
    cote pour dessiner ses cartes — avec ses sorties (`MOTS_REGLAGE`, recopiee
    elle aussi) et les compteurs de la maison (`compteurs_maison`).

Une fixture commune les tient d'accord, `tests/fixtures/prises_parite.json`,
lue par les tests des deux langues ; et un test relit `MOTS_PRISE` et
`MOTS_REGLAGE` dans le texte de src/prises.js : si l'une bouge sans l'autre,
il rougit.

Pur : ni Home Assistant, ni etat, ni horloge.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

# Les types de l'ecran (`TYPES_PRISE`), dans son ordre. « prise » ne pretend rien.
TYPES = ("nas", "pc", "lv", "ll", "sl", "fer", "frigo", "tv", "cafe", "radia", "box", "ve", "siren", "prise")

# Les mots qui trahissent un appareil, recopies de src/prises.js — l'ORDRE
# compte : « seche linge » avant « linge », « suszarka » avant « pralka ». Les
# mots s'ecrivent a plat, comme la-bas (`aplati`). La premiere ligne rend une
# prise ordinaire : les faux amis (un seche-cheveux, la recharge d'un velo,
# le fer forge), lus avant tout le reste (audit du 19/10).
MOTS_PRISE = (
    ("prise", ("hair dryer", "seche cheveux", "suszarka do wlosow", "fer forge", "chemin de fer", "velo",
               "trottinette", "bike", "ebike", "e bike", "scooter", "fahrrad", "fiets", "bici", "bicicletta",
               "bicicleta", "monopattino", "patinete", "rower", "hulajnoga")),
    ("lv", ("lave vaisselle", "lavevaisselle", "dishwasher", "vaisselle", "zmywarka", "lv", "geschirrspuler",
            "spulmaschine", "geschirrspulmaschine", "vaatwasser", "vaatwasmachine", "lavastoviglie", "lavavajillas",
            "lavaplatos")),
    ("sl", ("seche linge", "sechelinge", "dryer", "tumble", "suszarka", "sl", "trockner", "waschetrockner",
            "droger", "wasdroger", "droogtrommel", "asciugatrice", "secadora")),
    ("ll", ("lave linge", "lavelinge", "machine a laver", "washer", "washing", "lessive", "pralka", "ll",
            "waschmaschine", "waschautomat", "wasmachine", "lavatrice", "lavadora")),
    ("fer", ("fer a repasser", "fer", "repassage", "centrale vapeur", "iron", "zelazko", "bugeleisen",
             "dampfbugeleisen", "strijkijzer", "strijkbout", "ferro da stiro", "ferro stiro", "plancha de vapor",
             "centro de planchado")),
    ("frigo", ("frigo", "refrigerateur", "fridge", "refrigerator", "congelateur", "freezer", "lodowka",
               "zamrazarka", "chlodziarka", "kuhlschrank", "gefrierschrank", "gefriertruhe", "kuhltruhe",
               "koelkast", "vriezer", "diepvries", "frigorifero", "congelatore", "frigorifico", "nevera",
               "congelador", "refrigerador")),
    ("cafe", ("cafetiere", "machine a cafe", "coffee", "expresso", "espresso", "percolateur", "ekspres",
              "kaffeemaschine", "kaffeevollautomat", "koffiezetapparaat", "koffiemachine", "macchina caffe",
              "macchina del caffe", "caffettiera", "cafetera", "maquina de cafe", "maquina cafe")),
    ("ve", ("borne", "recharge", "wallbox", "chargeur voiture", "voiture electrique", "ev charger",
            "stacja ladowania", "ladesaule", "elektroauto", "laadpaal", "colonnina", "punto de recarga",
            "cargador coche")),
    ("nas", ("nas", "synology", "serveur", "server", "homelab", "unraid", "serwer", "servidor")),
    ("pc", ("pc", "ordinateur", "computer", "imac", "macbook", "desktop", "workstation", "komputer",
            "unite centrale", "rechner", "ordenador", "computadora")),
    ("tv", ("tv", "tele", "television", "televiseur", "oled", "videoprojecteur", "telewizor", "video projecteur",
            "projecteur video", "beamer", "fernseher", "televisie", "televisore", "televisione", "televisor")),
    ("box", ("box", "routeur", "router", "fibre", "livebox", "freebox", "bbox", "modem", "fritzbox", "fritz box",
             "enrutador")),
    ("radia", ("radiateur", "convecteur", "chauffage", "seche serviette", "heater", "radiator", "grzejnik",
               "kaloryfer", "ogrzewanie", "seche serviettes", "heizung", "heizkorper", "heizlufter",
               "handtuchwarmer", "kachel", "handdoekradiator", "radiatore", "termosifone", "stufa",
               "scaldasalviette", "radiador", "calefactor", "estufa", "toallero")),
    ("siren", ("sirene", "siren", "alarme sonore", "syrena", "sirena")),
)

# Ce qui dit un switch de REGLAGE (le voyant, le verrou enfant, l'etat au
# retour du courant), recopie de src/prises.js : il ne sert que sur un
# appareil qui porte plusieurs switch sans categorie (`_sorties`).
MOTS_REGLAGE = (
    "led", "voyant", "indicateur", "indicator", "status light", "backlight", "retroeclairage", "verrou",
    "verrouillage", "securite enfant", "lock", "comportement", "power on behavior", "power on behaviour", "restore",
    "restauration", "kindersicherung", "tastensperre", "sperre", "anzeige", "kontrollleuchte", "statusleuchte",
    "einschaltverhalten", "kinderslot", "kinderbeveiliging", "vergrendeling", "statuslampje", "inschakelgedrag",
    "blocco", "sicurezza bambini", "indicatore", "spia", "ripristino", "bloqueo", "indicador", "luz indicadora",
    "blokada", "dioda", "wskaznik", "kontrolka", "podswietlenie",
)

# Les sources du tableau de bord Energie dont les capteurs sont des compteurs
# de la maison (decision du 19/10). L'eau n'en est pas.
SOURCES_MAISON = ("grid", "solar", "battery", "gas")

# Tout ce qui n'est ni lettre ni chiffre separe deux mots.
SEPARATEURS = re.compile(r"[^a-z0-9]+")


def _sans_accents(texte: str) -> str:
    """Les marques combinantes (U+0300 a U+036F) retirees apres NFD."""
    return "".join(c for c in unicodedata.normalize("NFD", texte) if not 0x300 <= ord(c) <= 0x36F)


def aplati(texte: Any) -> str:
    """`aplati` de l'ecran : sans accents, sans casse. Le « l barre » polonais
    n'a pas de decomposition NFD : il se traite a part, comme la-bas."""
    return _sans_accents(str(texte) if texte else "").replace("ł", "l").replace("Ł", "L").lower()


def en_mots(texte: Any) -> str:
    """`enMots` de l'ecran : le texte reduit a ses mots, une espace entre deux,
    une espace aux deux bouts — « lave vaisselle » se cherche alors entier."""
    return " " + SEPARATEURS.sub(" ", aplati(texte)).strip() + " "


def type_de_prise(nom: Any, impose: Any = None, indice: Any = "") -> str:
    """`typeDePrise` de l'ecran : le type impose s'il en est un, sinon le
    premier dont un mot se lit, entier, dans le nom puis l'identifiant ;
    « prise » a defaut."""
    if isinstance(impose, str) and impose in TYPES:
        return impose
    n = en_mots(aplati(nom) + " " + aplati(indice))
    for type_, mots in MOTS_PRISE:
        for mot in mots:
            if en_mots(mot) in n:
                return type_
    return "prise"


MOTS_SIRENE = dict(MOTS_PRISE)["siren"]


def est_sirene(entity_id: Any, nom: Any) -> bool:
    """`estSirene` de l'ecran (src/attention.js), pour un interrupteur : « siren »
    dans l'identifiant ou le nom affiche, sans accent ni casse (ADR 0035), ou
    un mot entier du type `siren` de `MOTS_PRISE` (« alarme sonore »,
    « syrena » : audit du 19/10)."""
    texte = _sans_accents(str(entity_id or "") + " " + str(nom or "")).lower()
    mots = " " + SEPARATEURS.sub(" ", texte).strip() + " "
    return "siren" in texte or any(" " + m + " " in mots for m in MOTS_SIRENE)


def est_pont(appareil: Any) -> bool:
    """Le pont Zigbee2MQTT : son APPAREIL, fabricant « Zigbee2MQTT » et modele
    « Bridge » — jamais le nom d'une entite (spec 6.4, point 3)."""
    return (isinstance(appareil, dict) and appareil.get("fabricant") == "Zigbee2MQTT"
            and appareil.get("modele") == "Bridge")


def _mots(texte: Any) -> list[str]:
    """`motsDe` de l'ecran : les mots d'un nom, a plat, sans doublon, dans l'ordre."""
    return list(dict.fromkeys(en_mots(texte).split()))


def _mots_id(entite: dict) -> list[str]:
    """`motsId` de l'ecran : les mots de l'identifiant, domaine ote."""
    haid = str(entite.get("entity_id") or "")
    return _mots(haid.split(".", 1)[1] if "." in haid else haid)


def _communs(listes: list[list[str]]) -> list[str]:
    """Les mots que TOUTES les listes partagent."""
    if not listes:
        return []
    return [m for m in listes[0] if all(m in liste for liste in listes)]


def _reglage(entite: dict) -> bool:
    """Un switch de reglage : un mot de `MOTS_REGLAGE` dans son nom ou son identifiant."""
    n = en_mots(str(entite.get("nom") or "") + " " + str(entite.get("entity_id") or ""))
    return any(" " + m + " " in n for m in MOTS_REGLAGE)


def _sorties(tous: list[dict]) -> list[dict]:
    """`sortiesDe` de l'ecran : les switch sans categorie de l'appareil ; s'il en
    porte plusieurs, ceux de classe `outlet` s'il y en a, sinon tous moins les
    reglages — jamais aucun."""
    sw = [s for s in tous if not s.get("entity_category") and str(s.get("entity_id") or "").startswith("switch.")]
    if len(sw) < 2:
        return sw
    outlet = [s for s in sw if s.get("device_class") == "outlet"]
    vraies = [s for s in sw if not _reglage(s)]
    return outlet or vraies or sw


def _mesures(tous: list[dict], classe: str) -> list[dict]:
    """Les `sensor.*` de cette classe sans categorie, tries par identifiant."""
    return sorted((s for s in tous
                   if isinstance(s.get("entity_id"), str) and s["entity_id"].startswith("sensor.")
                   and s.get("device_class") == classe and not s.get("entity_category")),
                  key=lambda s: s["entity_id"])


def capteur(classe: str, entite: Any, soeurs: Any, nom_appareil: Any = None) -> str | None:
    """Le capteur `classe` (« power » ou « energy ») de la sortie `entite`, parmi
    ceux de son appareil (spec 6.4), ou None — `capteurDe` de l'ecran.

    UNE sortie sur l'appareil : un seul capteur, c'est le sien ; plusieurs,
    celui dont le nom partage le plus de mots avec le sien, le premier a
    egalite ; aucun mot commun : aucun. Le poele, pose sur l'appareil qui
    porte l'energie de toute la maison, n'emprunte pas sa puissance.

    PLUSIEURS sorties (multiprise, Shelly 2PM, double relais Fibaro — audit du
    19/10) : les mots de l'appareil ne comptent plus (son nom s'il est donne,
    ceux que toutes les sorties partagent dans leur nom ou leur identifiant) ;
    a egalite, le numero de canal de l'identifiant departage, sinon aucun ;
    et un capteur que deux sorties reclament n'est a aucune — la sortie d'une
    multiprise n'emprunte jamais le compteur commun a toutes ses sorties."""
    if not isinstance(entite, dict):
        return None
    tous = [entite] + [s for s in (soeurs if isinstance(soeurs, list) else []) if isinstance(s, dict)]
    return _capteur(entite, tous, _sorties(tous), classe, nom_appareil)


def _capteur(e: dict, tous: list[dict], sorties: list[dict], classe: str, nom_appareil: Any) -> str | None:
    candidats = _mesures(tous, classe)
    if len(sorties) < 2:
        if len(candidats) == 1:
            return candidats[0]["entity_id"]
        siens = set(_mots(e.get("nom")))
        choisi, meilleur = None, 0
        for s in candidats:
            commun = len(siens & set(_mots(s.get("nom"))))
            if commun > meilleur:
                choisi, meilleur = s["entity_id"], commun
        return choisi
    exclus = set(_mots(nom_appareil)) | set(_communs([_mots(s.get("nom")) for s in sorties])) \
        | set(_communs([_mots_id(s) for s in sorties]))

    def canal(s: dict) -> str:
        chiffres = [m for m in _mots_id(s) if m not in exclus and m.isdigit() and m.isascii()]
        return chiffres[-1] if chiffres else ""

    def choix(o: dict) -> str | None:
        siens = [m for m in _mots(o.get("nom")) if m not in exclus]

        def score(s: dict) -> int:
            mots = set(_mots(s.get("nom")))
            return sum(1 for m in siens if m in mots)

        meilleur = max([0] + [score(s) for s in candidats])
        pairs = [s for s in candidats if score(s) == meilleur]
        if len(pairs) > 1 or not meilleur:
            pairs = [s for s in pairs if canal(s) == canal(o)]
        return pairs[0]["entity_id"] if len(pairs) == 1 else None

    c = choix(e)
    if c and any(o is not e and choix(o) == c for o in sorties):
        return None
    return c


def _mesure_ses_sorties(tous: list[dict], sorties: list[dict], nom_appareil: Any) -> bool:
    """`mesureSesSorties` de l'ecran : un capteur de l'appareil porte les mots
    que partagent les identifiants de toutes les sorties, ou le nom de
    l'appareil s'il est donne."""
    ids = _communs([_mots_id(s) for s in sorties])
    app = _mots(nom_appareil)
    for s in _mesures(tous, "power") + _mesures(tous, "energy"):
        i, n = set(_mots_id(s)), set(_mots(s.get("nom")))
        if (ids and all(m in i for m in ids)) or (app and all(m in n for m in app)):
            return True
    return False


def compteurs_maison(prefs: Any) -> list[str]:
    """`compteursMaison` de l'ecran : les capteurs que les preferences du
    tableau de bord Energie (`energy/get_prefs`, ou `EnergyManager.data`)
    declarent sources — reseau (ancien format `flow_from` / `flow_to`, et
    recent, une source par connexion), solaire, batterie, gaz —, energies et
    puissances nommees. Tries ; sans preferences, aucun."""
    vus: set[str] = set()

    def liste(x: Any) -> list:
        return x if isinstance(x, list) else []

    def lire(o: Any) -> None:
        if isinstance(o, dict):
            for cle in ("stat_energy_from", "stat_energy_to", "stat_rate"):
                if isinstance(o.get(cle), str) and o[cle]:
                    vus.add(o[cle])

    sources = liste(prefs.get("energy_sources")) if isinstance(prefs, dict) else []
    for s in sources:
        if not isinstance(s, dict) or s.get("type") not in SOURCES_MAISON:
            continue
        lire(s)
        if isinstance(s.get("power_config"), dict):
            for v in s["power_config"].values():
                if isinstance(v, str) and v:
                    vus.add(v)
        for f in liste(s.get("flow_from")) + liste(s.get("flow_to")) + liste(s.get("power")):
            lire(f)
    return sorted(vus)


def est_prise(entite: Any, appareil: Any, soeurs: Any, lumiere: Any, fil_pilote: Any,
              sirene: Any, compteurs: Any = None) -> dict[str, Any]:
    """La regle « est une prise » (P1, spec 6.4) : {"prise", "puissance", "energie"}.

    Un `switch` sans categorie, ni declare lumiere, ni module fil pilote, ni
    sirene, ni le pont Zigbee2MQTT, ni pose sur l'appareil d'un compteur de la
    maison (`compteurs`, voir `compteurs_maison`) ; une SORTIE de son appareil
    (pas un voyant ni un verrou enfant publie sans categorie, `_sorties`) ; et
    qui MESURE — un capteur de puissance ou d'energie retenu (`capteur`) —, ou
    que Home Assistant dit prise (`outlet`), ou la sortie d'une multiprise
    dont l'appareil mesure (sans capteur a elle). Les autres rejoignent IoT,
    sauf le pont et la sirene. `entite` et chaque soeur : {"entity_id",
    "device_class", "entity_category", "nom"} ; `appareil` : {"fabricant",
    "modele", "nom" facultatif}, ou None ; `soeurs` : les entites du meme
    appareil, sans l'interrupteur."""
    rien = {"prise": False, "puissance": None, "energie": None}
    if not isinstance(entite, dict):
        return rien
    haid = entite.get("entity_id")
    if not isinstance(haid, str) or not haid.startswith("switch.") or entite.get("entity_category"):
        return rien
    if lumiere or fil_pilote or sirene or est_pont(appareil):
        return rien
    tous = [entite] + [s for s in (soeurs if isinstance(soeurs, list) else []) if isinstance(s, dict)]
    les_compteurs = set(compteurs) if isinstance(compteurs, (list, tuple, set, frozenset)) else set()
    if any(s.get("entity_id") in les_compteurs for s in tous):
        return rien
    sorties = _sorties(tous)
    if not any(s is entite for s in sorties):
        return rien
    nom_appareil = appareil.get("nom") if isinstance(appareil, dict) else None
    puissance = _capteur(entite, tous, sorties, "power", nom_appareil)
    energie = _capteur(entite, tous, sorties, "energy", nom_appareil)
    if (puissance is None and energie is None and entite.get("device_class") != "outlet"
            and not (len(sorties) > 1 and _mesure_ses_sorties(tous, sorties, nom_appareil))):
        return rien
    return {"prise": True, "puissance": puissance, "energie": energie}
