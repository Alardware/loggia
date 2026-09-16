# 0033 — La vue Sécurité parle comme l'Accueil

Date : 16/09/2026 (v3.34.0). Statut : acceptée. Suite de la refonte de
l'Accueil (ADR 0028 à 0032) : l'étape 7, proposée à l'utilisateur à la place
d'une troisième page « alarme » sur téléphone, et lancée par son « go ».

## Contexte

La carte Sécurité de l'Accueil dit tout en une seconde (ADR 0028) ; la vue
Sécurité, elle, gardait son vocabulaire d'avant — une sous-ligne de comptes,
un résumé des ouvrants en trois lignes, pas de point d'attention. On passait
de l'une à l'autre en changeant de langue. L'utilisateur avait imaginé une
page de plus sur téléphone pour une « vue alarme repensée » ; trois pages,
c'est une de trop à retenir, et la Sécurité a déjà sa vue : c'est elle qui
prend le langage de l'Accueil, et que l'on atteint d'un tap sur la carte.

## Décision

- **L'état en une seconde**, en tête de la vue : « Alarme désarmée · Tout est
  sécurisé » en vert, ou en ambre ce qui ne l'est pas — la même phrase que la
  carte de l'Accueil, portée par une seule fonction pure. Dessous, la même
  rangée de tuiles (portes, fenêtres, mouvement, caméras), désormais un seul
  composant ; sur l'Accueil une tuile mène à la vue, dans la vue elle défile
  jusqu'à sa section.
- **« À surveiller » dans la vue**, après les modes d'armement, seulement quand
  il y a un point, et seulement ceux de la sécurité : l'alarme, les capteurs
  de sûreté, un ouvrant ouvert alarme armée, une caméra hors ligne. Pas le
  CO₂ ni les piles, qui ont leur place ailleurs.
- **Un ouvrant, une carte** : la carte des pièces, avec la porte ou la fenêtre
  dessinée en fond que l'utilisateur aime, les ouverts d'abord ; elle ouvre sa
  fiche. Le résumé de trois lignes quitte la vue (il reste au catalogue). La
  présence garde sa carte.
- **Un tap sur la carte Sécurité de l'Accueil** ouvre la vue, sur tous les
  écrans ; les boutons d'armement et la serrure restent en dessous, hors du
  tap. Les modes de la vue, le code, le décompte d'armement ne changent pas.

## Conséquences

La vue reçoit la navigation (pour les points qui mènent ailleurs et les
fiches). Le mouvement n'a pas de section propre : sa tuile défile jusqu'au
journal, où il se lit. Non fait : la grille « 2+1 » (Sécurité et À surveiller
côte à côte sur PC) et la page alarme à gauche sur téléphone — l'utilisateur
ne les a pas tranchées.
