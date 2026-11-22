# 0379 — Une saisie de chauffage ne cache plus les thermostats

*20 novembre 2026 — appliqué (v3.100.0)*

## Le problème

> « J'ai ajouté un appareil sur Home Assistant que j'ai mis dans le séjour, sauf
> que dans Séjour sur Loggia il n'y est pas, alors que dans les appareils oui. »

- L'appareil est un nouveau poêle, un thermostat (`climate.*`) rangé dans la
  zone Séjour de Home Assistant. L'ancien poêle, lui, y est désactivé.
- La saisie du chauffage (Paramètres → Entités) nommait encore l'ancien poêle.
  Avec une saisie, la résolution ne la complétait que par les modules fil pilote
  découverts (plan 2 du chantier Chauffage, choix 3) : les thermostats
  restaient « au registre, où Objets les trouve ».
- Objets lit le registre : le poêle y était. La pièce, la vue Chauffage et
  l'Accueil ne lisent que les zones de chauffage : il n'y était pas, et la
  ligne de l'ancien poêle, sans état, ne montrait plus rien.
- C'était contraire à la règle du 07/10 : une fiche complète la découverte,
  jamais ne la remplace.

## Décidé

- `thermostatsHorsSaisie` (resolve.js) : les `climate.*` découverts qu'aucune
  ligne de la saisie ne nomme par son entité.
- `resolveClimate` rend la saisie telle quelle, puis ces thermostats, puis les
  modules qu'elle ne décrit pas — l'ordre de la découverte sans saisie.
- `climateZones` (noyau.jsx) fait de même, l'ancienne configuration
  (`loggia_entities.climate`) comprise. Une ligne dont l'appareil a disparu se
  tait toujours.
- Un thermostat découvert garde exactement la forme qu'il a sans saisie.

## Conséquences

- Un thermostat ajouté dans Home Assistant prend sa carte dans sa pièce, la vue
  Chauffage et l'Accueil, sans retoucher la saisie ; Objets n'en montre
  toujours qu'une.
- Un thermostat qu'une saisie décrivait sous une autre entité (un `switch` et
  ses aides) en plus de son propre `climate.*` apparaît désormais deux fois :
  la carte en trop se retire par l'édition de la vue.
- Le serveur n'est pas touché : il listait déjà tous les `climate.*` (mesure
  des montées, extinction, planning). Aucun redémarrage de Home Assistant.
- Tests : `tests/chauffage_zones.test.mjs`, `tests/resolve.test.mjs`.
