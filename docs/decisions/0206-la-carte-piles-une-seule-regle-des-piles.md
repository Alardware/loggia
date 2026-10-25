# 0206 — La carte Piles ; une seule règle des piles

*16 octobre 2026 — accepté, à l'essai (chantier Capteurs, étapes 2 et 3 ; rien de publié). C32 et C33 de `docs/chantier-capteurs-etapes-2-3.md` ; § 19.2 et 19.8, tranchés le 16/10.*

## Le problème

Les piles n'avaient pas de carte dans Objets : `pilesMaison` (piles.js) les listait pour
la vue Énergie seulement. Trois règles de couleur coexistaient : `niveauPile`
(attention.js, ambre à 20 %, rouge à 5 %) pour la plante, les robots et le point
d'attention ; « rouge sous 20 %, ambre sous 50 % » pour le coin d'un capteur et la rangée
Pile des fiches — une pile à 45 % s'y écrivait en ambre ; et la veille des piles du
serveur, réglée à 15 % chez lui. Une pile pouvait être sur la carte et pas dans le rail.

## La décision

**Qui est une pile (C32, § 8)** — `pilesDeLaMaison` (piles.js, pur) : les piles de
`pilesMaison` (ni masquées, ni désactivées, ni les téléphones), plus le `binary_sensor`
de classe `battery` d'un appareil physique qui n'a pas de pile chiffrée (allumé :
« faible ») ; moins un appareil qui porte un aspirateur, une tondeuse ou un
`battery_charging` (une batterie rechargeable), moins la batterie de la maison (le rôle
`batSoc` d'Énergie, que l'écran exclut). La liste de la vue Énergie ne change pas. Le nom
d'une pile est celui de son appareil, sinon celui de Home Assistant.

**UN seul seuil (§ 19.8).** Celui de sa veille des piles — son réglage de Règles ›
Veilles, 15 % par défaut —, relu avec les veilles du serveur (`loggia/veilles/etat`,
`reglerSeuilPile`, attention.js) et retenu pour toute la règle ; « critique » à 5 %. La
carte Piles, le compte « à regarder », le coin d'un capteur (`PileRepere`), la rangée
Pile des fiches (`RangeePile`, fichecapteur.jsx), la valeur d'une pile dans la fiche
universelle, la plante et les robots lisent `niveauPile` et `couleurPile`
(attention.js) ; la glyphe vient de `glyphePile` (piles.js). Deux seuils donneraient une
pile sur la carte et pas dans le rail. Le 20 % de la maquette tombe : la démo met la
fenêtre de la chambre à 12 % pour que « 3 piles à changer » reste vrai.

*Passe bis du 17/10.* Le seuil se relit UNE fois, à la racine de l'écran (`App`,
`useSeuilPile`), avec les veilles — plus depuis la carte Piles, la section Plantes et
piles ni la popup : réglé là, l'Accueil (« En ce moment », les points d'attention,
`deriveNotifs`) jugeait au défaut tant qu'on n'avait pas ouvert Objets › Capteurs, et
chaque montage remettait le seuil au défaut le temps que la veille réponde. Une réponse
vide ou illisible garde le dernier seuil connu ; sans serveur — la démo —, le défaut.

**La carte** — `RoomPilesCard`, dans la carte des groupes (ADR 0203) : la plaque
`battery-quarter`, ambre ou rouge avec des piles à changer, sinon neutre ; « Piles » ; la
phrase : « {k} piles à changer » (ambre ; rouge si l'une est au critique), sinon « {k}
piles sans nouvelles » (ambre), sinon « {n} piles · la plus basse à {p} % » (neutre — un
fait qui change, pas un « Tout va bien ») ; le chiffre {k} et « ≤ 15 % » dessous,
seulement s'il y en a à changer ; les puces : celles à changer (« {nom} · 14 % », « {nom}
· faible »), puis les muettes, au calme la plus basse. Elle s'abonne à ses piles, jamais
au domaine, et relit le seuil avec les veilles.

**La popup** — `Piles`, fichegroupe.jsx, par la même coquille : toutes les piles, celles
à changer d'abord, puis celles qui tiennent (la plus basse en tête), les muettes à la fin
(« sans nouvelles depuis sam. 14:05 ») ; une rangée chacune — l'appareil, sa pièce, la
glyphe au niveau, le pourcentage à la règle de la maison — ; une rangée ouvre la fiche de
l'APPAREIL ; une note dit le seuil et le critique. La pile faible d'un ouvrant n'est pas
sur la carte Ouvertures (§ 19.2) : dans sa popup et sur la carte Piles seulement.

**Plantes et piles juge (C33)** : Piles est « à regarder » dès qu'une pile est à changer
ou muette ; la section ne dit « Rien à signaler » que si tout est jugé et que rien ne
presse. Dans Objets, `groupe:piles` compte ses piles parmi les appareils reliés et ses
muettes parmi les entités absentes.

## Ce que cela coûte

Une lecture des veilles de plus, à la racine, toutes les 30 s (passe bis du 17/10 ; avant,
une par carte Piles et par section). Les piles des plantes sont des piles comme les autres :
le Monstera à 4 % met la carte en rouge. Sans serveur — la démo —, le seuil est le défaut.
Un `moisture` calculé n'est pas une fuite, côté écran aussi (ADR 0022, 16/10) : l'Accueil,
« En ce moment » et Paramètres › Alertes lisent la plateforme dans l'index.

## Ce qu'on n'a pas fait

La veille des piles compte encore les téléphones et les robots (hors chantier) ; l'écran
Énergie garde ses cartes à cinq barres et son filtre à 35 %.

## Ce que les tests tiennent

`tests/piles_carte.test.mjs` : qui est une pile, la vue et ses trois phrases, le seuil
relu, `niveauPile`, `couleurPile` et `glyphePile`, la carte et la compacte, Objets et la
section, la popup jouée, la seule règle (plus de « 20 / 50 » en dur), la démo ;
`tests/etats.test.mjs` et `tests/ouvrants.test.mjs` (assertions modifiées) ;
`tests/fuite_calculee.test.mjs` pour le `moisture` calculé.
