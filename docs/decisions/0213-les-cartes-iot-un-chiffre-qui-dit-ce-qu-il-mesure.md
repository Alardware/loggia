# 0213 — Les cartes IoT : un chiffre qui dit ce qu'il mesure, une phrase qui dit la suite

*18 octobre 2026 — accepté, à l'essai (chantier IoT, étape 1 : les robots ; rien de publié). La conception : `docs/chantier-iot.md`, I5 à I9, I12 à I14, I33 à I35, § 6, § 12 ; sa maquette « Cartes IoT », cadre 1a ; le plan : `docs/chantier-iot-plan-1-robots.md`, tâches 1, 2, 5, 6 et 7 ; sa « Passe bis du 18/10 » (après deux relectures) et sa « Passe bis 2 du 18/10 » (après la relecture de contrôle). Complétée à l'étape 2 (le distributeur, 19/10 : « L'étape 2 », à la fin) ; à compléter à l'étape 3 (l'eau).*

## Le problème

La carte d'un robot était `RoomMachineCard` : un anneau de batterie sans son nom, l'état de
Home Assistant traduit mot à mot (« À la base »), rien sur la suite — ni le prochain passage,
ni ce qui se nettoie —, les deux robots peints du même vert, « Démarrer » posé sur un robot
qui travaillait. La compacte renvoyait le robot à la base. Au téléphone, la carte n'avait pas
la grille commune (ADR 0202). L'en-tête d'Objets › IoT disait un compte sans dire ce qui
tourne. Et le démarrage n'avait plus de place : 1 099 580 octets construits pour une borne
de 1 100 000.

## La décision

**La place d'abord (§ 12).** `robots.js` se coupe en deux : la phase, la batterie, la phrase,
les puces et le calcul du prochain passage restent au démarrage ; les sessions, les usures,
les compteurs, les réglages, la fiche technique et ce que vise un planning partent dans
`robotsfiche.js`, que la popup seule importe. `distributeur.js` aussi : la lecture de la carte
reste, l'historique reconstruit et le planning affiché partent dans `distributeurfiche.js`.
Le démarrage passe de 1 099 580 à 1 081 447 octets ; l'étape finit à 1 088 635 — 11 365 sous
la borne, qui ne bouge pas. Après la passe bis du 18/10 : **1 092 160 octets** (la passe y ajoute
2 316 octets : le magasin des gestes, la batterie bornée, la liste de ce qui tourne ; 7 840 sous
la borne). Après la passe bis 2 du 18/10 : **1 093 967 octets**, 6 033 sous la borne (+1 801,
mesurés contre la même copie sans elle, 1 092 166 : la variante partagée d'optimiste.js et sa
garde, les aires d'une tondeuse que la carte suit, la fiche universelle sur la vue du robot).
Le boot n'importe que l'entrée et le vendor : un module du
démarrage qu'un morceau à la demande importerait aussi en sortirait dans un morceau partagé,
chargé avec lui et hors de la borne (mesuré au rejeu avec la démo, `lot14_chargement` le
garde).

**Le gabarit (I5).** `RoomRobotCard` prend la grille commune (`o-gabarit`) : 184 de haut sur
225 de large ; la plaque seule en haut ; 10 px plus bas, la rangée `RM_MILIEU` — le nom et la
phrase à gauche, le chiffre nommé à droite, alignés sur leur bas — ; au pied, une ou deux
puces de 44 px qui se partagent la largeur. Étroite (sous 188 px de contenu, la grille 1c) :
la plaque et le chiffre en haut, le nom entier, la phrase, UNE ligne de puces ; deux puces
n'ont que leur glyphe sous 200 px de contenu, leur mot reste dans leur nom.

**Le chiffre nommé (I6).** La batterie en 25 / 800, « % » en 15, et « BATTERIE » dessous en
petites capitales (10 / 800) ; étroite, le chiffre de la grille (22 px) et « Batterie » en
9,5 — 3 px sous le haut de la plaque, et non 4 : 3 + 22 + 2 + 11 = 38, la hauteur de la plaque ; à 39, la
rangée du haut grandissait, et un nom sur deux lignes poussait le pied hors des 150 px (passe bis du 18/10). L'attribut, sinon la sœur `battery` — bornée de 0 à 100, une valeur vide ou qui n'est pas un
nombre INCONNUE, jamais « 0 % » (`batterieRobot`, passe bis du 18/10). Sa couleur est la règle
des piles (`couleurPile`, ADR 0206) : neutre, sauf sous le seuil — dans la popup aussi. Un robot muet ne la montre pas : une valeur d'avant la
panne ne se donne pas pour vraie. Caché au lecteur d'écran : la surface dit « Aspirateur, Sur
la base, batterie 92 % ».

**La phrase (I7, § 6).** `phraseRobot` (robots.js), que la carte, la compacte, la popup et
« En ce moment » partagent, la première qui s'applique : « Indisponible depuis 14:20 » (le
liseré qui respire) ; « Il bipe : suivez le son », trois secondes après un `locate` accepté,
dans l'onglet qui l'a envoyé — un minuteur du module (`bipeRobot`, robotsetat.js), que la carte,
la compacte et la popup de l'onglet partagent : Home Assistant ne dit pas qu'un robot bipe, il
reste donc à part du magasin des gestes (ajustement de la passe bis du 18/10) ; « En erreur · Brosse coincée » ; au travail « Nettoie · Salon,
Cuisine », « Tond · Pelouse arrière » — ce que le carnet du serveur sait du passage (ADR 0215),
ou le départ que cet onglet vient de lancer ; « Tond · tout le jardin » quand ce sont toutes ses
aires ; « Nettoie · Nettoyer la buanderie », le nom d'un script maison qui l'a lancé ; sans rien,
« Nettoyage en cours » — ; « En pause ·
Salon, Cuisine » ; « Retour à la base » ; sur la base, le prochain passage qui PARTIRA —
« Passage à 09:30 », « Passage demain 09:30 », « Passage lundi 09:30 » : `prochainPassage` saute
un passage pris dans « Ne pas déranger » —, sinon « Sur la base », « Sur la base · en charge »
quand un capteur le dit ; arrêté ailleurs, « À l'arrêt ». Une tondeuse à aires dont aucune n'est
allumée, sur sa base ou arrêtée, dit « Aucune zone allumée » (passe bis 2 du 18/10, point D) :
elle n'offre pas « Démarrer ». Une ligne, « … » au bout. Ses encres
sont des jetons du thème (`--o-accent-soft`, `--o-ok`, `--o-bad`, `--o-text2`), que la garde de
contraste tient déjà — pas `lisibleSurLavis`, qui veut un hexadécimal.

**Les couleurs qui alertent (I8).** Au travail : la plaque à 0,18 et le lavis de 0,14 à 0,03
dans la teinte du robot — l'accent pour l'aspirateur, le vert pour la tondeuse ; au repos, le
gris doux et pas de lavis ; muet, `o-panne`, ni puce ni batterie.

**Les puces (I9).** Selon les bits de l'appareil (`BITS_ROBOT` : `VacuumEntityFeature`,
`LawnMowerEntityFeature`) : sur la base « Démarrer » et « Localiser » ; au travail « Pause » et
« Base » ; en pause ou au retour « Reprendre » et « Base » (choisie pendant le retour) ; en
erreur « Base » seule ; arrêté hors de sa base « Démarrer » et « Base ». Une tondeuse n'a pas
« Localiser ». Des services explicites, jamais `toggle` ; « Démarrer » part par
`loggia/robots/lancer` (ADR 0215), en direct sur un serveur d'avant. Chaque geste se voit tout
de suite, et l'état des robots se relit douze secondes après. Une tondeuse à aires dont aucune
n'est allumée n'a pas « Démarrer » (passe bis 2 du 18/10, point D) : `start_mowing` ne partirait
jamais — le serveur le refuse (`aucune_aire`) ; rien d'inerte, la ligne garde ce qui reste
possible (la base, arrêtée ailleurs), et toucher la carte ouvre la fiche, où l'on choisit. Ses
aires sont lues comme au serveur (`airesTondeuse`, robots.js : les interrupteurs de son appareil,
ni masqués ni désactivés), et suivies par la carte : l'une s'allume, « Démarrer » revient.

**Le geste en vol (passe bis du 18/10 ; passe bis 2).** Deux appuis rapprochés sur « Pause »
relançaient le robot : chaque carte tenait l'avance de son geste à elle (`useOptimiste`), la
puce basculait sous le doigt sur « Reprendre », et le second appui envoyait `start`. Le geste
en vol est UNE avance par robot que la carte large, l'étroite, la compacte, la popup et la
fiche universelle lisent ensemble — l'avance se voit partout pareil. Elle passe par la variante
PARTAGÉE d'optimiste.js (`poserPartage`, `lirePartage`, `useOptimistePartage` ; `poserGeste`,
`gesteEnVol`, `useGeste` dans robotsetat.js n'en sont que les mots du robot) : la règle de la
maison — tout état optimiste passe par optimiste.js, et il expire — tient À LA LETTRE, sans
exception (passe bis 2 du 18/10, point N ; le magasin à part de la passe bis en était une).
Même contrat que `useOptimiste` : tant que Home Assistant ne l'a pas confirmé — la phase
réelle est encore celle d'avant lui, et son `last_changed` n'a pas avancé —, et au moins 1,5 s
quoi qu'il arrive, la puce qui l'a lancé reste sur son geste, choisie, et ne fait rien
(`aria-disabled`) ; rien n'offre l'inverse — seule « Base » reste permise (`commandesEnVol`,
`gestePermis`) ; un second appui lit l'avance au moment même, avant que l'écran ne se
redessine. Confirmé, il l'est POUR DE BON : la maison revenue à la phase d'avant — un autre
écran, l'application du fabricant — ne le réarme pas (point G) ; un relevé plus vieux que
l'appui ne compte pas. Son filet, le modèle de celui du volume : cinq secondes et un relevé du
pont (`5000 + HASS_POLL_MS` ; I33 disait dix — à mesurer sur son matériel) ; un départ par le
serveur GARDE son geste tant que `loggia/robots/lancer` n'a pas répondu, 30 s au plus
(`GARDE_DEPART_MS`, au-delà des 20 s que le serveur attend son intégration), puis prend son
filet à la réponse (point E). Un refus ne fait tomber que SON geste, par son jeton : le refus
tardif d'un départ ne fait plus tomber la pause posée après lui (point F). « Base » posée pendant
le vol d'un départ, le robot encore sur sa base, garde sa puce, et la compacte aussi (point H).
Le serveur, lui, refuse un second départ de moins de 15 s, ou encore en vol (`deja_en_route`, ADR
0215). La fiche universelle (« L'appareil », dans les réglages de la popup) passe par la même
vue : ses boutons Pause, Démarrer et Base sont les puces de la carte, plus aucun service de
départ n'en part en direct, et sa batterie se lit comme ailleurs (point B). Les pièces ne se
choisissent pas sur la carte : c'est l'Accueil de la popup (ADR 0214).

**La compacte (I12)** garde la disposition de la maison et prend de la carte la phrase, la
batterie à droite, la teinte de la plaque au travail, et pour mini-commande la PREMIÈRE puce —
Démarrer, Pause, Reprendre ; jamais la base, sauf en vol : un geste en vol garde sa puce, quelle
qu'elle soit, choisie, qui ne fait rien (passe bis 2 du 18/10, point H).

**L'état des robots à l'écran (I35)** : `robotsetat.js`, le motif des prises — `loggia/robots/etat`
toutes les 60 s tant qu'une carte est montée, toutes les 15 s fiche ouverte, relu après une
commande ; un serveur muet garde ce qu'on savait et le dit ; un refus va au toast, sa phrase
avec. Le même objet tant que rien ne change (passe bis du 18/10) : une réponse égale à la
précédente ne redessine personne — `recu` et `maintenant`, que rien ne lisait, partent ; une
carte d'un autre domaine n'écoute ni les robots, ni leurs bips, ni leurs gestes.

**L'en-tête IoT (I14)** : « IoT », et le compte de sa maquette — « 3 appareils · 1 en marche »,
au pluriel de chaque langue. « En marche » compte ce qui travaille — une liste FERMÉE (`enMarcheIot`,
objets.js ; passe bis du 18/10) : un robot au travail, un ventilateur ou un humidificateur
allumé ; jamais une vanne ouverte, ni un interrupteur ou une aide allumés, que le filtre range
aussi ; rien ne travaille, le total seul. Un module à la demande (`enteteiot.jsx`), son repli de la même hauteur.

**« En ce moment » (I34)** écrit la phrase du robot ; son geste reste « Renvoyer au dock ».

## Ce que cela coûte

7 188 octets de plus au démarrage pour les cartes, `robotsetat.js` et la phrase
(1 081 447 → 1 088 635), puis 2 316 à la passe bis (→ 1 092 160), puis 1 801 à la passe bis 2
(→ 1 093 967). Une lecture de
`loggia/robots/etat` par minute tant qu'une carte est à l'écran, une toutes les quinze secondes
fiche ouverte. Un geste qu'aucune réponse ne confirme tient sa puce sept secondes ; un départ par
le serveur, jusqu'à sa réponse, trente secondes au plus. La carte d'une tondeuse écoute aussi ses
aires. Rien n'a été vu sur son matériel : un
bit qui manque à ses robots, c'est une puce absente — jamais une commande au hasard.

## Ce qu'on n'a pas fait

Choisir des pièces sur la carte ; un appui long ; la carte du distributeur et celle de l'eau
(étapes 2 et 3, qui compléteront cette décision) ; `lisibleSurLavis` pour la phrase.

## Ce que les tests tiennent

`tests/robots_carte.test.mjs` (la phrase, ses encres, les puces selon les bits, le prochain
passage qui partira), `tests/carte_robot.test.mjs` (la carte jouée : large, étroite, compacte,
muette, le départ par le serveur), `tests/robotsetat.test.mjs` (60 / 15 s, la relecture, « Il
bipe »), `tests/entete_iot.test.mjs`, `tests/poids.test.mjs` et `tests/lot14_chargement.test.mjs`
(la place et la borne), `tests/chiffre_carte_etroite.test.mjs`. La passe bis du 18/10 : `tests/robotsetat.test.mjs` (le magasin
des gestes, le même objet), `tests/robots_carte.test.mjs` (`commandesEnVol`, `gestePermis`, le nom
d'un script), `tests/carte_robot.test.mjs` (deux appuis sur la carte et la compacte, la batterie, la
colonne du chiffre étroit, la sous-ligne), `tests/entete_iot.test.mjs` (la liste fermée). La passe
bis 2 du 18/10 : `tests/optimiste.test.mjs` (la variante partagée — elle expire, l'état réel
reprend la main une fois pour toutes, la tenue, la garde, l'oubli par jeton — et elle reste
légère), `tests/robots_double_appui.test.mjs` (les huit scénarios de la relecture de contrôle,
S1 à S8, joués sur la carte, la compacte, la popup et la fiche universelle ; la tondeuse sans aire
allumée), `tests/robotsetat.test.mjs` (le geste par optimiste.js, la garde d'un départ, le carnet
sans zone), `tests/robots_carte.test.mjs` (« Base » en vol garde sa puce, la tondeuse sans aire).

## L'étape 2 : la carte du distributeur (19/10)

La consigne : « go le distributeur ». Le détail est dans l'ADR 0216 ; ce qui relève de cette
décision-ci : la carte du distributeur prend le gabarit — la plaque `paw` sur l'ambre, le chiffre
NOMMÉ (« 38 % », « Réservoir »), UNE puce au pied, « Distribuer 12 g » — et sa phrase est une
fonction pure, `phraseDistributeur` (§ 6 de la conception), calculée avec toute la vue de la carte
dans `carteDistributeur` (distributeur.js) : le prochain repas des sources actives et la réserve en
jours (« Repas à 19:00 · ≈ 8 j »), l'ambre sous 15 % de bac ou quand l'appareil se plaint,
« Indisponible depuis 14:20 » quand il se tait, « Réservoir indisponible » quand seule l'aide du bac
se tait. La compacte garde la plaque, le nom, la phrase, le pourcentage et une mini-puce. Le geste
de « Distribuer » est la variante partagée d'`optimiste.js` (`poserDistribution`) : deux appuis, d'où
qu'ils viennent, une ration. Le démarrage passe de 1 093 967 à 1 097 239 octets (+3 272) ; la borne ne
bouge pas. Les tests : `tests/distributeur_carte.test.mjs`, `tests/distributeuretat.test.mjs`,
`tests/carte_distributeur.test.mjs`.
