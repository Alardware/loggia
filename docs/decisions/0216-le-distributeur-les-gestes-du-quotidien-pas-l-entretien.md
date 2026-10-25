# 0216 — Le distributeur : les gestes du quotidien, pas l'entretien

*19 octobre 2026 — accepté, à l'essai (chantier IoT, étape 2 : le distributeur ; rien de publié). La consigne : « go le distributeur », dans le chantier « go cartes iot ». La conception : `docs/chantier-iot.md`, I8, I10, I21 à I26, § 6, § 7.8, § 10, § 11 ; sa maquette « Cartes IoT », cadres 1a (la carte) et 1e (la popup : Accueil, Repas, Historique) ; le plan : `docs/chantier-iot-plan-2-distributeur.md`, tâches 1 à 9. Complétée par sa passe bis du 19/10 (deux relectures, ses décisions D1 et D2 : « La passe bis », à la fin) : le serveur change (`distributeur_appareil.py`, la règle de la portion et l'erreur sans classe) — Home Assistant doit être REDÉMARRÉ à l'installation.*

## Le problème

La carte du distributeur offrait « Rempli » à côté de « Distribuer » : un appui par erreur
remettait le bac à 100 %, sans question. Elle disait « Réservoir aux trois quarts », un mot là où
sa maquette met un chiffre nommé, et sa patte orange n'était pas celle des autres cartes IoT. Deux
appuis sur « Distribuer » — la carte puis la popup, ou deux fois la carte — partaient tous les deux :
deux rations.

La popup gardait la forme de l'ADR 0155 : un Accueil qui empilait le bac, une ligne « Taille de la
portion » et « Aujourd'hui : 1 repas · 45 g » en phrase ; un onglet Entretien qui n'existait, chez
qui n'a qu'une aide de réservoir, que pour « Réservoir rempli » ; un Planning en titres italiques et
en orange ; un Historique qui comptait la semaine du CALENDRIER, en barres — un lundi matin, « 0
repas » —, et dont chaque ligne disait « Depuis une automatisation » sans dire laquelle.

## La décision

**La carte (I8, I10 ; 1a).** Elle prend le gabarit des cartes IoT (ADR 0213) : 184 de haut (225 de
large au PC, la grille 1c au téléphone, 176 à 390 px), la plaque `paw` sur l'ambre de la maison, le
chiffre NOMMÉ — « 38 % », « Réservoir » — et UNE puce au pied, « Distribuer 12 g » (les grammes quand
le poids d'une portion se sait, `grammesRation`), sinon « Distribuer ». « Rempli » quitte la carte.
Sa phrase (`phraseDistributeur`, § 6) : « Repas à 19:00 · ≈ 8 j », « Repas demain 07:30 », « Repas
mercredi 07:30 », « ≈ 8 j de réserve », « Dernier repas à 07:30 » (aujourd'hui seulement), « Programme de
l'appareil » (présent, illisible), « Aucun repas prévu », « — » tant que le serveur n'a pas répondu ;
en ambre sous 15 % de bac, et quand l'appareil se plaint — « Bac presque vide · Repas à 19:00 »,
« Distribution bloquée », « Problème signalé » ; « Indisponible depuis 14:20 » quand l'appareil se
tait (le liseré), et « Réservoir indisponible » quand seule l'aide du bac se tait : la vis répond,
« Distribuer » reste. La compacte (88) garde la plaque, le nom, la phrase, le pourcentage et une mini-puce
« Distribuer ». Tout se calcule
dans `carteDistributeur` (distributeur.js, pur, au démarrage) ; la mesure d'une portion et la réserve
en jours y reviennent de `distributeurfiche.js` (I10).

**Le geste partagé.** « Distribuer » passe par `poserDistribution` (distributeuretat.js), la
variante partagée d'`optimiste.js` (ADR 0213) : deux appuis, d'où qu'ils viennent — la carte, la
compacte, la popup —, une seule ration pendant 2,5 s, et la puce le dit (`aria-disabled`, le focus
reste). Depuis la passe bis (point C, plus bas), le verrou tient jusqu'à la réponse de Home Assistant.

**La popup : le socle (I21, I26).** L'en-tête commun prend la plaque de la carte et « {pièce} ·
distributeur » (« Distributeur » sans pièce). Les onglets : Accueil · Repas (l'identifiant
`planning` reste) · Historique, et Entretien SEULEMENT pour des consommables de l'appareil
(déshydratant, filtre d'un Petlibro ou d'un PetKit). La roue des réglages reste.

**L'Accueil (I22, I23 ; 1e).** Le bac en grand — « RÉSERVOIR », « 38 % » en 48 / 800, « ≈ 8 jours de
réserve · 760 g » (« Moins de deux jours de réserve », « Ce qu'il reste dans le bac » sans rythme
connu), la barre ambre de 8 px — et « Je l'ai rempli », qui DEMANDE : « Remettre le niveau à 100 %
? » · « Annuler » · « Oui, 100 % », puis `input_number.set_value` au maximum de l'aide, montré tout de
suite. Seulement sur une aide `input_number` vivante (un vrai capteur se remplit tout seul), et pas
sur un bac déjà plein. « Servir maintenant », selon la commande de l'appareil (ADR 0155, R1) : une
commande qui écrit une quantité (PetKit, Tuya) compte les portions de CE geste ; une taille de ration
de l'appareil (le `serving_size` d'un Aqara, la quantité manuelle d'un Petlibro) s'écrit aussitôt,
« Elle vaut pour les rations suivantes. » ; sans taille, « Distribuer » seul. Après l'appui,
« Demande envoyée à 18:20 », puis « Servi à 18:21 · 45 g » (en vert) quand un compteur de l'appareil
bouge dans la minute — les grammes de sa hausse, sinon la ration attendue ; sans compteur, la demande
seule. Les tuiles « Prochain repas » (l'heure, le nom de l'automatisation, ou « Planning de
Loggia », « Programme de l'appareil » ; « Aucun » · « Aucune automatisation active ») et
« Aujourd'hui » (« 1 repas · 45 g » et leurs heures, « Rien depuis minuit » ; absente quand rien ne
compte). « État du distributeur » seulement quand une anomalie est active, son mot en entier en
ambre ; jamais « Aucun problème ».

**Repas (I24).** Les règles du serveur ne changent pas. La rangée « Programme de l'appareil » dit
qui sert — « Ce sont vos automatisations qui servent » en mode manuel avec une automatisation allumée
— et son mode, « Manuel › », qui ouvre Réglages ; la ligne « Mode de distribution » part. « VOS
AUTOMATISATIONS » en petites capitales ; une rangée par automatisation, son nom 14 / 700, ses heures
17 / 800, ses jours, « Couper cette automatisation coupe ses 2 repas. » seulement quand elle sert, sa
bascule ; « Associer une automatisation » à l'accent. Le planning de Loggia, « Deux sources », la
mise en garde et l'ancienne liste restent, sur les panneaux de sa maquette.

**L'Historique (I25).** Les sept jours GLISSANTS — les 7 × 24 h qui finissent maintenant, comme le
robot (ADR 0214) : « 7 DERNIERS JOURS » · « 14 repas · 630 g ». Une rangée par repas : le jour dans
son badge, le titre VRAI — le nom de l'automatisation qui a servi, sinon « Planning de Loggia »,
« Repas à la main » (le bouton de l'appareil), « À distance », « Programme de l'appareil », et
« Repas » quand on ne sait pas d'où il vient ; jamais « Repas du matin » deviné à l'heure —, le
moment, la pastille d'origine (« Automatisme », « À la main », « Appareil ») et les grammes. « À
distance » n'a pas de pastille : l'application du fabricant, Loggia ou une automatisation que le
serveur ne reconnaît pas disent toutes « remote ». Les barres de la semaine partent
(`BarresSemaine`, `resumeSemaineRepas`).

**Plus d'orange de fiche (I8).** `.rb-distributeur` et son lavis `--rb-` partent ; « Distribuer »
est au bleu plein de l'accent, les liens à l'accent doux, les panneaux ceux de sa maquette.

**Ce que la vérification dans `?demo` a appris (tâche 8).** À 320 px en allemand, la puce du bac
passe sous le chiffre au lieu d'écraser « 38 % », la valeur d'une tuile se resserre comme celle du
robot (« Mahlzeite / n: » ne se coupe plus), la question garde sa ligne et ses puces passent dessous ;
au clavier, le focus va à « Annuler », puis revient à la puce — à « Distribuer » quand le bac rempli
ne l'offre plus ; les textes de la popup qui existaient avant l'étape passent, en allemand et en
espagnol, à la forme de politesse, comme ceux du robot (« Ihre Automatisierungen » au lieu de
« Deine »).

**La démo.** Par défaut, l'Aqara de la maison : le bac à 38 %, « Croquettes matin et soir » qui sert,
« Croquettes du midi » coupée, une ration donnée au bouton de l'appareil samedi. `?demo&distributeur=bas`
(240 g sur 2 000 : l'ambre) et `?demo&distributeur=probleme` (l'Aqara signale une erreur) ;
« Distribuer » sert après 2,5 s — « Demande envoyée », puis « Servi à ». L'horloge se règle
(`maisonDistributeurDemo(v, { quand })`).

## Ce que cela coûte

Le démarrage passe de 1 093 967 à 1 097 239 octets (+3 272 ; 2 761 sous la borne, qui ne bouge pas) :
la phrase, la vue de la carte, le geste partagé, la mesure d'une portion et la réserve revenues. La
fiche passe de 28 460 à 31 119 octets, `distributeurfiche.js` de 7 500 à 6 814. « Rempli » demande
maintenant d'ouvrir la popup : un geste de plus, voulu. L'onglet Entretien disparaît chez qui n'a
qu'une aide de réservoir. Dix-huit textes partent, trente-deux arrivent (le polonais à relire par
Seba882), onze valeurs allemandes et dix espagnoles passent au vouvoiement — revenues au tutoiement à
la passe bis (D2, plus bas) ; le démarrage y reste neutre (mesuré : l'étape ajoute 0 octet ; 19/10,
−61 octets sur la base).

## Ce qu'on n'a pas fait

La rangée « État du distributeur » · « Aucun problème » permanente de sa maquette (I22 : une phrase
permanente est du bruit) ; les titres « Repas du matin / du midi / du soir » rangés par l'heure
(I25) ; « Je l'ai rempli » pour un vrai capteur de niveau ; rien au serveur. Le nom d'une fiche trop
long pour sa ligne garde son ellipse (« Futtera… » à 320 px) : la décision du 05/10 tient. La
question « Remplacé » du robot, qui a les mêmes défauts au clavier et à 320 px, n'est pas touchée.

## Ce que les tests tiennent

`tests/distributeur_carte.test.mjs` (la phrase, la vue de la carte, le compteur désigné),
`tests/distributeuretat.test.mjs` (le geste partagé), `tests/carte_distributeur.test.mjs` (la carte
jouée : large, étroite, compacte, muette, deux appuis ; la coquille de la popup),
`tests/fiche_distributeur_accueil.test.mjs` (le socle, le bac et sa question, « Servir maintenant »,
« Servi à », les tuiles, l'état ; le bac plein, le focus, la mise en page qui cède),
`tests/fiche_distributeur_repas.test.mjs` (Repas, les sept jours, le titre vrai, l'orange parti),
`tests/demo_distributeur.test.mjs` (la démo à 18:20), `tests/langues_iot_etape2.test.mjs` (les sept
langues, le vouvoiement), et les épinglés mis à jour : `fichedistributeur`, `croquettes_popup`,
`distributeur_finition`, `distributeur`, `lot13`, `lot16_fiches_panne`, `objets`, `clair`,
`chiffre_carte_etroite`, `composeur`, `poids`, `robustesse_front`, `readme_vrai`.

## La passe bis du 19/10

Deux relectures (conformité, qualité) et ses deux décisions, prises vers 16:45.

**D1 — la règle de la portion, écran ET serveur.** Sur un Aqara C1 sous Zigbee2MQTT, la taille de
ration porte l'unité « portion » : `mesurePortion` ne la comptait que sans unité, et la carte disait
« Distribuer 6 g » et ≈ 37 j pour une popup à « 2 portions · 12 g ». Toute unité qui n'est pas une
masse (aucune, « portion », « portions »…) compte des PORTIONS. Et le champ « Poids d'une portion » de
Paramètres (`haids.portionWeight`) était lu comme la TAILLE de la ration : chez qui y met le POIDS
(un number en grammes, ce que le champ demande), la carte prenait le poids pour la portion, et le pas à
pas de « Servir maintenant » aurait réglé l'étalonnage de l'appareil. La même règle des deux côtés
(`portionDistributeur` / `poidsPortion`, `portion()` / `poids_portion()`, la fixture partagée et un
cas neuf, `aqara_z2m_poids_designe`) : un number désigné dont l'unité est une masse (g, kg —
`UNITES_MASSE`) est le poids d'une portion, et la taille se cherche parmi les sœurs ; sans unité de
masse, il reste la taille, comme avant. Le pas à pas n'écrit JAMAIS sur une entité de poids. **Le
serveur change : Home Assistant doit être redémarré à l'installation.** La démo par défaut désigne
son number en grammes : c'est désormais un poids ; la variante `z2m` porte la forme réelle — et,
depuis la passe bis 2 (plus bas), l'Aqara par défaut a sa taille de ration en « portion », comme
Zigbee2MQTT la publie : le pas à pas se voit depuis le lien public.

**B — l'erreur sans classe.** Le `binary_sensor` de suffixe `_error` d'un Aqara sous Zigbee2MQTT n'a
pas de `device_class` : il n'était jamais une anomalie. Parmi les seules sœurs de l'appareil, il vaut
« autre » (`MOTIF_ANOMALIE_SANS_CLASSE`, JS, Python et fixture) — « Problème signalé » sur la carte,
la rangée « État du distributeur » dans la popup ; `probleme` le porte sous ses deux formes.

**C — le verrou jusqu'à la réponse (sûreté).** Le verrou tombait à 2,5 s quoi qu'il arrive : un
distributeur en nuage qui répond en 3 s laissait passer un second appui, et servait deux rations.
`commanderService` rend désormais la promesse de l'appel (le cœur de `commander` vit dans
`lancerCommande`, qui rend la valeur ET la promesse ; `commander` garde sa valeur, que trois cartes
lisent). `lancerDistribution` (distributeuretat.js) pose le verrou avec sa GARDE de 30 s
(`GARDE_DISTRIBUER_MS`) et le relâche quand Home Assistant a répondu, réussi ou non
(`relacherPartage`) ; il prend alors son filet de 2,5 s, et la tenue minimale de 2,5 s reste. Le même
geste pour la carte large, l'étroite, la compacte et « Servir maintenant ». Un effet de bord voulu :
le départ direct d'un robot (`lancerRobot`, `direct()`) attend désormais la vraie réponse de Home
Assistant, comme son nom le dit.

**D — « Repas · un repas ».** Le titre de repli d'UN repas de source inconnue partageait la clé de
l'onglet, traduite au pluriel (« Meals », « Mahlzeiten », « Posiłki ») : il a sa clé, au singulier
(`trSens`), dans les six catalogues — le polonais à relire par Seba882.

**E — la tuile « Prochain repas ».** Le programme de l'appareil existe mais ne se lit pas, sans
automatisation ni capteur : la carte disait « Programme de l'appareil », la tuile « Aucun · Rien de
planifié ». Elle dit ce que la carte dit (ajustement 2 : rien ne s'invente).

**F — le démarrage : l'étape est NEUTRE.** La base pesait 1 098 850 octets, l'étape 2 fusionnée
1 102 091 (la borne de `lot14_chargement`, 1 100 000, rougissait). Ce que seule la popup lit — les
consommables, les réglages, le select du mode — ou que seul le serveur emploie — les cibles de
commande, les notes d'une entité désignée ailleurs, les tables du programme de l'appareil et des
consommables (`TABLES_FICHE`) — vit dans `distributeurfiche.js` ; la fixture fige l'union des deux
tables. Le code mort est parti (`carteDistributeur().rempli`, `alerteDistributeur().mot`,
`data-distributeur`) ; les clés orphelines aussi (« Rempli », « Distribuer une ration »,
« ≈ {n} jour de réserve » au singulier inatteignable). Le démarrage reste **neutre** (mesuré :
l'étape ajoute 0 octet ; 19/10, −61 octets sur la base) : l'étape 2, corrections comprises, n'ajoute
rien au démarrage.

**G — les petits.** L'en-tête de la popup ne dit plus « Ce distributeur ne répond plus. » quand
seule l'aide du bac se tait : le liseré est sur le panneau du réservoir, comme la plaque de la carte
reste ambre. « Oui, 100 % » sur une aide en kg montre « 2 000 g », plus « 2 g ». « État du
distributeur » dit le nom propre d'une anomalie « autre » (« Erreur moteur », la règle du 05/10) et
jamais deux fois le même mot. La tuile « Aujourd'hui » ne compte qu'un compteur qui a bougé AUJOURD'HUI
(`compteDuJour` lit l'instant) : plus de « 0 repas · 24 g » après minuit. « Servi à » exige une vraie
HAUSSE du compteur, pas un battement par `unavailable`. La compacte montre le geste en vol : sa
mini-puce prend le sablier. Une commande qui écrit une quantité relève sa valeur au minimum de
l'entité : la carte et la popup annoncent ce qui part VRAIMENT (min 2 → « 2 portions · 12 g »). Au
clavier, après « Oui, 100 % », le focus va à « Distribuer », ou à l'onglet quand l'appareil se tait —
jamais sur `<body>`. L'Entretien du distributeur passe au modèle du robot : la brique commune
`OngletEntretien` (fichecommune.jsx), que le robot reprend aussi — « Remplacé » demande (I20),
l'ambre sous 35 %, le rouge sous 15 % (en jours : 7 et 3), aucune phrase quand tout va bien. Les
commentaires périmés sont repris (`index.css`, `distributeur.js`, `fichedistributeur.jsx`,
`croquettes_popup.test.mjs`), l'import `enVol` masqué est renommé. La démo porte chaque cas :
`reservoir`, `programme`, `z2m`.

**D2 — le tutoiement, comme Home Assistant.** L'allemand et l'espagnol tutoient partout, comme
l'interface de Home Assistant, le reste de Loggia et le polonais de Seba882 ; le français reste au
« vous ». Les vingt-et-un textes anciens que l'étape 2 avait passés au vouvoiement reprennent leur
valeur d'avant ; les textes nouveaux de l'étape 2 et ceux de l'étape 1 (les robots) s'écrivent au
tutoiement ; les tests qui exigeaient la forme de politesse s'inversent.

**Ce qui reste ouvert.** Le fuseau horaire : les repas, minuit et « demain » suivent celui du
navigateur, pas celui de Home Assistant — une tablette réglée sur un autre fuseau décalerait la tuile
« Aujourd'hui » et « Repas demain ». Pas dans cette passe. Le test des clés orphelines
(`tout_tr_traduit`) cherche une sous-chaîne : il laissait passer « Rempli » et « Distribuer une
ration ».

**Ce que les tests tiennent, en plus.** `distributeur_carte` (D1 : la taille en « portion », le poids
désigné, la mesure), `fiche_distributeur_accueil` (D1 : le pas à pas sur la taille, jamais le poids ;
E ; G : l'aide muette, le kg, l'état, la tuile après minuit, « Servi à », le minimum, le focus,
l'Entretien), `distributeuretat` et `carte_distributeur` (C : l'appareil lent, la carte puis la
popup), `fiche_distributeur_repas` (D), `distributeur` et `test_distributeur_appareil.py` (la fixture
et la parité, les tables en deux moitiés), `demo_distributeur` (`z2m`, `reservoir`, `programme`,
l'erreur sans classe), `langues_iot` et `langues_iot_etape2` (le tutoiement), et les épinglés mis à
jour (`actions`, `robustesse_front`, `robots_vue`, `lot16_fiches_panne`, `fichedistributeur`,
`distributeur_finition`, `croquettes_popup`, `objets`).

## La passe bis 2 du 19/10 (relecture de contrôle)

Neuf corrections ciblées, chacune un test rouge d'abord ; rien ne bouge au démarrage (mesuré : −30
octets).

1. **L'Entretien du robot garde son dessin.** La brique commune (`OngletEntretien`) dessinait ses
   panneaux avec le socle — le dégradé surfA → surfB, l'ombre, le rayon `--o-radius` — quand le robot
   installé le matin même avait le panneau PLAT de sa maquette (§ 7.5 : `--o-s3`, le liseré, le
   rayon 18), comme ses autres onglets et l'Accueil du distributeur. La brique prend ce panneau
   (`PANNEAU_PLAT`) ; un test compare l'Entretien à l'Historique du robot.
2. **Le sous-texte d'une pièce reste gris sous un pourcentage** : « 43 h sur 60 h » d'une pièce à
   28 % passait à l'ambre chez lui. La couleur n'y va que s'il est le seul signal — des jours sans
   pourcentage, les consommables du distributeur. Le robot redevient identique à ce qui est installé.
3. **Toute unité de masse est un poids.** Seules g et kg comptaient (`UNITES_MASSE`) : un « Poids
   d'une portion » désigné en oz, en lb ou en mg devenait la taille, et le pas à pas aurait écrit sur
   l'étalonnage. Les masses de Home Assistant — g, kg, mg, µg (et « ug »), oz, lb, st — des deux
   côtés et dans la fixture (`poids_designe_en_onces`), converties en grammes partout où le code
   convertit : `enGrammes`, désormais exporté du démarrage (une seule table), lu par
   `distributeurfiche.js` et par la fiche ; le serveur ne convertit rien.
4. **`_error` sans classe seulement** : le code reconnaissait le suffixe pour toute classe autre que
   `problem`, quand la fixture et le commentaire disaient « sans classe » — un `_link_error` de
   classe connectivity à « on » (connecté) disait « Problème signalé ». L'absence de classe est exigée,
   des deux côtés (`erreur_de_classe_connectivite`).
5. **« Remplacé » n'est jamais inerte** : la fiche écarte un bouton de remise à zéro `unavailable`
   (`piecesDe`), comme le robot ; la brique du serveur (`consommablesDistributeur`) le garde, la
   parité la fige.
6. **« Servi à » exige une heure POSTÉRIEURE à l'appui** sur le capteur « dernier repas » : muet à
   l'appui puis revenu à son ancienne heure, il passait pour un repas (`Date.parse('unavailable')`
   ne vaut rien).
7. **Deux trous dans les tests** : la parité fige le poids (`poids_portion_id`, `luParite` et
   `_lu`) — le cas `poids_designe_hors_des_soeurs` restait vert sur le code d'avant D1 (vérifié :
   il rougit maintenant sur ce code) ; `tests/poids.test.mjs` épingle les fonctions parties vers
   `distributeurfiche.js` (consommables, réglages, `selectMode`, `ciblesDeCommande`,
   `notesAppareil`).
8. **La démo par défaut retrouve son pas à pas** : son number désigné est en grammes, donc un
   poids ; l'Aqara reçoit une sœur `number.distributeur_serving_size` en « portion » (1, de 1 à 10),
   comme Zigbee2MQTT la publie — « − 1 portion · 45 g + » depuis le lien public, la carte dit
   le vrai total (la taille × le poids ; réglée à 2, « Distribuer 90 g ») ; la variante `z2m`
   garde la forme de sa maquette, « 2 portions · 12 g ».
9. **Les documents** ne portent plus un chiffre de boot qui vieillit : « neutre au démarrage ».
