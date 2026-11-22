# 0366 — Ce qui sort du serveur suit les droits du compte

*14 novembre 2026 — appliqué (v3.100.0). Le serveur change : Home Assistant doit être REDÉMARRÉ à l'installation.*

## Le problème

La décision 0279 a filtré le journal des règles (`regles/etat`) par les droits
de lecture du compte, et laissé trois points ouverts. Ils concernent un compte
dont Home Assistant restreint la lecture — rare, mais c'est pour lui que la
restriction existe.

- **Les rappels et les minuteurs** se lisaient par la lecture de la
  configuration : tout compte y trouvait ceux des autres, avec leur auteur et
  des entités hors de ses droits. Leurs commandes à eux (`rappels/etat`,
  `minuteurs/etat`) filtraient déjà.
- **Le journal de six modules** (volets, fenêtres, présence, veilles,
  scénarios, robots) sortait en entier : un compte restreint y lisait les
  entités que le journal des règles lui taisait.
- **Le signal « la configuration a changé »** disait à tous les écrans QUEL
  compte venait d'écrire, et le nom de ses réglages personnels.

## La décision

- La lecture de la configuration ne rend plus `loggia_rappels` ni
  `loggia_minuteurs`. Le client ne les lisait jamais là.
- Le journal, les tenues et les ordres en attente de ces modules passent par le
  même filtre que le journal des règles, à la sortie des commandes : aucun
  module ne change.
- Le compte qui écrit n'est dit qu'à ses propres écrans, qui s'en servent pour
  relire ses réglages personnels. Les autres comptes ne reçoivent que les clés
  communes qui ont changé, et rien s'il n'y en a pas.

Un administrateur, et un compte que Home Assistant ne restreint pas — presque
toutes les installations —, reçoivent exactement ce qu'ils recevaient.

## Les conséquences

- L'export de la configuration ne contient plus les rappels ; un import ne
  remplace plus les rappels en cours (sauf avec un fichier exporté avant).
- Les sauvegardes du composant gardent les deux tables comme avant.

## Ce qui reste ouvert

Le détail écrit d'une ligne de journal, et quelques tables d'état des modules
(les fenêtres qui coupent, les volets abaissés) ne sont pas filtrés ; la
lecture de la configuration rend toujours les réglages des modules.

Tests : `tests/python/test_audit_1211_lot3_confidentialite.py`.
