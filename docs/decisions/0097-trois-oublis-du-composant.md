# 0097 — Trois oublis du composant : une écoute, un journal, une veilleuse

Date : 27/09/2026. Statut : appliqué (local). **Redémarrage de Home Assistant
requis** — le composant change, et un rechargement d'entrée ne relit pas les
modules Python. Deuxième point de l'audit du 27/09.

Trois défauts sans rapport de surface, mais de même famille : à chaque fois,
quelque chose est posé au démarrage et personne ne le reprend.

## 1. L'écoute de l'arrêt ne partait jamais

`Regles.__init__` s'abonnait à `homeassistant_stop` pour écrire le journal
avant que le process ne s'éteigne (audit du 18/09). Le désabonnement que rend
`async_listen_once` partait à la poubelle, et `arreter()` ne le retirait pas —
alors qu'elle retire déjà l'écoute des gestes juste au-dessus.

Conséquence : chaque rechargement de l'intégration laissait une instance
`Regles` accrochée au bus. Elle n'était plus dans `hass.data`, plus personne ne
lui parlait, mais elle vivait — et le jour de l'arrêt réel, autant d'écritures
concurrentes du même fichier de journal qu'il y avait eu de rechargements.

Le désabonnement se garde maintenant dans `self._defait_arret`, et part avec le
reste. `_sur_arret` l'oublie de son côté une fois déclenché : Home Assistant
retire lui-même une écoute `once`, la garder ferait mentir `arreter()`.

## 2. Les vingt dernières secondes du journal disparaissaient

Le journal s'écrit en différé, vingt secondes après la dernière ligne
(`DELAI_ECRITURE`). `arreter()` **annulait** ce rendez-vous sans jamais écrire
ce qu'il retenait — quand `_sur_arret`, le même geste à l'arrêt réel, écrit
avant de partir, et que `__init__.py` le promet noir sur blanc dans son texte.

Ce qui partait en silence, c'est précisément le journal qu'on vient consulter
après coup pour comprendre une règle qui ne s'est pas déclenchée. Et il partait
au pire moment : quand on recharge l'intégration, c'est-à-dire justement quand
on est en train de déboguer.

`arreter()` écrit maintenant ce que le différé retenait. **Seulement si une
écriture était en attente** : `_entrees` porte tout le journal, déjà relu du
magasin, et sans cette garde chaque rechargement réécrirait à l'identique un
fichier de cinq cents lignes.

## 3. La veilleuse ne se réarmait pas après un redémarrage

`LoggiaNuit` ne réagit qu'à une **transition** vers « on » : c'est
`_sur_lampe`, branché sur les changements d'état, qui pose la minuterie. Un
redémarrage de Home Assistant pendant qu'une veilleuse brûle n'en produit
aucune. La lampe restait donc allumée jusqu'au matin — l'exact contraire de ce
que le module promet, et sans un mot.

`minuteurs.py` et `sirene.py` reprennent déjà leurs rendez-vous au démarrage
(règle « action différée = serveur ») ; la veilleuse ne le faisait pas.
`_async_reabonner` termine désormais par une reprise : toute lampe de la liste
qui brûle reçoit sa minuterie. `_async_armer` garde toutes ses conditions —
module actif, lampe de la liste, plage du soir, pas de minuterie déjà posée.

**La durée reposée est pleine.** Le temps déjà écoulé est perdu avec la
mémoire, et mieux vaut laisser brûler un peu trop que couper au nez de
quelqu'un.

### Ce qu'on ne répare PAS, et pourquoi

L'éclairage nocturne souffre du même oubli, et il faut le laisser. Il n'éteint
que ce qu'il a lui-même allumé — `self.allumees`, une liste qui ne vit qu'en
mémoire. Après un redémarrage il ne peut plus prouver qu'une lampe est à lui,
et la règle du projet est claire : « une lampe déjà allumée n'est pas à nous ».
Réarmer là reviendrait à éteindre des lampes que quelqu'un a allumées lui-même.

La veilleuse peut le faire parce que sa définition l'y autorise : elle éteint ce
qu'une **main** a allumé. Toute lampe de sa liste qui brûle lui revient, sans
qu'elle ait rien à se rappeler.

## Les garde-fous

Six tests, vérifiés dans les deux sens — chacun échoue quand on retire son
correctif :

- l'écoute de l'arrêt part avec le module (`FauxBus` rend un désabonnement
  qu'on vérifie retiré) ;
- le journal en attente est écrit au rechargement ;
- un rechargement sans ligne en attente n'écrit rien ;
- une veilleuse déjà allumée est reprise au démarrage ;
- une veilleuse éteinte n'est pas reprise ;
- un module débrayé ne reprend rien.

Un test existant a dû être ajusté, et c'est la reprise qui a raison :
`test_la_veilleuse_eteint_ce_qu_une_main_a_allume` pose `duree: 0` sur une
lampe déjà allumée, donc la reprise l'éteint au montage. Le test ne parle que
du gel de la main ; il repart de zéro après le montage.

579 pytest, 991 tests JS, lint et audit propres.
