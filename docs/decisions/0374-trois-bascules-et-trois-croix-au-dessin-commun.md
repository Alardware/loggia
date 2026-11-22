# 0374 — Trois bascules et trois croix au dessin commun

*15 novembre 2026 — appliqué (v3.100.0). Audit du 12/11, lot 5c : ce qui, dans N3 (« un seul composant par rôle »), change le dessin. Validé le 12/11, puis sur une planche avant / après le 15/11 (« Oui, recommandé »). Pas de redémarrage de Home Assistant.*

## Le problème

Presque toutes les bascules de Loggia font 46 × 26. Trois faisaient 42 × 24,
un rond de 18, sans ombre : le réglage d'un appareil dans sa fiche, la
programmation automatique d'une zone de chauffage, « Ne pas juger cette
mesure » dans la fiche d'un capteur.

La croix qui ferme une fiche fait 34 × 34 partout. Trois avaient la leur : la
fiche d'un rendez-vous (28 px, carrée), le formulaire d'un événement et celui
d'un rappel (30 px, rondes) — avec un autre glyphe, et sans la zone de 44 px
qu'un doigt attrape (ADR 0371).

## La décision

**Les trois bascules prennent le dessin de la bascule de la maison.** 46 × 26,
un rond de 20 avec son ombre, le même gris quand elle est éteinte. Elles
gardent leur geste : l'une a une garde et un libellé qui change (« Couper… »),
l'autre porte le mot « Auto », la troisième est une rangée entière qui bascule.
Elles ne peuvent donc pas devenir `RmBascule` ; elles lisent son dessin, qui
s'écrit une fois — `railBascule` et `rondBascule`, à côté d'elle
(`src/cartes/briques.jsx`) — et qu'elle lit aussi. Son rendu ne change pas
d'une déclaration.

Deux règles ont décidé de l'endroit. `src/styles.js` ne porte aucune couleur en
dur, et le gris du rail éteint en est une : le dessin n'y va pas. Et
`RmBascule` garde sa position ÉCRITE sur elle — c'est ce qui la fait passer
au-dessus de la surface de sa carte (lot 13), et deux tests le lisent là.

**Les trois croix prennent le dessin de la croix commune.** 34 × 34, coins de
10, le même glyphe — `DESSIN_CROIX` et `CROIX` (`src/ui.jsx`), que
`CroixFeuille` lit aussi. Elles gardent leur bouton : elles ferment un panneau
posé DANS la feuille, et `CroixFeuille` fermerait la feuille entière. Elles
reçoivent la zone de 44 px d'un doigt (`o-doigt`).

**Un écart, à découvert.** Les deux formulaires sont posés sur un panneau déjà
teinté (`--o-s1`) : la croix commune, du même fond, s'y fondrait. Leur croix
garde donc le fond d'un cran plus clair qu'elle avait (`--o-s2`). La forme, la
taille et le glyphe sont ceux de la croix commune.

**Le seuil de 1180 px reste.** Les marges du puits d'Énergie changent à 1180 px
inclus dans la feuille quand le code dit « large » à partir de 1180. C'est la
seule largeur touchée, et c'est celle d'une tablette de 11 pouces couchée : la
corriger se verrait chez qui en a une. Son choix : laisser.

## Ce qui n'est pas fait

- **Les deux dessins de bascule** — celle des cartes (`RmBascule`, rond blanc,
  ombre) et celle des réglages (`Bascule`, rond gris quand elle est éteinte) —
  restent deux. Ils font la même taille ; les réunir changerait une
  soixantaine de bascules.
- **La bascule des tuiles de pièce** (44 × 25) reste : c'est sa maquette du
  08/11.

## Les conséquences

Les trois bascules grandissent de 4 px en largeur et de 2 px en hauteur ; leur
rangée ne change pas de hauteur. La fiche d'un rendez-vous grandit de 6 px, les
deux formulaires de 4 px. Aucun texte neuf, aucun catalogue touché. Une
assertion existante est modifiée : la taille de la croix commune se lit dans
`DESSIN_CROIX`, là où elle est écrite (`tests/feuilles.test.mjs`). Test :
`tests/audit_1211_lot5c_dessin.test.mjs`.
