# 0155 — Le distributeur comme le robot

Date : 05/10/2026 (v3.86.0). Statut : appliqué — le contrat a été figé
avant le code, ce qui a été livré, mesuré et relu est en fin de document.
**Redémarrage de Home Assistant requis** (décision 0126) : deux commandes
WebSocket et trois modules Python nouveaux.

## Contexte

La fiche du distributeur tenait en une page, et son « planning » était une
liste de repas SAISIE dans Paramètres : une heure, un libellé, des grammes,
un interrupteur. L'heure affichée était une copie, pas celle de
l'automatisation qui distribue vraiment. C'est le « spécifique à ma config »
dont l'utilisateur se plaint. « Distribuer » prenait le premier
`select.*feed` de TOUTE la maison, l'épingle le premier
`number.*serving_size`, et un script deviné à son nom pouvait servir de
commande. Le composant, lui, ne savait rien du distributeur.

Quatre études du 05/10 (le distributeur actuel, le modèle du robot, les
intégrations, les automatisations), puis un plan contesté point par point
(`distributeur_plan_corrige`), ont abouti aux décisions ci-dessous.

## Décisions de l'utilisateur (05/10)

1. **Le Planning lit ses sources dans cet ordre** : le programme de
   l'appareil, puis les automatisations de Home Assistant qui COMMANDENT le
   distributeur, reconnues seules, puis un planning tenu par Loggia côté
   serveur. Ce dernier n'est proposé que s'il n'y a ni programme ni
   automatisation.
2. **Une automatisation se reconnaît à ce qu'elle FAIT** : une ACTION qui
   commande le distributeur, scripts suivis, l'heure lue dans le
   déclencheur. Jamais à son nom.
3. **La liste de repas de Paramètres disparaît, sans rien perdre en
   silence** : encart « Ancienne liste de repas », et ses automatisations
   servent d'indices.
4. **Un repas du planning Loggia qui tombe pendant un redémarrage de HA :
   rien.** Il est noté « manqué » au journal, comme un passage de robot
   (ADR 0043).
5. Version 3.86.0, cette décision.

## La fiche

Une feuille à onglets sur le modèle du robot (ADR 0042) : **Accueil,
Planning, Historique, Entretien**, et la roue **Réglages** dans l'en-tête,
qui ouvre une page, pas un onglet. Un appareil = sa carte + sa fiche, pas de
vue (ADR 0153). Le Planning est **toujours** là, avec un état honnête :
serveur muet (HA pas redémarré) → « Planning indisponible pour l'instant » ;
aucune commande → « Loggia ne sait pas commander ce distributeur… » ; rien de
programmé → « Aucun repas programmé ». (Le plan disait aussi « sauf si
l'appareil est introuvable ET qu'aucune commande n'existe » : c'est
précisément le cas de son deuxième état vide, l'exception tombe.)
L'Historique aussi, « indisponible » distinct de « vide » ; Entretien
seulement s'il a quelque chose à montrer. L'épingle reste celle d'une ENTITÉ :
le `haid` désigné, sinon la commande, sinon la portion.
`ficherobot.jsx` ne bouge pas : dix-neuf tests le lisent comme du texte. Le
socle commun (`src/fichecommune.jsx`) en recopie environ 150 lignes,
assumées ; migrer le robot dessus est un lot à part.

## Le vocabulaire : présente, active

- **PRÉSENTE** : la source existe. Programme : lisible avec au moins un
  créneau, ou déclaré par l'appareil sans être lisible. Automatisations : au
  moins une reconnue, allumée ou éteinte.
- **ACTIVE** : elle distribue. Programme : lisible avec un créneau allumé.
  Automatisations : au moins une reconnue est allumée.
- Un programme **illisible** est présent et **non actif**. Il empêche
  d'ajouter un repas Loggia (on ne sait pas ce qu'il fait). Il n'allume pas
  l'avertissement « deux sources », sinon un Aqara en mode programmé sans
  créneau crierait au loup. Il ne retient pas non plus un repas Loggia déjà
  là.
- **connu** = faux quand on ne PEUT pas savoir si l'appareil distribue seul :
  Tuya sans service, Xiaomi, Catlink, LocalTuya, ESPHome — et un Aqara dont
  le MODE est illisible (`unavailable`, `unknown` : un Zigbee2MQTT hors ligne
  fait tomber toutes ses entités), qui ne se dit ni « manuel » ni « tenu par
  l'appareil ». Le formulaire du
  planning Loggia porte alors une mise en garde fixe : « Si l'application du
  fabricant programme aussi des repas, coupez-les : sinon l'animal mange deux
  fois. »

## Les sources, calculées par le serveur

`distributeurs.py > sources(user)` rend `{programme, automatisations,
loggia}`, chacune `{presente, active}` ; `source_active()` rend `appareil |
automatisations | loggia | None`. Le serveur tient la règle lui-même, pas
seulement l'écran :
- « Ajouter un repas » (admin) n'existe que si AUCUNE source n'est présente
  et qu'une commande est trouvée (`peutPlanifier`) ;
- un repas Loggia déjà là quand une source supérieure devient ACTIVE est
  **retenu au départ** : `async_lancer` recalcule `sources()` juste avant
  d'envoyer, note « autre source » au journal, et reprend seul quand l'autre
  source s'arrête. L'écran grise le bloc (« En pause ») sans le supprimer ;
- deux sources actives (programme lisible + automatisations) : on montre les
  deux blocs et l'avertissement, on ne coupe rien soi-même.

**Le programme de l'appareil**, en LECTURE seule en v1
(`distributeur_appareil.py`, pur) : Petlibro (`feeding_schedule`), PetKit
(`raw_distribution_data`, capteur de diagnostic souvent désactivé : on le
dit), Aqara sous ZHA (mode seulement) et sous Zigbee2MQTT (mode, et la liste
quand elle est complète), PetSafe (présent, illisible), tuya-local (un
`meal_plan` non vide = présent, illisible : AUCUN décodage, le format change
d'un produit à l'autre et une heure fausse est pire que rien), Tuya
officielle (le service `tuya.get_feeder_meal_plan`, s'il existe, appelé à
l'ouverture de la fiche seulement — jamais au sondage de la carte — avec un
délai de 5 s et un cache de 10 min ; une erreur se lit « non lisible », jamais
une panne). **Au départ d'un repas Loggia**, le serveur recalcule les sources
comme pour la fiche ouverte, Tuya compris (même délai, même cache) : c'est le
moment où une double ration se joue, et seul le sondage de la carte est exclu
(correction du contradicteur, 05/10 : « le dernier programme lu » laissait,
après un redémarrage sans fiche ouverte, `connu` faux et le repas partir à
côté d'un programme de l'application). Un Aqara en mode manuel n'est PAS une
source : ses créneaux ne partent pas, et la fiche le montre. Sous
Zigbee2MQTT, la liste n'est lue que si l'état est un JSON complet ; une liste
au format Python (guillemets simples, ce que Home Assistant affiche d'un
gabarit qui rend une liste) reste illisible en v1, même complète : remplacer
des guillemets serait deviner.

**Les automatisations** (`automatisations.py`, générique) : candidates par
`automations_with_entity` / `automations_with_device` sur les cibles de
commande, un second saut par les scripts (`scripts_with_*`, trois niveaux,
garde anti-cycle), et les appels directs `script.<id>` trouvés en parcourant
`raw_config` (Home Assistant ne les compte pas comme références). Le filtre
porte sur les **actions** : `action_script.referenced_entities /
referenced_devices`, avec repli sur `raw_config` quand l'attribut manque
(automatisation indisponible, version future). Une automatisation qui ne fait
que LIRE le bac, ou qui décrémente le réservoir, est écartée. Les cibles de
commande — la commande, le number de portion, le select de mode, le script
désigné, jamais un capteur ni le réservoir — servent à TROUVER les
candidates ; ne sont GARDÉES que celles dont une action vise une **cible de
repas** : la commande, le script désigné, ou un script qui commande.
Régler la portion ou le mode est un réglage, pas un repas (correction du
contradicteur, 05/10) : sinon une « portion d'hiver » posée chaque matin à
06:00 passerait pour un repas de trois portions, entrerait dans le prochain
repas et les jours de réserve, et rendrait les automatisations ACTIVES —
donc retiendrait le planning Loggia : un repas sauté. Une device action se
résout par le registre (son `entity_id` est un identifiant de registre) et
compte si l'entité résolue est une cible de repas ; non résolue, il faut
l'appareil du distributeur, un domaine button / number / select / text et,
pour un select, l'option START (une lumière du distributeur, ou son mode
choisi dans l'éditeur visuel, ne sont pas des repas). Les formes au singulier et au
pluriel (2024.7 et 2024.10), `platform` / `trigger`, `service` / `action`
sont lues toutes deux. Une heure qu'on ne peut pas déduire ne s'invente
pas : « Sans heure fixe », « Lever du soleil », « Toutes les 8 h »,
« Déclenchée autrement » ; ces heures-là n'entrent ni dans le prochain repas
ni dans les jours de réserve.

**Le planning de Loggia** (`distributeurs.py`, patron de `robots.py`) : un
tic par minute, posé seulement s'il existe un repas actif.

## Pas de « suivre » sur la commande

Le module **n'appelle pas `regles.suivre`** sur la commande du distributeur.
Sinon une ration donnée à la main depuis Home Assistant gèlerait l'entité
30 min (`GEL_DEFAUT`), et le repas programmé suivant serait retenu « sous la
main de quelqu'un ». Pour un robot, un passage sauté est un moindre mal ;
pour un animal, un repas sauté compte. Une ration manuelle ne décale ni
n'annule jamais un repas programmé. Un test le verrouille.

Un repas Loggia est **retenu**, et le journal le dit, quand : aucune
commande n'est trouvée (« commande inconnue ») ; l'entité de commande est
`unavailable` ou absente (« distributeur injoignable ») ; une source
supérieure est active (« autre source ») ; l'appareil a changé depuis
l'enregistrement du planning (« distributeur change »). Au démarrage, un repas
du jour passé depuis moins de 30 min est noté « manque au redemarrage », sans
rien distribuer.

## La commande, et la quantité

`commande_distribuer(soeurs, etats, cfg)` (Python) et `commandeDistribuer()`
(JS) appliquent la MÊME table, prouvée par une seule fixture ; la première
règle qui s'applique gagne, et elle ne regarde QUE les entités de l'appareil
désigné :
1. un `button` de clé `manual_feed` / `feed`, ou de suffixe `feed` /
   `food_out` (hors plan, schedule, reset, cancel, enable, disable) →
   `button.press` ;
2. un `number` de clé `feed` / `manual_feed` sur tuya, tuya_local ou petkit
   → `number.set_value`. C'est l'ÉCRITURE qui distribue : jamais un curseur ;
   un number dont la clé parle de quantité, de taille, de portion ou de poids
   est un réglage, jamais une commande ;
3. un `text` de clé `manual_feed…` (PetKit) → `text.set_value` ;
4. un `select` de suffixe `_feed` qui propose `START` (Zigbee2MQTT) →
   `select.select_option` ;
5. le script DÉSIGNÉ dans Paramètres → `script.turn_on`, avec `variables:
   {portions}`. Un script deviné à son nom ne part jamais ;
6. sinon rien : « Loggia ne sait pas commander ce distributeur ».

**Une portion = un pas de l'entité** (précision du 05/10, en écrivant la
fixture) : la valeur écrite pour n portions vaut `min(max, max(min, n ×
pas))`. Le plan disait « value = portions » : écrire 2 dans le number en
grammes d'un PetKit au pas de 20 serait refusé, ou distribuerait 2 g. Le
bouton de la carte envoie une portion, donc un pas.

Un select feed muet garde ses options (attributs de capacité, que Home
Assistant conserve) : il est reconnu, et la fiche dit « Ce distributeur ne
répond plus » plutôt que « ne sait pas commander ». **Hors ligne** (ADR 0048) :
la commande `unavailable` ou absente, la connectivité de l'appareil à `off`,
ou le réservoir désigné muet — `unavailable` ou absent, comme la carte
d'avant ; un réservoir `unknown` est SANS VALEUR, pas en panne (`health.js`
sépare les deux), et ne pose pas le liseré. Le réservoir seul ne suffisait
plus : chez l'utilisateur, c'est un `input_number` qui ne tombe jamais.

## Les formes figées

**`loggia_feeder`** (configuration de la maison) garde `haids`, `haid`,
`script` et, pour la migration, `meals` ; il gagne :
- `appareil` : le device_id du distributeur, facultatif, choisi dans
  Paramètres par `ListeChoix`. À défaut, l'appareil de la première entité
  désignée (haid > portionWeight > distribuees > reservoir) ; une entité
  désignée sur un AUTRE appareil est ignorée et signalée (`appareil_divergent`) ;
- `associees` : des `automation.*` associées à la main par un administrateur,
  pour ce que Home Assistant ne référence pas (`mqtt.publish` vers
  zigbee2mqtt, cible en gabarit, `area_id`, `label_id`).

**`loggia_distributeurs`** (le planning de Loggia, sous verrou par
`async_modifier_shared`) : `{appareil, repas: [{id, heure 'HH:MM', jours
[0 = lundi … 6], portions 1..20, actif}]}`, douze repas au plus. Illisible :
écarté au chargement, refusé à l'écriture (`RefusNomme('trop_de_repas', …)`).
`est_du` et `lire_heure` viennent de `robots.py`, le format est le même.

**`loggia/distributeurs/etat`**, OUVERTE, `{detail?: bool}` : `source`,
`sources`, `appareil {device_id, nom, fabricant, modele}`, `programme
{source, connu, presente, active, lisible, mode, note, repas[]}`,
`automatisations[]`, `planning`, `peutPlanifier`, `commande {domaine,
quantite, min, max, pas}` (sans entity_id ni données brutes de trop),
`ancienne_liste {n, relies, non_relies: [{heure, label}]}`, `notes[]`,
`journal` (vingt lignes du module).

**Un élément d'automatisation** : `{entity_id, nom, etat, dernier,
declencheurs: [{type: heure | soleil | periodique | autre, heure |
evenement + decalage | toutes + heures}], heures[], jours | null,
conditionnel, portions | null, pilotable, modifiable, id_config (seulement si
modifiable), indice: null | ancienne_liste | associee}`. `indice` n'est posé
que sur une automatisation NON reconnue par ses actions : l'écran en tire
« Reconnue par votre ancienne liste », qui serait faux pour une automatisation
reconnue d'elle-même que l'ancienne liste nommait aussi. JAMAIS `raw_config`,
`message` ni `data` : Home Assistant réserve `automation/config` aux
administrateurs, la commande ouverte ne doit pas le contourner.

**`loggia/distributeurs/config`**, `@require_admin`, `{patch: {repas}}` :
`repas` REMPLACE la liste. Les refus nommés sont relayés comme ceux des
robots.

**Les signatures** sur lesquelles les tranches s'accordent :
`resumer(hass, cibles, appareils, scripts, indices, user)`,
`commande_distribuer(soeurs, etats, cfg)`,
`programme_appareil(soeurs, etats, services)`,
`appareil_de(cfg_feeder, registre)`, `soeurs(registre, etats, device_id)`.

**La fixture partagée** `tests/fixtures/distributeurs.json` : trente et un
appareils typiques (Petlibro, PetKit avec et sans capteur de diagnostic, Tuya
officielle avec et sans service, tuya-local vide et plein, Aqara sous ZHA et
sous Zigbee2MQTT dans chaque mode — liste JSON, vide, tronquée, au format
Python, tout muet —, Catlink, PetSafe, Xiaomi, LocalTuya, ESPHome, fontaine,
litière, deux distributeurs et un select feed étranger, un appareil SANS
commande au milieu de commandes étrangères, appareil et script désignés
ensemble, script seul, script deviné, réservoir muet et réservoir sans
valeur), vingt et une automatisations résumées, les tables en constantes
nommées, et un exemple de chaque forme. Python et JS la lisent ; une table
qui divergerait rougit des deux côtés. Les constantes de chaque côté sont
comparées à `tables` clé par clé : une vingtaine d'entrées ne décident
d'aucun attendu, les cas seuls ne les figent pas.

## Droits (ADR 0144)

- `etat` est ouverte, mais filtrée : une automatisation que le compte ne peut
  pas lire n'apparaît pas (`_lecture_autorisee`), celle qu'il ne peut pas
  commander arrive `pilotable: false` (`controle_de`).
- « Modifier dans Home Assistant » : seulement si `modifiable` (`is_admin` de
  Home Assistant ET un identifiant de configuration), jamais dans la démo.
- Ajouter, supprimer un repas Loggia, son interrupteur, « Associer »,
  « Oublier l'ancienne liste » : masqués pour un compte ordinaire
  (`compteOrdinaire`), contrairement à l'onglet Planning du robot, dont
  l'écart n'est PAS recopié.

## La migration

Rien ne se perd en silence, et rien ne resert en silence.
- `meals` n'est ni effacé ni reconstruit. `feederAEcrire` le recopie tel quel
  (avec `associees` et `appareil`), relu au moment de l'écriture : toutes les
  vues réécrivent `loggia_feeder`.
- Plus aucun écran ne prend l'ancienne liste pour un planning. Ses
  `automation.*` deviennent des indices, montrés même non reconnus (« Reconnue
  par votre ancienne liste ») ; ses `input_boolean` ne sont pas repris : ils
  ne distribuaient rien par eux-mêmes.
- Paramètres perd « Repas de la journée » et gagne le champ « Appareil » et,
  s'il y a une ancienne liste, l'encart qui la compte (reliés, non reliés,
  avec leurs heures) et « Oublier l'ancienne liste » (admin) : `meals: []`,
  et les automatisations reliées restent associées (`associees`).
- Pas de conversion automatique vers le planning Loggia.
- Les lignes de repas que l'ADR 0153 avait mises dans la popup, chacune avec
  son interrupteur, partent avec la liste : la fiche montre à la place une
  ligne par automatisation reconnue, avec le sien (« Couper cette
  automatisation coupe ses {n} repas »).
- Avant le redémarrage de Home Assistant : « Planning indisponible pour
  l'instant », Distribuer marche (table JS), l'ancienne liste n'est plus un
  planning.

## Hors périmètre (v1)

Plusieurs distributeurs (`obj:feeder` reste unique ; un second garde sa
carte générique d'Objets, et la commande ne sort jamais de l'appareil
désigné). Écrire le programme d'un appareil. Décoder tuya-local. Lire Xiaomi,
LocalTuya, ESPHome, Catlink. Reconnaître un appareil comme distributeur par
lui-même (règle R0) : il se désigne. Une commande générique
`loggia/appareil/automatisations` : `resumer()` est prêt, rien ne l'appelle
encore hors du distributeur. Suivre une branche `choose` / `if` pour dire
qu'un repas est conditionnel. Rattraper un repas manqué (décision 4).

## Relevé en écrivant la fixture (05/10)

Six précisions du plan, à respecter par les tranches qui la lisent :
- une entité **masquée** reste une sœur : tuya-local masque son
  `meal_plan`, l'écarter ferait croire à un appareil sans programme — et
  proposer un planning Loggia par-dessus. Seules les entités désactivées
  sortent (elles n'ont pas d'état) ;
- **une portion = un pas** (ci-dessus) ;
- un Aqara en mode programmé **sans liste lisible** est présent mais non
  actif : le plan disait l'un dans son vocabulaire et l'autre dans ses tests ;
  c'est la lecture de ses tests et de son point 7 qui est retenue ;
- une **litière** PetKit (sans commande de distribution) n'est pas invitée à
  « activer le capteur de diagnostic » : `capteur_diagnostic` exige une
  commande PetKit ;
- **conditionnel** couvre toute condition de niveau haut autre qu'une
  condition d'heure (le plan citait or, not, template, state ; `numeric_state`
  en est une aussi) ;
- une **device action** ne vaut commande que dans les domaines button,
  number, select, text.

## Relu par le contradicteur (05/10)

Sept corrections du contrat, chacune avec son cas dans la fixture, vu rouge
sur la première version de la règle :
- **réglage ≠ repas** : seule une action sur une cible de repas garde une
  automatisation (cas `reglage_de_la_portion_seulement`,
  `mode_programme_le_soir`, `device_action_sur_le_mode`,
  `device_action_sur_la_portion`) ;
- **indice** seulement pour une automatisation non reconnue (le contrat
  d'exemple marquait « ancienne liste » une automatisation reconnue) ;
- **réservoir `unknown`** n'est pas une panne (`reservoir_sans_valeur`) ;
- **mode Aqara illisible** = inconnu (`aqara_z2m_tout_muet`) ;
- **liste Z2M au format Python** = illisible, jamais de guillemets remplacés
  (`aqara_z2m_liste_format_python`) ;
- **Tuya relu au départ** d'un repas Loggia, pas seulement « le dernier
  lu » ;
- **le Planning toujours présent**, l'exception du plan contredisait son
  propre état vide.
Et deux épingles qui manquaient : la commande de l'appareil passe avant le
script désigné (`appareil_et_script_designes`, ce que faisait déjà le
« Distribuer » d'avant) ; un appareil sans commande ne va jamais chercher
celle d'un autre, même faute de mieux
(`appareil_sans_commande_et_commandes_etrangeres`).

## Ce qui a été livré (05/10)

Onze tranches, chacune dans sa copie, chacune relue par un contradicteur
qui a vu ses tests rouges sur la version d'avant :
- **T0, le contrat** : cette décision et `tests/fixtures/distributeurs.json`,
  lue par les deux suites.
- **T1, les automatisations** (`automatisations.py`, 812 lignes) : lecture
  pure de `raw_config` (formes au singulier et au pluriel, `weekday`,
  soleil, périodique, `input_datetime`, horodatage décalé), `resumer()` aux
  imports paresseux, filtre sur les actions avec repli, second saut par les
  scripts sous garde anti-cycle, droits ; `doublures_ha.poser_automatisations()`.
  `manifest.json` gagne `after_dependencies` (`automation`, `mqtt`,
  `script`) : sans eux, hassfest refuse l'import.
- **T2, l'appareil** (`distributeur_appareil.py`, pur) : `appareil_de`,
  `soeurs`, la table R1 de la commande, les cibles de commande et de repas,
  les programmes lisibles ou non, anomalies et consommables, en constantes
  nommées comparées à la fixture.
- **T3, le module vivant** (`distributeurs.py`) : un tic par minute sans
  `suivre`, `async_lancer` qui recalcule les sources et note chaque repas
  retenu, « manque au redemarrage » (fenêtre de 30 min), `async_etat`,
  `async_enregistrer` sous verrou. `loggia/distributeurs/etat` (ouverte) et
  `loggia/distributeurs/config` (administrateurs) : 34 commandes, dont douze
  réservées. `distributeurs` entre dans `MODULES_VIVANTS` (`regles` reste
  dernier) et `rechargement.py` relie `loggia_distributeurs`.
- **T4, la logique de l'écran** (`src/distributeur.js`, pur) : la même table
  R1, `enLigne`, portion avec l'unité de l'entité, prochain repas (heures non
  fixes exclues), repas pour la réserve, historique reconstruit (compteur
  remis à zéro à minuit compris) ; `croqAncienneListe()` dans `lectures.js`.
- **T5, la fiche** (`src/fichedistributeur.jsx`, chargée à la demande, et
  `src/fichecommune.jsx`, le socle recopié du robot) : quatre onglets au
  motif ARIA du robot, roue Réglages, trois états vides du Planning,
  « Historique indisponible » distinct de « vide », `o-panne` sur l'en-tête
  et sur la ligne, écritures masquées pour un compte ordinaire, teinte
  `.rb-distributeur` (l'orange du thème, sous la garde de contraste).
- **T6, l'intégration** : la coquille `FicheDistributeur` (feuille à
  onglets, abonnée aux sœurs ET aux automatisations reconnues), la carte par
  `commandeDistribuer` et `enLigne`, le cache `src/distributeuretat.js`
  compté par références (60 s tant qu'une carte est montée, 15 s fiche
  ouverte, rien à la racine) ; l'existence de `obj:feeder` s'élargit à
  `appareil` (Objets, composeur, `configLive`), les entités de l'appareil
  sortent des candidats d'Objets. Partis : `prochaineRation`, `repasIn`,
  `repasLabel`, `croqMeals`.
- **T7, Paramètres et la migration** : « Repas de la journée » retiré
  (`repasAEcrire`, `readEnt.repas`, `croqRepasEdition` avec lui), champ
  « Appareil » par `ListeChoix`, `feederAEcrire` qui recopie `meals` et
  `associees` relus à l'écriture, encart « Ancienne liste de repas » et
  « Oublier » (administrateur).
- **T8, la démo** : l'Aqara sous Zigbee2MQTT commandé par deux
  automatisations (une troisième ne fait que lire le bac, et elle est
  écartée), le réservoir resté un helper, les variantes
  `?demo&distributeur=loggia | petlibro | rien | horsligne` et
  `&compte=ordinaire`, l'historique factice.
- **T9, les textes** dans les sept langues : 76 clés nouvelles par
  catalogue, pluriels polonais à trois formes, clés du journal au caractère
  près ; 17 clés retirées avec les textes qui les appelaient (dont « dans
  {h} h {m} » et « dans {n} min »).
- **T10, la vitrine** : version 3.86.0 (`manifest.json`, `package.json`,
  `package-lock.json`, resté à 3.80.0 depuis cette version-là), la ligne du
  README sur le distributeur — « piloté par automations » était devenu faux
  — et son épingle dans `readme_vrai.test.mjs`, qui tient les trois sources
  dans l'ordre de `source_active`, les quatre onglets et l'absence de liste
  à saisir. Relue par son contradicteur : le script ne se désigne que « si
  besoin », et le planning de Loggia n'est promis que « si Loggia sait le
  commander » ; l'épingle tient aussi ces deux promesses et le départ
  retenu, contre `refus_ajout`, le tic du serveur et `async_lancer`.

Les épingles qui lisaient l'ancien code ont été REMPLACÉES par une garantie
équivalente, jamais supprimées : `croquettes_popup`, `lot15_optimistes_cache`,
`objets`, `lot16_fiches_panne`, `lot16_feeder_enregistrement`,
`lot16_config_abimee`, `lot16_tests_lectures`, `composeur`, `clair`
(`mort` fondé sur `enLigne`), `choix` (trois feuilles à onglets),
`recharge`, `feuilles`, `liseres`, `views`, `runtime` ; côté Python
`test_websocket_api`, `test_websocket_api_execution`, `test_lot15_python`,
`test_rechargement`.

## Comment c'est vérifié

- **Tests nouveaux**, chacun vu rouge avant son code : 105 fonctions en
  Python (`test_automatisations` 28, `test_distributeur_appareil` 35,
  `test_distributeurs` 42 ; 702 cas une fois la fixture déroulée), 65 en JS
  (`distributeur` 27, `distributeur_migration` 12, `distributeuretat` 6,
  `fichedistributeur` 20 ; 71 exécutés, une par vue pour l'enregistrement),
  plus l'épingle du README.
- **Construction** : boot à 1 076 136 octets après la relecture (budget 1 100 000 ; il pesait
  1 053 838 avant ce chantier, +22 298) ; la fiche est un morceau à part
  (`fichedistributeur`, 27 Ko, et `fichecommune`, 10 Ko). La démo du site se
  construit. Lint : 0 erreur, 48 avertissements, tous `exhaustive-deps`
  (cliquet inchangé). Audit des données personnelles : propre.
- **Dans la démo seulement** (`?demo`, jamais une vraie installation), en
  français, allemand et polonais, à 1440 et 390 px : les quatre onglets et la
  roue ; la variante par défaut (mode « Manuel » de l'Aqara, deux
  automatisations, « coupe ses 2 repas », l'alerte du bac écartée) ;
  `petlibro` (programme lisible, avertissement « Deux sources », Entretien
  rempli : déshydratant, distribution bloquée, bac presque vide) ; `loggia`
  (deux repas, « Ajouter un repas », pas de portions pour un select START) ;
  `rien` (« Loggia ne sait pas commander ce distributeur… ») ; `horsligne`
  (liseré sur la carte et sur l'en-tête, « Ce distributeur ne répond
  plus. », plus de Distribuer) ; `compte=ordinaire` (ni « Associer », ni
  « Ajouter », ni « Supprimer »). Aucun texte français dans les fiches
  allemande et polonaise, aucune page qui déborde, aucun curseur. Le
  contradicteur a ajouté 360 et 320 px (`horsligne` en polonais, `loggia` en
  compte ordinaire et en mode clair, en allemand, `rien` en français) et le
  thème Neumorphix (`petlibro` en polonais, 390 px) : rien ne sort de la
  feuille, l'onglet choisi suit l'accent du thème.

## Relecture

Après les onze tranches : une finition (les sept derniers rouges de
l'assemblage, et les textes relus par un second contradicteur), puis une
relecture en cinq angles (serveur, écran, données, tests, accessibilité) et
ses corrections, chacune contestée et rouge avant son code. Suites à la
fin : 1 866 tests JS, 1 467 tests Python (et un échec attendu).
- **Le planning de Loggia** était injoignable dès que la fiche montrait le
  bloc « Programme de l'appareil » (un Aqara en mode manuel, sans
  automatisation) : il se propose dès que le serveur le permet. « Ajouter un
  repas » prend la première heure libre au lieu de poser un second repas à
  08:00.
- **Les droits** : la taille de la portion, le mode et « Remplacé » sont des
  commandes d'appareil, ouvertes à tous dans Réglages comme sur l'Accueil
  (ADR 0144) ; le planning de Loggia, « Associer » et « Oublier » restent
  réservés aux administrateurs.
- **Le serveur** : le départ d'un repas relit Tuya sans cache (une erreur ne
  reste en cache qu'une minute) ; une automatisation qui ne fait que NOMMER
  la commande (journal, notification) ou la lire dans une condition ne compte
  plus ; un redémarrage pendant l'heure répétée du passage à l'heure d'hiver
  ne ressert pas un repas et n'écrit plus un « manqué » à tort ; `resumer()`
  ne parcourt plus qu'une fois par état, quel que soit le compte ; le journal
  ne montre plus l'entité de la commande à qui ne peut pas la lire ; l'ancien
  `loggia_entities.feeder` est lu ; les trois modules sont en LF.
- **La parité** JS/Python vit dans une fixture partagée
  (`distributeurs_parite.json`) que les deux suites lisent ; l'écran ignorait
  la casse de START, plus maintenant.
- **Les textes** : en anglais, « feed » faisait manger le distributeur —
  c'est « dispense » ; l'encart de l'ancienne liste disait que ses repas « ne
  servaient plus » alors que l'automatisation reliée distribue toujours : il
  dit vrai, et montre les grammes de chaque repas.
- **Au téléphone** (320 px, allemand, néerlandais, polonais) : libellés sous
  le pas-à-pas, onglets qui débordaient (ceux du robot compris), heures
  coupées des tuiles, titre tronqué, pastille du jour : tout tient.
- **Clavier et contraste** : le focus ne tombe plus sur la page après
  Distribuer, une suppression ou un changement de page interne ; « Éteint »
  n'est plus estompé ; l'horloge du champ d'heure et le bouton Distribuer
  suivent le thème ; chaque repas et chaque pas-à-pas se nomment ; la portion
  de Réglages passe par l'état optimiste.
- **La carte et Paramètres** : un compteur hors ligne ne donne plus un faux
  « dernier repas » ; l'anomalie (« Bac presque vide ») vient en tête de la
  ligne de la carte ; les refus du serveur (« {n} repas au plus », ajout
  refusé) se disent ; Paramètres PROPOSE les scripts qui pourraient
  distribuer, sans jamais en choisir un, et dit pourquoi « Distribuer » ou
  les jours de réserve manquent.

**Redémarrage de Home Assistant requis** : avant lui, le Planning dit
« Planning indisponible pour l'instant », Distribuer marche (table de
l'écran), et l'ancienne liste n'est plus montrée comme un planning.

**À soumettre à Seba882** (ADR 0141) : les 80 clés nouvelles de `pl.js` —
la liste se tire en comparant le catalogue à celui de la v3.85.0. Aucune de
ses valeurs n'est réécrite ; 17 partent avec les textes qui les appelaient.

**Restes nommés**, à ne pas re-proposer comme des découvertes :
- un seul distributeur par maison, pas d'écriture de programme d'appareil,
  pas de décodage tuya-local (hors périmètre, ci-dessus) ;
- dans l'Historique d'un Petlibro, un repas reconstruit depuis le compteur
  du programme de l'appareil n'a pas de ligne de source (« Programmé » n'est
  pas déduit) ;
- la duplication assumée entre `fichecommune.jsx` et `ficherobot.jsx`
  (environ 150 lignes) : migrer le robot sur le socle est un lot à part ;
- au passage à l'heure d'été, un repas du planning de Loggia entre 02:00 et
  02:59 est sauté sans ligne au journal (l'heure n'existe pas cette nuit-là) ;
- la mémoire des actions lues garde environ 27 Mo sur une très grosse maison
  (1,6 Mo sur une maison moyenne) : une version qui ne garde que les actions
  utiles est possible, plus fragile ;
- une ancienne liste mêlant des repas reliés à des automatisations disparues
  et un repas relié à rien affiche encore « ne distribuait rien par
  elle-même » ;
- la fenêtre de confirmation de « Supprimer » (4 s) n'est pas annoncée au
  lecteur d'écran, comme chez le robot.
