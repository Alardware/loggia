# 0327 — « Je pars » et « Bonne nuit » montrent d'abord ce qui reste ouvert

*4 et 5 novembre 2026 — appliqué (v3.98.0) (étapes 2 et 4 du rapport sur l'usage)*

## Le problème

On lançait « Je pars » avec une fenêtre ouverte, et on l'apprenait une fois
dehors. Même chose le soir avec « Bonne nuit ».

## La décision

`src/depart.js`, une règle pure, liste d'abord les garages et portails
motorisés ouverts (`cover` de classe `garage` ou `gate`, pas en fermeture),
puis les portes et fenêtres ouvertes — les classes et exclusions de la rangée
sûreté ; le capteur de porte d'un garage qui a déjà son `cover` se tait.

`app/depart.jsx` (`AVANT_DE_LANCER = ['depart', 'nuit']`) ouvre « Avant de
partir » ou « Avant de dormir » : la liste, « Fermer » sur un portail, ce que
le scénario fera du reste, puis « Partir quand même » ou « Bonne nuit quand
même » (le nom que l'utilisateur a donné au scénario). Quand tout est fermé, le
bouton dit seulement « Partir » ou « Bonne nuit ». La croix ne lance rien. La
feuille ne s'ouvre que s'il reste quelque chose : sinon le scénario part
directement. Accueil, vue Scénarios et bouton « Bonne nuit » du moment ; la
recherche lance toujours directement.

## Les conséquences

Écran seulement. « Je rentre » n'est pas concerné. Tests `avant_depart`.
