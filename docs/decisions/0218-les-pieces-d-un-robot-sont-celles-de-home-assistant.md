# 0218 — Les pièces d'un robot sont celles de Home Assistant

*19 octobre 2026 — accepté, à l'essai (chantier IoT, tranche « robots 2 : les pièces sans rien configurer » ; rien de publié ; un redémarrage de Home Assistant à l'installation). La conception : `docs/chantier-iot.md`, « Tranche robots 2 », et son document de conception du 19/10 (R1 à R16, ses choix Q1 A, Q2 A, Q3 A) ; le plan : `docs/chantier-iot-plan-3-robots-pieces.md`. Passe bis du 20 octobre, sur sa décision du 20/10 à 08:05 (« Mon script garde la main ») et les deux relectures (conformité, qualité) : les corrections sont tenues ici, section par section ; passe bis 2 du même jour, sur la relecture de contrôle (la roue qui pouvait effacer la description de la maison) : sa section ci-dessous. 0219 reste réservée à sa relecture.*

## Le problème

Pour nettoyer des pièces, Loggia demandait de configurer : des interrupteurs de pièces et un script
dans la description de la maison, ou des numéros de segments relevés à la main. Depuis Home Assistant
2026.3, un contrat commun existe — l'association des pièces du robot aux ZONES de Home Assistant, une
fois, dans les réglages de l'entité, et l'action `vacuum.clean_area` — que Loggia ignorait. Et son
chemin « par commande » était faux : il envoyait `rooms: "1,3"` (une chaîne) à `spot_area`, quand
deebot-client 18, embarqué par Home Assistant ≥ 2026.3, attend une liste — la chaîne y devient
« 1,,,3 » ; sur un Ecovacs dont le modèle n'a pas de commande de pièces dans la bibliothèque (le sien),
l'intégration refuse d'ailleurs `spot_area` tout court, et la puce « Nettoyer 2 pièces » envoyait une
commande que Home Assistant rejetait. Chez lui, ce chemin ne se voyait pas : sa popup passe par ses
interrupteurs et son script.

Et un second problème, trouvé à la relecture du 20/10 : chez lui, `loggia_entities.vacuumScripts`
désigne `nettoyer_tout`, `pause`, `reprendre`, `retour_base` et `localiser`, mais PAS
`pieces_selectionnees` — et aucun écran ne permettait de le désigner. La tranche telle que rejouée
aurait alors pris la main sur ses pièces : l'exception `clean_V2` à l'écran, et le planning par pièces
par cette même commande, à la place de ses scripts.

## La décision

**Sa décision du 20/10 : « Mon script garde la main ».** Dès qu'un script de DÉPART est désigné pour
l'aspirateur de la maison (`nettoyer_tout` ou `pieces_selectionnees` — `SCRIPTS_DEPART` de `robots.py`),
Loggia ne prend jamais la main sur les pièces elle-même — ni zones de Home Assistant, ni exception
`clean_V2`, ni `spot_area`. Serveur ET écran, mêmes mots (`_script_depart` et `pieces.source ==
"scripts"` au serveur, `scriptDepartDesigne` à l'écran) :
- `pieces_selectionnees` désigné : les puces de « Où » sont ses interrupteurs (`vacuumRooms[].toggle`),
  toujours là, et le départ passe par ce script — le chemin de l'étape 1, qui existe. Une association
  dans Home Assistant n'y change rien : la ligne « Vos scripts gardent la main pour les pièces. » dit
  pourquoi les puces ne sont pas ses zones. Le script des pièces désigné sans aucune pièce à
  interrupteur : aucune puce, et un administrateur lit pourquoi (« Votre script des pièces est désigné,
  mais aucune pièce de la maison n'a d'interrupteur… ») ;
- un script de départ sans `pieces_selectionnees` (son cas) : AUCUNE puce de pièce — rien d'inerte,
  ni ses pièces publiées ni ses zones —, « Nettoyer tout le logement » reste et part par son
  `nettoyer_tout`, et une ligne, pour un administrateur, dit où désigner son script des pièces : la
  roue ;
- un passage PLANIFIÉ par pièces est RETENU avec « Vos scripts gardent la main pour les pièces. » (le
  serveur ne joue pas ses interrupteurs ; la feuille du Planning ne propose aucune pièce) ; « tout le
  logement » au planning part par son script `nettoyer_tout` — le serveur sait lancer un script
  (`regles.agir('script', 'turn_on')`), et le carnet note son nom —, sinon par `vacuum.start` ;
- un départ par zones ou par segments demandé au serveur alors qu'un script de départ est désigné se
  refuse par son code, `scripts_gardent_la_main` — l'écran n'en envoie pas, le serveur le dit quand même ;
- sans AUCUN script de départ : la tranche telle qu'elle est, ci-dessous. RIEN NE BASCULE, jamais : une
  mise à jour de Home Assistant qui donnerait le bit et une association ne change rien tant que ses
  scripts sont désignés.

**Le sélecteur des scripts, dans la roue de la popup du robot.** Un panneau « Scripts de la maison »,
une rangée par rôle (`nettoyer_tout`, `pieces_selectionnees`, `pause`, `reprendre`, `retour_base`,
`localiser`), en `ListeChoix` (jamais un `<select>`), pour l'aspirateur principal seul. Les suggestions :
les scripts de Home Assistant, ceux qui partagent le préfixe des scripts déjà désignés sous « Scripts du
robot », les autres sous « Autres scripts », « Aucun » en tête. Le RÔLE part SEUL au serveur, par une
commande dédiée et étroite — `loggia/robots/scripts { role, script | null }`, administrateurs seulement
(passe bis 2 du 20/10, ci-dessous) —, et le serveur le fond dans `loggia_entities.vacuumScripts` TELLE
QUE LA DESCRIPTION EST SUR LE DISQUE, d'un seul tenant sous le verrou du magasin
(`fusion_vacuum_scripts`, `async_modifier_shared`) : rien d'autre que ce rôle ne bouge, un rôle vidé est
retiré. Les rangées lisent les rôles désignés dans l'état que le serveur rend (`pieces[robot].scripts`),
la commande rend cet état, et les rangées ATTENDENT (désactivées, `aria-disabled`, « … ») tant que le
composant n'a pas répondu. Un compte ordinaire lit les rangées sans rien régler (ADR 0144) ; chaque
refus du serveur dit SA raison (`unauthorized` nomme la clé « loggia_entities », un plafond dit « trop
volumineux », un composant d'avant « ne répond pas »). `localiser` devient un rôle de GESTE du serveur
(`SCRIPTS_GESTE`, le schéma `role` de `loggia/robots/lancer`) : la puce « Localiser » — de la carte, de
la compacte, de la popup et de la fiche universelle, un seul geste (`localiserRobot`) — passe par le
script désigné, sinon par `locate` comme avant.

**Trois sources de pièces, dans cet ordre (R2 ; sa réponse Q1 A).** (1) Ses interrupteurs de pièces
et son script (`vacuumRooms` à interrupteur, `vacuumScripts.pieces_selectionnees`) gardent la main tant
qu'ils sont désignés — rien ne bascule après une mise à jour de Home Assistant ; quand une association
existe aussi, une ligne sous les puces le dit : « Vos scripts gardent la main pour les pièces. ». (2)
Les zones de Home Assistant associées au robot (`registry_entry.options.vacuum.area_mapping`), pour qui
n'a rien configuré : les puces de « Où » sont ces zones, nommées comme Home Assistant les nomme, rangées
d'abord dans l'ordre des pièces de Loggia (`loggia_rooms`, § 3.1), puis par étage (son niveau) et par nom
(l'ordre du serveur) ; leur couleur et leur icône sont celles CHOISIES d'une pièce de Loggia du même NOM
(`loggia_rooms[].teinte`, `.icon` — une pièce de Loggia n'a pas d'`area` : elle se rattache par son nom,
sans accents ni casse ; la table des teintes `TEINTES_ZONES` est recopiée de `TEINTES_PIECE` d'App.jsx
et tenue par un test de source, sans un octet au démarrage), sinon celles d'une pièce configurée du même
nom (`vacuumRooms`), sinon la palette des pièces (des jetons, I17) ; l'icône se dessine dans la seconde
feuille, devant le nom de la région. (3) Ce que le robot publie lui-même (`rooms` d'Ecovacs), par la
commande de son intégration. La première qui existe gagne ; les autres restent lisibles.

**Le bit `CLEAN_AREA` dit si un robot sait viser des pièces (R1, bornée à ce qui est vérifié).** Il
conditionne `vacuum.clean_area` partout, et `spot_area` chez Ecovacs — la même condition dans
l'intégration. `app_segment_clean` (Roborock) et `vacuum_clean_segment` (Dreame, Xiaomi) ne dépendent pas
du bit : xiaomi_miio n'implémente pas le contrat, son service marche sans lui — la conception disait
« aucune pièce par commande sans le bit », le code vérifié dit moins.

**Le serveur lit, l'écran montre (R3).** `loggia/robots/etat` rend `pieces` par aspirateur, sous les
droits de lecture : `source`, `capable` (le bit), `association`, `carte_changee` (la réparation
`segments_changed_<id d'entrée>` de Home Assistant, R9 — ignorée dans Home Assistant, `dismissed_version`
posée, elle est fermée), `script_pieces` (le script des pièces est désigné), `zones` (`id: zone:cuisine`,
`nom`, `zone`, `segments`), `autres_cartes` et `autres_zones`, `segments` (ce que le robot publie). Ce
que personne ne lisait est sorti de l'état à la passe bis (`etage`, `noms_segments`, `commande`,
`passages`). **Une zone n'est « sur une autre carte » que si c'est PROUVÉ (R11, corrigée)** : son groupe
(le nom de sa carte dans `last_seen_segments`) ou son préfixe (l'identifiant de carte) est une AUTRE
option de la sœur `select` de carte — dont l'état est le NOM de la carte, chez Ecovacs (`active_map`,
vérifié sur `dev`) comme chez Roborock (`selected_map`), et dont les `options` sont les noms de toutes
les cartes. Un Roborock « Map 0 » à segments `0_16` sans groupe, un Ecovacs dont la carte a été renommée
dans l'application (`last_seen_segments` garde l'ancien nom), une sœur sans options : tout est sur la
carte active, l'intégration dira ce qu'elle fait. Tout vit dans `robots_pieces.py`, pur ; `robots.py` lit
l'état, les options du registre des entités, le registre des zones et des étages (des `UserDict` : tout
`Mapping` se lit, le niveau d'étage avec), la sœur de carte, la réparation et la description de la maison
— en lecture seule, à chaque état (15 s fiche ouverte), le registre des entités rangé UNE fois par état,
et un robot dont l'état est étrange n'emporte pas les autres. Aucune commande WebSocket nouvelle.

**Le départ par zones (R4, R5).** `loggia/robots/lancer { robot, zones: [{ id, nom, zone }] }` : le
serveur lit tout ce qu'il lit AVANT la garde du double départ (`_depart_recent`, le vol) — plus aucun
`await` entre la garde et le vol, deux appuis dont la lecture suspendrait ne font pas deux départs — puis
vérifie ce que Home Assistant refuserait après — `areas_not_mapped` arrive une fois les zones associées
parties — : ses scripts (`scripts_gardent_la_main`), le bit (`pieces_inconnues`), l'association
(`association_absente`), chaque zone (`zone_sans_piece`, une zone disparue du registre comprise), la
carte (`autre_carte`) ; puis UNE commande, `vacuum.clean_area { cleaning_area_id }`, attendue, bornée, en
vol comme un départ (ADR 0215) ; le carnet note les zones. Un passage du planning vise des zones (`zone`)
ou, pour un passage d'avant, des segments — jamais les deux (`lire_zones`) ; la feuille d'un passage
d'avant montre ses zones d'alors parmi les puces, et toucher une puce d'une autre forme REMPLACE
l'ancienne forme au lieu de la mêler ; un `invalid_format` du serveur se dit d'une phrase traduite, jamais
brut. À l'heure dite, la même vérification, et un passage que Home Assistant refuserait est RETENU, sa
cause au journal (« zone sans pièce associée », « association absente », « autre carte »). Un passage qui
NOMME des pièces que l'intégration ne sait pas viser est retenu lui aussi (« pièces inconnues de cette
intégration ») — plus jamais « tout le logement » à leur place ; chez Ecovacs, un `rooms` vide à l'heure
dite est d'abord une LISTE PÉRIMÉE (« liste des pièces du robot périmée »), serveur et écran. L'écran part
par le serveur ; un serveur sans `lancer` part en direct par le même service.

**La commande des pièces publiées, corrigée et bornée (R4 ; sa réponse Q2 A).** Chez Ecovacs,
`spot_area` reçoit une LISTE sur Home Assistant ≥ 2026.3 (la version lue par le serveur dans
`homeassistant.const.__version__`, par l'écran dans `hass.config.version` ; inconnue, elle vaut
récente), une chaîne avant. Sans le bit sur un Home Assistant récent, l'intégration refuse `spot_area` :
si le robot PUBLIE ses pièces (`rooms`) et qu'AUCUN script de départ n'est désigné, Loggia envoie la
commande que ses propres scripts envoient — `vacuum.send_command`, `command: clean_V2`, `params: { act:
start, content: { type: freeClean, value: "<passages>,<segment>,…" } }`, le premier nombre étant le
compteur de passages de l'appareil (sa sœur `clean_count`, sinon un) — **une exception NOMMÉE à « jamais
une commande d'intégration devinée »**, prouvée sur son modèle par ses scripts, bornée à cette
plateforme, à ce bit absent, à un `rooms` publié et à l'absence de tout script de départ, écrite à un
seul endroit par côté (`robots_pieces.py`, `robotsfiche.js` ; un test de source le tient). Et comme
`rooms` est INTERMITTENT chez lui (`getMapSubSet` en échec) : une liste vide ne fabrique aucune puce —
un Ecovacs qui ne publie pas `rooms` à l'instant n'a aucune puce par commande, le bit ou non, puisque le
serveur refuserait (`publieRooms`, qui ne compte ni `null` ni une chaîne) —, et la liste que le robot
publie fait foi : un segment demandé qu'il ne publie plus à l'instant du départ ne part pas
(`pieces_perimees`, « rouvrez la fiche » ; le planning est retenu). Chez lui, aujourd'hui, ses scripts
gardent la main ; l'exception sert à qui n'a aucun script de départ.

**Ce que la popup dit quand il n'y a pas de puce, ou qu'il manque quelque chose (§ 3.1 ; R8, R14 ;
sa réponse Q3 A : l'association ne se fait que dans Home Assistant).** Avec un script de départ désigné
(sa décision du 20/10) : rien d'autre que « Vos scripts gardent la main pour les pièces. » (ses
interrupteurs, et une association existe), la ligne qui dit où désigner son script des pièces (un
administrateur, sans `pieces_selectionnees`) ou celle qui dit qu'aucune pièce n'a d'interrupteur — ni
« carte », ni « ailleurs » : les puces ne sont pas ses zones, rien à refaire. Sans script de départ : le
bit sans association, rien de publié — à un administrateur, le chemin exact — « Associez une fois les
pièces du robot aux zones de Home Assistant : Paramètres › Appareils et services › Entités › {robot} ›
roue › « Associer les segments aux zones ». » —, à un compte ordinaire « Les pièces du robot ne sont pas
encore associées aux zones de Home Assistant. », comme le dialogue de Home Assistant qui ne lui montre
pas « Configurer ». Le bit sans association, le robot publie ses pièces : elles s'offrent par leur
commande, et un administrateur lit « Associez les pièces aux zones de Home Assistant pour les nommer
comme vos pièces. ». La carte refaite (la réparation ouverte, non ignorée) : « La carte du robot a
changé : refaites l'association dans Home Assistant. », en ambre, pour tout compte ; les puces restent.
Des pièces sur une autre carte, prouvée : « {n} pièces sur une autre carte ({carte}) — changez de carte
dans les réglages du robot. ». Sans le bit, Home Assistant n'offre rien à associer : aucune ligne. Muet :
rien, le liseré est le seul signal.

**Le plan coloré (R7).** Les pièces de la seconde feuille sont celles de « Où » ; une association
écrite par numéro de segment (`seg:1`) devient la zone de Home Assistant dont un segment porte ce
numéro — chez Ecovacs le suffixe `_1`, ailleurs l'identifiant nu — quand UNE seule zone y répond ;
aucune n'y répond (un autre étage, un autre aspirateur) : elle RESTE telle quelle ; plusieurs : elle est
oubliée et la région redit « ? » ; une fois, par l'administrateur qui ouvre la carte, et seulement si
quelque chose a changé. La détection des régions compte les pièces du ROBOT (la somme des segments des
zones), pas les zones : une zone peut porter plusieurs pièces.

**`areas_not_mapped` malgré tout (point 9 de la relecture).** Une zone vidée dans Home Assistant entre
la lecture (15 s au plus) et l'appel : Home Assistant lance les zones encore associées, puis lève
l'erreur. Le serveur la traite comme tout refus d'appel — la demande s'oublie, le journal dit « commande
refusée par Home Assistant », le toast `commande_refusee` — alors que le robot nettoie ; la session qui
s'ouvre se dit alors « Nettoyage », sans pièces. Rare, dit tel quel : garder la demande comme départ
partiel demanderait de distinguer cette erreur des autres, pour un cas que la vérification amont rend
exceptionnel.

**Rien au démarrage (R15).** Tout vit dans la popup (`ficherobot.jsx`, `robotsfiche.js`, `vacplan.jsx`),
les refus (`refusrobots.js`) et la démo ; `robotsetat.js` transmet déjà l'objet d'une zone tel quel ;
`fichecommune.jsx` gagne un emplacement `apres` sous les réglages de l'appareil (une prop, rien de
rendu). Le boot mesure 1 084 565 octets avant et après chaque tâche d'écran : zéro octet.

**Les textes (§ 11).** Sept langues ; le français au « vous » ; l'allemand, l'espagnol, l'italien et le
néerlandais au tutoiement (sa décision du 19/10, comme l'interface de Home Assistant) ; le polonais
nouveau marqué pour Seba882 — neuf textes de plus à la passe bis (la roue, les deux lignes, le refus, la
phrase du passage refusé). Le détail du passage retenu derrière ses scripts est la phrase même de la
popup : une seule clé. Les intitulés du dialogue de Home Assistant cités dans la ligne d'association
sont ceux de l'interface de Home Assistant dans la langue de l'écran : écrits ici d'après l'anglais
vérifié (« Map vacuum segments to areas »), à relire dans chaque langue de HA.

## Passe bis 2 du 20/10 — la relecture de contrôle

**Le bloquant : la roue pouvait effacer toute la description de la maison.** La roue écrivait
`loggia_entities` ENTIÈRE par `cfgSet` (`loggia/config/set`) depuis le cache de l'onglet — `null` ou
une vieille copie tant que `loggia/config/get` n'avait pas répondu —, et le serveur remplace la clé
entière. Chez lui, un onglet lent (l'application mobile, un navigateur neuf) montrait « Aucun » sur les
six rôles ; une désignation envoyait `{ loggia_entities: { vacuumScripts: { un rôle } } }` et effaçait
ses dix-neuf clés (alarme, caméras, climat, volets, énergie…) ; un onglet à la copie périmée renvoyait la
copie (les cas 2 et 3 de la sonde `sonde_cfgset.mjs`). Trois niveaux :
- **au serveur**, un chemin DÉDIÉ et ÉTROIT plutôt qu'une fusion générale de `loggia_entities` dans
  `config/set` : la commande `loggia/robots/scripts { role, script | null }` (`require_admin`, comme
  `robots/config`), que `LoggiaRobots.async_designer_script` sert — `fusion_vacuum_scripts` (pure) fond le
  rôle dans la description EN PLACE sous le verrou du magasin (`async_modifier_shared`, lot 15 de l'audit
  du 03/10) ; une description illisible refuse (rien ne s'écrit) ; le magasin signale la clé changée aux
  écrans (`signaler_communes`, ADR 0067) ; la commande rend l'état des robots. Pourquoi pas une fusion
  dans `config/set` : le serveur ne saurait pas distinguer « la roue écrit un rôle » de « Paramètres écrit
  la description entière », qui doit pouvoir retirer une clé — une règle sur la forme du message serait une
  devinette ; une commande qui ne porte QUE le rôle ne peut rien effacer d'autre. L'état porte désormais
  `pieces[robot].scripts`, les rôles désignés de l'aspirateur principal (`{}` pour un autre) : la roue lit
  la vérité du serveur, plus la description que l'écran tient ;
- **à l'écran**, rien ne part tant que le composant n'a pas répondu (`pret` : son état est là — la notion
  de l'onglet Planning, vraie en démo aussi) : les rangées attendent, désactivées, `aria-disabled`, « … »
  à la place d'un « Aucun » qui mentirait ;
- plus aucune transformation côté écran : rien ne peut rendre `null`, et la copie du navigateur ne repart
  jamais — la sonde rejouée montre que seul `{ role, script }` quitte l'onglet, et `config/set` n'est
  plus jamais appelé par la roue. La phrase « deux écrans ne s'effacent pas » était fausse : deux écrans
  ne s'effaçaient pas SI chacun avait lu la configuration ; l'onglet qui ne l'avait pas lue effaçait tout.

**Le planning par `nettoyer_tout` ignorait une main posée sur le robot** (sonde S3) : `regles.agir('script',
'turn_on', [script])` regardait le gel du SCRIPT. Avant la branche script, `regles.gele(robot)` retient le
passage (« sous la main de quelqu'un »), comme pour `vacuum.start`.

**« Localiser » par son script, repris** (sondes S2, S2c) : plus de geste GARDÉ pour Localiser (il bloquait
« Nettoyer tout le logement » sept secondes, la puce inerte) — le geste partagé, sans garde, et
`gestePermis` ne retient que Localiser lui-même pendant son vol : un double appui ne relance pas le script,
« Nettoyer tout le logement » reste offert. « Il bipe : suivez le son » revient à la réponse du serveur. Un
script absent ou muet (`unavailable`, `unknown`) est un script absent, partout (`_etat_script` au serveur,
`scriptVivant` à l'écran) : Home Assistant saute en silence une entité indisponible d'un service d'entité —
`script.turn_on` « réussissait », rien ne bipait, le journal disait « script : Localiser » ; il se refuse
(`script_inconnu`), ne garde plus la main (`_script_depart`), et l'écran retombe sur `vacuum.locate`, sans
toast ; un serveur d'avant le redémarrage (`invalid_format` : son schéma ignore le rôle) aussi. La CARTE fait
comme la popup : un seul geste (`localiserRobot`, App.jsx) pour la carte, la compacte, la popup et la fiche
universelle — son script s'il est désigné (`cfgVal('loggia_entities')`, l'aspirateur principal), sinon
`locate` par le moteur d'actions.

**Mineurs.** La lecture des pièces d'un départ se protège (`_async_pieces_ou_rien`, sonde S4) : une lecture
qui lève n'empêche pas « tout le logement », et des zones se refusent sans devinette ; un `try` par
planning dans `async_minute` — un planning qui lève ne fait pas tomber les autres de la même minute. Le plan
coloré ne reçoit que les pièces qu'on peut choisir (`choisir ? pieces : []`) : plus de pièce cliquable
sans effet dans la seconde feuille. Chaque refus de la roue dit sa raison (un plafond n'est pas « réservé
aux administrateurs »). La couleur d'une zone : une pièce de Loggia se rattache aussi par la ZONE de ses
capteurs (`haid.temp`, `haid.humidity` → `areaOf` de l'index, comme `RoomNav`) — sans un octet au
démarrage, l'index est déjà là ; une pièce nommée autrement que sa zone garde sa teinte. L'heure de sa
décision : **08:05** le 20/10. Le boot reste sous sa borne (1 084 531 ≤ 1 084 565) : le geste de la carte
compacté, et trois resserrements sans effet (`MOTS_FICHE_ROBOT` sans les mots que les puces portent déjà,
`vueCarnetRobot`, `useEtatRobots`).

## Petit paquet du 25/10

1. **Un identifiant se valide en entier.** `SCRIPT`, `ROBOT`, `IDENT` (robots.py), `ROBOT` (robots_carnet.py) et `ZONE`
   (robots_pieces.py) passent par `fullmatch` : avec `match`, le `$` de Python acceptait un `\n` final (« script.x\n »).
2. **L'aspirateur principal est celui du serveur.** `loggia/robots/etat` publie `principal` (`_aspirateur_principal`, sous les
   droits de lecture) ; la popup ne lit plus que lui pour la roue et les scripts maison — sans réponse, aucun script (la roue
   attend seulement, désactivée). `LOGGIA_RESOLVED.vacuum.main` reste pour les cartes et l'Accueil ; le faux serveur fait pareil.
3. **« Localiser » se décide au serveur.** `loggia/robots/lancer {localiser: true}` : son script `localiser` désigné et qui répond,
   sinon `vacuum.locate` sous le contexte de la personne (`robot_injoignable`, `geste_refuse`) ; l'écran ne lit plus `cfgVal`. Un
   serveur d'avant refuse la clé (`invalid_format`) et l'écran envoie `locate` lui-même — jamais un départ à la place.
4. **Une description illisible a son code.** `description_illisible` (`RefusNomme`) dans `fusion_vacuum_scripts` ; la roue le dit
   en une phrase, dans les sept langues (le polonais à relire par Seba882).

## Ce que cela coûte

Un redémarrage de Home Assistant à l'installation, sur son « go » : `robots.py` change,
`robots_pieces.py` naît, le schéma de `loggia/robots/lancer` accepte le rôle `localiser`, et UNE commande
WebSocket nouvelle, `loggia/robots/scripts` (passe bis 2 — la roue n'écrit plus la description de la maison
depuis l'écran). Une lecture des registres (entités — rangé une fois —, zones, étages,
réparations) à chaque état — des lectures en mémoire. Chez lui : rien ne bascule ; le jour où il désigne
son script des pièces dans la roue, les puces de « Où » deviennent ses interrupteurs, et c'est tout. Son
robot n'a pas le bit tant que deebot-client ne connaît pas la commande de pièces de son modèle (à
demander sur le dépôt `DeebotUniverse/client.py`, le nom du fichier est le `model_id` du registre des
appareils) ; une mise à jour qui le lui donnerait ne changerait rien tant que ses scripts sont désignés.
Un passage d'avant qui nomme des pièces que l'intégration ne sait plus viser ne nettoie plus toute la
maison à leur place : il est retenu, et la popup le redit. Deux clés de catalogue que plus rien
n'appelait partent (« passage complet », « nettoyer tout (pieces inconnues de cette integration) »).

## Ce qu'on n'a pas fait

Proposer l'association par les noms depuis Loggia et l'écrire dans le registre (Q3 B) ; un « profil de
nettoyage » (passages, mode, eau avant un départ, R10 : `spot_area` garde `cleanings: 1`, l'exception
prend le compteur de l'appareil tel quel) ; changer de carte avant un départ ; lire les segments frais
(`vacuum/get_segments`, réservé aux administrateurs et au nuage) ; un écran pour les interrupteurs de
pièces (`vacuumRooms`) — la roue ne désigne que les scripts ; garder la demande au carnet comme départ
partiel sur `areas_not_mapped`. Rien n'a été vu sur son matériel ni sur un Roborock : les formes des
sœurs de carte sont celles du code de `dev`.

## Ce que les tests tiennent

`tests/python/test_robots_pieces.py` (la version, les pièces publiées, `commande_pieces` en liste, en
chaîne et l'exception, `commande_zones`, les zones du registre et leur ordre, les autres cartes — par
groupe, par préfixe, PROUVÉES par une autre option du `select` (Roborock « Map 0 », carte renommée, sans
options) —, l'ordre des sources, le script de départ à trois états et `verifier_zones` qui le refuse,
l'état allégé, la réparation, `segments_perimes`, `clean_V2` à un seul endroit),
`tests/python/test_robots.py` (`lire_zones` avec `zone`, `pieces` dans l'état sous les droits de
lecture, `lancer` par zones et ses refus, le planning par zones et ce qu'il retient, un passage d'avant et
une liste périmée, ce que le serveur lit de Home Assistant ; la passe bis : le planning par pièces retenu
derrière ses scripts et « tout » par son `nettoyer_tout`, `lancer` refusé par `scripts_gardent_la_main`,
la source `scripts` au seul aspirateur principal, le niveau d'étage dans un `UserDict`, `rooms` vide =
liste périmée, deux départs dont la lecture suspend, la réparation ignorée, le registre rangé une fois et
le robot étrange, le rôle `localiser`), `tests/robots_pieces.test.mjs` (la version, `commandeZones`
corrigée et l'exception, `commandeZonesHA`, le compteur de passages, `publieRooms` sans `null`,
`piecesDeLaVue` avec la teinte et l'icône choisies, l'ordre des pièces de Loggia, `TEINTES_ZONES` tenue
avec `TEINTES_PIECE` et la palette avec `MED_COLORS`, `lignesPieces` avec et sans script de départ,
`zonePlanning` avec `zone`, `migrerAssociationPlan` qui garde un `seg:` sans zone, les scripts par rôle et
leurs suggestions, `clean_V2` à un seul endroit), `tests/fiche_robot.test.mjs` (les zones en puces et le
départ par zones par le serveur et en direct, les lignes pour un administrateur et un compte ordinaire,
ses scripts qui gardent la main, la carte refaite et une autre carte, l'exception et le compteur, `rooms`
vide, `spot_area` en liste, la seconde feuille et la migration du plan ; la passe bis : son cas avant et
après, la roue et ses six rangées, l'écriture de `loggia_entities`, le refus qui nomme la clé, le compte
ordinaire, « Localiser » par script, un passage d'avant édité, `invalid_format` traduit, le nombre de
pièces du plan), `tests/robotsetat.test.mjs` et `tests/robots_vue.test.mjs` (assertions modifiées),
`tests/robots_planning.test.mjs`, `tests/demo_robots.test.mjs` (chaque variante, dont
`scripts-sans-pieces` et `scripts-avec-pieces`, le mélange des formes refusé, la sœur de carte),
`tests/langues_robots_pieces.test.mjs` (les sept langues, les deux blocs, le tutoiement, Seba882, aucune
clé dormante). La passe bis 2 : `tests/python/test_robots.py` (le rôle seul fondu dans la description
entière — les vingt clés de sa maison intactes —, la sonde de la relecture rejouée sur `fusion_vacuum_scripts`,
les refus qui n'écrivent rien et la commande réservée aux administrateurs, `pieces[robot].scripts` au seul
aspirateur principal, la main posée qui retient le planning par script, le script muet qui ne part pas et ne
garde plus la main, la lecture des pièces qui lève), `test_robots_pieces.py` (`scripts` dans l'état),
`test_websocket_api.py` et `test_demarrage.py` (la commande classée, enregistrée, comptée),
`tests/fiche_robot.test.mjs` (le rôle seul par `loggia/robots/scripts`, l'état rendu lu par la roue, la roue en
attente, chaque refus et sa raison, « Localiser » par le geste de la carte sans garde et ses replis),
`tests/carte_robot.test.mjs` (« Localiser » de la carte par son script, un seul appui, « Démarrer » offert,
les replis), `tests/robots_carte.test.mjs` (`gestePermis` pendant un Localiser), `tests/robots_pieces.test.mjs`
(`scriptVivant`, le rattachement par les capteurs), `tests/demo_robots.test.mjs` (la roue en démo).

## Notes de version (à dire, quand ce sera publié)

Les pièces d'un robot sont celles de Home Assistant : associez une fois ses pièces aux zones dans ses
réglages (Home Assistant 2026.3 et après), et la popup les propose, sans rien configurer dans Loggia.
Vos scripts gardent la main : dès qu'un script de départ est désigné dans la roue de la popup
(« Scripts de la maison »), Loggia ne prend pas la main sur les pièces. Un passage planifié qui nommait
des pièces que votre robot ne sait pas viser ne nettoie plus toute la maison à leur place : il est
retenu, et la popup le dit. Chez Ecovacs, les pièces partent en liste (deebot-client 18) ; un Ecovacs sans
commande de pièces dans la bibliothèque, sans aucun script de départ, part par la commande que ses
propres scripts envoient (`clean_V2`), une exception nommée. Dans la roue, désigner un script n'écrit plus
que ce rôle : le reste de la description de la maison ne bouge pas, quel que soit l'écran qui le fait.
« Localiser » passe par votre script quand vous en désignez un, et ne retient plus « Nettoyer tout le
logement ». Un redémarrage de Home Assistant à l'installation.

## Trois défauts du 25/10

Un geste par script maison (pause, reprise, retour à la base, localiser) partait vers un robot muet :
Home Assistant lançait le script, l'écran disait « fait », et rien ne bougeait. `_async_lancer_script`
refuse désormais un robot `absent` pour TOUT rôle par `robot_injoignable`, comme un départ et comme
`locate`, avant tout appel : rien ne part, rien au carnet ni au journal. Les contrôles d'avant gardent
leur ordre (script inconnu, puis droits, puis le robot). La démo (`lancerRobotDemo`) jouait le geste sur
un robot muet : elle le refuse aussi. Tests : `test_un_script_maison_ne_part_pas_vers_un_robot_muet`
(`tests/python/test_robots.py`), et le dernier test de `tests/demo_robots.test.mjs`. Un redémarrage de
Home Assistant à l'installation.

## Petit paquet du 26/10

Le refus `robot_injoignable` disait « Départ non lancé — le robot ne répond pas », y compris pour une
pause, une reprise, un retour à la base ou « Localiser » par script : le refus ne porte pas le geste, la
phrase devient neutre, « Commande non envoyée — le robot ne répond pas » (`src/refusrobots.js`, six
catalogues ; l'ancienne clé les quitte tous les six). La démo
croyait qu'un script maison existait dès qu'il avait un état : comme le vrai (`_etat_script`), un script
`unavailable` ou `unknown` est absent — il ne part pas (`script_inconnu`), ne garde pas la main sur les
pièces, et « Localiser » se replie sur `locate` (`scriptRepondDemo`, `src/demo.js`). Tests :
`tests/refus_codes.test.mjs`, le dernier test de `tests/demo_robots.test.mjs`. Rien ne change côté
serveur : pas de redémarrage de Home Assistant.

## Grille des pièces (26/10)

Les puces de « Où » se suivaient dans un `flex-wrap` : des lignes irrégulières, des largeurs
différentes, et « Tout le logement » ressemblait à une pièce de plus. Il a choisi la « Grille
régulière » (plutôt qu'un menu déroulant ou que rien) : « Tout le logement » (« Tout le jardin » pour
une tondeuse) prend toute la ligne, à part, au-dessus ; 12 px d'air ; puis les pièces dans une grille
sans cadre, aux colonnes de largeur égale, `repeat(auto-fill, minmax(104px, 1fr))`. Le minimum est
MESURÉ en démo : la largeur utile du panneau de tête vaut 236 px à 320 de fenêtre, 276 à 360, 306 à
390 et 396 dans la popup de bureau ; il faut au plus 114 px pour garder deux colonnes à 320, plus de
97 pour n'en pas mettre trois à 390, au plus 126 pour en avoir trois au bureau — 104 donne deux
colonnes au téléphone et trois au bureau. Chaque puce (`PuceOu`) prend toute sa case et passe de 40 à
44 px de haut (une cible tactile, la même partout) ; un nom trop long se coupe sur sa ligne, en points
de suspension, et garde son nom entier en `title` et en `aria-label`. Rien ne change dans ce que les
puces font ni envoient (`toutChoisi`, `toutPrendre`, `basculerZone`, `z.inerte`, `enRoute`), ni dans
les lignes de « Où ». L'ordre du DOM est l'ordre visuel : la tabulation suit les lignes de la grille,
avec le focus commun (`:focus-visible`). Tests : `tests/fiche_robot.test.mjs` (« grille des pièces » ;
la hauteur de 44 px au point 13).
