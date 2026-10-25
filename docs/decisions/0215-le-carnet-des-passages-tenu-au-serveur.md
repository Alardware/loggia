# 0215 — Le carnet des passages, tenu au serveur

*18 octobre 2026 — accepté, à l'essai (chantier IoT, étape 1 ; rien de publié ; un redémarrage de Home Assistant à l'installation). La conception : `docs/chantier-iot.md`, I3 A, § 8, § 9 ; sa maquette « Cartes IoT », cadres 1a, 1b, 1d ; le plan : `docs/chantier-iot-plan-1-robots.md`, tâches 3 et 4, sa « Passe bis du 18/10 » et sa « Passe bis 2 du 18/10 ».*

## Le problème

Home Assistant ne sait pas quelles pièces un robot nettoie, ni pourquoi il s'est arrêté :
l'historique d'un aspirateur ne dit que travail, pause, retour, base, et aucune de ses
intégrations ne publie les pièces en cours. Sa maquette écrit pourtant « Nettoie · Salon,
Cuisine » sur la carte, « Salon, Cuisine · 42 m² depuis 16:40 » dans la popup, et « Salon ·
Cuisine », « Bloqué sous le canapé » dans l'Historique. Un écran qui lance un passage sait ses
pièces ; les autres écrans, et cet écran-là au rechargement, ne les savent plus. Et
l'Historique se reconstruisait de l'historique d'état — quatorze jours relus à chaque
changement, sans pièces ni motif.

## La décision

**Un carnet au serveur** (I3 A, sa réponse « Carnet au serveur ») : `robots.py` pour le temps
réel — l'écoute, le disque, les commandes —, `robots_carnet.py` pour ce qui se calcule (pur :
ni Home Assistant ni l'heure, chaque fonction rend un carnet neuf).

**Ce qu'il note.** Une SESSION s'ouvre quand le robot se met au travail ; elle prend les
pièces, la source et le compte d'un DÉPART demandé dans les deux minutes (`noter_demande`) —
« loggia » pour un geste de l'écran, « planning » pour un départ planifié ; sans demande, la
source est « appareil » (l'application du fabricant, dont les pièces ne se savent pas). Seul
le TRAVAIL se compte, ni la pause ni le retour. Elle se ferme à la base (« termine »), en
erreur (« erreur »), arrêtée ailleurs (« interrompu ») ; moins d'une minute de travail est un
faux départ, qui ne se garde pas ; une session que plus rien ne ferme se clôt au bout d'un
jour ; un robot muet ne ferme rien. La surface est le maximum que publie son capteur pendant le
passage. **Le motif** (passe bis du 18/10), une erreur NEUVE publiée pendant lui : le texte se lit au
bon endroit, jamais un code nu (`texte_erreur` — l'intégration officielle Ecovacs publie un CODE en
état, 0 quand tout va bien, et son texte dans l'attribut `description`) ; un capteur muet
(`unavailable`, `unknown`) ne dit ni une erreur ni la fin d'une erreur ; seul un texte DIFFÉRENT du
dernier connu est une erreur neuve — une « dernière erreur » qui persiste, ou qui revient après
une coupure Bluetooth, n'est pas le motif de chaque passage ; relue au démarrage de Home
Assistant, l'erreur devient la dernière connue, jamais le motif du passage en cours ; datée par
le capteur d'heure de l'appareil quand il en a un (Mammotion, `error_1_time`), une erreur d'avant
le début du passage n'en est pas le motif, et le même texte à une heure neuve en est une ; ce
capteur d'heure muet (`unavailable`, `unknown`), la lecture est muette — ni une erreur neuve, ni
la fin d'une erreur —, et le même texte relu sans son heure garde la date connue : une coupure
Bluetooth qui tait l'heure avant le message, ou rend le message avant l'heure, ne fait plus d'une
vieille erreur le motif du passage en cours (passe bis 2 du 18/10, point A) ; publiée
juste après l'arrêt du robot — l'état « erreur » et le capteur ne se suivent pas toujours —, une
minute au plus, elle est le motif du passage qu'il vient de clore. Quatorze jours, deux cents
passages au plus.

**Où il vit.** `.storage/loggia_robots_etat`, son propre fichier, écrit 20 s après la
première note (un passage, ce sont des dizaines de phases et de surfaces), et une dernière fois
à l'arrêt et au déchargement ; au rechargement de l'intégration, l'instance suivante attend
l'écriture de la précédente, 10 s au plus, comme le carnet des lumières (ADR 0198). À l'arrêt de
Home Assistant, chaque passage en cours note l'instant de la coupure (`voir_arret`, passe bis du
18/10) : au retour, le temps qu'elle a duré ne se compte pas — un robot qui travaille encore
reprend à l'instant où il est revu, un robot rentré pendant la coupure clôt son passage à son
instant. Les robots
présents au démarrage sont suivis ; un robot ajouté ensuite l'est au redémarrage suivant.

**`loggia/robots/lancer {robot, zones, script, role}`** — le départ que donne une personne depuis l'écran :
ouvert à tout compte qui pilote le robot (`controle_de`, ADR 0144), borné à lui. Des pièces
partent par la commande que SON intégration attend (`commande_pieces` : `spot_area` d'Ecovacs,
`app_segment_clean` de Roborock, `vacuum_clean_segment` de Dreame et de Xiaomi) ; aucune, c'est
tout le logement (`vacuum.start`) ; une pièce sans segment, il ne part pas (`pieces_inconnues`).
Une tondeuse allume les aires choisies, éteint les autres, puis tond (`start_mowing`) ; sans aire
choisie, elle tond ses aires DÉJÀ allumées, sans rien basculer, et le carnet les nomme — jamais
Loggia ne rallume une aire que la personne n'a pas touchée ; une aire masquée n'en est pas une ;
toutes ses aires, c'est « tout le jardin » (passe bis du 18/10 ; le planning suit la même règle).
Sans aire choisie ni allumée, elle ne part PAS : `start_mowing` ne partirait sur rien de su, le
départ se refuse (`aucune_aire`) et le planning retient son passage, « aucune zone allumée » au
journal (passe bis 2 du 18/10, point D). Toujours un service explicite, jamais `toggle`, sous le
contexte de la personne — le socle y voit une main — et ATTENDU (`blocking=True`, passe bis), le
temps BORNÉ (passe bis 2, point E) : `ATTENTE_DEPART_S`, 20 s au plus en tout, attendus sans rien
annuler (`asyncio.wait`). Les bascules d'aires finissent avant `start_mowing` ; une bascule sans
réponse à temps retient la tondeuse (`sans_reponse`), la commande de départ sans réponse à temps
compte pour partie et continue sans Loggia — si elle échoue après coup, sa demande s'oublie et le
journal le dit, en rouge. L'échec d'une intégration, que seul un appel attendu fait remonter, se
dit (`commande_refusee`) et retire la demande du carnet. Deux appuis ne font pas deux départs : une
demande de moins de 15 s, le robot pas encore parti, se refuse (`deja_en_route`) ; et un départ EN
VOL — demandé, sans réponse encore de son intégration — refuse le suivant, deux minutes au plus
(`VOL_MAX_S`), que celui-ci vienne d'un autre écran ou du planning de la même minute, et
l'inverse : le planning en vol refuse l'écran (point E). **Les scripts maison de l'aspirateur**
(`vacuumScripts`, Paramètres) partent par là aussi — sa réponse du 18/10, « Par le serveur » :
`script.turn_on`, sous le contexte de la personne et dans les limites de ses droits, le robot ET le
script. Ils sont ceux de l'aspirateur PRINCIPAL et de lui seul (passe bis 2, point C) : celui que la
description de la maison nomme (`loggia_entities.vacuum.main`), à défaut le SEUL aspirateur de la
maison ; deux aspirateurs et aucun nommé, aucun script n'est reconnu — l'écran, lui, les donne au
principal qu'il résout (`resolved.vacuum.main`). Chacun part avec le RÔLE que l'écran lui demande
(`role` : `nettoyer_tout`, `pieces_selectionnees`, `pause`, `reprendre`, `retour_base` ; point J) —
c'est lui, et non la place du script dans une liste, qui dit s'il lance un passage : le même script
désigné pour « nettoyer tout » et pour « reprendre » reprend un robot en pause au lieu de tomber
sur `deja_en_route` ; un script qui n'est pas celui de ce rôle se refuse (`script_inconnu`).
`script.turn_on` rend la main dès que le script DÉMARRE (point M) : on l'attend jusque-là, borné ;
un échec à l'intérieur du script ne remonte pas — seul un refus de Home Assistant se dit. Un rôle de
départ suit les règles d'un départ et donne au passage son nom (« Nettoyer la buanderie », sans
celui du robot devant), que la carte et l'Historique disent à la place de « Nettoyage » ; un rôle de
geste — la pause, la reprise, la base — part seul, et son refus n'est pas un « départ non lancé »
(`geste_refuse`, point K) ; le journal dit « script : {nom} ». Le départ se note au journal
(« nettoyer : Salon, Cuisine »). Un refus ne commande rien et ne laisse aucune demande derrière
lui ; il porte son code, que l'écran dit (`refusrobots.js`, chargé au premier refus) :
`robot_injoignable`, `deja_en_route`, `pieces_inconnues` — l'intégration ne sait pas viser des
pièces : on ne part pas pour tout le logement à la place —, `zone_inconnue` (une aire qui n'est pas
la sienne), `aucune_aire`, `sans_reponse`, `script_inconnu`, `commande_refusee`, `geste_refuse`.
Le planning (ADR 0043) note aussi ses départs. Avant de tondre, il allume les zones du passage et
éteint les autres, chaque bascule attendue ; si l'une ne prend pas — l'aire choisie qui ne s'allume
pas, une autre qui ne s'éteint pas —, la tondeuse ne part pas : elle tondrait ce que le passage
excluait. Le journal dit la VRAIE cause : « sous la main de quelqu'un » quand une main tient l'aire,
« commande refusée par Home Assistant » quand Home Assistant l'a refusée, « sans réponse de Home
Assistant » passé le temps borné (point I) ; et la popup redit, une ligne, le dernier passage
retenu de moins d'un jour (ADR 0214).

**`loggia/robots/etat`** gagne `passages` (le plus récent d'abord), `en_cours` (la phase, la
durée de travail, les pièces, la surface) et `erreurs`, filtrés par ce que le compte peut LIRE
(`_lecture_autorisee`) ; le compte qui a lancé ne sort pas du serveur. Un passage et la session en
cours disent aussi le nom du script maison qui les a lancés (`libelle`). Plus de `maintenant`
(passe bis) : l'écran ne le lisait pas, et il rendait chaque réponse différente — l'écran ne
pouvait pas reconnaître un état inchangé. Un serveur d'avant ce
chantier ne connaît pas `lancer` : l'écran part alors en direct, comme avant, et l'Historique
relit l'historique d'état.

**L'écran** lit le carnet par `robotsetat.js` (ADR 0213) : les pièces en cours sur la carte et
dans la popup, l'Historique de sept jours (ADR 0214). Le départ que CET onglet vient de lancer
se dit avant que le carnet ne l'ait vu, deux minutes au plus.

## Ce que cela coûte

Un redémarrage de Home Assistant à l'installation, sur son « go » : le carnet ne vit qu'après
lui, et il naît vide — l'Historique des premiers jours est court. Un fichier de plus dans
`.storage`, borné (deux cents passages). Une commande de plus : le serveur en compte cinquante.
Un arrêt brutal perd jusqu'à 20 s de notes.

Une intégration qui part sans Loggia (son application) laisse un passage sans pièces :
« Nettoyage en cours », « Nettoyage » à l'Historique. Les scripts maison partent par `lancer`
depuis la passe bis du 18/10 (sa réponse « Par le serveur ») : leur passage se dit par leur nom.
Sans capteur d'heure, le même texte d'erreur qui revient n'est pas une erreur neuve : le motif
d'un second blocage identique ne se note pas ; et un capteur d'heure qui reste muet tait les
erreurs de son appareil jusqu'à son retour. Un départ attend son intégration 20 s au plus en tout
(passe bis 2 du 18/10, point E) : la puce de l'écran reste « en cours » tant que le serveur n'a pas
répondu, 30 s au plus, puis son filet d'un geste ; une intégration plus lente que 20 s voit sa
commande de départ comptée pour partie — l'écran le croit parti, et un second départ se refuse
jusqu'à sa réponse, deux minutes au plus —, et une bascule d'aire plus lente retient la tondeuse
(« Home Assistant n'a pas répondu à temps »). `script.turn_on` ne dit pas si le script a réussi,
seulement qu'il a démarré. Un arrêt brutal de Home Assistant, sans son événement d'arrêt, compte
encore la coupure.

## Ce qu'on n'a pas fait

Deviner les pièces d'un départ de l'application du fabricant ; lire l'historique d'état quand
le carnet existe ; suivre sans redémarrage un robot ajouté après le démarrage ; noter la pause
et le retour comme du travail.

## Tranche robots 2 (19/10 ; passe bis du 20/10 — ADR 0218)

`loggia/robots/lancer` garde son nom et son schéma ; une zone y porte désormais `zone` (l'identifiant
d'une zone de Home Assistant) OU `segments` (la forme d'avant), jamais les deux, et le départ par zones
part par `vacuum.clean_area` — une seule commande, attendue, bornée, en vol comme tout départ d'ici —
après que le serveur a vérifié ce que Home Assistant refuserait après l'avoir lancé ; le carnet note
les zones comme il notait les pièces (`{id, nom}`), rien d'autre ne change pour lui. Tout ce que le
serveur lit se lit AVANT la garde du double départ, et plus aucun `await` ne sépare la garde du vol.
Le planning suit la même règle à l'heure dite et RETIENT, sa cause au journal, ce que Home Assistant
refuserait — et un passage par pièces que l'intégration ne sait pas viser, ou dont le robot ne publie
plus la liste (une liste périmée, d'abord) : plus jamais « tout le logement » à leur place. Sa décision
du 20/10, « Mon script garde la main » : un script de départ désigné (`nettoyer_tout`,
`pieces_selectionnees`) retient tout passage planifié par pièces (« Vos scripts gardent la main pour les
pièces. »), fait partir « tout le logement » par son `nettoyer_tout` (le carnet note son nom), et refuse
un départ par zones ou par segments venu de l'écran (`scripts_gardent_la_main`) ; `localiser` devient un
rôle de geste. Le détail dans l'ADR 0218.

## Ce que les tests tiennent

`tests/python/test_robots_carnet.py` (l'ouverture, la demande des deux minutes, le travail
seul, les fermetures, le faux départ, la surface, le motif, l'élagage, la relecture ; la passe
bis : `texte_erreur`, le motif neuf, la coupure, le nom d'un script),
`tests/python/test_robots.py` (l'écoute, le disque, `lancer` et ses refus, sous le contexte de
la personne ; la passe bis : les 15 s, la règle de « où » de la tondeuse, les services attendus et
leur échec, le motif lu au bon endroit, l'arrêt et le retour de Home Assistant, le rechargement,
le retrait des écoutes, les scripts maison et leurs refus ; la passe bis 2 : le capteur d'heure muet
dans les deux ordres, la tondeuse sans aire allumée, le planning qui retient et sa vraie cause,
l'attente bornée et le départ en vol — l'écran, le planning de la même minute —, les scripts de
l'aspirateur principal seulement, le rôle demandé, le geste refusé), `tests/python/test_websocket_api.py` et `test_websocket_api_execution.py` (la
commande ouverte, son contrôle, les cinquante, le rôle d'un script), `tests/robotsetat.test.mjs` (le départ par le
serveur, en direct sans lui, le refus qui retombe au toast, le geste gardé jusqu'à la réponse),
`tests/demo_robots.test.mjs` (le faux serveur de la démo, qui fait de même).
