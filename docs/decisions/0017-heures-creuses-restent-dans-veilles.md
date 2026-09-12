# ADR 0017 — Les heures creuses restent dans Veilles jusqu'à l'onglet Énergie

**Statut** : décidé le 2026-09-12.

## Contexte

La règle des heures creuses vit dans l'onglet Veilles. La spécification la
veut dans un onglet Énergie, avec le surplus solaire, le dépassement
d'abonnement, l'oubli de consommation et le bilan hebdomadaire — qui
n'existent pas encore.

## Décision

**Elle ne bouge pas avant l'onglet Énergie.** Un déplacement seul n'apporte
rien à l'utilisateur ; elle rejoindra l'onglet le jour où il naîtra, avec
ses règles.

## Conséquences

- Sa configuration reste sous `loggia_veilles.creuses` ; le déplacement
  devra la migrer sans la perdre.
