"""Les capteurs de Meteo-France que la fiche meteo lit (01/11, ADR 0309 ; lot 5 du rapport Gladys : D14, W1, W2).

La prevision horaire de Meteo-France, dans Home Assistant, n'a pas de
`precipitation_probability` : la fiche ecrivait « Pluie 0 % · Neige 0 % » sous
l'averse. Les vraies probabilites sont dans des capteurs a part, et la pluie de
l'heure qui vient dans un autre (`next_rain`, son attribut `1_hour_forecast`).

L'integration ne leur donne ni cle de traduction ni classe utile : ils se
reconnaissent a la FIN de leur identifiant stable, `<lat>,<lon>_rain_chance`
(lu dans le registre et dans `homeassistant/components/meteo_france`). Seul le
role sort vers l'ecran ; l'identifiant, qui porte les coordonnees de la ville,
reste ici.
"""
from __future__ import annotations

from typing import Any

PLATEFORME_METEO_FRANCE = "meteo_france"

# La fin de l'identifiant stable -> le role dans l'index.
ROLES_METEO = {
    "_rain_chance": "pluie",
    "_snow_chance": "neige",
    "_freeze_chance": "gel",
    "_next_rain": "pluie_heure",
    # L'alerte departementale (ADR 0310) : `<departement> Weather alert` (« 18 Weather alert »,
    # lu dans un registre reel). L'Accueil en tire le point de la vigilance rouge et la ligne
    # de l'orange ; le numero du departement reste ici.
    " Weather alert": "vigilance",
}


def role_meteo(domaine: str, plateforme: Any, unique_id: Any) -> str | None:
    """Le role d'un capteur de Meteo-France pour la fiche meteo, ou None."""
    if domaine != "sensor" or plateforme != PLATEFORME_METEO_FRANCE or not isinstance(unique_id, str):
        return None
    for fin, role in ROLES_METEO.items():
        if unique_id.endswith(fin):
            return role
    return None
