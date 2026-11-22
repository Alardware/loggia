# 0362 — Une avance ne tombe que quand l'état l'a atteinte

*13 novembre 2026 — appliqué (v3.100.0)*

## Le problème

Quand on règle une consigne, l'écran montre tout de suite la valeur demandée
(l'avance), puis la rend à Home Assistant dès que celui-ci répond
(`useOptimiste`, ADR de l'état optimiste). « Répondre » voulait dire : l'état
réel a changé, quelle que soit sa nouvelle valeur.

Trois appuis rapides sur « + » depuis 20° : l'écho du premier ordre (20,5°)
arrivait pendant que l'écran montrait déjà le deuxième (21°). Il effaçait
l'avance, l'écran reculait à 20,5°, et le troisième appui repartait de là : 21°
était envoyé deux fois, et la pièce finissait à 21° au lieu de 21,5°. Un cran
sur trois pouvait ainsi se perdre.

## La décision

`useOptimiste` accepte un juge facultatif : l'avance ne tombe que lorsque
l'état réel l'a **atteinte**. L'écho d'un ordre déjà remplacé n'est pas une
réponse. Le filet reste : sans réponse au bout de six secondes, l'écran redit
l'état réel, par exemple quand l'appareil arrondit autrement ou refuse.

Les six consignes de température le passent : la carte et la feuille d'un
thermostat, la carte et la feuille d'une zone de chauffage, la fiche du
chauffage et ses températures de mode. Sans juge, rien ne change pour les
autres usages (une bascule, une position).

## Les limites connues

- Si quelqu'un d'autre change la consigne pendant ces six secondes, l'écran
  garde l'avance jusqu'au filet.
- Le refus d'un appui ancien efface encore l'avance d'un appui plus récent.
- La carte d'un thermostat dans une vue personnalisée garde sa fenêtre fixe
  de quatre secondes : elle ne perd pas de cran, mais elle n'est pas passée à
  `useOptimiste`.

Pas de redémarrage de Home Assistant. Tests :
`tests/audit_1211_lot2b_fiches.test.mjs` (B29), `tests/optimiste.test.mjs` et
`tests/lot15_optimistes_cache.test.mjs` (assertions modifiées).
