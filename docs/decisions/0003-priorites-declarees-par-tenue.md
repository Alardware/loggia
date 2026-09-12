# ADR 0003 — Des priorités déclarées, tenues entité par entité

**Statut** : appliqué (v3.9.0, volets).

## Contexte

« Vent fort passe avant les deux autres » était un ordre d'appels enfoui
dans une fonction. Trois règles visant le même volet donnaient un
comportement imprévisible : la protection solaire baissait un volet
l'après-midi, la fermeture du soir le fermait, puis le soleil quittait la
façade et la protection le « rendait » à sa position d'avant — elle le
rouvrait à la nuit tombée.

## Décision

Chaque règle **déclare un niveau** une fois dans son module
(`volets.PRIORITES` : vent 100, coucher 60, soleil 50, lever 30). Une règle
qui commande avec `tenir=True` **tient** l'entité et la protège des règles
plus faibles jusqu'à la rendre. Face à une tenue, la plus haute l'emporte ;
l'**égalité ne retient pas** ; commander par-dessus une tenue **la reprend**.
Une règle ne rend une entité que si elle la tient encore (`tient()`). Une
tenue oubliée tombe au bout de douze heures — un filet, pas un réglage.
Au-dessus de toutes : une main (ADR 0002).

Le journal dit quand une règle cède : « 1 tenu par vent ».

## Conséquences

- Le rang est une donnée du module, pas de la configuration : l'utilisateur
  ne le règle pas, il le lit (« Qui l'emporte » dans l'onglet).
- Les niveaux d'un module ne disent rien des autres modules. Une échelle
  commune à toute la maison reste à décider (voir ADR 0014).
