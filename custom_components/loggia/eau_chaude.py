"""L'eau chaude pendant les vacances (chantier G3, E2 ; ADR 0302).

Une OPTION du chauffage, DECOCHEE par defaut (`eau_chaude.absence`) : pendant
les Vacances de la maison, chaque chauffe-eau qui sait le faire passe en mode
absence (`water_heater.set_away_mode`) — il ne garde pas 200 litres a 55 °C
pour personne — et le quitte AVANT le retour, pour que l'eau soit chaude a
l'arrivee : `AVANCE_RETOUR` avant la fin des Vacances. Des Vacances sans date
de fin le gardent jusqu'a ce que la maison revienne au Planning.

Loggia ne leve que ce qu'il a pose (`poses`, garde au redemarrage) : un mode
absence mis a la main sur l'appareil n'est pas le sien. Et un ballon qu'il avait
pose, VU en absence (`vus`), puis retrouve hors absence pendant les Vacances, a
ete remis a la main : il est laisse tranquille (`laisses`) jusqu'a la fin des
Vacances, sans nouvel ordre. Tant qu'on ne l'a pas vu en absence, un « off »
n'est que l'etat d'avant notre ordre (un ballon en nuage publie tard) : on attend.
Une levee refusee se retente au reveil suivant, `ESSAIS_LEVEE` fois au plus.
Un ballon muet au moment de lever reste pose : le moteur revient le voir par un
reveil court (`RELANCE`), pendant `RELANCE_MAX` au plus.

Pur : ni Home Assistant ni horloge. Le moteur du chauffage le nourrit.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from .chauffage_config import lire_instant

# Le temps de chauffer un ballon froid : la veille du retour a midi pour un retour a minuit.
AVANCE_RETOUR = timedelta(hours=12)
# `WaterHeaterEntityFeature.AWAY_MODE`.
FONCTION_ABSENCE = 4
# Un ballon pose qu'on n'a pas pu lever (muet) : revenu voir toutes les 5 min, pendant deux jours au plus.
RELANCE = timedelta(minutes=5)
RELANCE_MAX = timedelta(hours=48)
# Une levee que l'appareil refuse : trois essais, puis un message au journal.
ESSAIS_LEVEE = 3


def option_active(cfg: Any) -> bool:
    return isinstance(cfg, dict) and isinstance(cfg.get("eau_chaude"), dict) and cfg["eau_chaude"].get("absence") is True


def levee_a(cfg: Any) -> datetime | None:
    """L'instant ou le mode absence se leve, quand l'option tourne et que les Vacances ont une fin."""
    if not option_active(cfg):
        return None
    maison = cfg.get("maison") or {}
    if maison.get("mode") != "vacances":
        return None
    fin = lire_instant(maison.get("vacances_fin"))
    return fin - AVANCE_RETOUR if fin is not None else None


def absence_voulue(cfg: Any, maintenant: datetime) -> bool:
    """Le mode absence doit-il etre en vigueur maintenant ?"""
    if not option_active(cfg) or (cfg.get("maison") or {}).get("mode") != "vacances":
        return False
    leve = levee_a(cfg)
    return leve is None or maintenant < leve


def sait_absence(attributs: Any) -> bool:
    try:
        return bool(int((attributs or {}).get("supported_features") or 0) & FONCTION_ABSENCE)
    except (TypeError, ValueError):
        return False


def ordres_absence(chauffe_eaux: dict[str, Any], voulu: bool, poses: set[str],
                    laisses: Any = (), vus: Any = ()) -> tuple[list[tuple[str, bool]], set[str], set[str], set[str]]:
    """Les ordres a envoyer, ce que Loggia tiendra pose ensuite, ce qu'il
    laisse tranquille jusqu'a la fin des Vacances, et ce qu'il a VU en absence
    depuis son ordre.

    `chauffe_eaux` : {entity_id: `away_mode` lu — "on", "off", ou None quand
    l'appareil est muet ou ne sait pas}. Un appareil muet ne recoit rien et
    reste dans `poses` : on le levera a son retour. Un ballon pose, VU « on »
    depuis, qu'on retrouve « off » pendant les Vacances a ete remis a la main :
    il sort de `poses`, entre dans `laisses`, et ne recoit rien."""
    ordres: list[tuple[str, bool]] = []
    tenus = set(poses)
    if voulu:
        garde = set(laisses or ())
        vus_ = set(vus or ()) & tenus
        for haid in sorted(chauffe_eaux):
            etat = chauffe_eaux[haid]
            if haid in garde:
                continue
            if haid in tenus:
                if etat == "on":
                    vus_.add(haid)                  # notre ordre a pris
                elif etat == "off" and haid in vus_:
                    tenus.discard(haid)             # vu en absence, puis remis a la main : son geste compte
                    vus_.discard(haid)
                    garde.add(haid)
                continue                            # pas encore vu en absence : l'etat d'avant notre ordre, on attend
            if etat == "off":
                ordres.append((haid, True))
                tenus.add(haid)
        return ordres, tenus, garde, vus_
    for haid in sorted(poses):
        if haid not in chauffe_eaux:
            tenus.discard(haid)                     # disparu de Home Assistant : plus rien a lever
            continue
        etat = chauffe_eaux.get(haid)
        if etat == "on":
            ordres.append((haid, False))
            tenus.discard(haid)
        elif etat == "off":
            tenus.discard(haid)                     # deja leve (a la main, sur l'appareil) : plus rien a tenir
    return ordres, tenus, set(), set()              # les Vacances finies, plus rien n'est laisse
