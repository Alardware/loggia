"""Stockage de la configuration Loggia, par utilisateur Home Assistant.

Remplace le localStorage du navigateur, qui est lie a l'appareil ET a l'origine :
une meme personne n'y retrouve pas ses reglages selon qu'elle passe par l'IP
locale ou par Nabu Casa. Ici la configuration suit l'utilisateur.

Le dashboard etant celui de la MAISON, ses reglages vivent dans une section
commune a tous les comptes ; ne restent propres a chacun que ceux qui dependent
de l'appareil devant lequel on se trouve (voir PERSONAL_KEYS).

SEUL un administrateur Home Assistant ecrit dans cette section commune. Les
autres comptes n'ecrivent que la leur : ils gardent leurs preferences sans
pouvoir toucher au dashboard du foyer. L'identite ET le role viennent de la
connexion WebSocket authentifiee, jamais d'un champ envoye par le client.
Voir websocket_api.py.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = "loggia_dashboard_config"
STORAGE_VERSION = 1

# Nom porte par le fichier avant que le projet ne s'appelle Loggia. Une
# installation existante a toute sa configuration dedans — pieces, entites,
# profils : demarrer sur un fichier vide reviendrait a l'effacer. On le reprend
# une fois, puis on n'y touche plus.
ANCIEN_STORAGE_KEY = "orion_dashboard_config"
# Meme chose pour les cles elles-memes : `orion_rooms` devient `loggia_rooms`.
ANCIEN_PREFIXES = (("orion_", "loggia_"), ("orion-", "loggia-"))

# Cles refusees a l'enregistrement, quoi qu'envoie le client.
#
# Le code PIN administrateur y figurait, au nom du secret. Un PIN de quatre
# chiffres ecrit en clair dans le localStorage n'en est pourtant pas un : il se
# lit en deux clics dans les outils du navigateur. Ce que ce refus coutait,
# lui, etait bien reel — un code different sur chaque appareil, et un de plus
# entre l'acces local et l'acces distant, qui n'ont pas la meme origine
# (retour 03/09). Il est desormais accepte comme le reste ; il protege un
# basculement de profil, pas un compte.
FORBIDDEN_KEYS: frozenset[str] = frozenset()

# Le dashboard est celui de la MAISON : ses reglages sont communs a tous les
# comptes Home Assistant, sinon un telephone ou une tablette connectee sous un
# autre compte repart d'un ecran vide.
#
# Ne restent propres a chaque compte que les reglages lies a l'appareil devant
# lequel on se trouve : qui l'utilise, les marges de securite de son ecran, et
# quels panneaux y sont replies.
PERSONAL_KEYS: frozenset[str] = frozenset(
    {
        # Marges de securite de l'ecran et trace du dernier passage : elles
        # decrivent un appareil, pas la maison. Le profil actif les a quittees
        # le 03/09 — on veut se retrouver au meme endroit, quel que soit
        # l'ecran que l'on prend.
        "loggia-navoffset",
        "loggia-topoffset",
        "loggia-lastseen",
    }
)
PERSONAL_SUFFIXES: tuple[str, ...] = ("panel",)


def est_personnelle(key: str) -> bool:
    """Cette cle reste-t-elle attachee a un seul compte ?"""
    return key in PERSONAL_KEYS or key.endswith(PERSONAL_SUFFIXES)

# Garde-fous de taille : une configuration Loggia complete pese quelques dizaines
# de Ko. Au-dela, c'est une erreur ou un abus — on refuse plutot que de laisser
# grossir un fichier du dossier .storage.
MAX_KEYS_PER_USER = 128
MAX_VALUE_BYTES = 256 * 1024
MAX_TOTAL_BYTES = 1024 * 1024


def _taille(contenu: dict) -> int:
    """Poids JSON d'un dictionnaire de reglages, en octets.

    Sert a mesurer ce qui est CONSERVE, pas ce qui arrive : une suite de petites
    requetes acceptees une a une peut laisser un fichier enorme.
    """
    try:
        return len(json.dumps(contenu, ensure_ascii=False).encode("utf-8"))
    except (TypeError, ValueError):
        # Non serialisable : la sauvegarde echouera de toute facon plus loin.
        return 0


class LoggiaStore:
    """Acces au fichier de configuration, avec cache memoire."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._ancien: Store = Store(hass, STORAGE_VERSION, ANCIEN_STORAGE_KEY)
        self._data: dict[str, Any] | None = None
        # `async_save` serialise le dictionnaire dans un executor pendant que la
        # boucle continue de tourner. Sans verrou, une seconde ecriture — un
        # autre onglet, un autre appareil — mute le MEME objet en cours de
        # serialisation. Le cycle charger / fusionner / ecrire est donc exclusif.
        self._lock = asyncio.Lock()

    async def _load(self) -> dict[str, Any]:
        if self._data is None:
            raw = await self._store.async_load()
            renomme = False
            if not isinstance(raw, dict) or not raw:
                raw, renomme = await self._reprendre_ancien()
            if not isinstance(raw, dict):
                raw = {}
            raw.setdefault("users", {})
            if not isinstance(raw["users"], dict):
                raw["users"] = {}
            raw.setdefault("shared", {})
            if not isinstance(raw["shared"], dict):
                raw["shared"] = {}
            if self._migrer(raw) or renomme:
                await self._store.async_save(raw)
            self._data = raw
        return self._data

    async def _reprendre_ancien(self) -> tuple[dict[str, Any], bool]:
        """Reprend la configuration ecrite sous l'ancien nom du projet.

        L'ancien fichier n'est pas efface : le nouveau est ecrit a cote, et une
        version precedente du dashboard retrouverait la sienne intacte. Le cout
        est un fichier orphelin dans `.storage`, la contrepartie est qu'un
        retour arriere ne perd rien.
        """
        ancien = getattr(self, "_ancien", None)
        if ancien is None:
            return {}, False
        try:
            data = await ancien.async_load()
        except Exception:  # noqa: BLE001 — un ancien fichier illisible ne doit rien bloquer
            _LOGGER.warning("Loggia : ancienne configuration illisible, elle est ignoree")
            return {}, False
        if not isinstance(data, dict) or not data:
            return {}, False
        _LOGGER.info("Loggia : reprise de la configuration ecrite sous le nom Orion")
        return self._renommer_cles(data), True

    @staticmethod
    def _renommer_cles(data: dict[str, Any]) -> dict[str, Any]:
        """`orion_rooms` devient `loggia_rooms`, partout ou une cle est stockee."""

        def renomme(cle: str) -> str:
            # `orion-skyorion` portait deux fois le nom du projet : changer le
            # prefixe ne suffit pas a lui donner son nouveau nom.
            if cle == "orion-skyorion":
                return "loggia-ciel"
            for avant, apres in ANCIEN_PREFIXES:
                if cle.startswith(avant):
                    return apres + cle[len(avant):]
            return cle

        sortie: dict[str, Any] = dict(data)
        users = data.get("users")
        if isinstance(users, dict):
            sortie["users"] = {
                uid: ({renomme(k): v for k, v in reglages.items()} if isinstance(reglages, dict) else reglages)
                for uid, reglages in users.items()
            }
        partage = data.get("shared")
        if isinstance(partage, dict):
            sortie["shared"] = {renomme(k): v for k, v in partage.items()}
        return sortie

    @staticmethod
    def _migrer(raw: dict[str, Any]) -> bool:
        """Fait remonter une configuration deja en place vers la partie commune.

        Sans cela, activer le partage repartirait d'un dashboard vide : la
        configuration existante resterait prisonniere du compte qui l'a ecrite.
        On prend celle du compte le mieux garni — c'est celui qui a fait la
        configuration — et on ne touche pas a ce qui serait deja commun.
        """
        # Un marqueur explicite, jamais deduit du contenu : une partie commune
        # vide est un etat LEGITIME (l'admin a tout efface), et s'en servir de
        # temoin ressusciterait au redemarrage suivant ce qu'il venait de
        # supprimer.
        if raw.get("migrated") or not raw["users"]:
            raw["migrated"] = True
            return False
        source = max(
            raw["users"].values(),
            key=lambda c: len(c) if isinstance(c, dict) else 0,
        )
        raw["migrated"] = True
        if not isinstance(source, dict) or len(source) <= 1:
            return True
        raw["shared"] = {k: v for k, v in source.items() if not est_personnelle(k)}
        # La source garde sinon une copie de chaque cle remontee — et cette
        # copie, prioritaire a la lecture, masquerait pour ce compte toute mise
        # a jour faite ensuite par un autre.
        for cle in raw["shared"]:
            source.pop(cle, None)
        _LOGGER.info(
            "Loggia : %d reglages remontes vers la configuration commune",
            len(raw["shared"]),
        )
        return True

    async def async_get_shared(self, key: str, default: Any = None) -> Any:
        """Une valeur de la partie commune, pour les modules serveur.

        Les alertes lisent ici : leur configuration appartient a la maison,
        pas a un compte. Bon marche — le fichier est en cache memoire.
        """
        data = await self._load()
        return data["shared"].get(key, default)

    async def async_set_shared(self, key: str, value: Any) -> None:
        """Ecriture SERVEUR d'une cle commune (journal des alertes).

        Reservee aux modules du composant : le client, lui, passe par
        async_set_user qui verifie le role. Meme verrou que le reste.
        """
        async with self._lock:
            data = await self._load()
            data["shared"][key] = value
            await self._store.async_save(data)

    async def async_get_user(self, user_id: str) -> dict[str, Any]:
        """Configuration vue par un utilisateur : le commun, puis le sien.

        Ses reglages d'appareil l'emportent sur le commun — c'est le seul cas ou
        deux valeurs coexistent pour une meme cle.
        """
        data = await self._load()
        value = data["users"].get(user_id)
        perso = dict(value) if isinstance(value, dict) else {}
        return {**data["shared"], **perso}

    async def async_set_user(
        self,
        user_id: str,
        patch: dict[str, Any],
        *,
        replace: bool = False,
        is_admin: bool = False,
    ) -> dict[str, Any]:
        """Fusionne (ou remplace) la configuration d'un utilisateur.

        Une valeur a None supprime la cle : c'est ainsi que le frontend efface un
        reglage sans avoir besoin d'une commande dediee.

        SEUL un administrateur Home Assistant ecrit dans la partie commune. Pour
        les autres, TOUT atterrit dans leur propre section : leurs reglages
        s'appliquent chez eux et n'y sont pas perdus, mais le dashboard de la
        maison reste intact. Sans cette regle, n'importe quel compte authentifie
        pourrait vider ou reecrire la configuration de tout le foyer — et, en
        reecrivant `loggia_users`, se donner le role administrateur dans Loggia.
        """
        async with self._lock:
            return await self._set_locked(user_id, patch, replace=replace, is_admin=is_admin)

    async def _set_locked(
        self,
        user_id: str,
        patch: dict[str, Any],
        *,
        replace: bool,
        is_admin: bool,
    ) -> dict[str, Any]:
        data = await self._load()
        # `replace` ne remet a zero QUE la section de l'appelant. Vider la partie
        # commune effacerait le dashboard de tout le foyer sur un simple appel
        # d'un seul appareil ; pour retirer une cle commune, un administrateur
        # envoie explicitement sa valeur a None.
        if replace:
            perso: dict[str, Any] = {}
        else:
            value = data["users"].get(user_id)
            perso = dict(value) if isinstance(value, dict) else {}
        commun: dict[str, Any] = dict(data["shared"])

        for key, value in patch.items():
            if key in FORBIDDEN_KEYS:
                _LOGGER.warning("Loggia : cle refusee a l'enregistrement (%s)", key)
                continue
            vers_commun = is_admin and not est_personnelle(key)
            if value is None:
                # On efface des DEUX cotes : une cle ayant change de categorie
                # laisserait sinon une valeur orpheline, invisible mais agissante.
                perso.pop(key, None)
                if is_admin:
                    commun.pop(key, None)
            elif vers_commun:
                commun[key] = value
                perso.pop(key, None)
            else:
                perso[key] = value
                # Meme raison en sens inverse : sans ce nettoyage, l'ancienne
                # valeur commune resterait visible par tous les autres comptes.
                if is_admin:
                    commun.pop(key, None)

        if len(perso) > MAX_KEYS_PER_USER or len(commun) > MAX_KEYS_PER_USER:
            raise ValueError(
                f"trop de cles ({max(len(perso), len(commun))} > {MAX_KEYS_PER_USER})"
            )

        # Le plafond de taille ne portait que sur la requete recue. Apres fusion,
        # seul le NOMBRE de cles etait verifie : 128 cles de 256 Kio ecrites en
        # requetes separees passaient une a une et laissaient un fichier de
        # 32 Mio, resserialise et reecrit a chaque reglage modifie. Le volume
        # conserve se mesure donc ici, apres fusion, et non a l'entree.
        for nom, contenu in (("compte", perso), ("commun", commun)):
            taille = _taille(contenu)
            if taille > MAX_TOTAL_BYTES:
                raise ValueError(
                    f"stockage {nom} trop volumineux ({taille} > {MAX_TOTAL_BYTES} octets)"
                )

        data["users"][user_id] = perso
        data["shared"] = commun
        await self._store.async_save(data)
        return {**commun, **perso}

    async def async_delete_user(self, user_id: str) -> None:
        """Efface les reglages propres a un compte.

        La configuration commune n'est PAS touchee : elle appartient a la
        maison, et l'effacer depuis un appareil viderait le dashboard de tous
        les autres.
        """
        async with self._lock:
            data = await self._load()
            if data["users"].pop(user_id, None) is not None:
                await self._store.async_save(data)

    async def async_stats(self) -> dict[str, Any]:
        """Chiffres utiles au diagnostic, sans exposer le contenu."""
        data = await self._load()
        return {
            "users": len(data["users"]),
            "shared": len(data["shared"]),
            "keys": {uid: len(cfg) for uid, cfg in data["users"].items()},
            "version": STORAGE_VERSION,
        }
