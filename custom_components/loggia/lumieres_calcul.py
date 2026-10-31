"""Le carnet des lumieres sans Home Assistant (chantier Lumieres, L1 et spec 6.1).

Pur : ni Home Assistant, ni horloge, ni disque. `lumieres.py` y prend ce qui
se calcule et garde le temps reel - le registre, les abonnements, le disque.

Chaque lampe a sa FICHE :
  * `vu` : le dernier etat vu, {"state", "bri"} - le suivant s'y compare ;
  * `dernier` : son dernier niveau allumee, {"bri", "mode", "kelvin", "hs"} -
    garde eteinte, c'est « se rallumera a 80 % » ;
  * `niveau_a` : l'instant ou son niveau a ete note pour la derniere fois -
    un reglage qui suit de pres s'y fond ;
  * `evenements` : ses notes, au format du logbook de Home Assistant, plus
    `bri` et `reglage` (spec 6.2) ;
  * `avant_rallumage`, le temps d'un doute seulement (ECHO_S) : le dernier
    niveau d'avant un rallumage qui n'est peut-etre que l'echo d'une extinction
    en fondu. Il ne sort jamais du carnet (`sans_rallumage_en_doute`) ;
  * `doute_demarrage`, le temps de la fenetre de demarrage seulement
    (FENETRE_DEMARRAGE_S) : une lampe qui s'est tue au demarrage de Home
    Assistant, {"when", "avant"} - l'heure de son silence, et son `vu` d'avant
    lui. Il ne s'ecrit jamais (`sans_doute_demarrage`).
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from .nombres import fini

# Les etats d'une lampe ; un autre ne se note pas.
ETATS = ("on", "off", "unavailable", "unknown")
# Ceux ou la lampe dit ou elle en est. `unavailable` et `unknown` disent
# seulement qu'on ne sait pas : vus en PREMIER, ils ne sont pas retenus (`noter`).
ETATS_DE_LA_LAMPE = ("on", "off")
# Les modes ou une lampe est en couleur : sa teinte (`hs`) se garde (spec 5).
MODES_COULEUR = ("hs", "xy", "rgb", "rgbw", "rgbww")
# Des reglages a moins de 30 s l'un de l'autre ne font qu'une note, a la
# derniere valeur (spec 6.1) : une glissiere qu'on promene, l'echo d'une
# ampoule qui confirme son niveau.
FONDRE_S = 30
# L'echo d'une extinction en fondu (doute D2, vu chez lui le 15/10). Eteinte avec
# une transition, une ampoule Hue est dite `off`, puis remonte un etat du milieu
# du fondu - `on` a 2 %, deux secondes plus tard -, puis le `off` final, sept
# secondes apres. Pris pour un rallumage, il notait « Allumee a 2 % » et une
# seconde extinction, et la lampe « se rallumait a 2 % ». Un rallumage sans compte,
# a moins de ECHO_S d'une extinction, pas plus haut que le niveau d'avant elle,
# puis eteint a moins de ECHO_S, n'en est que l'echo (`noter`). Dix secondes
# couvrent l'echo vu chez lui (2 s, puis 7 s) avec de la marge ; plus long, le
# doute avalerait de vrais gestes - une lampe qu'on rallume le temps de chercher
# quelque chose, puis qu'on eteint. Le fondu de cinq minutes de la regle Nuit,
# s'il remonte ses paliers tout du long, n'y entre pas.
ECHO_S = 10
# Un fondu que Loggia a demande (ADR 0304) : la lampe le fait elle-meme
# (`transition`) et, selon son integration, publie ses paliers - toutes les
# secondes, toutes les quarante, ou pas du tout. FONDRE_S et ECHO_S ne couvrent
# pas trois minutes : « Reveil » aurait fait six « Reglee a », « Bonne nuit » une
# « Reglee a 40 % » avant l'extinction, et la lampe « se serait rallumee a 3 % ».
# Le scenario l'annonce donc au carnet (`annoncer_fondu`), qui le tient jusqu'a sa
# fin plus MARGE_FONDU_S - le temps du dernier echo (`_noter`).
MARGE_FONDU_S = ECHO_S


# Un nombre fini, ou None - un booleen n'en est pas un (nombres.py, lot 8).
nombre = fini


def _table(x: Any) -> dict[str, Any]:
    return x if isinstance(x, dict) else {}


def pourcentage(brightness: Any) -> int | None:
    """Le niveau d'une lampe ALLUMEE, en pourcentage, comme Home Assistant le
    calcule (`round(b / 255 * 100)`) - et au moins 1 % : allumee, elle eclaire.
    None : pas de niveau (une lampe en tout ou rien, un interrupteur)."""
    b = nombre(brightness)
    if b is None:
        return None
    return max(1, round(min(b, 255.0) / 255 * 100))


def niveau(attributs: Any) -> dict[str, Any]:
    """Le niveau d'une lampe allumee, d'apres ses attributs : {"bri", "mode",
    "kelvin", "hs"}. `kelvin` en blanc (`color_temp`), `hs` en couleur ; None
    pour ce qui ne s'applique pas ou ne se lit pas."""
    a = _table(attributs)
    mode = a.get("color_mode") if isinstance(a.get("color_mode"), str) else None
    kelvin = nombre(a.get("color_temp_kelvin")) if mode == "color_temp" else None
    hs = a.get("hs_color") if mode in MODES_COULEUR else None
    teinte = [nombre(v) for v in hs] if isinstance(hs, (list, tuple)) and len(hs) == 2 else [None]
    return {"bri": pourcentage(a.get("brightness")), "mode": mode,
            "kelvin": round(kelvin) if kelvin is not None else None,
            "hs": [round(v, 1) for v in teinte] if None not in teinte else None}


def vue(etat: Any, attributs: Any) -> dict[str, Any] | None:
    """Ce que le carnet compare d'un etat a l'autre : {"state", "bri"}, `bri`
    seulement allumee. None : un etat qu'une lampe ne prend pas - ou que Home
    Assistant pose LUI-MEME quand l'entite n'est pas (encore) recreee, au
    demarrage ou au rechargement de son integration : `unavailable` avec
    `restored: true`. Ce n'est pas la lampe qui ne repond plus."""
    a = _table(attributs)
    if etat not in ETATS or a.get("restored") is True:
        return None
    return {"state": etat, "bri": pourcentage(a.get("brightness")) if etat == "on" else None}


def contexte(user_id: Any, lien: Any = None) -> dict[str, Any]:
    """Le contexte d'une note, au format du logbook : `context_user_id`, une
    personne (l'application, Loggia) ; `context_event_type` et `context_name`,
    l'automatisation ou le script qui a lance le changement (`lien`, le couple
    (type, nom) de `lien_de`)."""
    type_, nom = lien if isinstance(lien, tuple) and len(lien) == 2 else (None, None)
    return {"context_user_id": user_id if isinstance(user_id, str) and user_id else None,
            "context_event_type": type_ if isinstance(type_, str) and type_ else None,
            "context_name": nom if isinstance(nom, str) and nom else None}


def fiche_neuve() -> dict[str, Any]:
    """Une lampe que le carnet n'a encore jamais vue."""
    return {"vu": None, "dernier": None, "niveau_a": None, "evenements": []}


def _auteur(note: dict[str, Any]) -> tuple:
    return note["context_user_id"], note["context_event_type"], note["context_name"]


def noter(fiche: dict[str, Any], etat: Any, attributs: Any, t: float, ctx: dict[str, Any],
          demarrage: bool = False, origine: Any = None) -> dict[str, Any]:
    """La fiche NEUVE d'une lampe, apres un etat vu a l'instant `t` (secondes),
    de contexte `ctx` (`contexte`) ; `demarrage` : la fenetre de demarrage est
    ouverte. Une note par changement :

      * l'etat change (`on`, `off`, `unavailable`, `unknown`) : une note, avec
        son niveau si la lampe s'allume. Le tout premier etat vu n'en fait
        pas : ce n'est pas un geste, et le logbook ne le montre pas non plus ;
      * allumee, puis allumee a un autre niveau : un reglage (`reglage`). A
        moins de FONDRE_S du niveau precedent - un allumage ou un reglage -,
        il se fond dans sa note, a la derniere valeur, si son auteur est le
        meme ou s'il n'en a pas (l'echo de l'ampoule) ; la note garde son
        heure et son auteur ;
      * le meme etat au meme niveau (une valeur publiee de nouveau, une
        reprise), une couleur seule : pas de note.

    Allumee, `dernier` prend son niveau, note ou pas - sauf quand l'etat n'en
    porte aucun (`brightness` absent) : le dernier niveau CONNU reste, un `on`
    sans niveau ne l'ecrase pas par {bri: None} (audit du 19/10). Une lampe
    qui n'a jamais eu de niveau ni de mode - un interrupteur declare lumiere -
    n'a pas de `dernier` : None, pas une table de None. Une horloge qui recule
    ne range pas une note avant la precedente.

    Deux etats ne comptent pas (relecture du 14/10) : un etat que Home Assistant
    pose lui-meme (`restored`, voir `vue`) ne touche a rien ; et tant que la lampe
    n'a pas d'etat (`vu` vide), `unknown` et `unavailable` ne sont pas retenus -
    son retour est alors son PREMIER etat vu, pas un allumage.

    L'echo d'une extinction en fondu (ECHO_S, doute D2) : un rallumage sans compte,
    a moins de ECHO_S d'une extinction et pas plus haut que le niveau d'avant elle,
    se note mais reste EN DOUTE - la fiche garde le dernier niveau d'avant lui
    (`avant_rallumage`). Eteint a son tour a moins de ECHO_S, sans compte, ce
    n'etait que l'echo : sa note s'efface, les deux extinctions n'en font qu'une -
    celle du geste, a son heure, avec son auteur -, et le dernier niveau redevient
    celui d'avant. Ses paliers et une couleur seule se fondent dans le doute ; une
    autre note, ou un niveau qui remonte plus haut qu'avant l'extinction, y mettent
    fin. Le geste d'un humain - un compte - ne s'efface jamais.

    La fenetre de demarrage (FENETRE_DEMARRAGE_S, doute D1) : `unknown` ou
    `unavailable`, sur une lampe qui a deja un etat, n'y fait pas de note. `vu` le
    suit, et la fiche garde un doute (`doute_demarrage`) : l'heure du silence, et
    l'etat d'avant lui. Le vrai etat, quand il arrive, se compare a celui d'avant le
    silence, comme si la lampe ne s'etait jamais tue : le meme ne fait pas de note -
    rien ne s'est passe -, un autre en fait une, a son heure, avec son niveau et son
    contexte. Encore muette a la fermeture, elle ne repond plus : `clore_demarrage`
    note son silence, a son heure. La fenetre fermee, un doute qui resterait se clot
    d'abord : hors d'elle, rien ne change.

    Un fondu annonce (`annoncer_fondu`, ADR 0304) : voir `_noter` ; `origine` est
    l'identifiant du contexte de l'etat (`Context.id`), qui reconnait les paliers de
    l'ordre du fondu lui-meme. Fini, il s'oublie au premier etat qui suit."""
    fondu = fiche.get("fondu")
    if isinstance(fondu, dict) and t > fondu["jusqu_a"]:
        fiche = sans_fondu(fiche)
    apres = vue(etat, attributs)
    if apres is None:
        return fiche
    if fiche.get("doute_demarrage") is not None:
        if not demarrage:
            return noter(clore_demarrage(fiche), etat, attributs, t, ctx, origine=origine)
        if apres["state"] in ETATS_DE_LA_LAMPE:
            # Son vrai etat : compare a celui d'avant le silence.
            return noter(sans_doute_demarrage(fiche), etat, attributs, t, ctx, demarrage, origine)
        # Toujours muette : `vu` la suit, le doute garde son heure et l'etat d'avant.
        return fiche if apres == fiche["vu"] else dict(fiche, vu=apres)
    if (demarrage and fiche["vu"] is not None and apres["state"] not in ETATS_DE_LA_LAMPE
            and apres != fiche["vu"]):
        # Elle se tait pendant la fenetre : peut-etre son integration qui n'a pas
        # encore parle. Pas de note, un doute.
        return dict(fiche, vu=apres, doute_demarrage={"when": t, "avant": fiche["vu"]})
    f = _noter(fiche, apres, attributs, t, ctx, origine)
    return fiche if f is fiche else _suivre_le_doute(fiche, f, ctx)


def _dernier_apres(dernier: Any, attributs: Any) -> dict[str, Any] | None:
    """Le dernier niveau d'une lampe qu'on voit allumee : son niveau, s'il en
    a un ; sinon celui qu'on connaissait ; sinon ce que l'etat dit d'autre (un
    mode) ; sinon rien - None, pas une table de None."""
    nouveau = niveau(attributs)
    if nouveau["bri"] is not None:
        return nouveau
    if dernier is not None:
        return dernier
    return nouveau if any(v is not None for v in nouveau.values()) else None


def _noter(fiche: dict[str, Any], apres: dict[str, Any], attributs: Any, t: float,
           ctx: dict[str, Any], origine: Any = None) -> dict[str, Any]:
    """Les notes de `noter`, l'echo mis a part (`_suivre_le_doute`) : `apres`
    est la vue de l'etat (`vue`), deja calculee.

    Pendant un fondu annonce (ADR 0304), pour un etat SANS compte ou portant le
    contexte de l'ordre du fondu (`origine`) - le geste d'un compte, meme celui qui
    a lance le scenario, ne s'efface jamais (relecture du 31/10) :
      * vers un niveau, un reglage se fond dans la note du fondu - son allumage, ou
        son premier reglage -, quel que soit l'ecart entre deux paliers ;
      * vers l'extinction, un `on` STRICTEMENT plus bas qu'avant le fondu - un palier,
        ou l'echo apres l'extinction - ne fait pas de note et ne change pas le dernier
        niveau ; un rallumage a son niveau d'avant ou plus haut est un geste ;
      * une note sans auteur prend celui du fondu, seulement dans le SENS du fondu :
        un `on` vers un niveau, un `off` vers l'extinction. Un `off` pendant un Reveil,
        un `on` pendant une extinction ne sont pas a lui."""
    avant = fiche["vu"]
    if avant is None and apres["state"] not in ETATS_DE_LA_LAMPE:
        return fiche
    fondu = _fondu_de(fiche, t, ctx, origine)
    if (fondu is not None and fondu["eteindre"] and avant is not None and apres["state"] == "on"
            and _plus_bas(apres["bri"], fondu["avant"])):
        if avant["state"] == "on":
            return dict(fiche, vu=apres)
        if avant["state"] == "off":
            return fiche
    dans_son_sens = fondu is not None and apres["state"] == ("off" if fondu["eteindre"] else "on")
    if dans_son_sens and _auteur(ctx) == (None, None, None):
        ctx = contexte(fondu["qui"])
    f = dict(fiche, vu=apres, evenements=list(fiche["evenements"]))
    derniere = f["evenements"][-1] if f["evenements"] else None
    if derniere is not None:
        t = max(t, derniere["when"])
    if apres["state"] == "on":
        f["dernier"] = _dernier_apres(fiche["dernier"], attributs)
    if avant is None:
        return f
    if apres["state"] != avant["state"]:
        f["evenements"].append({"when": t, "state": apres["state"], "bri": apres["bri"], "reglage": False, **ctx})
        f["niveau_a"] = t if apres["state"] == "on" else None
        return f
    if apres["state"] != "on" or apres["bri"] is None or apres["bri"] == avant["bri"]:
        return f
    dans_le_fondu = fondu is not None and not fondu["eteindre"] and derniere is not None and derniere["when"] >= fondu["depuis"]
    if (derniere is not None and derniere["state"] == "on" and f["niveau_a"] is not None
            and (t - f["niveau_a"] < FONDRE_S or dans_le_fondu)
            and _auteur(ctx) in (_auteur(derniere), (None, None, None))):
        f["evenements"][-1] = dict(derniere, bri=apres["bri"])
    else:
        f["evenements"].append({"when": t, "state": "on", "bri": apres["bri"], "reglage": True, **ctx})
    f["niveau_a"] = t
    return f


def _echo_de(ctx: dict[str, Any], ordre: dict[str, Any]) -> bool:
    """Un etat qui peut etre l'echo de la note `ordre` : sans compte - le geste d'un
    humain ne s'efface jamais -, et sans auteur, ou avec celui de l'ordre : Home
    Assistant prete le contexte d'un ordre a ce qui le suit de pres."""
    return ctx["context_user_id"] is None and _auteur(ctx) in ((None, None, None), _auteur(ordre))


def _pas_plus_haut(bri: Any, dernier: Any) -> bool:
    """Un niveau qui ne depasse pas celui de `dernier` : un fondu descend. Faute de
    niveau d'un cote ou de l'autre - une lampe sans variateur n'a pas de fondu -,
    non."""
    haut = dernier.get("bri") if isinstance(dernier, dict) else None
    return bri is not None and haut is not None and bri <= haut


def _plus_bas(bri: Any, dernier: Any) -> bool:
    """Un niveau STRICTEMENT plus bas que celui de `dernier` : le palier d'un fondu
    vers l'extinction, ou son echo. Le niveau d'avant lui-meme est un rallumage."""
    haut = dernier.get("bri") if isinstance(dernier, dict) else None
    return bri is not None and haut is not None and bri < haut


def _suivre_le_doute(avant: dict[str, Any], apres: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
    """La fiche `apres` (`_noter`), le doute d'un rallumage ouvert, suivi ou tranche :
    `avant` est la fiche d'avant l'etat vu, de contexte `ctx`."""
    doute = avant.get("avant_rallumage")
    f = {k: v for k, v in apres.items() if k != "avant_rallumage"}
    notes, neuves = avant["evenements"], f["evenements"]
    if len(neuves) == len(notes):
        # Pas de nouvelle note - un palier fondu dans le rallumage, une couleur : le
        # doute dure, tant que le niveau ne remonte pas plus haut qu'avant l'extinction.
        garde = doute is not None and _pas_plus_haut(neuves[-1]["bri"], doute)
        return dict(f, avant_rallumage=doute) if garde else f
    neuve, derniere = neuves[-1], (notes[-1] if notes else None)
    if doute is not None:
        # Le rallumage en doute s'eteint vite, sans compte : ce n'etait que l'echo. Sa
        # note s'efface, l'extinction du geste reste seule, le niveau d'avant revient.
        # Toute autre note met fin au doute : le rallumage reste.
        if neuve["state"] == "off" and neuve["when"] - derniere["when"] < ECHO_S and _echo_de(ctx, notes[-2]):
            return dict(f, evenements=notes[:-1], dernier=doute, niveau_a=None)
        return f
    if (neuve["state"] == "on" and derniere is not None and derniere["state"] == "off"
            and neuve["when"] - derniere["when"] < ECHO_S and _echo_de(ctx, derniere)
            and _pas_plus_haut(neuve["bri"], avant["dernier"])):
        # Rallumee de pres, sans compte, pas plus haut : peut-etre l'echo. Le rallumage
        # se note, et la fiche garde le dernier niveau d'avant, pour le rendre.
        return dict(f, avant_rallumage=avant["dernier"])
    return f


def sans_rallumage_en_doute(fiche: dict[str, Any], maintenant: float) -> dict[str, Any]:
    """La fiche telle que le carnet la DIT, a l'ecran comme sur le disque, a
    l'instant `maintenant` : un rallumage encore en doute (moins de ECHO_S) ne se
    dit pas encore. La lampe est dite comme avant lui - eteinte, a son dernier
    niveau d'avant -, et le restera si ce n'etait que l'echo. Un arret de Home
    Assistant au milieu de l'echo n'ecrit donc ni « Allumee a 2 % » ni un faux
    dernier niveau : au redemarrage, l'extinction qui le suit arrive bien apres
    ECHO_S, et l'echo ne s'y reconnaitrait plus. Passe le doute, le rallumage se
    dit tel qu'il a ete note. `avant_rallumage` ne sort jamais."""
    doute = fiche.get("avant_rallumage")
    if doute is None:
        return fiche
    f = {k: v for k, v in fiche.items() if k != "avant_rallumage"}
    if maintenant - f["evenements"][-1]["when"] >= ECHO_S:
        return f
    return dict(f, vu={"state": "off", "bri": None}, niveau_a=None, dernier=doute, evenements=f["evenements"][:-1])


# ── Un fondu que Loggia a demande (ADR 0304) ────────────────────────────────

def annoncer_fondu(fiche: dict[str, Any], t: float, duree: Any, eteindre: bool,
                   qui: Any = None, origine: Any = None) -> dict[str, Any]:
    """La fiche d'une lampe a qui Loggia demande, a l'instant `t`, un fondu de
    `duree` secondes - vers l'extinction (`eteindre`) ou vers un niveau -, au nom
    du compte `qui` (None : une automatisation, la maison), par l'ordre de contexte
    `origine` (`Context.id` : ses premiers paliers le portent). Le carnet le tient
    jusqu'a `t + duree + MARGE_FONDU_S` (`_noter`), avec le dernier niveau
    d'avant lui. Une duree nulle ou illisible ne change rien."""
    d = nombre(duree)
    if d is None or d <= 0:
        return fiche
    return dict(fiche, fondu={"depuis": t, "jusqu_a": t + d + MARGE_FONDU_S, "eteindre": bool(eteindre),
                              "qui": qui if isinstance(qui, str) and qui else None,
                              "origine": origine if isinstance(origine, str) and origine else None,
                              "avant": fiche.get("dernier")})


def _fondu_de(fiche: dict[str, Any], t: float, ctx: dict[str, Any], origine: Any = None) -> dict[str, Any] | None:
    """Le fondu en cours a l'instant `t`, si l'etat de contexte `ctx` peut en
    etre : sans compte, ou portant le contexte de l'ordre du fondu (`origine`).
    Le geste d'un compte - un autre ordre, un autre contexte - n'en est jamais.
    None sinon."""
    fondu = fiche.get("fondu")
    if not isinstance(fondu, dict) or not fondu["depuis"] - 1 <= t <= fondu["jusqu_a"]:
        return None
    du_fondu = fondu.get("origine") is not None and origine == fondu.get("origine")
    return fondu if ctx["context_user_id"] is None or du_fondu else None


def sans_fondu(fiche: dict[str, Any]) -> dict[str, Any]:
    """La fiche sans fondu : il ne dure que quelques minutes, il ne s'ecrit pas."""
    return {k: v for k, v in fiche.items() if k != "fondu"} if "fondu" in fiche else fiche


# ── La fenetre de demarrage (doute D1, vu chez lui le 16/10) ────────────────
# Au demarrage de Home Assistant, une lampe dont l'integration n'a pas encore parle
# existe deja, `unknown` - sans `restored`, que Home Assistant ne pose qu'a une entite
# qu'il n'a pas encore recreee (`vue`) -, et son vrai etat arrive plus tard : 89 s
# chez lui le 16/10, pour ses quatorze lampes a la fois. Note, l'inconnu disait une
# panne a l'heure du redemarrage, et l'etat d'avant, qui revenait, un geste :
# vingt-huit fausses notes, a chaque redemarrage. Pendant la fenetre, un silence
# reste en doute (`noter`). Elle s'ouvre a la naissance du carnet, se ferme
# FENETRE_DEMARRAGE_S apres que Home Assistant a demarre - des la relecture du carnet
# quand il tournait deja, au rechargement de l'integration -, et jamais plus de
# FENETRE_DEMARRAGE_MAX_S apres la naissance, meme s'il ne le dit jamais
# (`fin_demarrage`). Deux minutes couvrent les 89 s vues chez lui avec de la marge ;
# plus longue, une vraie panne au demarrage tarderait d'autant a se dire.
FENETRE_DEMARRAGE_S = 120
FENETRE_DEMARRAGE_MAX_S = 300


def fin_demarrage(naissance: float, demarre: float | None) -> float:
    """L'instant ou la fenetre de demarrage se ferme : FENETRE_DEMARRAGE_S apres que
    Home Assistant a demarre (`demarre`), et jamais plus de FENETRE_DEMARRAGE_MAX_S
    apres la naissance du carnet - `demarre` None : il ne l'a pas (encore) dit."""
    garde = naissance + FENETRE_DEMARRAGE_MAX_S
    return garde if demarre is None else min(demarre + FENETRE_DEMARRAGE_S, garde)


def sans_doute_demarrage(fiche: dict[str, Any]) -> dict[str, Any]:
    """La fiche telle que le FICHIER la garde : une lampe en doute de demarrage y est
    telle qu'avant son silence (son `vu` d'avant), et le doute n'y entre pas. Relu
    apres un redemarrage en pleine fenetre, l'inconnu passerait pour son etat, et son
    retour pour un geste ; et un doute non leve n'est pas une note. Ce que l'ecran lit
    - les notes, le dernier niveau - ne bouge pas pendant le doute."""
    doute = fiche.get("doute_demarrage")
    if doute is None:
        return fiche
    return dict({k: v for k, v in fiche.items() if k != "doute_demarrage"}, vu=doute["avant"])


def clore_demarrage(fiche: dict[str, Any]) -> dict[str, Any]:
    """La fiche a la fermeture de la fenetre de demarrage. Encore muette, la lampe
    n'attendait pas son integration : elle ne repond plus. UNE note, de l'etat ou elle
    est, a l'heure ou elle s'est tue - celle qu'elle aurait eue hors de la fenetre,
    plus tard seulement. Une fiche sans doute reste telle quelle."""
    doute = fiche.get("doute_demarrage")
    if doute is None:
        return fiche
    return noter(sans_doute_demarrage(fiche), fiche["vu"]["state"], {}, doute["when"], contexte(None))


# ── La fenetre du carnet : depuis la veille a 00:00 (spec 6.2) ──────────────
# Cent notes par lampe au plus : deux jours d'une lampe ordinaire en font
# quelques dizaines ; un eclairage adaptatif, qui la regle toutes les minutes
# et demie, en ferait des centaines, et le fichier enflerait a chaque ecriture.
NOTES_MAX = 100


def veille_a_minuit(maintenant: datetime) -> float:
    """La veille a 00:00, a l'heure de la maison, en secondes : le carnet garde
    ses notes depuis ce moment. `maintenant` porte le fuseau de la maison
    (`dt_util.now()`)."""
    jour = maintenant.date() - timedelta(days=1)
    return datetime(jour.year, jour.month, jour.day, tzinfo=maintenant.tzinfo).timestamp()


def elaguer(evenements: list[dict[str, Any]], depuis: float) -> list[dict[str, Any]]:
    """Les notes depuis `depuis` (la veille a 00:00), et la derniere d'avant :
    l'etat de la lampe quand la fenetre s'ouvre, meme apres des jours sans
    changement - la duree allumee se compte « depuis l'etat d'avant minuit »
    (spec 8). NOTES_MAX au plus : les reglages les plus anciens partent
    d'abord - les allumages et les extinctions font la duree -, puis les
    notes les plus anciennes.

    La note d'avant ne part JAMAIS (relecture du 14/10) : c'est la seule qui dit
    l'etat a minuit. Ni la premiere quand c'est un reglage - le plus ancien -, ni
    sous la tranche des plus recentes : elle compte dans les NOTES_MAX, et ce sont
    les notes de la fenetre qui lui font de la place."""
    avant = [e for e in evenements if e["when"] < depuis][-1:]
    dedans = [e for e in evenements if e["when"] >= depuis]
    places = NOTES_MAX - len(avant)
    surplus = len(dedans) - places
    if surplus > 0:
        partants = set([i for i, e in enumerate(dedans) if e["reglage"]][:surplus])
        restantes = [e for i, e in enumerate(dedans) if i not in partants]
        dedans = restantes[max(0, len(restantes) - places):]
    return avant + dedans


# ── Le carnet relu du disque ────────────────────────────────────────────────

def _texte(x: Any) -> str | None:
    return x if isinstance(x, str) and x else None


def _pourcent(x: Any) -> int | None:
    """Un niveau relu : un entier de 1 a 100, sinon None."""
    return x if isinstance(x, int) and not isinstance(x, bool) and 1 <= x <= 100 else None


def _lire_vu(brut: Any) -> dict[str, Any] | None:
    b = _table(brut)
    if b.get("state") not in ETATS:
        return None
    return {"state": b["state"], "bri": _pourcent(b.get("bri")) if b["state"] == "on" else None}


def _lire_dernier(brut: Any) -> dict[str, Any] | None:
    """Un dernier niveau relu ; None quand rien ne s'y lit - pas une table de
    None (audit du 19/10)."""
    if not isinstance(brut, dict):
        return None
    hs = brut.get("hs")
    teinte = [nombre(v) for v in hs] if isinstance(hs, list) and len(hs) == 2 else [None]
    kelvin = nombre(brut.get("kelvin"))
    dernier = {"bri": _pourcent(brut.get("bri")), "mode": _texte(brut.get("mode")),
               "kelvin": round(kelvin) if kelvin is not None else None,
               "hs": teinte if None not in teinte else None}
    return dernier if any(v is not None for v in dernier.values()) else None


def _lire_note(brut: Any) -> dict[str, Any] | None:
    b = _table(brut)
    when = nombre(b.get("when"))
    if when is None or b.get("state") not in ETATS:
        return None
    allumee = b["state"] == "on"
    return {"when": when, "state": b["state"], "bri": _pourcent(b.get("bri")) if allumee else None,
            "reglage": allumee and b.get("reglage") is True,
            "context_user_id": _texte(b.get("context_user_id")),
            "context_event_type": _texte(b.get("context_event_type")),
            "context_name": _texte(b.get("context_name"))}


def lire_carnet(brut: Any, depuis: float) -> dict[str, dict[str, Any]]:
    """`.storage/loggia_lumieres_etat` relu et elague : {entity_id: fiche}. Ce
    qui ne se lit pas s'ecarte - une lampe, une note, un niveau abimes -, et
    les notes se rangent dans l'ordre du temps."""
    carnet: dict[str, dict[str, Any]] = {}
    for haid, f in _table(brut).items():
        if not isinstance(haid, str) or not haid.startswith(("light.", "switch.")) or not isinstance(f, dict):
            continue
        brutes = f.get("evenements") if isinstance(f.get("evenements"), list) else []
        notes = sorted((n for n in map(_lire_note, brutes) if n is not None), key=lambda n: n["when"])
        carnet[haid] = {"vu": _lire_vu(f.get("vu")), "dernier": _lire_dernier(f.get("dernier")),
                        "niveau_a": nombre(f.get("niveau_a")), "evenements": elaguer(notes, depuis)}
    return carnet


# ── Qui a ouvert un contexte (spec 6.1) ─────────────────────────────────────
# « Quelques minutes » dans la spec : une heure, pour qu'une automatisation
# qui allume, attend (`delay`) puis eteint garde son nom aux deux bouts ; mille
# liens au plus, les plus anciens partent d'abord.
LIEN_S = 3600
LIENS_MAX = 1000


def garder_liens(liens: dict[str, tuple], maintenant: float) -> dict[str, tuple]:
    """Les liens {contexte: (instant, type, nom)} de moins de LIEN_S, LIENS_MAX
    au plus - les plus recents."""
    gardes = [(k, v) for k, v in liens.items() if v[0] > maintenant - LIEN_S]
    return dict(gardes[-LIENS_MAX:])


def lien_de(liens: dict[str, tuple], ident: Any, parent: Any, quand: float) -> tuple | None:
    """(type, nom) de l'automatisation ou du script qui a ouvert le contexte
    `ident` - a defaut son parent, comme le logbook -, s'il l'a ouvert moins de
    LIEN_S avant `quand` ; None sinon."""
    for cle in (ident, parent):
        lien = liens.get(cle) if isinstance(cle, str) else None
        if lien is not None and lien[0] > quand - LIEN_S:
            return lien[1], lien[2]
    return None
