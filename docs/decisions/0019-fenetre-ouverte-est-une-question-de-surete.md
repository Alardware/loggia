# ADR 0019 — « Fenêtre ouverte coupe le chauffage » se place en sûreté

**Statut** : décidé le 2026-09-12, à faire (migration de `fenetres`).

## Contexte

Sur l'échelle de la maison (ADR 0014), le retour de présence remet les
consignes d'avant le départ (ADR 0011). S'il est plus fort que la coupure
des fenêtres, il rallume un radiateur devant une fenêtre ouverte.

## Décision

La coupure des fenêtres est au palier **sûreté**. Elle tient le chauffage
tant que la fenêtre est ouverte ; le retour attend qu'elle se ferme pour
remettre la consigne. Chauffer dehors n'est jamais voulu.

## Conséquences

- `fenetres` commande avec `tenir=True` et rend à la fermeture de la
  fenêtre.
- Une main qui rallume le radiateur fenêtre ouverte l'emporte quand même
  (ADR 0002) : le journal le dit, la règle ne se bat pas.
