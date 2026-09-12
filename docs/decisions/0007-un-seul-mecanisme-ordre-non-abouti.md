# ADR 0007 — Un seul mécanisme « ordre non abouti »

**Statut** : décidé le 2026-09-12, à faire (§3).

## Contexte

Deux mécanismes visaient le même défaut. L'*attente* existe déjà : un ordre
adressé à un volet injoignable est gardé jusqu'à son retour, puis rejoué
(rattrapage), ou périmé à l'événement solaire opposé. La règle « Manœuvre
non confirmée » (§3) proposait, deux minutes après un ordre, de comparer
position réelle et attendue, de réessayer, puis d'écrire une ligne rouge.

## Décision

**Fusion.** Un ordre non abouti a deux causes et un seul traitement :

- volet **injoignable** — on attend son retour (existant) ;
- volet **joignable mais immobile** deux minutes après l'ordre — on
  réessaie N fois, puis une ligne rouge au journal.

Un seul réglage visible : le nombre de tentatives (1 à 3).

## Conséquences

- Pas de seconde carte ni de second journal : « Dernières manœuvres »
  montre l'échec en rouge.
- La vérification demande `current_position` ; un volet sans positionnement
  ne se vérifie que par ouvert/fermé.
