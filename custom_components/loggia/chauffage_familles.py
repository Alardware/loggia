"""Reconnaitre un chauffage, et lui parler dans sa langue (chantier Chauffage, § 3 et § 4).

Trois familles, reconnues ICI — une seule reconnaissance, cote serveur, que
l'ecran lit :

  fil_pilote  un `select` dont les options sont des ordres fil pilote ET dont
              l'identifiant stable (`unique_id`, pose par l'integration) ou le
              nom d'origine dit « pilot wire ». Deux familles de signaux,
              jamais le `friendly_name`, que l'utilisateur renomme (ADR 0164,
              0174) ;
  vtherm      un `climate` de la plateforme `versatile_thermostat` : il se
              commande par ses preREGLAGES. Jamais `set_temperature` — le
              prereglage passerait a `none` et la presence de VTherm ne
              s'appliquerait plus ;
  thermostat  tout autre `climate` qui n'est pas cree par Loggia ET qui recoit
              une consigne (`TARGET_TEMPERATURE`) : une temperature par mode.
              Un `climate` qui ne se regle que par prereglages (un Heatzy...)
              n'en est pas un : Home Assistant refuserait `set_temperature`.

Les temperatures se gardent en °C (ADR 0128) ; elles partent dans l'unite de
l'installation, qui est celle des services `climate` de Home Assistant, au pas
de l'appareil et dans ses bornes (`min_temp`, `max_temp` : Home Assistant
refuse une consigne qui en sort).

Pur : pas d'import de Home Assistant. Le moteur lui passe ce qu'il a lu du
registre et des etats.
"""
from __future__ import annotations

import math
import re
import unicodedata
from typing import Any

from .chauffage_calcul import MODES
from .unites import depuis_celsius, vers_celsius

# Les quatre ordres sans lesquels un `select` n'est pas un fil pilote.
ORDRES_INDISPENSABLES = frozenset({"confort", "eco", "hors_gel", "arret"})

# Les options, une fois mises a plat (minuscules, sans accent, espaces et
# tirets devenus « _ ») : `comfort_-1` → `comfort_1`, « Hors-gel » → `hors_gel`,
# « Arrêt » → `arret`. Le zigbee2mqtt du NodOn parle anglais, d'autres
# integrations francais.
OPTIONS: dict[str, frozenset[str]] = {
    "confort": frozenset({"comfort", "confort", "komfort"}),
    "confort_1": frozenset({"comfort_1", "confort_1", "komfort_1", "comfort_minus_1"}),
    "confort_2": frozenset({"comfort_2", "confort_2", "komfort_2", "comfort_minus_2"}),
    "eco": frozenset({"eco", "economy"}),
    "hors_gel": frozenset({"frost_protection", "frost", "hors_gel", "horsgel", "antigel",
                           "anti_freeze", "antifreeze"}),
    "arret": frozenset({"off", "arret", "stop"}),
}

# Ce que dit l'identifiant stable d'un module fil pilote — ou sa cle de
# traduction : sous ZHA (`pilot_wire_mode`), le `unique_id` est
# `<ieee>-<endpoint>[-<suffixe>]` et le nom d'origine peut manquer.
FIL_PILOTE = re.compile(r"pilot[ _-]?wire|fil[ _-]?pilote")

# Les prereglages de VTherm pour nos modes. Ni Confort −1 ni −2.
PRESETS_VTHERM = {"confort": "comfort", "eco": "eco", "hors_gel": "frost"}

# La plateforme des VTherm, et la notre : un `climate` de Loggia n'est pas un
# chauffage de plus (plan 3).
PLATEFORME_VTHERM = "versatile_thermostat"
PLATEFORME_LOGGIA = "loggia"

# Better Thermostat : ses vannes (TRV) sont dans les donnees de son integration,
# cle `thermostat` = [{"trv": "climate.x", ...}] (lu dans son code, 19/10 ; ses
# attributs ne les nomment pas). VTherm, lui, les publie dans ses attributs :
# `vtherm_over_climate` / `vtherm_over_switch` / `vtherm_over_valve` →
# `underlying_entities` (et, dans ses versions anciennes, a plat).
PLATEFORME_BT = "better_thermostat"
SOUS_JACENT_A_PLAT = re.compile(r"^underlying_(entity|climate|switch|valve)_\d+$")

# Le bit de `supported_features` qui dit qu'un `climate` recoit une consigne
# (`ClimateEntityFeature.TARGET_TEMPERATURE`).
FONCTION_CONSIGNE = 1

# Les modes « chauds » d'un thermostat, dans l'ordre de preference.
CHAUFFE = ("heat", "heat_cool", "auto")

# Les prereglages ou un appareil chauffe a PUISSANCE FIXE, sans regarder sa
# consigne : le planning n'a plus d'effet. Par plateforme, et seulement ce qui
# est mesure (19/10, `manual` d'un poele MCZ) : ailleurs, « manuel » peut etre
# une consigne tenue a la main, qui marche tres bien.
PUISSANCE_FIXE = {"maestro_mcz": frozenset({"manual"})}

# Les modes ou un appareil REFROIDIT (une pompe a chaleur reversible, une
# clim) : le planning de chauffe ne le commande pas, ni ne le remet en chauffe,
# ni ne l'eteint ; il attend qu'il repasse en chauffe (audit du 19/10).
FROID = frozenset({"cool", "dry", "fan_only"})

# Un mode que l'appareil ne comprend pas : le plus proche qu'il comprend.
REPLIS = {"confort": (), "confort_1": ("confort",), "confort_2": ("confort_1", "confort"),
          "eco": ("hors_gel",), "hors_gel": ("eco",), "arret": ("hors_gel", "eco")}

TEMPERATURES_DEFAUT = {"confort": 20.0, "eco": 17.0, "hors_gel": 7.0}

# Les etats qui ne disent rien de l'appareil.
MUETS = frozenset({"unavailable", "unknown", "none", ""})

# Une CONSIGNE a rendre, et non un mode : un thermostat que le moteur a seulement
# BAISSE pour une fenetre ouverte (reglee en Eco) passe a la regle des fenetres
# quand le moteur le lache (« consigne:20.0 », dans l'unite de la maison ; 25/10).
PREFIXE_CONSIGNE = "consigne:"

# Ce que publie un thermostat `off` qui n'est pas eteint : il s'est mis en
# VEILLE de lui-meme, la piece a sa consigne, et repartira seul (le
# « Start / Stop » d'un poele MCZ). `off` sans `hvac_action`, ou avec `off` :
# vraiment eteint (audit du 19/10).
ACTIONS_EN_VEILLE = frozenset({"idle", "heating", "preheating"})

# Ce que dit l'identifiant stable, la cle de traduction ou le nom d'origine du
# `switch` qui allume le PROGRAMME de l'appareil : `…-crono_enabled` (« Timer »)
# d'un poele MCZ, un « schedule » zigbee… Jamais le `friendly_name` (ADR 0164).
PROGRAMME = re.compile(r"crono|chrono|timer|schedul|program|zeitplan")


def canonique(option: Any) -> str:
    """Une option mise a plat, pour la reconnaitre quelle que soit sa graphie.
    Les noms colles de ZHA se decoupent : « FrostProtection » → `frost_protection`,
    « ComfortMinus1 » → `comfort_minus_1` (audit du 19/10)."""
    s = unicodedata.normalize("NFKD", str(option or "")).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"(?<=[a-z])(?=[A-Z])|(?<=[A-Za-z])(?=\d)", "_", s)
    return re.sub(r"[\s_\-]+", "_", s.strip().lower()).strip("_")


def mode_option(option: Any) -> str | None:
    """Le mode d'une option de `select`, ou None si ce n'est pas un ordre fil pilote."""
    c = canonique(option)
    for mode, graphies in OPTIONS.items():
        if c in graphies:
            return mode
    return None


def options_du_module(options: Any) -> dict[str, str]:
    """{mode: option}, avec l'option telle que le module l'ecrit :
    `select_option` refuse une option qu'il ne propose pas."""
    sortie: dict[str, str] = {}
    for option in options if isinstance(options, (list, tuple)) else ():
        mode = mode_option(option)
        if mode is not None and mode not in sortie:
            sortie[mode] = str(option)
    return sortie


def accepte_une_consigne(attributs: Any) -> bool:
    """Ce `climate` recoit-il une temperature (`set_temperature`) ? Un chauffage
    qui ne se regle que par prereglages (un Heatzy...) n'a pas
    `ClimateEntityFeature.TARGET_TEMPERATURE` : Home Assistant refuserait
    l'ordre. Une fonction absente ou illisible n'exclut personne : on n'ecarte
    que ce que l'appareil dit ne pas savoir faire."""
    fonctions = attributs.get("supported_features") if isinstance(attributs, dict) else None
    if isinstance(fonctions, int) and not isinstance(fonctions, bool):
        return bool(fonctions & FONCTION_CONSIGNE)
    return True


def famille(domaine: str, plateforme: Any, unique_id: Any, nom_origine: Any,
            attributs: Any, cle_traduction: Any = None) -> str | None:
    """`fil_pilote`, `vtherm`, `thermostat` — ou None."""
    if domaine == "climate":
        if plateforme == PLATEFORME_LOGGIA:
            return None
        if plateforme == PLATEFORME_VTHERM:
            return "vtherm"
        if not accepte_une_consigne(attributs):
            return None
        # Une clim qui ne fait que du froid n'est pas un chauffage. Sans liste de
        # modes, on n'ecarte personne (comme pour la consigne).
        modes = attributs.get("hvac_modes") if isinstance(attributs, dict) else None
        if isinstance(modes, (list, tuple)) and modes and mode_chauffe(attributs) is None:
            return None
        return "thermostat"
    if domaine != "select":
        return None
    options = (attributs or {}).get("options") if isinstance(attributs, dict) else None
    if not ORDRES_INDISPENSABLES <= set(options_du_module(options)):
        return None
    signes = " ".join(str(x).lower() for x in (unique_id, nom_origine, cle_traduction) if x)
    return "fil_pilote" if FIL_PILOTE.search(signes) else None


def modes_permis(fam: str, attributs: Any) -> list[str]:
    """Les modes que ce chauffage comprend, dans l'ordre de `MODES` (§ 4)."""
    attrs = attributs if isinstance(attributs, dict) else {}
    if fam == "fil_pilote":
        connus = options_du_module(attrs.get("options"))
        return [m for m in MODES if m in connus]
    arret = "off" in (attrs.get("hvac_modes") or ())
    if fam == "vtherm":
        presets = attrs.get("preset_modes") or ()
        return [m for m in MODES if (m in PRESETS_VTHERM and PRESETS_VTHERM[m] in presets)
                or (m == "arret" and arret)]
    if fam == "thermostat":
        return [m for m in MODES if m != "arret" or arret]
    return []


def mode_applicable(mode: Any, permis: list[str]) -> str | None:
    """Le mode lui-meme s'il est compris, sinon son repli le plus proche."""
    if mode in permis:
        return mode
    for repli in REPLIS.get(mode, ()):
        if repli in permis:
            return repli
    return None


def temperature_du_mode(mode: str, temperatures: Any) -> float | None:
    """La consigne d'un mode pour un thermostat, en °C. Confort −1 et −2 se
    deduisent du Confort, sans jamais descendre sous l'Eco : une fenetre ou une
    Absence reglee sur Eco ne doit jamais relever une piece sur un creneau
    Confort -1 ou -2. Tant que Eco <= Confort, ce que la configuration garantit,
    l'ordre du froid au chaud tient : Eco <= Confort -2 <= Confort -1 <= Confort."""
    t = dict(TEMPERATURES_DEFAUT)
    if isinstance(temperatures, dict):
        for cle in t:
            v = temperatures.get(cle)
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                t[cle] = float(v)
    if mode in t:
        return t[mode]
    if mode == "confort_1":
        return max(t["confort"] - 1, t["eco"])
    if mode == "confort_2":
        return max(t["confort"] - 2, t["eco"])
    return None


def _nombre(valeur: Any) -> float | None:
    """Un nombre fini, ou None : un booleen n'en est pas un, ni un texte."""
    if isinstance(valeur, (int, float)) and not isinstance(valeur, bool) and math.isfinite(valeur):
        return float(valeur)
    return None


def pas_de_consigne(attributs: Any, unite: str) -> float:
    """Le pas de la consigne, dans l'unite de l'installation : celui que
    l'appareil annonce (`target_temp_step`), sinon celui de l'interface de Home
    Assistant (1 en °F, 0,5 en °C)."""
    pas = _nombre(attributs.get("target_temp_step")) if isinstance(attributs, dict) else None
    if pas is not None and pas > 0:
        return pas
    return 1.0 if unite == "F" else 0.5


def consigne_en_unite(celsius: float, attributs: Any, unite: str) -> float:
    """Une consigne en °C telle qu'on l'envoie : dans l'unite de l'installation,
    arrondie au pas de l'appareil (chaque demi vers le haut : 19,5 et 20,5 ne
    donnent pas la meme consigne sur un poele au degre), puis ramenee dans ses
    bornes. `min_temp` et `max_temp` sont lus tels que Home Assistant les
    donne, dans l'unite de l'installation ; il refuse ce qui en sort."""
    attrs = attributs if isinstance(attributs, dict) else {}
    pas = pas_de_consigne(attrs, unite)
    valeur = math.floor(depuis_celsius(celsius, unite) / pas + 0.5) * pas
    bas, haut = _nombre(attrs.get("min_temp")), _nombre(attrs.get("max_temp"))
    if bas is not None:
        valeur = max(valeur, bas)
    if haut is not None:
        valeur = min(valeur, haut)
    return round(valeur, 4)


def mode_chauffe(attributs: Any) -> str | None:
    """Le mode `hvac` qui chauffe : `heat`, sinon `heat_cool`, sinon `auto`."""
    modes = (attributs or {}).get("hvac_modes") if isinstance(attributs, dict) else None
    for m in CHAUFFE:
        if m in (modes or ()):
            return m
    return None


def en_veille(fam: str, etat: Any, attributs: Any) -> bool:
    """Ce thermostat `off` s'est-il mis en VEILLE de lui-meme ? Il le dit par
    `hvac_action` (`idle` : la piece a sa consigne). Pour le planning, il est
    allume, dans son mode qui chauffe : s'endormir et se reveiller ne sont pas
    des gestes, et on ne le rallume pas (audit du 19/10)."""
    if fam != "thermostat" or str(etat) != "off" or not isinstance(attributs, dict):
        return False
    return attributs.get("hvac_action") in ACTIONS_EN_VEILLE and mode_chauffe(attributs) is not None


def trame_fausse(fam: str, etat: Any, attributs: Any) -> bool:
    """Cet etat est-il une trame FAUSSE, a ignorer comme un etat muet ? A chaque
    reconnexion, l'integration MCZ publie quelques secondes un poele en `heat` a
    consigne 0, piece a 0, prereglage `unknown`. Pris pour un geste, il devenait
    une reprise en main a 0 °C que le moteur renvoyait au poele (ramenee a 5, son
    minimum), puis un second faux geste a son vrai retour : chez lui le 25/10 a
    01:16, 04:11 et 09:30. Une consigne de chauffe a 0 ou moins n'existe pas, en
    °C comme en °F ; eteint, la consigne ne dit rien."""
    if fam not in ("thermostat", "vtherm") or not isinstance(attributs, dict):
        return False
    if str(etat if etat is not None else "").lower() in ("off", *MUETS):
        return False
    t = _nombre(attributs.get("temperature"))
    return t is not None and t <= 0


def puissance_fixe(plateforme: Any, attributs: Any) -> bool:
    """Cet appareil chauffe-t-il a puissance fixe (le `manual` d'un poele MCZ) ?
    Sa consigne, donc le planning, n'a plus d'effet : Loggia le dit, et ne change
    pas son prereglage — c'est le choix de la personne (19/10)."""
    if not isinstance(attributs, dict):
        return False
    return attributs.get("preset_mode") in PUISSANCE_FIXE.get(str(plateforme or ""), ())


def refroidit(fam: str, etat: Any) -> bool:
    """L'appareil refroidit-il (froid, deshumidification, ventilation) ? Le
    planning de chauffe n'y touche pas : ce n'est ni un geste sur le chauffage,
    ni un appareil a remettre en chauffe (audit du 19/10)."""
    return fam in ("thermostat", "vtherm") and str(etat) in FROID


def _etat_lu(fam: str, etat: Any, attributs: Any) -> str:
    """L'etat tel que le planning le compte : un thermostat en veille est dans
    son mode qui chauffe."""
    if en_veille(fam, etat, attributs):
        return str(mode_chauffe(attributs))
    return str(etat if etat is not None else "")


def commande(fam: str, cible: dict, etat: Any, attributs: Any, temperatures: Any,
             unite: str = "C") -> list[tuple[str, str, dict]]:
    """Les appels qui mettent l'appareil dans `cible` ({"mode", "temperature"
    en °C}) : [(domaine, service, donnees)] dans l'ordre ou ils partent, sans
    `entity_id` — le moteur l'ajoute. [] si l'appareil ne sait pas le faire.

    Allumer et regler sont deux appels, dans cet ordre : Home Assistant ne
    tient aucun compte d'un `hvac_mode` passe a `set_temperature` (c'est
    l'affaire de l'integration, et certaines l'ignorent)."""
    attrs = attributs if isinstance(attributs, dict) else {}
    mode, temperature = cible.get("mode"), cible.get("temperature")
    if fam == "fil_pilote":
        option = options_du_module(attrs.get("options")).get(mode)
        return [("select", "select_option", {"option": option})] if option else []
    if mode == "arret":
        return [("climate", "set_hvac_mode", {"hvac_mode": "off"})]
    if fam == "thermostat":
        t = temperature if isinstance(temperature, (int, float)) else temperature_du_mode(mode, temperatures)
        if t is None:
            return []
        reglage = ("climate", "set_temperature", {"temperature": consigne_en_unite(float(t), attrs, unite)})
        chauffe = mode_chauffe(attrs)
        if chauffe and _etat_lu(fam, etat, attrs) != chauffe:
            return [("climate", "set_hvac_mode", {"hvac_mode": chauffe}), reglage]
        return [reglage]
    if fam == "vtherm":
        preset = PRESETS_VTHERM.get(mode)
        if preset is None:
            return []
        appels: list[tuple[str, str, dict]] = []
        chauffe = mode_chauffe(attrs)
        if str(etat) == "off" and chauffe:
            appels.append(("climate", "set_hvac_mode", {"hvac_mode": chauffe}))
        appels.append(("climate", "set_preset_mode", {"preset_mode": preset}))
        return appels
    return []


def lire_appareil(fam: str, etat: Any, attributs: Any, unite: str = "C") -> dict[str, Any]:
    """Ce que l'appareil dit faire : {"mode", "temperature" (°C), "signature"}.

    `signature` change quand le MODE change, pas quand la piece se rechauffe :
    c'est elle qui separe un geste d'un attribut qui bouge. None : un etat muet."""
    s = str(etat if etat is not None else "")
    if s.lower() in MUETS:
        return {"mode": None, "temperature": None, "signature": None}
    attrs = attributs if isinstance(attributs, dict) else {}
    if fam == "fil_pilote":
        return {"mode": mode_option(s), "temperature": None, "signature": (s,)}
    if fam == "vtherm":
        preset = attrs.get("preset_mode")
        inverse = {p: m for m, p in PRESETS_VTHERM.items()}
        mode = "arret" if s == "off" else inverse.get(preset)
        return {"mode": mode, "temperature": None, "signature": (s, preset)}
    t = attrs.get("temperature")
    t = float(t) if isinstance(t, (int, float)) and not isinstance(t, bool) else None
    celsius = round(vers_celsius(t, unite), 1) if t is not None else None
    if s == "auto" and mode_chauffe(attrs) not in (None, "auto"):
        # Il suit SON programme (Tado, Netatmo : `heat` est leur manuel, souvent
        # temporaire). Ce n'est pas une consigne a tenir, et ce que son programme
        # fait de la consigne n'est pas un geste : la signature l'ignore (19/10).
        return {"mode": None, "temperature": celsius, "programme": True, "signature": (s,)}
    s = _etat_lu(fam, s, attrs)
    return {"mode": "arret" if s == "off" else None, "temperature": None if s == "off" else celsius,
            "signature": (s, t)}


def deja(fam: str, cible: dict, etat: Any, attributs: Any, temperatures: Any,
         unite: str = "C") -> bool:
    """L'appareil est-il DEJA dans `cible` ? On n'envoie un ordre que s'il differe.

    Un thermostat se compare a la consigne qu'on enverrait (au pas et dans les
    bornes de l'appareil), a un demi-pas pres : ce que Home Assistant lit n'est
    jamais plus fin que ce pas, ni que son affichage (1 en °F, 0,1 en °C)."""
    s = str(etat if etat is not None else "")
    if s.lower() in MUETS:
        return False
    attrs = attributs if isinstance(attributs, dict) else {}
    mode, temperature = cible.get("mode"), cible.get("temperature")
    if fam == "fil_pilote":
        return mode is not None and mode_option(s) == mode
    s = _etat_lu(fam, s, attrs)
    if mode == "arret":
        return s == "off"
    if s == "off":
        return False
    if fam == "vtherm":
        return mode in PRESETS_VTHERM and attrs.get("preset_mode") == PRESETS_VTHERM[mode]
    # Un thermostat laisse sur son propre programme (`auto`) n'obeit pas au
    # planning : il doit etre dans le mode qui chauffe, `heat` d'abord.
    chauffe = mode_chauffe(attrs)
    if chauffe and s != chauffe:
        return False
    t = temperature if isinstance(temperature, (int, float)) else temperature_du_mode(mode, temperatures)
    actuelle = _nombre(attrs.get("temperature"))
    if t is None or actuelle is None:
        return False
    tolerance = max(pas_de_consigne(attrs, unite), 1.0 if unite == "F" else 0.1) / 2
    return abs(actuelle - consigne_en_unite(float(t), attrs, unite)) <= tolerance


def sous_jacents_vtherm(attributs: Any) -> list[str]:
    """Les entites qu'un VTherm commande, lues dans ses attributs."""
    if not isinstance(attributs, dict):
        return []
    trouves: set[str] = set()

    def ajouter(liste: Any) -> None:
        for x in liste if isinstance(liste, (list, tuple)) else ():
            if isinstance(x, str) and "." in x:
                trouves.add(x)

    ajouter(attributs.get("underlying_entities"))
    for cle, valeur in attributs.items():
        if isinstance(valeur, dict):
            ajouter(valeur.get("underlying_entities"))
        elif isinstance(valeur, str) and SOUS_JACENT_A_PLAT.match(str(cle)):
            ajouter([valeur])
    return sorted(trouves)


def sous_jacents_bt(donnees: Any) -> list[str]:
    """Les vannes qu'un Better Thermostat commande, lues dans les donnees de son integration."""
    liste = donnees.get("thermostat") if isinstance(donnees, dict) else None
    return sorted({x["trv"] for x in liste if isinstance(x, dict) and isinstance(x.get("trv"), str)}
                  if isinstance(liste, (list, tuple)) else ())


def commandes_par(entrees: Any, attributs_de: Any, entrees_bt: Any) -> dict[str, str]:
    """{entite commandee : le thermostat qui la commande} — VTherm et Better
    Thermostat. Ces entites ne sont pas des chauffages de plus : leur planning
    passe par le thermostat qui les commande, sinon deux chefs (audit du 19/10).
    `attributs_de(entity_id)` rend les attributs ; `entrees_bt` : [(entry_id,
    donnees)] des integrations Better Thermostat. Un Better Thermostat dont on ne
    retrouve pas le `climate` laisse un nom vide : ses vannes sont ecartees quand meme."""
    sortie: dict[str, str] = {}
    climats_bt: dict[Any, str] = {}
    for e in entrees or ():
        haid = str(getattr(e, "entity_id", "") or "")
        if not haid.startswith("climate."):
            continue
        plateforme = getattr(e, "platform", None)
        if plateforme == PLATEFORME_VTHERM:
            for s in sous_jacents_vtherm(attributs_de(haid)):
                if s != haid:
                    sortie.setdefault(s, haid)
        elif plateforme == PLATEFORME_BT:
            climats_bt.setdefault(getattr(e, "config_entry_id", None), haid)
    for entry_id, donnees in entrees_bt or ():
        pilote = climats_bt.get(entry_id, "")
        for s in sous_jacents_bt(donnees):
            if s != pilote:
                sortie.setdefault(s, pilote)
    return sortie


# Ce que la fiche lit dans l'historique d'un `climate` (chauffageplanning.js) :
# la consigne, la piece, ce qu'il fait, son prereglage, sa plage.
ATTRIBUTS_HISTORIQUE = ("temperature", "current_temperature", "hvac_action", "preset_mode",
                        "target_temp_low", "target_temp_high")


def historique_resume(points: Any) -> list[dict[str, Any]]:
    """[(etat, instant ISO, attributs)] → [{state, last_updated, attributes}] :
    les seuls attributs que la fiche lit, et un point seulement quand l'etat ou
    l'un d'eux change. Sept jours d'un poele pesaient 3 a 14 Mo par
    `history/period` (tous ses attributs, a chaque mise a jour) : la
    commande `loggia/chauffage/historique` ne rend que ceci (audit du 19/10)."""
    sortie: list[dict[str, Any]] = []
    avant = None
    for etat, instant, attributs in points or ():
        if not isinstance(instant, str) or not instant:
            continue
        a = attributs if isinstance(attributs, dict) else {}
        garde = {k: a[k] for k in ATTRIBUTS_HISTORIQUE if a.get(k) is not None}
        cle = (str(etat), repr(sorted(garde.items())))
        if cle == avant:
            continue
        avant = cle
        sortie.append({"state": str(etat), "last_updated": instant, "attributes": garde})
    return sortie


# Scheduler (nielsfaber/scheduler-component) : un `switch` de sa plateforme,
# dont l'attribut `entities` dit ce que ses creneaux commandent ; eteint, il ne
# fait rien. Velair : les thermostats de son integration, `climate_entities`,
# dans ses options sinon ses donnees (`get_configured_climate_entities`).
PLATEFORME_SCHEDULER = "scheduler"
PLATEFORME_VELAIR = "velair"


def concurrents_scheduler(interrupteurs: Any, entite: str) -> list[str]:
    """[(entity_id, etat, attributs)] des `switch` Scheduler → ceux, allumes,
    dont un creneau commande `entite`."""
    sortie = []
    for haid, etat, attributs in interrupteurs or ():
        if str(etat).lower() in MUETS or str(etat).lower() == "off":
            continue
        cibles = (attributs or {}).get("entities") if isinstance(attributs, dict) else None
        if isinstance(cibles, (list, tuple)) and entite in cibles:
            sortie.append(haid)
    return sorted(sortie)


def entites_velair(options: Any, donnees: Any) -> list[str]:
    """Les thermostats qu'une integration Velair programme."""
    for source in (options, donnees):
        if isinstance(source, dict) and isinstance(source.get("climate_entities"), (list, tuple)):
            return [x for x in source["climate_entities"] if isinstance(x, str)]
    return []


def interrupteurs_du_module(entrees: Any, appareil: Any) -> list[str]:
    """Les `switch` du MEME appareil qu'un module fil pilote — son
    interrupteur. Jamais commande par Loggia (§ 3.3) : on le lit pour dire
    « le module est coupe, le planning ne peut rien »."""
    if not appareil:
        return []
    trouves = []
    for e in entrees or []:
        haid = str(getattr(e, "entity_id", "") or "")
        if not haid.startswith("switch.") or getattr(e, "device_id", None) != appareil:
            continue
        if getattr(e, "disabled_by", None) or getattr(e, "entity_category", None):
            continue
        trouves.append(haid)
    return sorted(trouves)


def programmes_de_l_appareil(entrees: Any, appareil: Any) -> list[str]:
    """Les `switch` du MEME appareil qui allument son propre programme (le
    chrono d'un poele, un planning zigbee) : allume, il change les reglages
    lui-meme et le planning n'est plus seul a commander (D5, § 3.4 ; audit du
    19/10). Reconnus par l'identifiant stable, la cle de traduction ou le nom
    d'origine — jamais par le nom affiche. Jamais commandes par Loggia : on les
    lit pour le DIRE."""
    if not appareil:
        return []
    trouves = []
    for e in entrees or []:
        haid = str(getattr(e, "entity_id", "") or "")
        if not haid.startswith("switch.") or getattr(e, "device_id", None) != appareil:
            continue
        if getattr(e, "disabled_by", None):
            continue
        signes = " ".join(str(x).lower() for x in (getattr(e, "unique_id", None), getattr(e, "translation_key", None),
                                                  getattr(e, "original_name", None)) if x)
        if PROGRAMME.search(signes):
            trouves.append(haid)
    return sorted(trouves)
