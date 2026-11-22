# 0349 — Un réglage de menu rangé deux fois redevient une liste

*12 novembre 2026 — appliqué (v3.100.0)*

## Le problème

Les trois réglages du menu (vues affichées, vues masquées, ordre) avaient reçu
un découpage par profil écrit à la main le 10/10, puis le passage central du
lendemain (ADR 0182). Chez qui avait déjà un menu, la valeur du premier a été
rangée tout entière comme part commune du second :
`{ __profils: { "0": […], "*": { "0": […], "1": […], "*": […] } } }`.

Plus personne ne lit cet ancien découpage : la part commune de ces clés
n'échoit qu'au premier profil, qui a la sienne depuis. Il reste dans la
configuration, avec des vues qui n'existent plus.

## La décision

À la prochaine écriture d'une de ces trois clés, la part commune redevient la
liste qu'elle portait, ou disparaît (`sansDoubleRangement`, `state.js`). Ce que
chaque profil voit ne change pas.

Écarté : rendre à chaque profil son choix d'avant. Un mois a passé, et une vue
qui reviendrait seule dans un menu surprendrait plus qu'elle ne servirait.
Écarté aussi : nettoyer au démarrage — seul un geste écrit (ADR 0223).

## Les conséquences

Pas de redémarrage de Home Assistant. Test : `tests/installation_reelle.test.mjs`.
