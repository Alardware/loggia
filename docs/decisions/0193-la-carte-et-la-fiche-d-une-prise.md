# 0193 — La carte et la fiche d'une prise

*13 octobre 2026 — accepté, à l'essai (chantier Prises, plan 2, rien de publié). Remplace en partie l'ADR 0095, § 4.*

*14 octobre 2026 — la puissance passe en bas. Sa demande, « oui aligne aussi la
puissance des prises en bas » : sur la carte large, elle n'est plus posée sur la
ligne du nom, à sa droite, mais à droite du nom ET de la phrase, alignée sur le
bas de la phrase — la disposition de la carte d'une lumière (ADR 0197) et de
celle d'un volet. Le pied, la carte étroite et la confirmation ne changent pas.*

*15 octobre 2026 — la carte étroite suit la grille commune (passe téléphone, ADR 0202 ;
« ok pour 1c »). Sous 188 px de contenu, la puissance ne descend plus au pied : elle
monte en haut à droite, face à la plaque (`ChiffreHaut`) ; la phrase tient sur une ligne,
« Depuis le 4 sept. » quand la bascule dit déjà l'état ; la ligne du bas porte la bascule
et les kWh du jour, « Aujourd'hui » dessous. La courbe, le pied et la demande sur place
restent à la carte large ; Annuler et Couper n'ont plus de glyphe. La carte large ne
change pas.*

## Le problème

> « passe au cartes prises du dossier que je t'ai partagé » — 13 octobre

Sous le filtre Prises d'Objets vivait tout switch visible qui n'était ni une
lumière ni un module fil pilote : le « Permit join » du pont de Zigbee2MQTT, la
sirène de l'alarme, le poêle — dont l'appareil porte les compteurs de toute la
maison, si bien que l'ancienne règle, le premier capteur de puissance de
l'appareil, pouvait lui donner celui de la maison. Une prise disait « Allumée »,
« En veille », « Chauffe » ou « Compresseur » selon un seuil de 3 W, s'animait,
et portait son type en capitales au-dessus du nom. La maquette « Cartes prises »
dit autre chose : une phrase (« En marche depuis 08:50 », « Terminé à 16:14 ·
1,08 kWh »), la puissance en grand, la journée en courbe, une confirmation pour
couper ce qui ne doit pas l'être, et une fiche qui raconte la journée.

## La décision

**Une prise est un switch qui mesure (P1).** Son appareil porte un capteur
`power` ou `energy` sans catégorie, ou elle est de la classe `outlet` ; ni un
switch de configuration, ni l'interrupteur d'un module fil pilote, ni un switch
déclaré lumière, ni le pont de Zigbee2MQTT (reconnu à son APPAREIL,
`Zigbee2MQTT` / `Bridge`, au caractère près), ni une sirène. Le capteur d'une
prise est le seul de sa classe sur son appareil — si l'appareil n'a qu'un
switch sans catégorie —, sinon celui qui partage le plus de mots avec son nom ;
aucun mot commun, aucun capteur : ni la puissance de la maison, ni celle de
toute une multiprise. La règle est écrite deux fois, à l'écran (`estPrise`,
`src/prises.js`) et au serveur (plan 1, `est_prise`), avec les mêmes entrées
(la classe du registre, le nom affiché sinon celui du registre), tenues
d'accord par une fixture (`tests/fixtures/prises_parite.json`).

**Ce qui n'est plus une prise va ailleurs.** Les autres switch, et les
`input_boolean`, rejoignent IoT ; le pont part dans Paramètres › Interrupteurs
(« Appairage Zigbee » : deux appuis pour l'ouvrir, un pour le fermer) ; la
sirène ne vit plus que dans Sécurité ; une note en pied du filtre Prises le dit,
avec leurs noms. « Ajouter une carte » range les prises comme Objets : le NAS,
le PC et le lave-vaisselle y restent sous Prises, et la puce paraît.

**La recherche (Ctrl+K) ne bascule rien de ce qui demande deux appuis.** Entrée
est UN appui. Une prise allumée dont la protection est vraie, ou pas encore lue,
mène à Objets › Prises, où sa carte demande ; le pont de Zigbee2MQTT mène à
Paramètres › Interrupteurs — sans le droit de cette section, il ne se propose
pas, comme toute section interdite ; une sirène mène à Sécurité. Une prise
libre, ou coupée, se bascule comme avant, d'un ordre explicite (`turn_on`,
`turn_off`) — tant qu'une carte de prise est montée quelque part : la recherche
ne s'abonne à rien, et un état que personne ne relit vaut une protection inconnue
(ADR 0196).

**La carte (1a), aux tailles actuelles** (184 ; 176 de large au téléphone).
La plaque teintée de l'appareil, le cadenas d'une prise protégée et la bascule
rose (inerte quand la prise est muette) ; le nom et la phrase du § 4, dans une
même colonne ; à leur droite, en bas, alignée sur le bas de la phrase (14/10), la
puissance en 25 px (« 1,95 kW » au-delà de 1 000 W) — comme le pourcentage d'une
lumière et celui d'un volet ; au pied, « Aujourd'hui », ses kWh et la courbe du
jour, qui prend la hauteur qui reste (18 à 36 px).
Sous 188 px de contenu, la puissance descend au pied à la place
d'« Aujourd'hui » et la phrase passe sur deux lignes ; sous 120 px, les chiffres
du pied se resserrent. Couper À LA MAIN une prise protégée demande d'abord (P5)
— de même quand sa protection n'est pas ENCORE LUE : dans le doute, on demande
(ADR 0196). La question prend la place de la phrase, Annuler et Couper celle du
pied (leur glyphe sur une carte étroite), six secondes au plus, le focus sur
Annuler puis rendu à la bascule. Le cadenas, lui, ne paraît que pour une
protection connue. Muette : le liseré qui respire, la phrase en rouge, la
courbe en gris.

**La compacte** garde sa disposition et prend la phrase, la puissance (à partir
de 140 px de contenu) et le glyphe ; allumée et gardée — protégée, ou protection
pas encore lue —, sa bascule ouvre la fiche quand elle en a une à ouvrir. Sans
fiche à ouvrir — la compacte de l'appareil, dans sa propre fiche —, elle demande
sur place, en deux appuis : le premier pose la question à la place de l'état, le
second coupe (ADR 0196).

**Les cartes vivent chacune pour soi, et l'ADR 0119 tient sans nuance.** La
puissance d'une carte bouge sans que l'écran entier se redessine : ni Objets ni
les pièces ne surveillent les `sensor.`, qui jittent sans cesse, et cela ne
change pas. Chaque carte et chaque compacte s'abonnent à SA bascule et à SON
capteur de puissance (`useVuePrise` ; le capteur en clé bruyante, à 10 W près)
et lisent les états dans ce relevé vivant, non dans celui de leur parent. Une
compacte qui n'est pas une prise ne s'abonne à rien : `useHass` sans clé ne
pose plus ni relevé ni intervalle.

**L'en-tête d'Objets › Prises** : « 3 allumées · 150 W en ce moment · 1
indisponible ». Il s'abonne de même aux prises visibles (`EntetePrisesVive`) :
sa puissance vit, comme celle des cartes, sans que l'écran entier se redessine.
Le compte tient sur UNE ligne, à toute largeur, en chiffres tabulaires (« … » à
défaut) ; à 760 px et moins, « en ce moment » s'efface. À la ligne, le compte
faisait presque le double de la hauteur de son repli de chargement, et la grille
bougeait de 16 px quand « 167 W » devenait « 4 W » : le repli porte maintenant
les mêmes classes, et rien ne saute à l'arrivée du compte.

**La fiche**, une feuille sans onglets chargée à la demande : le grand chiffre
ou « Coupée » / « Indisponible », la phrase longue, la confirmation « Couper
quand même » (sans cadenas ni « · protégée » tant que la protection n'est pas
lue), l'encart d'une prise muette (« du réseau Zigbee » pour une prise
Zigbee2MQTT ou ZHA), la courbe des 24 heures, l'énergie du jour et du mois
(ADR 0195), les rangées Protéger, Prévenir à la fin du cycle, Ce qu'elle
alimente (ADR 0196), Minuteur et L'appareil, et le Journal du jour : le logbook
de Home Assistant et le journal de Loggia (`loggia/volets/manoeuvres`,
réutilisée telle quelle), et qui — Réseau, Mesure, Loggia, Automatisme avec son
nom, Bouton de la prise (P9, ADR 0194).

**Ce qui part (P10, P11)** : les mots d'avant, l'animation, l'étiquette du type
au-dessus du nom ; dans la fiche d'une prise, « Alimentée », « Puissance
instantanée », « Énergie · Compteur de l'appareil » et « Dernier changement ».
La feuille d'un switch qui ne mesure pas perd la puissance et l'énergie qu'elle
lisait au premier capteur venu. **Les couleurs de la maquette (P12)** : le
lave-vaisselle passe au cyan ; une icône choisie l'emporte toujours.

**Un nombre et son unité ne se séparent pas.** Dans les phrases — « Terminé à
14:50 · 1,08 kWh », « est en marche (4 W) », « dans 30 min », la ligne du
cycle, le Journal du jour, la ligne du compteur —, l'espace entre le nombre et
son unité est INSÉCABLE (U+00A0) : à 360 px, « 1,08 » finissait la ligne et
« kWh » commençait la suivante. Les fonctions de format (`kwhPrise`, `fmtWatts`,
`dureePrise`) gardent leur espace ordinaire, que la tuile d'énergie coupe pour
écrire le chiffre en grand et l'unité en petit ; `insecable` (prises.js) lie
l'atome au moment de bâtir la phrase. L'en-tête d'Objets › Prises, sur une seule
ligne, n'a pas besoin de ce lien.

**La borne du démarrage ne se relève pas** : la feuille de l'agenda du rail
(Mois, Semaine, Jour) passe à la demande et rend 20,7 Ko, la place de la carte,
de la compacte et de l'état partagé ; l'en-tête d'Objets › Prises et la fiche
naissent à la demande.

## Ce que cela coûte

Un nom long finit en « … » quand la puissance prend sa part de la rangée du nom
et de la phrase, comme celui d'un volet à côté de son pourcentage ; la phrase d'une
compacte étroite aussi, comme tout sous-titre de compacte. Et dans le doute — le
temps que l'état du serveur arrive —, même une prise libre demande avant d'être
coupée : un appui de plus.

## Ce qu'on n'a pas fait

L'appui long, une carte par sortie d'une multiprise, des seuils réglables, la
protection dans les règles de Loggia (§ 14 de la spécification).

## Ce que les tests tiennent

`tests/prises.test.mjs` (la règle, la phrase, l'appui sur la bascule),
`tests/prises_parite.test.mjs` (la règle et sa fixture),
`tests/prises_objets.test.mjs`, `tests/carte_prise.test.mjs` (dont la puissance en
bas, le 14/10), `tests/entete_prises.test.mjs`, `tests/fiche_prise.test.mjs`,
`tests/prisesfiche.test.mjs`, `tests/appairage_zigbee.test.mjs`,
`tests/composeur.test.mjs` (« Ajouter une carte » range les prises),
`tests/poids.test.mjs` (la feuille de l'agenda à la demande),
`tests/lot14_chargement.test.mjs` (la borne).

Les gestes se testent en les JOUANT. `tests/crochets.mjs` appelle un composant
avec un répartiteur de hooks à lui — l'état tient, les effets partent, un appui
joue le `onClick` de l'arbre —, sans dépendance de plus.
`tests/prises_gestes.test.mjs` s'en sert pour la recherche, les cartes vivantes,
la protection pas encore lue, la compacte et le gros interrupteur ;
`tests/fiche_prise_gestes.test.mjs` pour la fiche : bascule, puces, rangée
Protéger, six secondes, un serveur qui répond mal.
