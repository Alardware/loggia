"""Spotify : l'enceinte, puis la playlist (ADR 0344).

Ce qui compte : la playlist part sur l'enceinte CHOISIE et pas sur le dernier
appareil actif ; une enceinte que Spotify ne voit pas est refusee sans rien
jouer ; personne ne fait jouer un lecteur qu'il ne pilote pas ; une panne de
Spotify revient en un refus nomme.
"""
from __future__ import annotations

import asyncio
import sys

import pytest

from conftest import COMPOSANT, charger

spotify = charger("spotify")

COMPTE = "media_player.spotify_maison"
SOURCES = ["Echo - Salon", "Echo Dot - Bureau", "Partout"]
URI = "spotify:playlist:0SlqjJVYUJSNpMjVfYmr7X"


class FauxEtat:
    def __init__(self, state, attributes=None):
        self.state = state
        self.attributes = dict(attributes or {})


class FauxServices:
    def __init__(self, panne=None):
        self.appels = []
        self.panne = panne

    async def async_call(self, domaine, service, data, blocking=False, context=None):
        self.appels.append((domaine, service, dict(data), getattr(context, "user_id", None)))
        if self.panne == service:
            raise RuntimeError("Player command failed: Premium required")


class FauxHass:
    def __init__(self, etats, panne=None):
        self.etats = etats
        self.services = FauxServices(panne)
        self.states = self

    def get(self, haid):
        return self.etats.get(haid)


def maison(source=None, panne=None):
    return FauxHass({COMPTE: FauxEtat("idle", {"source_list": SOURCES, "source": source})}, panne)


def jouer(hass, uri, sortie=None, compte=COMPTE, **kw):
    return asyncio.run(spotify.async_jouer(hass, compte, uri, sortie, attente=0, **kw))


def test_une_seule_uri_pour_le_lien_l_uri_et_l_arbre():
    assert spotify.uri_spotify("https://open.spotify.com/playlist/0SlqjJVYUJSNpMjVfYmr7X?si=zuvn-8KBRB2eYgjDdVpiyQ") == URI
    assert spotify.uri_spotify("https://open.spotify.com/intl-fr/playlist/37i9dQZF1DX2jdUWwSgTho") == "spotify:playlist:37i9dQZF1DX2jdUWwSgTho"
    assert spotify.uri_spotify(URI) == URI
    assert spotify.uri_spotify("spotify://0123abcd/" + URI) == URI
    assert spotify.uri_spotify("https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy") == "spotify:album:4aawyAB9vmqN3uQ7FjRGTy"
    for rien in ("", None, "bonjour", "https://open.spotify.com/track/0SlqjJVYUJSNpMjVfYmr7X", "spotify:playlist:court"):
        assert spotify.uri_spotify(rien) is None


def test_l_enceinte_puis_la_playlist_au_nom_du_compte():
    h = maison()
    r = jouer(h, "https://open.spotify.com/playlist/0SlqjJVYUJSNpMjVfYmr7X?si=x", "Echo - Salon", par="u1")
    assert h.services.appels == [
        ("media_player", "select_source", {"entity_id": COMPTE, "source": "Echo - Salon"}, "u1"),
        ("media_player", "play_media", {"entity_id": COMPTE, "media_content_id": URI, "media_content_type": "playlist"}, "u1"),
    ]
    assert r == {"uri": URI, "sortie": "Echo - Salon"}


def test_deja_sur_l_enceinte_ou_sans_enceinte_la_playlist_seule():
    h = maison(source="Echo - Salon")
    jouer(h, URI, "Echo - Salon")
    assert [a[1] for a in h.services.appels] == ["play_media"]
    h = maison()
    assert jouer(h, URI) == {"uri": URI, "sortie": None}
    assert [a[1] for a in h.services.appels] == ["play_media"]


def test_une_enceinte_que_spotify_ne_voit_pas_est_refusee_sans_rien_jouer():
    h = maison()
    with pytest.raises(spotify.RefusNomme) as e:
        jouer(h, URI, "Echo de la cuisine")
    assert e.value.code == "spotify_enceinte_absente" and e.value.nomme == "Echo de la cuisine"
    assert h.services.appels == []


def test_un_lien_illisible_ou_un_compte_absent():
    h = maison()
    with pytest.raises(spotify.RefusNomme) as e:
        jouer(h, "https://open.spotify.com/track/0SlqjJVYUJSNpMjVfYmr7X", "Echo - Salon")
    assert e.value.code == "spotify_lien"
    for compte in ("media_player.autre", "light.salon"):
        with pytest.raises(spotify.RefusNomme) as e:
            jouer(h, URI, compte=compte)
        assert e.value.code == "spotify_compte_absent"
    assert h.services.appels == []


def test_personne_ne_fait_jouer_un_lecteur_qu_il_ne_pilote_pas():
    h = maison()
    with pytest.raises(PermissionError):
        jouer(h, URI, "Echo - Salon", controle=lambda e: False)
    assert h.services.appels == []
    jouer(h, URI, "Echo - Salon", controle=lambda e: e == COMPTE)
    assert len(h.services.appels) == 2


def test_un_refus_de_spotify_devient_un_refus_nomme():
    h = maison(panne="play_media")
    with pytest.raises(spotify.RefusNomme) as e:
        jouer(h, URI, "Echo - Salon")
    assert e.value.code == "spotify_refus" and "Premium" in e.value.nomme


def test_la_commande_est_cablee_et_ouverte():
    ws = (COMPOSANT / "websocket_api.py").read_text(encoding="utf-8")
    assert 'WS_SPOTIFY_JOUER = "loggia/spotify/jouer"' in ws
    assert "Commande(WS_SPOTIFY_JOUER, handle_spotify_jouer," in ws
    assert "controle=controle_de(connection.user)" in ws.split("async def handle_spotify_jouer", 1)[1].split("async def ", 1)[0]


# ── Les playlists, que Spotify joue ou non (ADR 0346) ──────────────────────
ENTREE = "01JENTREESPOTIFY"


class FauxNoeud:
    def __init__(self, d):
        self.d = d

    def as_dict(self):
        return self.d


def lire(compte=COMPTE, entree=ENTREE, panne=None, **kw):
    vus = []

    async def naviguer(hass, type_contenu, identifiant):
        vus.append((type_contenu, identifiant))
        if panne:
            raise panne
        enfant = {"title": "Footing", "media_content_id": f"spotify://{ENTREE.lower()}/{URI}", "can_play": True}
        return FauxNoeud({"title": "Playlists", "children": [enfant]})

    r = asyncio.run(spotify.async_playlists(maison(), compte, entree=entree, naviguer=naviguer, **kw))
    return r, vus


def test_les_playlists_se_lisent_par_l_integration_que_spotify_joue_ou_non():
    r, vus = lire()
    assert vus == [("spotify://current_user_playlists", f"spotify://{ENTREE}/current_user_playlists")]
    assert r["children"][0]["title"] == "Footing"
    assert spotify.uri_spotify(r["children"][0]["media_content_id"]) == URI


def test_l_entree_se_lit_dans_le_registre_et_seulement_pour_spotify(monkeypatch):
    class Registre:
        def __init__(self, entrees):
            self.entrees = entrees

        def async_get(self, haid):
            return self.entrees.get(haid)

    class Entree:
        def __init__(self, platform, config_entry_id):
            self.platform = platform
            self.config_entry_id = config_entry_id

    registre = Registre({COMPTE: Entree("spotify", ENTREE), "media_player.salon": Entree("cast", "X")})
    monkeypatch.setattr(sys.modules["homeassistant.helpers.entity_registry"], "async_get", lambda hass: registre)
    assert spotify._entree_spotify(maison(), COMPTE) == ENTREE
    assert spotify._entree_spotify(maison(), "media_player.salon") is None
    assert spotify._entree_spotify(maison(), "media_player.inconnu") is None
    _, vus = lire(entree=None)
    assert vus == [("spotify://current_user_playlists", f"spotify://{ENTREE}/current_user_playlists")]


def test_lire_les_playlists_un_compte_absent_un_compte_qui_ne_le_voit_pas_une_panne():
    for compte in ("light.salon", None):
        with pytest.raises(spotify.RefusNomme) as e:
            lire(compte=compte)
        assert e.value.code == "spotify_compte_absent"
    with pytest.raises(spotify.RefusNomme) as e:
        lire(entree="")
    assert e.value.code == "spotify_compte_absent"
    with pytest.raises(PermissionError):
        lire(lecture=lambda haid: False)
    r, _ = lire(lecture=lambda haid: haid == COMPTE)
    assert r["title"] == "Playlists"
    with pytest.raises(spotify.RefusNomme) as e:
        lire(panne=RuntimeError("Invalid Spotify account specified"))
    assert e.value.code == "spotify_refus" and "account" in e.value.nomme


def test_la_lecture_des_playlists_est_cablee_sous_les_droits_de_lecture():
    ws = (COMPOSANT / "websocket_api.py").read_text(encoding="utf-8")
    assert 'WS_SPOTIFY_PLAYLISTS = "loggia/spotify/playlists"' in ws
    assert "Commande(WS_SPOTIFY_PLAYLISTS, handle_spotify_playlists," in ws
    corps = ws.split("async def handle_spotify_playlists", 1)[1].split("async def ", 1)[0]
    assert "lecture=_lecture_autorisee(connection.user)" in corps
