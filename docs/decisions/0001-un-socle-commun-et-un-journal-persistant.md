# ADR 0001 — Un socle commun, et un journal qui survit au redémarrage

**Statut** : appliqué (v3.7.0).

## Contexte

Six modules de règles vivaient côte à côte et chacun avait écrit sa
plomberie : cinq journaux séparés, tous en mémoire, remis à zéro à chaque
redémarrage. Déboguer une règle muette cette nuit était impossible le
lendemain — c'est arrivé, deux jours durant, sur le planning des volets.
Aucun ne distinguait une main d'une règle, et la seule priorité était écrite
en dur au milieu d'une fonction.

## Décision

Un fichier, `regles.py`, tient ce que toutes les règles partagent. Une règle
commande par `agir()` et n'appelle jamais un service directement. Le journal
est unique, persistant, dans **son propre magasin** (`loggia_journal`) et non
dans la configuration : mélangé à elle, il l'aurait gonflée à chaque
manœuvre et aurait voyagé entre appareils. Deux cents lignes, écriture
différée de vingt secondes. Chaque ligne porte un **motif**.

`agir()` rend la liste de ce qui est *réellement* parti, jamais la liste
demandée : un journal qui dit « ferme 2 » quand un seul a bougé rend le
défaut invisible.

## Conséquences

- Un module qui migre sur le socle perd son journal local et gagne les
  mécaniques suivantes sans une ligne de plus.
- Le journal appartient à la maison, pas à un utilisateur : il n'est pas
  synchronisé par compte.
- Les modules non migrés (fenêtres, présence, nuit, interrupteurs) restent
  invisibles au journal commun jusqu'à leur migration.
