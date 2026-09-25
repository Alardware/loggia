# ADR 0094 — Un seuil de CO₂ par pièce

**Date** : 2026-09-25
**Statut** : décidé et appliqué ; gardé en local.

Quatrième des quatre points d'**A8**. L'ADR 0044 laissait trois choses « non
faites » : « un capteur au choix quand il y en a plusieurs, la courbe sur la
fiche du capteur, un seuil par pièce ».

## La première était déjà faite

**Le capteur au choix existe depuis longtemps.** Chaque pièce désigne le sien
dans l'éditeur d'entités (`haid.co2`), et `co2Id` en découle directement. Le
« non fait » était périmé.

C'est la **cinquième** fiche du plan du 22/09 qui se révèle fausse à la
vérification, après S1, S3, S5 et S8. La leçon tient : lire le code avant de
croire une note, même une note qu'on a écrite soi-même.

La courbe sur la fiche du capteur n'a pas été demandée et reste ouverte.

## Le vrai sujet : « le pire » ne voulait rien dire

La carte CO₂ du rail montre **la pièce la plus chargée**. Elle la choisissait
sur le chiffre le plus haut, et comparait tout le monde au seuil de la maison
(1 400 ppm par défaut).

Or une chambre et un séjour ne demandent pas le même confort. Avec un seuil par
pièce, « le plus chargé » devient ambigu — et le chiffre brut devient le
mauvais critère :

> Une chambre réglée à 1 000 ppm qui en affiche **1 100** est plus urgente qu'un
> séjour réglé à 1 600 qui en affiche **1 400**, même si 1 400 est le plus gros
> nombre des deux.

## La décision

**Un seuil facultatif par pièce**, et un classement sur **l'écart au seuil**,
pas sur les ppm.

- Une colonne « Seuil CO₂ » dans l'éditeur d'entités, à côté du capteur. Un
  nombre, vide par défaut.
- `pireCapteur` prend le seuil de chaque capteur quand il existe, celui de la
  maison sinon, et retient le plus grand rapport `valeur / seuil`.
- La carte annonce le seuil de **cette** pièce, pas celui de la maison.

**Rien ne bouge pour qui n'a rien réglé.** Sans seuil par pièce, tout le monde
partage celui de la maison : les rapports sont proportionnels aux valeurs, et
le classement est exactement celui d'avant. C'est vérifié par un test, pas
supposé.

**Un seuil absurde retombe sur la maison** : zéro, négatif, ou illisible. On ne
divise pas par ce qu'on n'a pas compris.

## Conséquences

- Deux textes nouveaux dans les sept langues : « Seuil CO₂ » et « 1400 par
  défaut ».
- Une clé de plus dans la configuration d'une pièce, `haid.co2seuil`, un entier
  ou `null`. Une valeur illisible ne s'enregistre pas — elle devient `null`.
- Le seuil de la veille CO₂ du serveur reste le **défaut de la maison**
  (`seuilCo2`) : on ne le remplace pas, on l'affine pièce par pièce.
- Rien côté serveur, aucun redémarrage de Home Assistant.

## Vérifié à l'écran

La colonne « SEUIL CO₂ » apparaît dans l'éditeur d'entités, entre « CO2 » et
« LAMPES DU BOUTON ».

Tests : `tests/accueil_co2.test.mjs` — le classement par écart au seuil (une
chambre à 1 100/1 000 passe devant un séjour à 1 400/1 600), le retour au
comportement d'avant sans réglage, le défaut de la maison, et les deux seuils
absurdes.
