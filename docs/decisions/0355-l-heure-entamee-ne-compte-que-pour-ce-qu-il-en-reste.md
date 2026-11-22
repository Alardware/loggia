# 0355 — L'heure entamée ne compte que pour ce qu'il en reste

*13 novembre 2026 — appliqué (v3.100.0)*

## Le problème

Avec un prix qui varie d'heure en heure, Loggia annonce « Le moins cher :
14:00–16:00 » : la fenêtre continue de deux heures la moins chère à venir
(`fenetreMoinsChere`, `tarif.js`). L'heure en cours y comptait pour une heure
entière. À 14 h 50, une tranche bon marché presque finie emportait donc la
fenêtre : dix minutes de prix bas, puis une heure chère, passaient devant
« 16:00–18:00 », réellement moins chère pour qui lance sa machine maintenant.

Un test figeait ce choix (`tests/g3_prix_dynamique.test.mjs`, « l'heure en
cours compte »). Décision du propriétaire, le 12/11 : l'heure entamée ne
compte plus entière.

## La décision

Une fenêtre part de **maintenant**, ou du début d'une tranche à venir, et dure
la durée demandée **au juste** :

- la tranche en cours ne pèse que pour ce qu'il en reste ;
- la dernière tranche est coupée où la fenêtre s'arrête ;
- le prix annoncé est la moyenne de ce que la fenêtre traverse, pondérée par
  la durée.

Quand maintenant reste le meilleur moment, la fenêtre s'écrit de l'heure qu'il
est à deux heures plus tard (« 14:50–16:50 »), et les conseils la disent en
cours.

## Ce qui ne change pas

- Un trou dans la prévision coupe la continuité ; à égalité, la fenêtre la plus
  tôt ; des prix tous égaux ne désignent rien.
- Pour des tranches d'une heure lues à l'heure pile, le résultat est le même
  qu'avant.

## Les conséquences

Avec moins de deux heures de prévision devant soi, plus rien n'est désigné :
la ligne « Le moins cher » disparaît jusqu'à l'arrivée des prix suivants. Avant,
la dernière fenêtre restait annoncée alors qu'elle était à moitié passée.

Pas de redémarrage de Home Assistant. Tests : `tests/audit_1211_lot2a.test.mjs`
(B13), `tests/g3_prix_dynamique.test.mjs` (assertion modifiée).
