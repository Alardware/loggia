# ADR 0007 — Un seul mécanisme « ordre non abouti »

**Statut** : décidé le 2026-09-12 ; appliqué le 2026-09-22 (v3.67.0).

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

## Mise en œuvre (22/09/2026, v3.67.0)

- `volets.py` : chaque ordre parti par le socle (`_async_service`) pose une
  vérification deux minutes plus tard (`VERIF_DELAI`), sur la position visée
  (`cible_de` : 100, 0, ou la position demandée). À l'heure dite :
  injoignable → l'ordre d'ouverture ou de fermeture rejoint l'attente, comme
  s'il n'était jamais parti (une position, elle, ne s'attend pas : la règle du
  soleil réévalue d'elle-même) ; position inconnue (en mouvement, sans
  position) → on ne conclut rien ; atteinte à cinq près (`atteint`) → rien ;
  sinon on redemande par le socle — une main posée entre-temps arrête tout,
  en silence —, jusqu'à `verification.tentatives` (1 à 3, défaut 2), puis la
  ligne rouge : règle « non abouti », motif « immobile après N essais »,
  drapeau `echec` sur l'entrée du journal (`regles.noter`).
- L'onglet Volets règle les tentatives (trois puces) et montre la ligne en
  rouge dans « Dernières manœuvres » ; le Journal aussi.
- Un nouvel ordre sur le même volet remplace la vérification en cours ; la
  simulation ne vérifie rien ; le rechargement de la simulation et l'arrêt
  annulent tout.

Tests : tests/python/test_volets.py (section « Ordre non abouti »).
