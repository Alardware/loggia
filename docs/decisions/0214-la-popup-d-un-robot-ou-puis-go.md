# 0214 — La popup d'un robot : où, puis go

*18 octobre 2026 — accepté, à l'essai (chantier IoT, étape 1 ; rien de publié). La conception : `docs/chantier-iot.md`, I2 A, I4 A, I15 à I20, I32, I33 ; sa maquette « Cartes IoT », cadres 1b (Accueil), 1c (Planning), 1d (Entretien et Historique) ; le plan : `docs/chantier-iot-plan-1-robots.md`, tâches 8 et 9, sa « Passe bis du 18/10 » et sa « Passe bis 2 du 18/10 ».*

## Le problème

La fiche d'un robot bâtissait son en-tête et sa barre d'onglets à la main — quelque cent
cinquante lignes recopiées du socle commun, le « lot à part » que l'ADR 0155 nommait. Son
Accueil dessinait un anneau de batterie et un « Démarrer · 1 zone » ; sur une tondeuse,
choisir une zone basculait aussitôt son interrupteur : un choix qui commandait l'appareil
avant le départ. La carte du logement occupait un onglet à elle. Le planning montrait des
champs d'heure natifs, et un compte ordinaire pouvait tout y toucher, que le serveur refusait
ensuite. L'Historique comptait la semaine du calendrier, en barres : un robot passé dimanche
affichait 0 le lundi. L'entretien coloriait à 35 / 65 dans la teinte du robot, et « Remplacé »
— une remise à zéro qui ne se rattrape pas — se pressait en deux appuis, même à 100 %. La
tuile « Prochain passage » pouvait annoncer un passage que « Ne pas déranger » retiendrait.

## La décision

**Le socle commun (I15).** La fiche passe sur `fichecommune.jsx` (ADR 0155) : l'en-tête
(`EnteteFiche` : la plaque aux couleurs de la carte, le nom, « {pièce} · robot aspirateur » — sans
zone, « Robot aspirateur », une majuscule devant (passe bis du 18/10) —, l'épingle, la roue des
réglages — elle reste, I4 A —, UNE croix) ; les onglets (`FicheOnglets`,
`PanneauOnglet`) Accueil · Planning (si le composant répond) · Historique · Entretien (s'il a
une pièce d'usure ou un compteur) ; la page des réglages (`PageReglagesAppareil`), la puissance
d'aspiration en tête, « L'appareil » vers la fiche universelle. La fiche reçoit la VUE de sa
carte (`useVueRobot`, l'état des robots relu toutes les 15 s fiche ouverte) : la carte et la
fiche disent la même chose. L'onglet Carte part.

**L'Accueil, « Où, puis go » (I16).** Le panneau de tête : le mot d'état en 24 / 800 — en
teinte au travail — et sa phrase (« Choisissez où, ou lancez tout. », « Salon, Cuisine · 42 m²
depuis 16:40 », « Salon, Cuisine · 42 m² faits », « Il rentre se recharger ») ; la batterie à
droite, le glyphe et la couleur de la règle des piles (`couleurPile`, comme la carte). « OÙ »,
seulement si Loggia sait commander des pièces : « Tout le logement » choisie tant qu'aucune pièce
ne l'est, une puce de 40 px par pièce avec son point de couleur — une pièce que Loggia ne sait pas
viser (sans segment, ou sans interrupteur pour un script maison) n'est pas une puce, et un départ
qui en viserait une se refuse (`pieces_inconnues`), jamais « tout le logement » à sa place ; au
travail, les puces montrent ce qui se nettoie, inertes, en gris de texte ; muet, ni « Où » ni
puce. Le choix reste DANS la popup. **Une tondeuse, une seule règle pour « où »** (passe bis du
18/10) : jamais Loggia ne rallume une aire que la personne n'a pas touchée — ses puces partent
PRÉ-CHOISIES selon les aires allumées ; « Tout le jardin » les choisit toutes, explicitement ;
aucune choisie, la puce principale ne s'offre pas ; partir allume les choisies et éteint les
autres, chaque bascule finie avant `start_mowing` ; une aire masquée n'en est pas une, ici comme
au serveur ; toutes ses aires, le passage se dit « tout le jardin ». La puce
principale de 48 px — « Nettoyer 2 pièces », « Nettoyer tout le logement », « Tondre tout le
jardin », « Tondre 1 zone », « Mettre en pause », « Reprendre » — part par le serveur
(`loggia/robots/lancer`, ADR 0215), avec ses pièces ; un refus fait retomber l'avance du geste
et va au toast. La seconde : « Localiser » sur la base, « Base » ailleurs. En erreur, la popup
offre de repartir ; la carte, elle, n'offre que la base. Une puce sans geste possible — muet,
un bit qui manque — ne se dessine pas, comme sur la carte (passe bis du 18/10) ; un geste en vol
garde sa puce, son mot et sa couleur, sans rien faire, jusqu'à la réponse de Home Assistant
(ADR 0213) ; un geste qui part par le serveur garde sa puce tant que le serveur n'a pas répondu, et
un refus ne fait retomber que son geste (passe bis 2 du 18/10, points E et F). Les deux puces en
13 px et au rayon 10, ceux de sa maquette. Un script maison (`vacuumScripts`) garde la main — et
part par le serveur, sa réponse du 18/10 (« Par le serveur », ADR 0215) — avec le RÔLE de la puce
qui le lance (`role` : nettoyer tout, les pièces, la pause, la reprise, la base ; passe bis 2,
point J) ; ces scripts sont ceux de l'aspirateur PRINCIPAL (`resolved.vacuum.main`) : la popup
d'un autre aspirateur ne les montre pas, ses puces partent par ses services (point C). Une
tondeuse à aires sans aire choisie n'offre pas de départ, et rien n'en part, ni par le serveur ni
en direct (point D). Puis les deux tuiles — « Prochain passage », le premier qui
PARTIRA, ou « Aucun » · « Rien de planifié » ; « 7 derniers jours », « 129 m² » · « 3 passages ·
2 h 47 » — et l'entretien qui presse, sous 35 % : « Filtre à 32 % · à changer bientôt ». Une
tuile sans onglet où mener n'est pas un bouton. Un passage du planning que le serveur a RETENU
dans le dernier jour — et aucun parti depuis — se dit sous les tuiles, une ligne sobre qui ouvre
le Planning : « Passage de 09:30 retenu : aucune zone allumée », sa cause dans la langue de
l'écran (`passageRetenu`, le journal du module ; passe bis 2 du 18/10, point I) — il ne se lisait
qu'au Journal. Sa maquette dessine la popup à 520 px ; au
téléphone (mesuré à 375, 360 et 320 px), sous 360 px de panneau la seconde puce ne garde que
son glyphe — son mot reste son nom — et la principale passe en 13 px, sur deux lignes sous 270
plutôt que coupée ; la valeur d'une tuile passe en 17 px, puis en 15 : « Demain 09:30 » tient
sur sa ligne.

**La carte du logement (I2 A, sa réponse « Ligne « Voir la carte » »).** Une rangée à
chevron, seulement si le robot publie une image ; elle ouvre le plan dans une SECONDE feuille,
montée après le contenu, où toucher une pièce la choisit comme dans « Où ». La caméra du robot n'y
est plus : elle part, à sa demande du 18/10 (« Elle part de la popup ») ; elle reste dans Sécurité.

**Le planning qui prévient (I18).** Ce que le serveur tient ne change pas (ADR 0043).
L'heure en 22 / 800, au gris éteint si le passage l'est ; les sept jours en puces de sa maquette,
pleine largeur, 34 px de haut, au rayon 10, dans une grille de sept colonnes (passe bis du 18/10) ;
un passage pris dans la plage le dit en ambre : « Dans « Ne pas déranger » : ce passage n'aura pas
lieu. » ; tant qu'un passage est actif : « Si l'application du fabricant programme aussi des
passages, coupez-les : sinon il part deux fois. ». « Ne pas déranger » se dit en clair —
« Aucun départ entre 22:00 et 07:00 », « Les passages partent à toute heure » — et se règle par
« De − 22:00 + à − 07:00 + », des pas de 30 min ; le pas qui rendrait la plage vide ne s'offre
pas ; plus de champ d'heure natif. La pluie de la tondeuse reste sous « Ne pas déranger » et
prend l'interrupteur de clé `rain_detection` avant tout autre. La feuille d'un passage vit dans
`<body>`, hors de la fiche : son « Enregistrer » prend le bleu plein du thème, pas un jeton du robot
(passe bis du 18/10) ; la réponse d'un enregistrement se pose sur l'état frais des robots.

**Les droits (I32, ADR 0144).** Un compte ordinaire LIT le planning — ni « Ajouter », ni
bascule, ni pas, ni feuille ; « Éteint » dit un passage éteint —, comme celui du distributeur.
Les commandes de l'APPAREIL restent à tous : partir, la pause, la base, localiser, les pièces
d'un départ, la pluie de l'appareil, « Remplacé ».

**L'Historique, sept jours glissants (I19).** « 7 DERNIERS JOURS » : Passages, Durée, Surface
(si le robot la publie) sur les 7 × 24 h qui finissent maintenant, la session en cours
comprise ; puis la liste de ces jours : la session en cours en tête, puis chaque passage — le
jour, ses pièces (« Salon · Cuisine », « Tout le logement », sinon « Nettoyage » / « Tonte »),
« 08:30 · 51 min », le motif s'il est connu, la surface, « Terminé » neutre, « Interrompu »
ambre, « Erreur » rouge ; en cours, « En cours », « En pause » ou « Retour » dans la teinte du
robot. Les barres partent. La source : le carnet du serveur (ADR 0215) ; l'historique d'état
n'est plus lu que sans lui.

**L'Entretien qui alerte (I20).** La phrase de sa maquette, au vouvoiement — « 2 pièces à
changer bientôt. » — et sa seconde moitié (« Touchez « Remplacé » … ») seulement si un bouton
existe ; l'allemand et l'espagnol à la forme de politesse eux aussi, comme l'avertissement du
Planning (« Tippen Sie … », « Toque … », « schalten Sie sie ab », « desactívelas » ; passe bis 2
du 18/10, point K) ; tout au-dessus de 35 %, l'Entretien ne dit RIEN — jamais de « Tout va bien » permanent :
« Tout est en ordre. » part (passe bis du 18/10). Une rangée par pièce : le nom, le pourcentage et la barre de
6 px — rouge sous 15, ambre sous 35, neutre au-dessus. « Remplacé » n'existe que si l'appareil
expose le bouton de remise à zéro, activé, et que la pièce n'est pas à 100 % ; il DEMANDE sur
sa rangée « Remettre Filtre à 100 % ? » · « Annuler » · « Oui, 100 % ». Puis les compteurs,
tels que l'appareil les nomme.

**Les couleurs des pièces (I17)** : les pièces nouvelles et les lecteurs prennent les jetons du
thème (`MED_COLORS`), plus une couleur en dur.

## Ce que cela coûte

Le morceau de la fiche passe de 38 054 à 29 949 octets (le socle est partagé) ; le démarrage
gagne 423 octets (la plaque partagée avec la carte, la vue rapide). Sur une tondeuse, choisir
une aire ne la prépare plus à l'avance : celui qui allumait ses interrupteurs pour choisir
choisit maintenant dans la fiche, et c'est le départ qui les allume. Les premiers jours après
l'installation, l'Historique part du carnet, qui naît vide. Le titre « Compteurs » part : sa
maquette ne l'a pas.

## Ce qu'on n'a pas fait

« Activer ce passage », le nom de la bascule d'un passage dans sa maquette : elle garde
« Passage de 09:30 », sinon chaque passage s'annoncerait pareil au lecteur d'écran. (Les jours en
puces pleine largeur et les scripts maison par le serveur, d'abord laissés, sont faits à la passe
bis du 18/10.)

## Tranche robots 2 (19/10 ; passe bis du 20/10 — ADR 0218)

« Où » ne change pas de place ni de dessin ; ce qui change, c'est d'où viennent les puces, et ce
qu'on lit quand il n'y en a pas. Trois sources, dans cet ordre : ses interrupteurs de pièces et son
script (la règle de cette décision, I16 — ils gardent la main), les ZONES de Home Assistant associées
au robot dans ses réglages (Home Assistant ≥ 2026.3 ; le serveur les lit, l'écran les montre), ce que
le robot publie (`rooms`). Sous les puces, ou à leur place, des lignes sobres disent ce qui manque :
l'association à faire (le chemin exact à un administrateur), la carte refaite (en ambre), des pièces
sur une autre carte. Sa décision du 20/10, « Mon script garde la main » : dès qu'un script de DÉPART
est désigné, les puces sont ses interrupteurs ou rien — jamais les zones de Home Assistant ni les
pièces publiées à leur place —, et la roue de la popup gagne « Scripts de la maison », une rangée par
rôle (`ListeChoix`, administrateurs), qui désigne ses scripts dans la description de la maison ;
« Localiser » passe par son script quand il en désigne un. La seconde feuille montre les mêmes pièces,
avec l'icône choisie d'une pièce de Loggia, et compte les pièces du robot. Le détail, règle par règle,
dans l'ADR 0218.

## Ce que les tests tiennent

`tests/fiche_robot.test.mjs` (le socle, l'Accueil, « Où », la tondeuse, la seconde feuille, les
tuiles, muet, la roue, les jetons), `tests/fiche_robot_onglets.test.mjs` (le Planning, un compte
ordinaire, la pluie, l'Historique avec et sans carnet, l'Entretien et sa question),
`tests/robots_vue.test.mjs`, `tests/robots_planning.test.mjs`, `tests/onglets_robot.test.mjs`,
`tests/feuilles.test.mjs`, `tests/lot16_fiches_panne.test.mjs`, `tests/clair.test.mjs`. La passe bis du
18/10 : `tests/fiche_robot.test.mjs` (deux appuis dans la popup, la tondeuse et ses aires, les pièces
qu'il ne sait pas viser, la batterie, les scripts maison par le serveur, la caméra partie, les puces
sans geste, les rayons), `tests/fiche_robot_onglets.test.mjs` (« tout le jardin », l'état frais, la
feuille dans `<body>`, l'Entretien sans phrase permanente, les jours en puces), `tests/langues_iot.test.mjs`
(le vouvoiement). La passe bis 2 : `tests/fiche_robot.test.mjs` (le rôle d'un script, l'aspirateur
principal seul), `tests/fiche_robot_onglets.test.mjs` (le passage retenu), `tests/robots_double_appui.test.mjs`
(les huit scénarios de la relecture de contrôle, la popup et la carte ensemble), `tests/langues_iot.test.mjs`
(l'allemand et l'espagnol au vouvoiement).
