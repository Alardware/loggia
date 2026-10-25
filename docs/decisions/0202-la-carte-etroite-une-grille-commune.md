# 0202 — La carte étroite : le modèle 1c, une grille commune

*15 octobre 2026 — accepté, à l'essai (passe téléphone, rien de publié). Remplace, pour la carte étroite, ce que les ADR 0188, 0193, 0196 et 0197 en disaient.*

## Le problème

> « ok pour 1c » — 15 octobre

Au téléphone, deux colonnes de cartes de 141 à 176 px de large. Sous 188 px de
contenu, chaque carte avait sa disposition étroite, écrite dans son propre bloc de
`index.css` : le chauffage, le volet, la prise, la lumière. Le 15/10 au matin, la
lumière et le volet avaient pris celle du radiateur (ADR 0197, 0188) : le texte effacé
dans la grille du milieu (`display: contents`), le nom en 13 px à côté d'un chiffre de
20 px. Chez lui, cela donnait « Climatisati… », « Prise PC Bureau (… » et un chiffre
serré contre le nom. Les bascules se tenaient en haut à droite de la lumière, de la
prise, du radiateur et de la clim ; la prise descendait sa puissance au pied, écrivait
sa phrase sur deux lignes et montrait Annuler et Couper en glyphes. Claude Design lui a
proposé trois colonnes : il a pris 1c, « Moyennes avec réglages », avec trois
ajustements (T1 à T3) ; la conception (`docs/chantier-cartes-telephone.md`) tranche le
reste (T4 à T18).

## La décision

**Une grille commune (T4).** Sous 188 px de contenu, toute carte au gabarit qui porte
`o-gabarit` prend la même disposition, de haut en bas : la plaque à gauche et le CHIFFRE
à droite ; le nom EN ENTIER ; la phrase ; UNE ligne de commandes de 44 px, collée au
pied par sa marge auto. Un seul bloc de `index.css` la porte, à la place des quatre
d'avant ; le seuil ne bouge pas. C'est la règle de toute carte nouvelle au téléphone :
la carte d'une mesure la prendra (ADR 0200).

**Deux écritures.** Ce qui change de place — le chiffre, la bascule, le cadenas, le
pied d'une prise, une phrase qui a sa forme courte — s'écrit deux fois, `o-seul-large`
et `o-seul-etroit`, et la feuille n'en montre qu'une, en `display: none !important`
(hors de l'arbre d'accessibilité et du parcours au clavier). Sans requêtes de conteneur
(Safari 15 et avant), la carte large seule.

**Le budget en hauteur** : 38 (la plaque) + 10 + 2 × 16 (le nom) + 2 + 15 (la phrase)
+ 9 + 44 (la ligne de commandes) = 150 px, le contenu de la carte de 184 px. Un nom
d'une ligne rend 16 px, que la marge auto du pied absorbe (ADR 0179). Les tailles, les
écarts et les rembourrages ne changent pas (T5).

- **Le chiffre** (T6) : celui de la carte d'un capteur, 22 px / 800, l'unité en 12 px
  au gris doux, 4 px sous le haut de la plaque. Sa largeur en em (`emChiffre`) le fait
  rétrécir jusqu'à 16 px sans se couper : « 1,95 kW » en 19,8 px à 320 px dans Objets,
  18,8 dans une vue personnelle. Caché au lecteur quand la surface le dit déjà ; lu
  pour la température d'un chauffage.
- **Le nom** (T7) : 14 px / 600, deux lignes au plus, passé à la ligne entre deux mots ;
  une troisième ligne, ou un mot plus large que la carte, finit en « … » (la règle R8).
- **La phrase** (T8) : une ligne, de 12 à 10,5 px d'après sa longueur, « … » en dernier
  recours. Une lampe allumée l'écrit à son encre, lisible comme un texte sur son lavis :
  de 5,5 à 9,7:1 mesurés, en thème sombre et clair, Loggia et iOS.
- **La lumière** (T1, T12) : la plaque est l'interrupteur — un `<button role="switch">`,
  nommé comme la bascule, 44 × 44 de toucher, qui n'ouvre pas la fiche ; muette,
  inerte, et le toucher la traverse (`pointer-events: none`) jusqu'à la surface, qui
  ouvre la fiche. Un glissé qui part d'elle fait défiler la page et n'allume rien. La
  barre reste la ligne du bas.
- **Le chauffage** (T9, T13, T18) : la bascule part, la marche et l'arrêt sont dans la
  fiche. − et + font 44 px dès 142 px de contenu, puis cèdent, jamais sous 28 px ; un
  mot de mode long élargit sa place. L'étiquette passe en minuscules, de 10 à 8 px.
- **Le volet** (T14) : Monter, Stop et Descendre se partagent la ligne ; le petit volet
  et le mot « Stop » restent à la carte large.
- **La prise** (T10, T11, T17) : la bascule à gauche ; à droite, les kWh du jour, de 13
  à 10,5 px, « Aujourd'hui » dessous. Allumée et gardée — protection pas encore lue —,
  sa bascule ouvre la fiche (`appuiBascule` → « fiche ») : la carte étroite ne demande
  pas sur place ; coupée, elle envoie `turn_on`. Protégée, une pastille, le cadenas et
  « Protégée », sans interrupteur ; le mot s'efface sous 140 px de contenu. La forme
  courte, « Depuis le 4 sept. », seulement si l'état se voit : sans protection, ou
  allumée. Protégée et coupée, la pastille ne dit rien de l'état : « Coupée depuis le
  5 oct. » reste entière. À l'heure, la phrase reste entière.

**La borne du démarrage ne se relève pas (T16).** Le contenu de la feuille d'un lecteur
(`RoomMediaSheet`, devenu `FicheMediaContent`) passe à la demande AVANT que les cartes
n'entrent : le boot passe de 1 098 820 à 1 087 434 octets, le contenu pèse 12 Ko dans son
morceau ; il finit à 1 090 737 octets, 9 263 sous la borne de 1 100 000. La coquille
(`FicheMedia`, App.jsx) garde la feuille et pose la frontière Suspense DEDANS, sur le
patron de `FicheLumiere` : un morceau qui ne se charge pas (hors ligne, page périmée) se
dit dans la feuille, par sa barrière — jamais à la place de la vue Objets.

**Les cartes larges ne changent pas**, ni les compactes, ni les popups : à 1440 et
1280 px, les 50 cartes d'Objets sont, élément par élément — position, taille, police,
couleur —, celles d'avant la passe.

## Ce que cela coûte

Deux écritures dans le DOM : chaque test vise la sienne. `defaireDemande` rend le focus à
la bascule de la carte qui se voit. Pendant la demande, la ligne de commandes étroite n'est
pas rendue : il ne reste que la bascule de la carte large, que la feuille cache sur une
carte devenue étroite pendant les 6 s. Le focus va alors à la surface de la carte, le
bouton qui l'ouvre : il reste dans la carte, jamais sur la page. Ses habitudes : un
toucher sur l'ampoule ouvrait la fiche ; sur une carte étroite, il allume ou éteint (T1) —
sauf sur une lampe muette, où il ouvre la fiche comme avant.

Ce qui finit encore en « … », mesuré dans la démo (Objets, Pièces, une vue
personnelle ; 390, 360 et 320 px ; français, allemand, polonais) :
- les phrases longues : « Terminé à 16:14 · 1,08 kWh » et « Indisponible depuis
  14:20 » dès 360 px, « En marche depuis 08:50 » et « Ouvre demain à 08:18 » à 320 px ;
  en allemand « Fertig um 16:14 · 1,08 kWh » et « Nicht erreichbar seit 14:20 » dès
  360 px, « Öffnet morgen um 08:18 » à 320 px ; en polonais « Zakończono o 16:14 ·
  1,08 kWh » dès 390 px, « Niedostępne od 14:20 » et « Otworzy się jutro o 08:18 » à
  320 px ;
- « Coupée depuis le 4 sept. », la phrase d'une prise protégée et coupée, qui garde sa
  forme entière (T17) : 123 px à 10,5 px pour 113 de place à 320 px, dans les Pièces ;
  elle tient à 360 et à 390 px ;
- l'étiquette « Harmonogram » (polonais), partout, comme avant ;
- les mots de mode d'un chauffage, entre ses deux carrés : « Wyłączone » (polonais) à
  320 px, dans Objets et dans les Pièces ; « Frostschutz » (allemand) à 320 px ;
  « Ochrona przed zamarzaniem » (polonais), qui devient « zamarz… » à 360 et à 320 px.
  T18 ne les sauve qu'à partir de 360 px, parfois de 390 ;
- à 320 px en allemand, le nom « Außenwandleuchte » (130 px pour 111) ; et
  « Nachtlicht Schlafzimmer Lino » prend trois lignes, la troisième en « … ». Dans une
  vue personnelle, « NAS-Steckdose (Zephyr) » passe à la ligne à son trait d'union et
  prend trois lignes, comme « lave-vaisselle » se coupe à son trait d'union en français.

## Ce qu'on n'a pas fait

Ce que 1c montre et que la carte ne prend pas (T15) : le cadenas dans la phrase,
« Planning · jusqu'à 22:00 » et « Mode » (la nuit, la phrase se couperait), « 0,1 kWh
auj. » sur une ligne, les 170 px de haut et les 12 px d'écart, « Dernier geste ».
L'appui long. Le garage, le portail, le lecteur, les machines, la carte générique et la
compacte gardent les leurs.

## Ce que les tests tiennent

`tests/chiffre_carte_etroite.test.mjs` tient la grille commune : le bloc et ses deux
écritures, le budget, la phrase rejouée sur les phrases des sept langues, le chiffre du
haut, les carrés d'un chauffage, la ligne d'une prise, et le ménage — plus rien dans
`src/` ne nomme ce qui est parti. Chaque carte a le sien : `carte_lumiere`,
`carte_volet`, `carte_chauffage`, `carte_prise` ; `prises_gestes` joue la bascule
étroite d'une prise gardée, `prises` la forme courte (T17), `lot14_chargement` la borne.
