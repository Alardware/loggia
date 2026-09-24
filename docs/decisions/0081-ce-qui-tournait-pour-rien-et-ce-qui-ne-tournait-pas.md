# ADR 0081 — Ce qui tournait pour rien, et ce qui ne tournait pas

**Statut** : décidé et appliqué le 2026-09-24 ; gardé en local pour la mise à
jour groupée de correctifs.

Point M9 du plan du 22/09 : « Rendu et sondages : ce qui tourne pour rien ». Le
plan listait quatre griefs. **Deux étaient réels et coûteux, un s'est révélé
négligeable à la mesure, un demandait d'abord le découpage.** Les voici dans
cet ordre, parce que c'est l'ordre dans lequel il faut les lire.

## 1. Le suivi du thème réécrivait tout, quarante fois par minute

« Suivre Home Assistant » réappliquait le thème toutes les 1,5 seconde : retirer
une cinquantaine de propriétés de la racine, les réécrire, puis relancer la
garde de contraste et ses calculs de couleur. Chaque passe invalidait le style
de toute la page, indéfiniment, pour un thème qui ne change presque jamais.

La lecture reste : le thème de Home Assistant peut changer sans que son NOM
bouge — le mode sombre, par exemple — et `hass.themes` charge parfois après
coup. Mais on ne **réécrit** que si la lecture a changé, comparée par
`signatureHaTheme`. Le coût retombe à quatre `getComputedStyle` par tick, sans
aucune écriture.

*Non vérifié à l'écran* : cette branche demande une vraie installation Home
Assistant comme parent, que la démonstration n'a pas. Elle repose sur la
relecture du code.

## 2. Le serveur refaisait l'index complet des registres douze fois par minute

L'écran sonde `loggia/scenarios/etat` toutes les cinq secondes. Chaque appel
reconstruisait l'inventaire, et donc l'index complet des zones, des appareils et
des entités — pour des registres qui ne bougent qu'au renommage d'une pièce ou
à l'ajout d'un appareil. Douze fois par minute, **par écran ouvert**.

Ce que les registres disent est désormais retenu, et oublié sur les trois
événements qui le rendent périmé : `entity_registry_updated`,
`device_registry_updated`, `area_registry_updated`. Les **états**, eux, ne sont
jamais mis en cache : ils changent tout le temps, c'est le sujet même de
l'inventaire.

Une lecture qui échoue n'est pas retenue : la suivante réessaie.

## 3. Le sondage de `hass` : mesuré, et laissé tranquille

Le plan reprochait au sondage de parcourir tous les états toutes les deux
secondes dès qu'une clé-préfixe est suivie. C'est exact. Mesuré dans le
navigateur, sur la boucle réelle et ses sept préfixes :

| Entités | Coût d'un tick |
|---|---|
| 200 | 0,11 ms |
| 1 000 | 0,35 ms |
| 3 000 | 1,11 ms |
| 10 000 | 4,40 ms |

Une installation de trois mille entités y passe **1,1 ms toutes les deux
secondes**, soit 0,05 % d'un cœur. Il n'y a rien à gagner, et un chemin chaud
qu'on remanie sans raison est un chemin qu'on casse. **Non modifié.**

La vraie sortie de ce sondage serait de s'abonner aux changements d'état plutôt
que d'interroger. C'est une refonte du chemin de données, pas une optimisation.

## 4. Mémoïser le contexte de l'en-tête : impossible en l'état

`HeaderCtx` reçoit un objet littéral neuf à chaque rendu, et l'en-tête se
redessine donc à chaque fois. Le remède évident, `useMemo`, **ne servirait à
rien ici** : trois de ses valeurs sont recalculées à chaque rendu et arrivent
toujours en nouvelles références — `notifs` vient de `deriveNotifs(hass)`,
`droits` de `droitsDe(...)`, `rooms` d'un `.map()` écrit sur place. Le memo
manquerait à tous les coups.

Les mémoïser d'abord demande de toucher au flux de données du monolithe, ce que
le plan confie déjà au point M1 (le découpage). **Reporté là, pas oublié.**

Une seule chose en a été tirée, parce qu'elle est un défaut de justesse et non
de vitesse : la liste des profils était clavée par son RANG. Ce sont des
boutons, donc focalisables ; ajouter ou retirer un profil pendant que le menu
est ouvert déplaçait le focus d'une ligne à l'autre. Elle est clavée par le nom.

Les autres `key={i}` du fichier sont restés : ce sont des listes de taille fixe
(les gouttes de pluie du fond, les cinq barres d'un signal) ou des lignes de
texte sans état. Une clé par rang y est correcte.

## 5. La feuille de style

356 `!important`, 11 sélecteurs `[style*=]`, 24 `:has(`. Le plan le disait
lui-même : « une dette à traiter avec le découpage, pas avant ». **Non touché.**

## Conséquences

- **Redémarrage de Home Assistant requis** : le composant change (le cache des
  registres et ses trois abonnements).
- `LoggiaScenarios.async_arreter` défait enfin quelque chose — ses trois
  abonnements. Son docstring disait « rien à défaire », ce n'est plus vrai.
- Une pièce renommée, un appareil déplacé : l'inventaire s'en aperçoit à
  l'événement, pas au prochain sondage.

Tests : la suite Python au vert (568), la suite JS au vert (950). Le cache se
construit à la première lecture et se vide sur événement ; les tests des
scénarios bâtissent l'objet sans passer par le constructeur, d'où des valeurs
de CLASSE pour le cache et les abonnements.
