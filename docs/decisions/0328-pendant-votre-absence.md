# 0328 — « Pendant votre absence »

*5 novembre 2026 — appliqué (v3.98.0) (étape 3 du rapport sur l'usage)*

## Le problème

En rentrant, rien ne disait ce qui s'était passé : il fallait ouvrir le
journal, les caméras et la sécurité un par un.

## La décision

`src/absence.js`, une règle pure : la maison est vide quand toutes les
personnes sont ailleurs, sinon quand l'alarme est armée en absence ou en
vacances. Une absence d'au moins 30 minutes se raconte jusqu'à 12 heures après
le retour : alarme déclenchée, sonnette et colis, ouvertures et mouvements (hors
des 10 minutes du retour), machines finies ; six lignes au plus, puis
« {n} autres ».

`accueil/absence.jsx` lit l'historique de Home Assistant — deux requêtes au
plus, par paquets de 40 entités, seulement quand quelqu'un part ou rentre. Une
carte en tête de la colonne de droite, et « {n} événements pendant votre
absence » dans la phrase du bandeau. « Masquer » est retenu par l'écran
(`loggia-absence-vue`).

## Les conséquences

Écran seulement. La démonstration invente une absence. Test `absence`.
