"""Une seule idee de la lumiere de la maison (audit du 19/10, ADR 0260).

Pourquoi ce module existe
─────────────────────────
Chaque regle avait la sienne. Le coucher et le depart prenaient tout ce qui
s'appelle `light.*` - la LED de la borne Wi-Fi comprise, que le danger montait
a 100 % -, et ignoraient l'interrupteur declare lumiere ; les scenarios
ecartaient la configuration et le cache, mais pas l'interrupteur ; le carnet
suivait l'interrupteur, mais pas les scenarios. Et la veilleuse n'etait
epargnee que la ou l'on y avait pense.

Ici, UNE definition, que toutes les regles lisent :

  * une lumiere de la maison, c'est un `light.*` sans categorie (ni `config`
    ni `diagnostic`), ni cache ni desactive, PLUS un interrupteur declare
    lumiere (Parametres > Entites) ; un groupe de lumieres s'efface devant ses
    membres - eteindre le groupe et ses membres, c'est compter double ;
  * ce qu'on epargne, ce sont les veilleuses de la regle Nuit, et tout groupe
    qui en contient une : son `turn_off` l'eteindrait avec les autres ;
  * un interrupteur recoit l'ordre de SON domaine : `homeassistant.turn_off`,
    jamais `light.turn_off`, que Home Assistant refuserait.

Pur jusqu'a la marque « Le temps reel » : ni Home Assistant, ni horloge, ni
disque, comme `lumieres_calcul.py`. Apres elle, ce qu'il faut pour lire les
etats et le registre - l'import se fait dans la fonction, et un registre
illisible rend None : on ne filtre rien, plutot que de ne rien commander.
"""
from __future__ import annotations

from typing import Any, Iterable

from .nombres import fini

# Les interrupteurs declares lumieres (Parametres > Entites), et le repli
# herite : `switchLights` de la description de la maison.
CLE_INTERRUPTEURS = "loggia_switchlights"
CLE_ENTITES = "loggia_entities"
# La regle Nuit, ou vivent les veilleuses.
CLE_NUIT = "loggia_nuit"
# Les etats ou une lampe ne dit pas ou elle en est.
MUETS = ("unavailable", "unknown")


def _liste_de_textes(x: Any) -> list[str]:
    return [h for h in x if isinstance(h, str) and h] if isinstance(x, (list, tuple, set, frozenset)) else []


def interrupteurs_declares(liste: Any, entites: Any) -> set[str]:
    """Les interrupteurs declares lumieres, lus comme `prises.py` les lit
    (`cvEstLumiere` de l'ecran) : `liste` (`loggia_switchlights`), sinon
    `switchLights` d'`entites` (`loggia_entities`). Une liste presente, meme
    vide, l'emporte sur le repli."""
    if liste is None:
        liste = entites.get("switchLights") if isinstance(entites, dict) else None
    return {h for h in _liste_de_textes(liste) if h.startswith("switch.")}


def veilleuses_de(nuit: Any) -> list[str]:
    """Les veilleuses de la regle Nuit (`loggia_nuit.veilleuse.lampes`), que
    la regle soit active ou non : la liste dit ce qu'est une veilleuse, le
    drapeau dit si elle s'eteint seule."""
    v = nuit.get("veilleuse") if isinstance(nuit, dict) else None
    return _liste_de_textes(v.get("lampes")) if isinstance(v, dict) else []


def lire_registre(entrees: Any) -> dict[str, dict[str, Any]]:
    """Ce que le registre des entites dit de chacune : {entity_id: {"categorie",
    "cache", "desactivee"}}. Ce qui n'est pas une entree s'ecarte."""
    sortie: dict[str, dict[str, Any]] = {}
    for e in entrees or ():
        haid = getattr(e, "entity_id", None)
        if not isinstance(haid, str) or not haid:
            continue
        categorie = getattr(e, "entity_category", None)
        categorie = getattr(categorie, "value", categorie)
        sortie[haid] = {"categorie": str(categorie) if categorie else None,
                        "cache": getattr(e, "hidden_by", None) is not None,
                        "desactivee": getattr(e, "disabled_by", None) is not None}
    return sortie


def membres_de(attributs: Any) -> list[str]:
    """Les membres d'un groupe de lumieres (`attributes.entity_id`) ; rien
    pour une lampe."""
    return _liste_de_textes(attributs.get("entity_id")) if isinstance(attributs, dict) else []


def _admise(registre: dict[str, dict[str, Any]] | None, haid: str) -> bool:
    r = (registre or {}).get(haid) or {}
    return not (r.get("categorie") or r.get("cache") or r.get("desactivee"))


def lumieres_de_la_maison(attributs: dict[str, Any], registre: dict[str, dict[str, Any]] | None = None,
                          declares: Iterable[str] = ()) -> list[str]:
    """Les lumieres de la maison, triees : les `light.*` d'`attributs`
    ({entity_id: attributs de l'etat}) que le registre n'ecarte pas - ni
    categorie, ni cachee, ni desactivee -, plus les interrupteurs `declares`
    connus (un etat, ou une entree au registre) que le registre n'ecarte pas.
    Un groupe dont un membre est de la maison s'efface : on garde les membres.
    `registre` None (illisible) : rien ne s'ecarte."""
    lampes = {h for h in attributs if isinstance(h, str) and h.startswith("light.") and _admise(registre, h)}
    lampes |= {h for h in declares if isinstance(h, str) and h.startswith("switch.")
               and (h in attributs or h in (registre or {})) and _admise(registre, h)}
    groupes = {h for h in lampes if any(m in lampes for m in membres_de(attributs.get(h)))}
    return sorted(lampes - groupes)


def a_epargner(attributs: dict[str, Any], veilleuses: Iterable[str]) -> set[str]:
    """Ce qu'une extinction generale epargne : les veilleuses, et tout groupe
    d'`attributs` qui en contient une - de proche en proche, un groupe de
    groupes compte. Une veilleuse absente ou renommee reste nommee : elle ne
    fait de mal a personne."""
    epargnees = set(_liste_de_textes(list(veilleuses or ())))
    encore = True
    while encore:
        encore = False
        for haid, a in attributs.items():
            if haid not in epargnees and any(m in epargnees for m in membres_de(a)):
                epargnees.add(haid)
                encore = True
    return epargnees


# Le bit TRANSITION de LightEntityFeature : une lampe qui ne l'a pas ne sait pas
# fondre, et le lui demander ne ferait rien de bon (la veilleuse de la Nuit, les
# scenarios - ADR 0304).
LIGHT_TRANSITION = 32
# Les modes ou une lampe recoit un blanc (`color_temp_kelvin`) : le sien, ou la
# couleur de ce blanc - Home Assistant convertit pour une lampe en couleur.
MODES_DU_BLANC = ("color_temp", "hs", "xy", "rgb", "rgbw", "rgbww")


def sait_fondre(attributs: Any) -> bool:
    """La lampe sait-elle fondre (`transition`) ? Le bit TRANSITION de son
    `supported_features`. Sorti de `nuit.py` (ADR 0304) : la veilleuse et les
    scenarios le lisent ici."""
    f = (attributs.get("supported_features") if isinstance(attributs, dict) else None) or 0
    try:
        return bool(int(f) & LIGHT_TRANSITION)
    except (TypeError, ValueError, OverflowError):
        return False


def sait_le_blanc(attributs: Any) -> bool:
    """La lampe prend-elle un blanc (`color_temp_kelvin`) ? Un blanc reglable, ou
    une couleur. Un variateur, un interrupteur : non."""
    modes = attributs.get("supported_color_modes") if isinstance(attributs, dict) else None
    return isinstance(modes, (list, tuple, set)) and any(m in MODES_DU_BLANC for m in modes)


def blanc_borne(attributs: Any, kelvin: float) -> int:
    """`kelvin` ramene aux bornes du blanc de la lampe (`min_` et
    `max_color_temp_kelvin`), quand elle les publie ; tel quel sinon - Home
    Assistant le convertit pour une lampe en couleur."""
    a = attributs if isinstance(attributs, dict) else {}
    k = float(kelvin)
    bas, haut = fini(a.get("min_color_temp_kelvin")), fini(a.get("max_color_temp_kelvin"))
    if bas is not None and bas > 0:
        k = max(bas, k)
    if haut is not None and haut > 0:
        k = min(haut, k)
    return int(round(k))


def service_de(haid: str, allumer: bool) -> tuple[str, str]:
    """(domaine, service) de l'ordre d'allumage ou d'extinction : `light` pour
    une lampe, `homeassistant` pour un interrupteur - `light.turn_off` sur un
    `switch.*`, Home Assistant le refuse."""
    service = "turn_on" if allumer else "turn_off"
    return ("light" if haid.startswith("light.") else "homeassistant", service)


def par_service(haids: Iterable[str], allumer: bool) -> list[tuple[str, str, list[str]]]:
    """Les ordres a donner, un par service : [(domaine, service, cibles
    triees)], les lampes d'abord. Rien pour rien."""
    lots: dict[tuple[str, str], list[str]] = {}
    for h in haids:
        if isinstance(h, str) and h:
            lots.setdefault(service_de(h, allumer), []).append(h)
    return [(d, s, sorted(set(c))) for (d, s), c in sorted(lots.items(), key=lambda x: x[0][0] != "light")]


# ── Le temps reel : les etats, le registre, le magasin ──────────────────────

async def async_interrupteurs_declares(store: Any) -> set[str]:
    """Les interrupteurs declares lumieres, lus au magasin (`interrupteurs_declares`)."""
    liste = await store.async_get_shared(CLE_INTERRUPTEURS, None)
    entites = await store.async_get_shared(CLE_ENTITES, None) if liste is None else None
    return interrupteurs_declares(liste, entites)


async def async_veilleuses(store: Any) -> list[str]:
    """Les veilleuses de la regle Nuit, lues au magasin (`veilleuses_de`)."""
    return veilleuses_de(await store.async_get_shared(CLE_NUIT, None))


def attributs_des_lumieres(hass: Any, declares: Iterable[str] = ()) -> dict[str, dict[str, Any]]:
    """{entity_id: attributs} des `light.*` qui ont un etat, et des
    interrupteurs `declares` qui en ont un. Des etats illisibles levent : qui
    appelle le dit a sa facon."""
    ids = list(hass.states.async_entity_ids("light")) + [h for h in declares if isinstance(h, str)]
    sortie: dict[str, dict[str, Any]] = {}
    for haid in ids:
        etat = hass.states.get(haid)
        if etat is not None:
            sortie[haid] = dict(getattr(etat, "attributes", None) or {})
    return sortie


def registre_de(hass: Any) -> dict[str, dict[str, Any]] | None:
    """Le registre des entites, lu (`lire_registre`) ; None s'il ne se lit
    pas - on ne filtre alors rien."""
    try:
        from homeassistant.helpers import entity_registry as er

        return lire_registre(er.async_get(hass).entities.values())
    except Exception:  # noqa: BLE001
        return None
