"""Les pieces d'un robot : ce que Home Assistant en sait, sans rien configurer (chantier IoT, tranche robots 2 ; ADR 0218).

Pur : ni Home Assistant, ni l'heure. `robots.py` lit l'etat du robot, les
options du registre des entites, le registre des zones, la soeur de carte
active, la reparation et la description de la maison, puis passe tout ici.

Trois sources de pieces, dans cet ordre (R2 ; sa reponse Q1 A, 19/10) :
  1. les interrupteurs de pieces et le script de la maison (`vacuumRooms`,
     `vacuumScripts.pieces_selectionnees`) — ses scripts gardent la main tant
     qu'ils sont designes ;
  2. l'association de Home Assistant (`area_mapping`, dans les options de
     l'entite ; Home Assistant >= 2026.3, le bit CLEAN_AREA) — les pieces sont
     alors les ZONES de Home Assistant, et le depart part par `vacuum.clean_area` ;
  3. ce que le robot publie lui-meme (`rooms` d'Ecovacs), par la commande de
     son integration : `spot_area` quand il a le bit — une LISTE depuis
     deebot-client 18 (R4) —, et sans le bit l'exception NOMMEE de sa reponse
     Q2 A : la commande que ses propres scripts envoient, `clean_V2` /
     `freeClean`, le nombre de passages en tete — bornee a cette plateforme, a
     ce bit absent et a un `rooms` publie. Un `rooms` intermittent (chez lui,
     `getMapSubSet` echoue) : vide, aucune puce ; perime a l'instant du depart,
     on ne part pas, et on le dit (`segments_perimes`).
La premiere source qui existe gagne ; les autres restent lisibles, pour que la
popup dise pourquoi (« Vos scripts gardent la main pour les pieces. »).

Sa decision du 20/10 (« Mon script garde la main ») : des qu'un script de
DEPART est designe pour l'aspirateur de la maison (`nettoyer_tout` ou
`pieces_selectionnees`), Loggia ne prend jamais la main sur les pieces — ni
zones de Home Assistant, ni exception, ni `spot_area` : la source est `scripts`,
et `script_pieces` dit si les puces peuvent etre ses interrupteurs (le script
des pieces est designe). Sans lui, aucune puce ; la popup dit a un
administrateur ou le designer (la roue). Rien ne bascule, jamais.

R1, bornee a ce qui est verifie : le bit CLEAN_AREA conditionne `clean_area`
partout et `spot_area` chez Ecovacs (la meme condition dans l'integration) ;
`app_segment_clean` (Roborock) et `vacuum_clean_segment` (Dreame, Xiaomi) ne
dependent pas du bit — xiaomi_miio n'implemente pas le contrat, son service
marche sans lui.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

# `VacuumEntityFeature.CLEAN_AREA` : une integration l'annonce quand elle sait viser des pieces (Home Assistant >= 2026.3).
CLEAN_AREA = 16384
# La version de `vacuum.clean_area`, de l'association et de deebot-client 18 (une LISTE pour `spot_area`).
VERSION_ZONES = (2026, 3)
# Les cles de traduction de la soeur `select` qui dit la carte active. Son etat est le NOM de la carte — chez Ecovacs
# (`active_map` : `current_option` est le nom, l'identifiant seulement quand la carte n'en a pas ; verifie sur `dev`) comme chez
# Roborock (`selected_map` : `name or f"Map {flag}"`) — et ses `options`, les noms de toutes les cartes. Le groupe d'un segment
# (`last_seen_segments`) est ce nom ; son prefixe (« m1_10 » -> « m1 »), l'identifiant de carte.
CLES_CARTE_ACTIVE = ("active_map", "selected_map")
# Le compteur de passages de l'appareil (Ecovacs, `number` de cle `clean_count`, 1 a 4) : au plus dix, par surete.
MAX_PASSAGES = 10
ZONE = re.compile(r"^[^\s\x00-\x1f]{1,80}$")


def lire_version(texte: Any) -> tuple[int, int] | None:
    """« 2026.10.1 » -> (2026, 10). None si ce n'est pas une version."""
    m = re.match(r"^\s*(\d+)\.(\d+)", str(texte or ""))
    return (int(m.group(1)), int(m.group(2))) if m else None


def version_recente(version: tuple[int, int] | None) -> bool:
    """Home Assistant >= 2026.3 ? Inconnue — un stub —, c'est le monde d'aujourd'hui : oui."""
    return version is None or tuple(version) >= VERSION_ZONES


def _plat(texte: Any) -> str:
    return unicodedata.normalize("NFD", str(texte or "")).encode("ascii", "ignore").decode("ascii").lower()


def slug_en_nom(slug: Any) -> str:
    """« salle_de_bain » -> « Salle de bain » : le nom d'une piece publiee, comme `vacNom` a l'ecran."""
    mots = re.sub(r"[_\-]+", " ", str(slug or "")).strip()
    return (mots[:1].upper() + mots[1:]) if mots else ""


def _entiers(valeurs: Any) -> list[int]:
    return [v for v in (valeurs if isinstance(valeurs, list) else [valeurs]) if isinstance(v, int) and not isinstance(v, bool)]


def segments_publies(attributs: Any) -> list[dict[str, Any]]:
    """Les pieces que le robot PUBLIE (`rooms` : `{slug: id | [ids]}`), en segments nommes, ranges par numero : `[{id, nom, slug,
    segments}]`. Une cle a plusieurs segments est UNE entree (deux pieces du meme nom se nettoient ensemble), comme a l'ecran.
    Vide, absent, illisible : rien — un `rooms` intermittent ne fabrique aucune puce (Q2)."""
    brut = (attributs or {}).get("rooms") if isinstance(attributs, dict) else None
    if not isinstance(brut, dict):
        return []
    out = []
    for slug, valeur in brut.items():
        segs = _entiers(valeur)
        if segs:
            out.append({"id": "seg:" + "-".join(str(s) for s in segs), "nom": slug_en_nom(slug), "slug": str(slug), "segments": segs})
    return sorted(out, key=lambda p: p["segments"][0])


def publie(attributs: Any) -> bool:
    """Le robot publie-t-il ses pieces en ce moment ?"""
    return bool(segments_publies(attributs))


def commande_pieces(plateforme: Any, segments: Any, *, bits: Any = 0, version_ha: tuple[int, int] | None = None,
                    publie: bool = False, passages: Any = 1) -> tuple[str, str, dict] | None:
    """La commande qui nettoie des pieces, telle que l'integration l'attend. Rend (domaine, service, data) — sans `entity_id`,
    que le socle ajoute — ou None : pas de commande au hasard.

    Ecovacs : `spot_area` avec une LISTE sur Home Assistant >= 2026.3 (deebot-client 18 ; R4) quand le robot a le bit, une
    chaine avant ; sans le bit sur un Home Assistant recent, l'integration refuse `spot_area` (« not supported ») — s'il publie
    `rooms`, l'exception nommee de sa reponse Q2 A : `clean_V2` / `freeClean`, « <passages>,<segment>,… » ; sinon rien.
    """
    segs = _entiers(segments if isinstance(segments, list) else [])
    if not segs or len(segs) != len(segments):
        return None
    if plateforme == "ecovacs":
        if not version_recente(version_ha):
            return ("vacuum", "send_command", {"command": "spot_area", "params": {"rooms": ",".join(str(s) for s in segs), "cleanings": 1}})
        if int(bits or 0) & CLEAN_AREA:
            return ("vacuum", "send_command", {"command": "spot_area", "params": {"rooms": segs, "cleanings": 1}})
        if publie:
            n = passages if isinstance(passages, int) and not isinstance(passages, bool) and 1 <= passages <= MAX_PASSAGES else 1
            return ("vacuum", "send_command", {"command": "clean_V2", "params": {"act": "start", "content": {
                "type": "freeClean", "value": ",".join(str(s) for s in [n] + segs)}}})
        return None
    if plateforme == "roborock":
        return ("vacuum", "send_command", {"command": "app_segment_clean", "params": segs})
    if plateforme in ("dreame_vacuum", "xiaomi_miio"):
        return (plateforme, "vacuum_clean_segment", {"segments": segs})
    return None


def commande_zones(zones: Any) -> tuple[str, str, dict] | None:
    """`vacuum.clean_area { cleaning_area_id: [zones] }` : le contrat commun de Home Assistant >= 2026.3 (R4)."""
    ids = [str(z["zone"]) for z in (zones or []) if isinstance(z, dict) and z.get("zone")]
    return ("vacuum", "clean_area", {"cleaning_area_id": ids}) if ids else None


def _carte_du_segment(sid: str, groupes: dict[str, str]) -> str:
    """La carte d'un segment : son groupe (le nom de la carte, `last_seen_segments`), sinon son prefixe (« m1_10 » -> « m1 »)."""
    return groupes.get(sid) or (sid.split("_", 1)[0] if "_" in sid else sid)


def _sur_carte_active(sid: str, groupes: dict[str, str], carte_active: Any, cartes: Any) -> bool:
    """Un segment est sur la carte active si rien ne PROUVE le contraire (passe bis du 20/10, point 1) : la preuve, c'est que
    son groupe (le nom de sa carte dans `last_seen_segments`) ou son prefixe (l'identifiant de carte) soit une AUTRE option de la
    soeur `select` de carte. Sans soeur, sans ses options, un groupe qui n'est aucune option (une carte renommee dans
    l'application : `last_seen_segments` garde l'ancien nom) ou un groupe vide (Roborock, une carte sans nom) : sur la carte
    active — l'integration dira ce qu'elle fait, la surface du carnet aussi."""
    if carte_active is None or not isinstance(cartes, (list, tuple)):
        return True
    actif = str(carte_active)
    autres = {str(c) for c in cartes if str(c) != actif}
    if not autres:
        return True
    groupe = groupes.get(sid)
    if groupe == actif:
        return True
    if groupe in autres:
        return False
    return (sid.split("_", 1)[0] if "_" in sid else None) not in autres


def _script(scripts: Any) -> str | None:
    """Le script de depart designe : `"pieces"` (`pieces_selectionnees`), `"depart"` (`nettoyer_tout` seul), None. `True` vaut
    « pieces » (la forme d'avant la passe bis du 20/10)."""
    if scripts in ("pieces", "depart"):
        return scripts
    return "pieces" if scripts is True else None


def pieces_du_robot(bits: Any, attributs: Any, options: Any, zones_registre: Any, carte_active: Any = None, reparation: bool = False,
                    *, scripts: Any = None, plateforme: Any = None, version_ha: tuple[int, int] | None = None,
                    cartes: Any = None, designes: Any = None) -> dict[str, Any]:
    """Ce que `loggia/robots/etat` rend par robot (§ 5.2 de la conception, allege a la passe bis du 20/10 de ce que l'ecran ne lit pas) :

      { source: "scripts" | "zones" | "segments" | "aucune", capable, association, carte_changee, script_pieces,
        zones: [{id: "zone:cuisine", nom, zone, segments: ["m1_10"]}], autres_cartes: [{carte, n}], autres_zones: [zone],
        segments: [{id: "seg:10", nom, slug, segments: [10]}], scripts: {role: "script.…"} }

    `options` : `registry_entry.options["vacuum"]` (`area_mapping`, `last_seen_segments`) ; `zones_registre` : `{area_id: {nom,
    etage, niveau}}` (l'etage et son niveau, du registre des etages) ; `carte_active` et `cartes` : l'etat de la soeur `select` de
    carte et ses options, ou None ; `reparation` : la reparation `segments_changed` est ouverte ; `scripts` : le script de DEPART
    designe pour ce robot (`_script`) ; `designes` : les scripts maison designes pour ce robot, par role — la roue de la popup les lit
    ici, la verite du serveur, et non dans la description que l'ecran tient (passe bis 2 du 20/10). `autres_zones` : les zones
    comptees dans `autres_cartes`, pour `verifier_zones`.
    """
    recent = version_recente(version_ha)
    capable = bool(recent and int(bits or 0) & CLEAN_AREA)
    opts = options if isinstance(options, dict) else {}
    association = opts.get("area_mapping") if isinstance(opts.get("area_mapping"), dict) else None
    vus = opts.get("last_seen_segments") if isinstance(opts.get("last_seen_segments"), list) else []
    groupes = {str(s.get("id")): str(s["group"]) for s in vus if isinstance(s, dict) and s.get("id") is not None and s.get("group")}
    registre = zones_registre if isinstance(zones_registre, dict) else {}

    zones: list[dict[str, Any]] = []
    ailleurs: dict[str, int] = {}
    autres_zones: list[str] = []
    if capable and association is not None:
        for zone, brut in association.items():
            z = registre.get(str(zone))
            segs = [str(s) for s in brut if isinstance(s, (str, int)) and not isinstance(s, bool)] if isinstance(brut, list) else []
            if not isinstance(z, dict) or not segs:
                continue  # une zone supprimee du registre (R13), ou sans segment : pas une puce
            if not any(_sur_carte_active(s, groupes, carte_active, cartes) for s in segs):
                # Tous ses segments sont sur une autre carte (R11) : l'integration les ignorerait en silence — pas une puce, comptee.
                carte = _carte_du_segment(segs[0], groupes)
                ailleurs[carte] = ailleurs.get(carte, 0) + 1
                autres_zones.append(str(zone))
                continue
            zones.append({"id": "zone:" + str(zone), "nom": str(z.get("nom") or zone), "zone": str(zone), "segments": segs})
    # Par etage — son niveau, comme le dialogue de Home Assistant ; un etage sans niveau apres, par son nom ; sans etage, en
    # dernier — puis par nom. (L'ordre des pieces de Loggia se rend a l'ecran, qui seul le connait : `piecesDeLaVue`.)
    def rang(z):
        r = registre.get(z["zone"]) or {}
        niveau, etage = r.get("niveau"), r.get("etage")
        connu = isinstance(niveau, (int, float)) and not isinstance(niveau, bool)
        return (0 if connu else 1 if etage else 2, niveau if connu else 0, _plat(etage or ""), _plat(z["nom"]))
    zones.sort(key=rang)
    autres_cartes = [{"carte": carte, "n": n} for carte, n in sorted(ailleurs.items(), key=lambda x: _plat(x[0]))]

    segments = segments_publies(attributs)
    par_commande = commande_pieces(plateforme, segments[0]["segments"], bits=bits, version_ha=version_ha, publie=True) if segments else None

    script = _script(scripts)
    if script is not None:
        source = "scripts"
    elif capable and association is not None and zones:
        source = "zones"
    elif par_commande is not None:
        source = "segments"
    else:
        source = "aucune"
    roles = {str(r): str(s) for r, s in designes.items() if isinstance(r, str) and isinstance(s, str)} if isinstance(designes, dict) else {}
    return {"source": source, "capable": capable, "association": bool(capable and association is not None), "carte_changee": bool(reparation),
            "script_pieces": script == "pieces", "zones": zones, "autres_cartes": autres_cartes, "autres_zones": autres_zones,
            "segments": segments, "scripts": roles}


def verifier_zones(zones: Any, pieces: dict[str, Any]) -> str | None:
    """Ce que Home Assistant refuserait APRES avoir lance (`areas_not_mapped` arrive une fois les zones associees parties), dit
    AVANT l'appel : le code du refus, ou None. `zones` : celles d'un depart ou d'un planning, avec `zone`. Un script de depart
    designe passe devant tout (sa decision du 20/10) : Loggia ne prend pas la main sur les pieces."""
    demandees = [str(z.get("zone")) for z in (zones or []) if isinstance(z, dict) and z.get("zone")]
    if not demandees:
        return None
    if pieces.get("source") == "scripts":
        return "scripts_gardent_la_main"
    if not pieces.get("capable"):
        return "pieces_inconnues"
    if not pieces.get("association"):
        return "association_absente"
    connues = {z["zone"] for z in pieces.get("zones") or []}
    ailleurs = set(pieces.get("autres_zones") or [])
    for zone in demandees:
        if zone in connues:
            continue
        return "autre_carte" if zone in ailleurs else "zone_sans_piece"
    return None


def segments_perimes(segments: Any, attributs: Any, plateforme: Any) -> bool:
    """Chez Ecovacs, la liste que le robot publie fait foi (Q2 : `rooms` est intermittent chez lui) : un segment demande qu'il ne
    publie plus — ou plus rien publie — a l'instant du depart, et l'on ne part pas sur une liste perimee. Ailleurs, le robot ne
    publie pas sa liste : la regle d'aujourd'hui."""
    segs = _entiers(segments if isinstance(segments, list) else [])
    if plateforme != "ecovacs" or not segs:
        return False
    publies = {s for p in segments_publies(attributs) for s in p["segments"]}
    return any(s not in publies for s in segs)


def est_zone_ha(z: Any) -> bool:
    """Une zone de depart ou de planning a la forme « zone de Home Assistant » (R5) ?"""
    return isinstance(z, dict) and isinstance(z.get("zone"), str) and bool(ZONE.match(z["zone"]))
