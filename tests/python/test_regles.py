"""Le socle commun des regles.

Trois mecaniques y vivent, et chacune corrige un defaut constate :

  * le JOURNAL etait ecrit cinq fois, en memoire, et repartait a zero a chaque
    redemarrage. Deboguer une regle qui n'a pas fonctionne cette nuit etait
    donc impossible le lendemain — c'est arrive, deux jours durant, sur le
    planning des volets ;
  * rien ne distinguait une MAIN d'une regle. Une lampe allumee par quelqu'un
    et une lampe allumee par le dashboard se ressemblent trait pour trait ;
  * une regle qui commandait notait le nombre DEMANDE, jamais le nombre parti.
    « ferme 2 » alors qu'un volet n'avait rien recu : le journal mentait, et le
    defaut restait invisible.
"""
from __future__ import annotations

import asyncio
import time

import pytest

from conftest import FauxStore, charger


def lancer(coro):
    return asyncio.run(coro)


class FauxServices:
    def __init__(self, existants=("mobile",)):
        self.appels = []
        self.existants = set(existants)

    def has_service(self, domaine, service):
        return service in self.existants

    async def async_call(self, domaine, service, data, blocking=False, context=None):
        self.appels.append((domaine, service, dict(data), context))


class FauxHass:
    def __init__(self):
        self.services = FauxServices()
        self.taches = []

    def async_create_task(self, coro):
        self.taches.append(coro)
        return coro

    def abandonner(self):
        taches, self.taches = self.taches, []
        for coro in taches:
            coro.close()


class FauxEvenement:
    """Un changement d'etat, avec le contexte qui dit d'ou il vient."""

    def __init__(self, haid, context):
        self.data = {"entity_id": haid}
        self.context = context


@pytest.fixture
def module():
    return charger("regles")


class FauxMagasin:
    """La partie commune du magasin : `loggia_alertes`, et rien d'autre."""

    def __init__(self, alertes=None):
        self.alertes = alertes

    async def async_get_shared(self, cle, defaut=None):
        return self.alertes if cle == "loggia_alertes" else defaut


@pytest.fixture
def socle(module):
    faits = []

    def fabrique(depart=None, alertes=None, quand=None):
        r = module.Regles(FauxHass(), FauxMagasin(alertes))
        r._depot = FauxStore(depart)
        if quand is not None:
            r._maintenant = lambda: quand
        faits.append(r)
        return r

    yield fabrique
    for r in faits:
        r.hass.abandonner()


def contexte(user_id=None):
    from homeassistant.core import Context

    return Context(user_id=user_id)


# ── Le journal ──────────────────────────────────────────────────────────────

def test_une_ligne_porte_son_motif(socle):
    """Sans le motif, on lit qu'un volet s'est ferme sans savoir pourquoi.

    C'est la colonne qui manquait aux cinq journaux precedents, et la seule
    qui permette a quelqu'un de comprendre sa maison sans lire le code.
    """
    r = socle()
    ligne = lancer(r.noter("volets", "planning", "fermer",
                           cibles=["cover.a", "cover.b"], motif="coucher + 30"))
    assert ligne["module"] == "volets"
    assert ligne["motif"] == "coucher + 30"
    assert ligne["n"] == 2
    assert ligne["ts"] > 0


def test_le_journal_survit_au_redemarrage(socle):
    """Le defaut d'origine : cinq journaux en memoire, vides a chaque reveil."""
    depart = {"entrees": [{"ts": 1.0, "module": "nuit", "regle": "veilleuse",
                           "quoi": "eteindre", "cibles": [], "n": 0,
                           "motif": "", "detail": ""}]}
    r = socle(depart)
    lignes = lancer(r.journal())
    assert len(lignes) == 1
    assert lignes[0]["module"] == "nuit"


def test_le_plus_recent_vient_en_premier(socle):
    r = socle()
    lancer(r.noter("volets", "planning", "ouvrir"))
    lancer(r.noter("nuit", "veilleuse", "eteindre"))
    lignes = lancer(r.journal())
    assert [l["module"] for l in lignes] == ["nuit", "volets"]


def test_le_journal_ne_grossit_pas_sans_fin(socle, module):
    r = socle()
    for i in range(module.MAX_JOURNAL + 40):
        lancer(r.noter("volets", "planning", "ouvrir", detail=str(i)))
    assert len(lancer(r.journal(limite=1000))) == module.MAX_JOURNAL


def test_on_peut_lire_le_journal_d_un_seul_module(socle):
    r = socle()
    lancer(r.noter("volets", "planning", "ouvrir"))
    lancer(r.noter("nuit", "veilleuse", "eteindre"))
    assert [l["module"] for l in lancer(r.journal(module="volets"))] == ["volets"]


# ── Le geste manuel ─────────────────────────────────────────────────────────

def test_une_main_gele_l_entite(socle):
    """`context.user_id` rempli : le changement vient d'une personne."""
    r = socle()
    r.suivre("volets", ["cover.a"])
    r._sur_changement(FauxEvenement("cover.a", contexte(user_id="u1")))
    assert r.gele("cover.a")
    assert r.gel_restant("cover.a") > 0


def test_une_regle_ne_gele_rien(socle):
    """Sans `user_id`, le changement vient d'une automatisation : les regles
    doivent continuer de piloter."""
    r = socle()
    r.suivre("volets", ["cover.a"])
    r._sur_changement(FauxEvenement("cover.a", contexte()))
    assert not r.gele("cover.a")


def test_le_socle_ne_se_gele_pas_lui_meme(socle):
    """Le piege : notre propre ordre revient sous forme de changement d'etat.

    Sans reconnaitre nos contextes, la premiere commande gelait l'entite et la
    regle ne pouvait plus jamais agir.
    """
    r = socle()
    r.suivre("volets", ["cover.a"])
    lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a"]))
    _, _, _, ctx = r.hass.services.appels[0]
    # Home Assistant nous rend le changement, avec NOTRE contexte — et un
    # `user_id` s'il a ete declenche depuis une session utilisateur.
    ctx.user_id = "u1"
    r._sur_changement(FauxEvenement("cover.a", ctx))
    assert not r.gele("cover.a")


def test_le_gel_expire(socle):
    r = socle()
    r.duree_gel = 0.001
    r.suivre("volets", ["cover.a"])
    r._sur_changement(FauxEvenement("cover.a", contexte(user_id="u1")))
    time.sleep(0.01)
    assert not r.gele("cover.a")


def test_on_peut_rendre_la_main_aux_regles(socle):
    r = socle()
    r.suivre("volets", ["cover.a"])
    r._sur_changement(FauxEvenement("cover.a", contexte(user_id="u1")))
    r.degeler("cover.a")
    assert not r.gele("cover.a")


# ── L'entonnoir ─────────────────────────────────────────────────────────────

def test_agir_ecarte_ce_qui_est_sous_la_main(socle):
    r = socle()
    r.suivre("volets", ["cover.a", "cover.b"])
    r._sur_changement(FauxEvenement("cover.a", contexte(user_id="u1")))
    partis = lancer(r.agir("volets", "planning", "cover", "close_cover",
                           ["cover.a", "cover.b"], motif="coucher + 30"))
    assert partis == ["cover.b"], "on a commande une entite que quelqu'un tenait"
    assert r.hass.services.appels[0][2]["entity_id"] == ["cover.b"]


def test_le_journal_ne_compte_que_ce_qui_est_parti(socle):
    """« ferme 2 » alors qu'un seul est parti : c'est ce mensonge qui rendait
    les defauts invisibles."""
    r = socle()
    r.suivre("volets", ["cover.a", "cover.b"])
    r._sur_changement(FauxEvenement("cover.a", contexte(user_id="u1")))
    lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a", "cover.b"]))
    ligne = lancer(r.journal())[0]
    assert ligne["n"] == 1
    assert "sous la main" in ligne["detail"]


def test_tout_gele_ne_commande_rien(socle):
    r = socle()
    r.suivre("volets", ["cover.a"])
    r._sur_changement(FauxEvenement("cover.a", contexte(user_id="u1")))
    partis = lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a"]))
    assert partis == []
    assert r.hass.services.appels == []
    assert lancer(r.journal())[0]["n"] == 0


def test_les_donnees_du_service_passent(socle):
    r = socle()
    lancer(r.agir("volets", "soleil", "cover", "set_cover_position",
                  ["cover.a"], {"position": 30}, motif="facade au soleil"))
    _, service, data, _ = r.hass.services.appels[0]
    assert service == "set_cover_position"
    assert data == {"entity_id": ["cover.a"], "position": 30}


def test_chaque_ordre_a_son_propre_contexte(socle):
    """Deux ordres partageant un contexte : le second passerait pour le premier,
    et la reconnaissance de nos propres effets se tromperait."""
    r = socle()
    lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a"]))
    lancer(r.agir("nuit", "veilleuse", "light", "turn_off", ["light.a"]))
    assert r.hass.services.appels[0][3].id != r.hass.services.appels[1][3].id


# ── Les priorites ───────────────────────────────────────────────────────────

def test_une_regle_forte_tient_contre_une_faible(socle):
    """« Vent fort passe avant les deux autres », generalise : chaque regle
    declare son niveau, et le plus haut l'emporte."""
    r = socle()
    lancer(r.agir("volets", "vent", "cover", "open_cover", ["cover.a"], priorite=100, tenir=True))
    partis = lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a"], priorite=60))
    assert partis == []
    assert len(r.hass.services.appels) == 1, "le planning a baisse un volet que le vent tenait"
    assert "1 tenu par vent" in lancer(r.journal())[0]["detail"]


def test_une_regle_plus_forte_passe_et_reprend(socle):
    """Commander par-dessus une tenue la reprend : la regle qui tenait ne
    rendra pas l'entite derriere nous."""
    r = socle()
    lancer(r.agir("volets", "soleil", "cover", "set_cover_position", ["cover.a"],
                  {"position": 30}, priorite=50, tenir=True))
    assert r.tient("volets", "soleil", "cover.a")
    partis = lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a"], priorite=60))
    assert partis == ["cover.a"]
    assert not r.tient("volets", "soleil", "cover.a"), "le soleil rouvrirait un volet ferme pour la nuit"


def test_a_egalite_rien_ne_retient(socle):
    r = socle()
    lancer(r.agir("volets", "a", "cover", "open_cover", ["cover.a"], priorite=50, tenir=True))
    assert lancer(r.agir("volets", "b", "cover", "close_cover", ["cover.a"], priorite=50)) == ["cover.a"]


def test_rendre_libere_les_plus_faibles(socle):
    r = socle()
    lancer(r.agir("volets", "vent", "cover", "open_cover", ["cover.a"], priorite=100, tenir=True))
    r.relacher("volets", "vent")
    assert lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a"], priorite=60)) == ["cover.a"]


def test_une_main_reprend_ce_qu_une_regle_tenait(socle):
    """Sans cela, la regle rendrait l'entite a la fin du gel : la protection
    solaire rouvrant un volet qu'on venait de baisser a la main."""
    r = socle()
    r.suivre("volets", ["cover.a"])
    lancer(r.agir("volets", "soleil", "cover", "close_cover", ["cover.a"], priorite=50, tenir=True))
    r._sur_changement(FauxEvenement("cover.a", contexte(user_id="u1")))
    assert not r.tient("volets", "soleil", "cover.a")


def test_une_tenue_oubliee_finit_par_tomber(socle):
    """Un filet : une regle qui oublie de rendre ne bloque pas les autres pour toujours."""
    r = socle()
    lancer(r.agir("volets", "vent", "cover", "open_cover", ["cover.a"], priorite=100, tenir=True))
    r._tenues["cover.a"]["fin"] = time.time() - 1
    assert lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a"], priorite=60)) == ["cover.a"]


def test_relacher_tout_un_module_et_lui_seul(socle):
    r = socle()
    lancer(r.agir("volets", "vent", "cover", "open_cover", ["cover.a"], priorite=100, tenir=True))
    lancer(r.agir("volets", "soleil", "cover", "close_cover", ["cover.b"], priorite=50, tenir=True))
    lancer(r.agir("nuit", "veilleuse", "light", "turn_on", ["light.a"], priorite=10, tenir=True))
    r.relacher("volets")
    assert r.tenues("volets") == {}
    assert r.tenues("nuit") == {"light.a": "veilleuse"}


# ── La simulation ───────────────────────────────────────────────────────────

def test_la_simulation_n_envoie_rien_mais_note_tout(socle):
    """« Observer sans agir » : ce qui donne confiance a un tiers avant de
    laisser le dashboard piloter sa maison."""
    r = socle()
    partis = lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a", "cover.b"],
                           motif="coucher", simuler=True))
    assert r.hass.services.appels == [], "la simulation a commande la maison"
    assert partis == ["cover.a", "cover.b"], "la simulation doit dire ce qui SERAIT parti"
    ligne = lancer(r.journal())[0]
    assert ligne["simule"] is True
    assert ligne["n"] == 2
    assert ligne["motif"] == "coucher"


def test_la_simulation_respecte_les_mains_et_les_priorites(socle):
    """Elle raconte la meme histoire que le reel : une entite gelee, ou tenue
    par plus fort, n'y part pas davantage."""
    r = socle()
    r.suivre("volets", ["cover.a", "cover.b"])
    r._sur_changement(FauxEvenement("cover.a", contexte(user_id="u1")))
    lancer(r.agir("volets", "vent", "cover", "open_cover", ["cover.b"], priorite=100,
                  tenir=True, simuler=True))
    partis = lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a", "cover.b"],
                           priorite=60, simuler=True))
    assert partis == []
    assert r.hass.services.appels == []


def test_une_ligne_reelle_n_est_pas_simulee(socle):
    r = socle()
    lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a"]))
    assert lancer(r.journal())[0]["simule"] is False


# ── Les heures calmes ───────────────────────────────────────────────────────

def test_la_plage_traverse_minuit(module):
    from datetime import datetime

    plage = {"actif": True, "debut": "22:00", "fin": "07:00"}
    assert module.Regles.dans_la_plage(plage, datetime(2026, 9, 12, 23, 30))
    assert module.Regles.dans_la_plage(plage, datetime(2026, 9, 12, 3, 0))
    assert module.Regles.dans_la_plage(plage, datetime(2026, 9, 12, 22, 0))
    assert not module.Regles.dans_la_plage(plage, datetime(2026, 9, 12, 7, 0))
    assert not module.Regles.dans_la_plage(plage, datetime(2026, 9, 12, 12, 0))


def test_la_plage_dans_la_journee(module):
    from datetime import datetime

    plage = {"actif": True, "debut": "13:00", "fin": "15:00"}
    assert module.Regles.dans_la_plage(plage, datetime(2026, 9, 12, 14, 0))
    assert not module.Regles.dans_la_plage(plage, datetime(2026, 9, 12, 23, 0))


def test_une_plage_inactive_ou_illisible_ne_calme_rien(module):
    from datetime import datetime

    minuit = datetime(2026, 9, 12, 0, 0)
    assert not module.Regles.dans_la_plage(None, minuit)
    assert not module.Regles.dans_la_plage({"actif": False, "debut": "22:00", "fin": "07:00"}, minuit)
    assert not module.Regles.dans_la_plage({"actif": True, "debut": "tard", "fin": "07:00"}, minuit)
    assert not module.Regles.dans_la_plage({"actif": True, "debut": "22:00", "fin": "22:00"}, minuit)
    assert not module.Regles.dans_la_plage({"actif": True, "debut": "25:00", "fin": "07:00"}, minuit)


# ── Le telephone ────────────────────────────────────────────────────────────

def alertes(calme=False):
    return {"service": "mobile", "calme": {"actif": calme, "debut": "22:00", "fin": "07:00"}}


def nuit():
    from datetime import datetime

    return datetime(2026, 9, 12, 2, 30)


def jour():
    from datetime import datetime

    return datetime(2026, 9, 12, 14, 0)


def test_prevenir_passe_par_le_telephone_choisi(socle):
    r = socle(alertes=alertes(), quand=jour())
    assert lancer(r.prevenir("veilles", "co2", "CO2 : 1450 ppm", motif="1450 ppm")) is True
    assert r.hass.services.appels == [("notify", "mobile", {"title": "Loggia", "message": "CO2 : 1450 ppm"}, None)]
    ligne = lancer(r.journal())[0]
    assert (ligne["module"], ligne["regle"], ligne["quoi"], ligne["n"]) == ("veilles", "co2", "prevenir", 1)
    assert ligne["motif"] == "1450 ppm"
    assert "CO2 : 1450 ppm" in ligne["detail"]


def test_pendant_les_heures_calmes_rien_ne_sonne(socle):
    """La notification part — on la lira au reveil — mais ne sonne pas, et le
    journal le dit : quand rien n'a sonne cette nuit, on sait si c'etait voulu."""
    r = socle(alertes=alertes(calme=True), quand=nuit())
    assert lancer(r.prevenir("veilles", "batterie", "pile a 9 %")) is True
    charge = r.hass.services.appels[0][2]
    assert charge["data"] == {"importance": "low", "push": {"sound": "none"}}
    assert lancer(r.journal())[0]["detail"].startswith("silencieuse, heures calmes")


def test_le_danger_reveille_meme_la_nuit(socle):
    """Le SEUL canal qui contourne les heures calmes — et le mode silencieux du
    telephone avec."""
    r = socle(alertes=alertes(calme=True), quand=nuit())
    assert lancer(r.prevenir("alertes", "fumee", "Fumee : cuisine", critique=True)) is True
    data = r.hass.services.appels[0][2]["data"]
    assert data["channel"] == "alarm_stream", "Android : sans le canal des alarmes, Ne pas deranger l'avale"
    assert data["push"]["sound"]["critical"] == 1, "iOS : sans le son critique, le mode silencieux l'avale"
    ligne = lancer(r.journal())[0]
    assert ligne["quoi"] == "alerter"
    assert ligne["detail"].startswith("critique")


def test_hors_des_heures_calmes_la_notification_est_ordinaire(socle):
    r = socle(alertes=alertes(calme=True), quand=jour())
    lancer(r.prevenir("veilles", "co2", "CO2"))
    assert "data" not in r.hass.services.appels[0][2]


def test_personne_a_qui_parler(socle):
    """Sans telephone choisi, rien ne part — et le journal le dit, plutot que
    de laisser croire que la regle s'est tue."""
    r = socle(alertes={}, quand=jour())
    assert lancer(r.prevenir("veilles", "co2", "CO2")) is False
    assert r.hass.services.appels == []
    assert lancer(r.journal())[0]["detail"].startswith("personne a qui parler")


def test_un_telephone_disparu_ne_plante_pas(socle):
    r = socle(alertes={"service": "telephone_vendu"}, quand=jour())
    assert lancer(r.prevenir("veilles", "co2", "CO2")) is False
    assert r.hass.services.appels == []
    assert "introuvable" in lancer(r.journal())[0]["detail"]


def test_en_simulation_le_telephone_ne_sonne_pas(socle):
    r = socle(alertes=alertes(), quand=jour())
    assert lancer(r.prevenir("veilles", "co2", "CO2", simuler=True)) is True
    assert r.hass.services.appels == []
    assert lancer(r.journal())[0]["simule"] is True

# ── L'echelle de la maison ──────────────────────────────────────────────────

def test_le_journal_garde_cinq_cents_lignes(module):
    """Sept modules et les notifications dedans : deux cents lignes tenaient
    une journee chargee, et le probleme de la veille avait deja disparu."""
    assert module.MAX_JOURNAL == 500


def test_l_echelle_a_quatre_paliers_dans_cet_ordre(module):
    assert (module.niveau("surete") > module.niveau("presence")
            > module.niveau("nuit") > module.niveau("confort"))


def test_un_palier_ne_mord_jamais_sur_le_suivant(module):
    """Quel que soit le zele d'un module : le rang le plus haut du confort
    reste sous le rang zero de la nuit."""
    assert module.niveau("confort", 19) < module.niveau("nuit")
    assert module.niveau("confort", 99) == module.niveau("confort", 19)
    assert module.niveau("nuit", -5) == module.niveau("nuit")


def test_un_palier_inconnu_est_une_erreur(module):
    with pytest.raises(ValueError):
        module.niveau("bricolage")


def test_un_module_plus_fort_l_emporte_sur_un_autre_module(socle, module):
    """LE cas de l'echelle : deux modules visent la meme lampe. Le depart
    (presence) l'eteint et la tient ; la veilleuse (nuit) ne la rallume pas."""
    r = socle()
    lancer(r.agir("presence", "depart", "light", "turn_off", ["light.a"],
                  priorite=module.niveau("presence"), tenir=True))
    partis = lancer(r.agir("nuit", "veilleuse", "light", "turn_on", ["light.a"],
                           priorite=module.niveau("nuit", 5)))
    assert partis == []
    assert "1 tenu par depart" in lancer(r.journal())[0]["detail"]


# ── La main declaree ────────────────────────────────────────────────────────

def test_un_bouton_est_une_main(socle):
    """Un interrupteur sans fil passe par Loggia, sans contexte d'utilisateur :
    le socle ne le verrait pas. Le module le declare, et l'entite est gelee."""
    r = socle()
    lancer(r.geler("interrupteurs", "Salon", ["light.a"], quoi="bouton", motif="on_press"))
    assert r.gele("light.a")
    ligne = lancer(r.journal())[0]
    assert (ligne["module"], ligne["regle"], ligne["quoi"], ligne["motif"]) == ("interrupteurs", "Salon", "bouton", "on_press")
    assert ligne["cibles"] == ["light.a"]
    # Et une regle ne passe plus dessus.
    assert lancer(r.agir("nuit", "coucher", "light", "turn_off", ["light.a"], priorite=60)) == []


def test_un_bouton_reprend_ce_qu_une_regle_tenait(socle):
    r = socle()
    lancer(r.agir("presence", "depart", "light", "turn_off", ["light.a"], priorite=80, tenir=True))
    lancer(r.geler("interrupteurs", "Salon", ["light.a"], quoi="bouton"))
    assert not r.tient("presence", "depart", "light.a")


def test_les_gels_se_lisent(socle):
    r = socle()
    r.suivre("volets", ["cover.a"])
    r._sur_changement(FauxEvenement("cover.a", contexte(user_id="u1")))
    gels = r.gels()
    assert list(gels) == ["cover.a"]
    assert 0 < gels["cover.a"] <= r.duree_gel
    r.degeler("cover.a")
    assert r.gels() == {}


def test_le_composant_transmet_le_socle_aux_quatre_modules_migres():
    from conftest import COMPOSANT

    texte = (COMPOSANT / "__init__.py").read_text(encoding="utf-8")
    for nom, classe in (("fenetres", "LoggiaFenetres"), ("presence", "LoggiaPresence"),
                        ("nuit", "LoggiaNuit"), ("interrupteurs", "LoggiaInterrupteurs")):
        assert 'data["%s"] = %s(hass, data["store"], data.get("regles"))' % (nom, classe) in texte, nom
        assert 'if not data.get("%s") and data.get("store") and data.get("regles"):' % nom in texte, nom

def test_un_gel_expire_ne_se_lit_plus(socle):
    """L'ecran ne doit pas montrer une main qui n'y est plus."""
    r = socle()
    r._gel["cover.a"] = time.time() - 1
    assert r.gels() == {}
