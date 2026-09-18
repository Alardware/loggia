# 0044 — La carte CO₂ du rail de l'Accueil

Date : 18/09/2026 (v3.46.0). Statut : acceptée. Une capture fournie par
l'utilisateur — « CO₂ · Chambre · Aérer au-dessus de 1000 ppm », l'étendue
« 24 h · 520 – 1240 ppm », une barre par heure avec la dernière plus sombre,
l'axe « −24 h · −12 h · maintenant », un bouton « Ouvrir les volets · aérer » —
avec une consigne : « j'aime beaucoup cette carte CO₂ ».

## Contexte

Le CO₂ vit déjà à trois endroits : la barre de confort des pièces (ADR 0039),
la carte « À surveiller » quand une pièce passe le seuil (ADR 0028), la veille
CO₂ du serveur qui prévient et ventile. Aucun ne montre la JOURNÉE : on voit
que la chambre est à 1 240 ppm, pas qu'elle y monte chaque nuit. La capture
vient d'ailleurs : elle donne une disposition, pas une palette (ADR 0038).

## Décision

- **Un widget EN OPTION du rail de l'Accueil, « CO₂ »** — le mécanisme de
  l'ADR 0041 (`WIDGETS_OPTION`) : absent par défaut, ajouté en mode édition,
  retiré par la croix. Les blocs d'information vont dans le rail.
- **La pièce la plus chargée, la seule qui compte** : parmi les capteurs de
  CO₂ des pièces (ceux de la barre de confort), celui dont la valeur est la
  plus haute donne son nom et sa courbe. Sans capteur de CO₂, le widget
  n'existe pas — même en option.
- **Une barre par heure, moyenne pondérée par le temps** de l'historique
  Home Assistant des vingt-quatre dernières heures (relu toutes les cinq
  minutes) ; la dernière barre est le moment, pleine. Avant le premier point
  on ne sait rien : la barre est nulle, en gris — pas zéro. L'étendue
  « min – max » comprend le moment.
- **La couleur dit l'état** : au-dessus du seuil, l'ambre ; en dessous,
  l'accent du thème. Les teintes sont celles des cartes du rail.
- **Le seuil est celui de la veille CO₂ du serveur** quand elle répond, sinon
  le seul chiffre de la maison (`SEUIL_CO2`, 1 200 ppm) — pas un troisième
  réglage. « Aérer au-dessus de N ppm » le dit.
- **Le bouton n'existe que s'il y a quelque chose à commander** : la
  ventilation de la veille CO₂ (« Ventiler »), sinon les volets de la zone du
  capteur qui savent s'ouvrir (« Ouvrir les volets · aérer »), sinon rien.

## Conséquences

Ce qui se calcule vit dans `src/air.js`, pur et testé à sec
(tests/accueil_co2.test.mjs, 26 mutations tuées) ; `Co2Rail`
(src/widgetsrail.jsx) ne garde que le dessin et la relecture de l'historique.
La démo rattache ses capteurs de CO₂ et ses volets à leur pièce et trace une
journée plausible. Non fait : un capteur au choix quand il y en a plusieurs, la
courbe sur la fiche du capteur, un seuil par pièce. Vérifié en démo seulement.
