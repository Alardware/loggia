"""Les textes du serveur, et leur langue (ADR 0070).

Le journal reste ecrit en francais ; a cote, une ligne composee garde ses
parties — un gabarit et ses arguments — pour que l'ecran la traduise. Les
notifications, elles, partent dans la langue de Home Assistant.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

from conftest import charger
from test_regles import FauxHass, FauxMagasin, alertes, jour

textes = charger("textes")
regles = charger("regles")


def lancer(coro):
    return asyncio.run(coro)


# ── Les parties ────────────────────────────────────────────────────────────
def test_un_mot_fixe_n_a_pas_de_parties_et_se_rend_tel_quel():
    assert textes.parties("couper") is None
    assert textes.parties("") is None
    assert textes.parties(None) is None
    assert textes.rendre_fr("couper") == "couper"
    assert textes.rendre_fr(None) == ""


def test_un_gabarit_et_ses_arguments_se_rendent_en_francais():
    assert textes.parties(("vent {v}", {"v": "62 km/h"})) == [("vent {v}", {"v": "62 km/h"})]
    assert textes.rendre_fr(("vent {v}", {"v": "62 km/h"})) == "vent 62 km/h"
    assert textes.rendre_fr(textes.partie("{n} min", n=30)) == "30 min"


def test_plusieurs_parties_se_joignent_par_le_point_median_et_les_vides_se_taisent():
    liste = textes.joindre("critique", None, "", ("{nom} : pile a {v} %", {"nom": "Capteur", "v": 9}))
    assert liste == [("critique", {}), ("{nom} : pile a {v} %", {"nom": "Capteur", "v": 9})]
    assert textes.rendre_fr(liste) == "critique · Capteur : pile a 9 %"
    # Une liste dans une liste : `joindre` aplatit.
    assert textes.rendre_fr(textes.joindre(liste, "fin")) == "critique · Capteur : pile a 9 % · fin"


def test_remplir_ne_passe_pas_par_format_une_accolade_dans_un_nom_ne_casse_rien():
    assert textes.remplir("{nom} : {v} ppm", {"nom": "Salon {est}", "v": 1450}) == "Salon {est} : 1450 ppm"
    assert textes.remplir("sans repere", None) == "sans repere"


# ── La langue du serveur ───────────────────────────────────────────────────
def test_la_langue_du_serveur_est_celle_de_home_assistant_le_francais_a_defaut():
    assert textes.langue_serveur(SimpleNamespace(config=SimpleNamespace(language="de-DE"))) == "de"
    assert textes.langue_serveur(SimpleNamespace(config=SimpleNamespace(language="EN"))) == "en"
    assert textes.langue_serveur(SimpleNamespace(config=SimpleNamespace(language=None))) == "fr"
    assert textes.langue_serveur(SimpleNamespace()) == "fr"


def test_traduire_lit_le_catalogue_de_la_langue_puis_l_anglais_puis_le_francais(monkeypatch):
    monkeypatch.setitem(textes.TEXTES, "en", {"{nom} : pile a {v} %": "{nom}: battery at {v} %"})
    monkeypatch.setitem(textes.TEXTES, "de", {"{nom} : pile a {v} %": "{nom}: Batterie bei {v} %"})
    msg = ("{nom} : pile a {v} %", {"nom": "Capteur", "v": 9})
    assert textes.traduire(msg, "fr") == "Capteur : pile a 9 %"
    assert textes.traduire(msg, "de") == "Capteur: Batterie bei 9 %"
    assert textes.traduire(msg, "cs") == "Capteur: battery at 9 %", "sans catalogue (tcheque), le filet anglais"
    assert textes.traduire(("inconnu {x}", {"x": 1}), "de") == "inconnu 1", "sans rien, le francais"
    assert textes.traduire("critique", "de") == "critique"


# ── Le journal garde le francais ET les parties ────────────────────────────
def test_le_journal_ecrit_le_francais_et_garde_les_parties():
    r = regles.Regles(FauxHass(), FauxMagasin(None))
    ligne = lancer(r.noter("volets", "vent", "ouvrir", cibles=["cover.a"],
                           motif=("vent {v}", {"v": "62 km/h"}),
                           detail=[("{n} en attente", {"n": 2}), "capteur indisponible"]))
    assert ligne["quoi"] == "ouvrir" and ligne["motif"] == "vent 62 km/h"
    assert ligne["detail"] == "2 en attente · capteur indisponible"
    assert ligne["g"] == {"motif": [["vent {v}", {"v": "62 km/h"}]],
                          "detail": [["{n} en attente", {"n": 2}], ["capteur indisponible", {}]]}
    # Un mot fixe partout : pas de `g` — l'ecran connait sa cle.
    simple = lancer(r.noter("presence", "depart", "couper", cibles=["light.a"], motif="maison vide"))
    assert "g" not in simple and simple["motif"] == "maison vide"


def test_ce_que_le_socle_ecarte_se_dit_par_parties():
    r = regles.Regles(FauxHass(), FauxMagasin(None))
    r._gel["cover.a"] = 10 ** 12
    lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a", "cover.b"], motif="coucher du soleil"))
    ligne = lancer(r.journal())[0]
    assert ligne["detail"] == "1 sous la main de quelqu’un"
    assert ligne["g"]["detail"] == [["{n} sous la main de quelqu’un", {"n": 1}]]


# ── Le telephone parle la langue du serveur ────────────────────────────────
def test_la_notification_part_dans_la_langue_de_home_assistant(monkeypatch):
    monkeypatch.setitem(textes.TEXTES, "de", {
        "{nom} : pile a {v} %": "{nom}: Batterie bei {v} %",
        "Loggia — sûreté": "Loggia — Sicherheit",
    })
    hass = FauxHass()
    hass.config = SimpleNamespace(language="de")
    r = regles.Regles(hass, FauxMagasin(alertes()))
    r._maintenant = lambda: jour()
    msg = ("{nom} : pile a {v} %", {"nom": "Capteur", "v": 9})
    assert lancer(r.prevenir("veilles", "batterie", msg, titre="Loggia — sûreté", motif=("{v} %", {"v": 9}))) is True
    domaine, service, charge, _ = hass.services.appels[0]
    assert (domaine, service) == ("notify", "mobile")
    assert charge == {"title": "Loggia — Sicherheit", "message": "Capteur: Batterie bei 9 %"}
    # Le journal, lui, reste en francais — avec les parties que l'ecran traduit.
    ligne = lancer(r.journal())[0]
    assert ligne["motif"] == "9 %" and ligne["detail"] == "Capteur : pile a 9 %"
    assert ligne["g"]["detail"] == [["{nom} : pile a {v} %", {"nom": "Capteur", "v": 9}]]


def test_sans_telephone_le_journal_dit_ce_qui_aurait_ete_envoye():
    r = regles.Regles(FauxHass(), FauxMagasin({"service": ""}))
    msg = ("{nom} : {v} ppm, il faut aerer", {"nom": "Salon", "v": 1450})
    assert lancer(r.prevenir("veilles", "co2", msg)) is False
    ligne = lancer(r.journal())[0]
    assert ligne["detail"] == "personne a qui parler · Salon : 1450 ppm, il faut aerer"
    assert ligne["g"]["detail"][0][0] == "personne a qui parler · {message}"
