# ADR 0013 — Tout migrer sur le socle avant d'ajouter une règle

**Statut** : appliqué (v3.11.0) — les sept modules sont sur le socle.

## Contexte

Cinq mécaniques transversales sont en place (ADR 0001 à 0005), portées par
trois modules : volets, veilles, alertes. Fenêtres, présence, nuit et
interrupteurs gardent chacun leur journal en mémoire et ignorent les mains,
les priorités et la simulation. Vingt-deux règles attendent.

## Décision

**Migrer d'abord** les quatre modules restants et livrer l'onglet Journal
(ADR 0009) ; ensuite seulement les règles, en commençant par les trois
marquées prioritaires (§1 volet bloqué, §10 présence fiable, §14 éclairage
nocturne) et la moitié « action » de §18.

## Conséquences

- Aucune règle nouvelle ne naît hors du socle.
- Le journal devient réellement unifié avant qu'on s'y fie pour déboguer
  les règles nouvelles.
