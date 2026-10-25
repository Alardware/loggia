# 0191 — Les réglages d'un volet vivent dans sa popup

*13 octobre 2026 — accepté, à l'essai (chantier Volets : plan 1, tâche 7 ; plan 2, tâche 13 ; rien de publié)*

À la question « que fait-on de Paramètres › Règles › Volets, et des jours d'un
volet "Heures à lui" ? », il a répondu le 13/10 : « Les deux ».

## Le problème

La fiche d'un volet (ADR 0188) règle ses heures, ses jours, sa façade et la
porte devant lui. Paramètres › Règles › Volets les réglait aussi, volet par
volet. Un même réglage avait donc deux endroits.

Les jours propres d'un volet, eux, ne faisaient que RESTREINDRE ceux de la
maison, vérifiés en premier (`volets.py`, `_async_planifie`). Dans une maison
réglée du lundi au vendredi, une chambre réglée sur le week-end ne s'ouvrait
donc jamais. Et dans la fiche, une puce allumée pouvait annoncer un jour où le
volet ne bougerait pas.

## La décision

**V2.** Les trois listes « volet par volet » quittent Paramètres :
- « Comme les autres · Heures à lui · Jamais », avec les décalages et les jours
  propres ;
- « Où donne chaque volet » ;
- la porte devant chaque volet.

Une ligne dit où ces réglages se trouvent maintenant : « Chaque volet se règle
dans sa popup ».

Ce qui vaut pour toute la maison reste dans Paramètres :
- l'interrupteur et le mode du lever et du coucher, ainsi que leurs décalages
  et leurs jours ;
- les seuils de la protection solaire et son thermomètre ;
- le vent fort et les fenêtres de toit ;
- l'interrupteur de « Volet bloqué » ;
- les tentatives et les dernières manœuvres ;
- « Observer sans agir » ;
- l'avertissement des ouvrants sans classe.

**V5.** Les jours propres d'un volet « Heures à lui » REMPLACENT ceux de la
maison. Sans jours propres, le volet suit la maison. Une liste propre vide veut
dire « jamais dans ce sens ».

« Heures à lui » se reconnaît au drapeau `perso`, ou à l'ancienne forme : un
décalage propre sans drapeau. Des jours propres sur un volet « Comme les
autres » ne comptent plus (l'écran n'écrit pas cette forme) : ce volet suit la
maison.

Le moteur, le calcul (`volets_calcul.py`) et son jumeau
(`src/voletsplanning.js`) changent ensemble, et la fixture partagée les tient
d'accord. Dans la fiche (`JOURS_PROPRES = 'remplacent'`), les sept puces
s'ouvrent, et la semaine les montre.

Chez lui, rien ne change :
- les sept jours de la maison sont cochés ;
- sa chambre garde ses propres jours d'ouverture, c'est-à-dire aucun, puisqu'il
  travaille de nuit.

**V11.** Choisir une façade dans la fiche allume la protection solaire si elle
est coupée. Choisir une porte allume « Volet bloqué ». Choisir « Aucune »
n'éteint rien. C'est la règle du 07/10 : tout doit marcher sans configurer.

## Ce qu'on n'a pas fait

Les réglages de toute la maison ne vont pas dans la fiche d'un volet. Le mode
de la maison y est seulement montré ; il se change par sa liste (« Pour tous
les volets »).

## Ce que les tests tiennent

**Écran**
- `tests/regles.test.mjs` : ce qui part, ce qui reste, et le réglage « Heures à
  lui » qui se fait dans la fiche.
- `tests/voletsfiche.test.mjs` : V5 et V11.
- `tests/rien_en_francais_expressions.test.mjs` : les points cardinaux de la
  fiche.

**Serveur et calcul**
- `tests/python/test_volets.py` : V5 dans `_async_planifie` et
  `volets_du_jour`. Trois tests d'avant gagnent `perso`, puisque des jours
  propres sans « Heures à lui » ne comptent plus.
- `tests/python/test_volets_calcul.py` et `tests/voletsplanning.test.mjs` : la
  fixture `tests/fixtures/volets_parite.json`, qui gagne les cas e, f et g.
