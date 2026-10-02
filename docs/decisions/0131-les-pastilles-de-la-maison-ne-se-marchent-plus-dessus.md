# 0131 — Les pastilles de la maison ne se marchent plus dessus

Date : 02/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti.

Le schéma Énergie pose jusqu'à six pastilles autour de la maison : irradiance,
production, voiture, batterie, consommation, réseau. Cinq sont à des places
fixes ; celle du **soleil** suit l'astre, et se retrouvait donc parfois sur une
voisine — « le capteur du soleil se superpose, place-le de l'autre côté ».

**Le calcul n'évitait qu'une seule pastille**, celle de la production. En fin de
journée le soleil descend à droite, et l'irradiance venait se poser sur celle du
réseau — qui n'était pas dans le calcul. Le défaut n'était donc pas un oubli de
quelques pixels : c'était une liste incomplète, qui ne pouvait que laisser
passer les cas qu'elle ne nommait pas.

**Décidé :** les trois positions fixes sont **nommées dans le code**, et la
pastille du soleil essaie le côté naturel, **puis l'autre**, et ne remonte qu'en
dernier recours. Ajouter une pastille fixe sans l'ajouter à cette liste
ramènerait le défaut par le même chemin — le commentaire le dit sur place.

**Deux corrections se sont croisées, et les deux étaient justes.** La décision
0128, écrite en parallèle, plafonnait la hauteur de la pastille à 150 pour la
garder dans le dôme de l'arc : au lever et au coucher, le soleil descend vers
205-235 et la pastille partait rejoindre le pylône, en bas à droite. Ce plafond
est conservé **avec** l'essai de l'autre côté — l'un traite la hauteur, l'autre
le côté, et aucun des deux ne suffisait seul.

---

**Et moins de pastilles sur les petits écrans.** Elles ne rétrécissent pas avec
l'écran : à six sur un téléphone, elles se marchent dessus quoi qu'on fasse.

- **Ordinateur** : toutes.
- **Tablette** : sans la **voiture**. Elle se pose sur le garage, la partie du
  dessin qui se réduit le plus.
- **Téléphone** : sans le **panneau**. La production reste lisible juste
  dessous, dans les chiffres de la vue.

Le format vient du même calcul que partout ailleurs — `formatEcran`, la souris
pour l'ordinateur, le doigt au-delà de 1180 px pour la tablette. Pas de
nouveau seuil : un seuil de plus serait un seuil à maintenir.
