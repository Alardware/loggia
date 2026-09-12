# ADR 0012 — Éclairage nocturne : la main l'emporte sur la minuterie

**Statut** : décidé le 2026-09-12, à faire (§14).

## Contexte

La règle allume une lumière à 10 % sur mouvement la nuit et l'éteint seule
après trois minutes. Si quelqu'un la monte à la main entre-temps, le geste
manuel la gèle trente minutes (ADR 0002) : la minuterie ne l'éteindra pas.

## Décision

**La main l'emporte.** Monter la lumière, c'est dire « je reste ». La règle
lâche, la lumière reste le temps du gel, puis les règles reprennent. Aucune
exception au respect du geste manuel, aucune troisième mécanique.

## Conséquences

- Cohérent avec les volets : une règle ne se bat jamais contre une main.
- La règle ne touche pas non plus une lumière déjà allumée avant la
  détection (garde-fou de la spécification).
