# ADR 0016 — Le mode invité est un input_boolean de Home Assistant

**Statut** : décidé le 2026-09-12 ; appliqué le 2026-09-22 (v3.69.0).

## Contexte

Quelqu'un garde la maison sans téléphone suivi. Sans mode invité, la maison
se met en veille sur la tête du visiteur : départ, extinction générale,
alerte mouvement. Il faut un interrupteur — et décider à qui il appartient.

## Décision

Un **input_boolean désigné** une fois dans Loggia. Loggia l'affiche et le
bascule, mais il appartient à Home Assistant : la voix, un bouton mural ou
une autre automatisation peuvent aussi l'allumer. Il bloque le départ (règle de
présence) et l'extinction générale du coucher (règle de nuit), et se coupe
seul au retour d'un habitant depuis trente minutes. (Corrigé le 22/09/2026 :
la décision citait une « alerte mouvement » qui n'existe pas dans
`alertes.py` — les seules alertes de mouvement sont celles des portes quand
l'alarme est armée, et l'alarme ne relève pas de Loggia.)

## Conséquences

- Sans input_boolean désigné, la carte est grisée et dit lequel créer
  (critère 2).
- La coupure automatique est une commande du socle : elle se voit au
  journal et respecte une main qui l'aurait rallumé.

## Mise en œuvre (22/09/2026, v3.69.0)

- `presence.py` : `invite = {entite}` dans la configuration ; l'interrupteur
  est écouté comme une personne et déclaré au socle. À l'évaluation, la
  maison n'est vide que si tout le monde est absent ET le mode est éteint ;
  allumé alors que la maison est en veille, il la réveille (retour). Le
  décompte de départ, s'il sonne, vérifie encore le mode.
- **La coupure** : c'est le retour d'un habitant qui lance la demi-heure
  (`INVITE_COUPURE`), pas sa présence — quelqu'un déjà là quand le mode
  s'allume ne le coupe pas. La demi-heure passée, si l'habitant est toujours
  là et le mode encore allumé, `input_boolean.turn_off` part par le socle
  (règle « invité », motif « un habitant est rentré depuis 30 min ») : une
  main qui a rallumé l'interrupteur entre-temps le gèle, et il reste allumé.
  Reparti avant, ou mode éteint : la coupure s'annule. Sans personne suivie,
  pas de coupure automatique (la maison ne sait pas qu'un habitant rentre).
- **Ce que la coupure ne fait pas** : elle vit en mémoire, et c'est la
  TRANSITION « tous absents → un habitant rentre » qui l'arme. Un redémarrage
  de Home Assistant pendant la demi-heure l'oublie donc, et l'habitant déjà là
  au redémarrage n'en déclenche pas de nouvelle : le mode reste allumé jusqu'à
  ce qu'on l'éteigne, ou jusqu'au prochain retour. C'est la même règle que
  pour les lumières éteintes en partant — après un redémarrage, Loggia ne
  prétend pas savoir depuis quand quelqu'un est rentré. La tenir malgré un
  redémarrage demanderait d'écrire l'échéance au magasin, comme le minuteur
  d'extinction (ADR 0068) et le test de sirène (ADR 0065) ; ce n'est pas fait.
- `nuit.py` : l'extinction du coucher lit la désignation dans `loggia_presence`
  et, mode allumé, se retient — une ligne au journal le dit.
  *Corrigé le 23/09* : elle la lisait même quand la **règle de présence était
  éteinte**. L'interrupteur restait alors allumé pour toujours, puisque plus
  rien ne le coupait, et le coucher n'éteignait donc plus jamais rien — sans
  que rien à l'écran ne dise pourquoi. La désignation n'est désormais lue que
  si `presence.actif`, et la carte du mode invité disparaît de l'onglet quand
  la règle est éteinte.
- L'onglet Présence : carte « Mode invité », un choix parmi les
  `input_boolean` de la maison, la bascule qui passe par Home Assistant, et
  la coupure programmée quand elle l'est. Sans désignation, la carte dit
  quoi créer.

Tests : tests/python/test_presence.py (section « Le mode invité »),
tests/python/test_nuit.py, tests/presence_invite.test.mjs.
