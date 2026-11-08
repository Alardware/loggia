# 0329 — Ranger ses cartes d'un appui long, au doigt comme à la souris

*5 novembre 2026 — appliqué (v3.98.0) (étape 5 du rapport sur l'usage)*

## Le problème

Ranger ses cartes demandait le mode édition, peu pratique au téléphone. Un
premier essai ne marchait que pour les pièces de l'Accueil, au doigt : « quand
tu fais quelque chose va au bout ».

## La décision

`useRangerLibre` (`glisser.js`) : un appui long de 500 ms
(`APPUI_LONG_MS`) puis un glisser, hors édition, au doigt comme à la souris. La
carte suit le pointeur, la place visée s'allume, l'ordre s'écrit au lâcher, et
le clic du lâcher est avalé. Un toucher court ouvre toujours ; bouger avant la
demi-seconde fait défiler ; une commande de la carte (interrupteur, barre,
bouton) ne saisit rien. Objets, pièce, Énergie, Sécurité, Volets, vue Scénarios
et rangée de l'Accueil, favoris, vues personnelles, pièces de l'Accueil.

Écarté : l'interrupteur visible sur la carte étroite d'une lumière, essayé puis
retiré à sa demande — la plaque reste l'interrupteur. Les caméras ne se rangent
pas.

## Les conséquences

Écran seulement ; le mode édition ne change pas. Test `ranger_au_doigt`.
