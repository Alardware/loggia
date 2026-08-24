"""Ajout depuis l'interface.

Loggia n'a rien a demander : ni identifiants, ni adresse, ni choix d'entites.
Le formulaire se reduit donc a une confirmation, et une seule entree suffit.
"""
from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult

from .const import DOMAIN


class LoggiaConfigFlow(ConfigFlow, domain=DOMAIN):
    """Entree unique, sans configuration."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is None:
            return self.async_show_form(step_id="user")

        return self.async_create_entry(title="Loggia", data={})
