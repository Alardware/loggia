# ADR 0008 — Le préchauffage commence par une durée fixe

**Statut** : décidé le 2026-09-12, à faire (§7).

## Contexte

« Chauffer à 6 h 20 pour être bien à 7 h » : la spécification prévoyait une
durée *apprise*, le moteur mesurant combien de temps la pièce a mis à monter
les jours précédents. Cela demande un historique, des semaines de mesure,
et un comportement muet en attendant.

## Décision

Une **durée fixe réglable** d'abord — « chauffer N minutes avant », défaut
quarante. L'apprentissage viendra remplacer le défaut quand il aura assez
mesuré, sans changer le réglage visible.

## Conséquences

- La règle est utile dès le premier matin.
- L'apprentissage, le jour venu, ne doit pas ajouter de réglage : il affine
  le défaut.
