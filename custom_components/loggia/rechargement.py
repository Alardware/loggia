"""Une configuration ecrite par l'ecran est reprise tout de suite (03/10).

Six modules gardent leur configuration en memoire : la nuit, les volets, la
presence, les fenetres, les veilles et les robots. Ils la relisent a leur
demarrage, et quand l'ecran l'enregistre par LEUR commande — qui les
reabonne et repose leurs rendez-vous.

Mais elle s'ecrit aussi par la configuration generale (`loggia/config/set`) :
un IMPORT la remplace d'un bloc, une REMISE A ZERO l'efface. Le fichier
changeait, pas le module. La vue Nuit montrait l'ancienne heure du coucher,
et a cette heure-la la maison s'eteignait selon l'ancienne regle — jusqu'au
redemarrage suivant de Home Assistant, dont personne ne parlait (relecture du
lot 1 de l'audit du 03/10).

Le magasin signale deja, cle par cle, ce que la configuration generale vient
de changer (`SIGNAL_CONFIG`, ADR 0067). On l'ecoute, et le module dont la cle
a change se recharge par sa propre methode d'enregistrement, avec un patch
VIDE : elle relit la cle, la normalise, la range et se reabonne — exactement
ce que fait un enregistrement depuis l'ecran.

Pas de boucle : ce que les modules ecrivent passe par `async_modifier_shared`
(directement, ou par `async_set_shared`), qui ne signale rien.
"""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.core import HomeAssistant, callback

from .store import SIGNAL_CONFIG

_LOGGER = logging.getLogger(__name__)

# La cle de configuration de chaque module qui la garde en memoire. Les
# scenarios et les alertes relisent la leur a chaque usage, les interrupteurs
# aussi : rien a recharger pour eux.
CLES_DES_MODULES: dict[str, str] = {
    "loggia_nuit": "nuit",
    "loggia_volets": "volets",
    "loggia_presence": "presence",
    "loggia_fenetres": "fenetres",
    "loggia_veilles": "veilles",
    "loggia_robots": "robots",
}


def modules_a_recharger(communes: Any) -> list[str]:
    """Les modules touches par une ecriture, chacun une fois, dans l'ordre."""
    if not isinstance(communes, (list, tuple, set)):
        return []
    return sorted({CLES_DES_MODULES[c] for c in communes if c in CLES_DES_MODULES})


class LoggiaRechargement:
    """Ecoute la configuration generale et recharge les modules concernes.

    `data` est `hass.data[DOMAIN]` : le module est cherche AU MOMENT du
    signal, pour qu'un rechargement de l'integration, qui les rebatit, ne
    laisse pas cet ecouteur sur d'anciennes instances.
    """

    def __init__(self, hass: HomeAssistant, data: dict[str, Any]) -> None:
        from homeassistant.helpers.dispatcher import async_dispatcher_connect

        self.hass = hass
        self._data = data
        self._defaire = async_dispatcher_connect(hass, SIGNAL_CONFIG, self._recu)

    @callback
    def _recu(self, info: Any) -> None:
        communes = info.get("communes") if isinstance(info, dict) else None
        for nom in modules_a_recharger(communes):
            module = self._data.get(nom)
            if module is None or not hasattr(module, "async_enregistrer"):
                continue
            self.hass.async_create_task(self._async_recharger(nom, module))

    async def _async_recharger(self, nom: str, module: Any) -> None:
        try:
            await module.async_enregistrer({})
        except Exception:  # noqa: BLE001
            # Un module qui ne se recharge pas garde son ancienne
            # configuration jusqu'au redemarrage : on le dit au journal, sans
            # empecher les autres de se recharger.
            _LOGGER.exception("Loggia %s : configuration non reprise apres son changement", nom)

    @callback
    def async_arreter(self) -> None:
        if self._defaire is not None:
            self._defaire()
            self._defaire = None
