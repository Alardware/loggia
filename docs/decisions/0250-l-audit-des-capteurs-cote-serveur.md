# 0250 — L'audit des capteurs, côté serveur

*19 octobre 2026 — accepté, à l'essai (audit des capteurs, lot 2 ; rien de publié). Décisions de l'utilisateur, déjà tranchées. Amende l'ADR 0022 ; complète l'ADR 0004 et l'ADR 0206.*

## Le problème

L'audit des capteurs du 19/10 a rejoué les règles du composant sur ses vrais
modules (tests pytest). Plusieurs contredisaient l'écran, ou ce que l'écran
promettait :

- sur une fumée, la maison remontait aussi les fenêtres de toit et déployait
  le store banne — `ouvrants.py`, lui, ne les ouvre jamais ;
- « Observer sans agir » ne couvrait pas les veilles : la VMC du CO₂ et la
  prise des heures creuses partaient quand même ; et rien ne disait que la
  sûreté, elle, agit toujours ;
- une catégorie décochée dans Paramètres › Alertes coupait le téléphone, pas
  la réaction : la vanne se coupait sur une fuite décochée ;
- un détecteur de sûreté qui se tait — une pile à plat — ne prévenait de rien,
  et personne ne le savait ;
- la veille des piles du serveur ne suivait pas la règle de l'écran
  (ADR 0206) : le seuil exclu, les piles binaires ignorées, les téléphones et
  les batteries rechargeables signalés, un premier passage une heure après le
  démarrage.

## La décision

**1. La fumée sans velux ni banne.** La sûreté ne remonte que les volets,
stores et rideaux (`shutter`, `blind`, `curtain`, `shade`) : la liste
d'`ouvrants.py`, moins le store banne. Une fenêtre de toit (`window`) et un
store banne (`awning`) restent comme ils sont (ADR 0022, amendement du 19/10).

**2. La sûreté hors de « Observer sans agir ».** Les alertes de sûreté
(`alertes.py`) agissent toujours — lumières, volets, vanne, téléphone — : la
sûreté ne se simule pas. Les VEILLES, elles, rejoignent l'interrupteur unique
des Règles (ADR 0004) : leur drapeau `simulation.actif` vit dans
`loggia_veilles`, l'écran le lit et le pose avec ceux des six autres modules
(`lireObservation`, `ecrituresObservation`), et la veille le passe au socle
(`regles.agir` et `regles.prevenir`, `simuler`). Basculer remet la veille à
zéro, comme les autres. À côté de l'interrupteur, l'écran dit « sauf la
sûreté ».

**3. Catégorie décochée = pas de réaction.** Décocher fumée, gaz, monoxyde,
fuite ou alarme coupe le téléphone ET la réaction de la maison pour cette
catégorie. Une installation jamais configurée, ou une catégorie que la
configuration ne nomme pas, garde le défaut de l'écran (`ALERTES_DEF`) :
chaque danger coché. Sous chaque case qui fait réagir la maison, une ligne le
dit : « Décochée : ni alerte, ni réaction de la maison. »

**4. Le détecteur muet se dit.** Un détecteur de sûreté (`BINAIRES` :
fumée, gaz, monoxyde, fuite) muet (`unavailable`, `unknown`) depuis
`DELAI_MUET` — 15 minutes : un Zigbee qui redémarre tient dedans, une pile à
plat non — envoie UNE notification ordinaire, « Détecteur muet, à vérifier :
{nom} », traduite dans la langue du serveur ; une seule fois jusqu'à son
retour. Elle suit la configuration des alertes (actives, catégorie cochée) et
les heures calmes ; la maison ne réagit pas. Plusieurs détecteurs tus dans la
même minute (un coordinateur Zigbee tombé) partent dans UNE notification qui
les nomme (« Détecteurs muets, à vérifier : … ») ; ceux déjà dits sont gardés
dans `loggia_alertes_etat`, et un redémarrage ne les redit pas (relecture du
lot 2).

**5. Les piles du serveur alignées sur l'écran.** La veille des piles suit
`pilesDeLaMaison` (piles.js) : le seuil compris (`<=`, comme `niveauPile`) ;
un `binary_sensor` de classe `battery` allumé est une pile faible (« {nom} :
pile faible »), sauf sur un appareil qui a une pile chiffrée ou qui n'est pas
physique ; ni une entité masquée ou désactivée, ni un téléphone
(`mobile_app`), ni une batterie rechargeable (un aspirateur, une tondeuse, un
`battery_charging` sur l'appareil), ni la batterie de la maison (le rôle
`batSoc` d'Énergie : la fiche, sinon le tableau de bord Énergie). Le premier
passage a lieu quand Home Assistant a fini de démarrer.

**Et, au passage, ce que l'audit a trouvé à côté :**

- un danger déjà là au démarrage est traité (H4), une alarme déclenchée aussi,
  et une entité qui apparaît déjà en danger après le démarrage (découverte
  MQTT, intégration rechargée) est un événement — au téléphone seulement :
  la maison ne réagit qu'à un passage VU, d'un état connu au danger (son
  choix du 19/10, « Prévenir seulement ») ; un danger qui revient du
  silence sans avoir cessé force de nouveau la maison, sans nouvelle
  notification ; une porte fermée avant le silence et ouverte après est une
  ouverture (relecture du lot 2) ; un retour depuis un état
  muet se compare au dernier état connu, et une ouverture ne part jamais d'un
  état muet (H5) ; une entité supprimée pendant un danger rend la maison
  (M23) ; `armed_custom_bypass` est armé, comme à l'écran (M21) ;
- une seule règle « plante ou fuite » : le serveur et Paramètres › Alertes
  écartent, comme l'Accueil, le besoin d'eau d'une plante de `loggia_plants`,
  quelle que soit sa plateforme (M1) ;
- une valeur muette ne réarme jamais une veille, et ce qui a été signalé
  survit au redémarrage, dans son fichier `loggia_veilles_etat` (M2) ;
- les veilles et la présence se réabonnent au démarrage complet et quand le
  registre des entités change (M4) ; leurs listes ne gardent que des
  identifiants d'entité (M24) ;
- un compte restreint ne reçoit que les appareils dont il peut lire une
  entité (M25).

## Conséquences

- La règle d'un volet, d'une plante, d'une pile vit maintenant des deux côtés
  avec le même énoncé ; un changement d'un côté doit se faire de l'autre
  (`tests/python/test_alertes_capteurs.py`, `test_veilles_capteurs.py`,
  `tests/capteurs_serveur_ecran.test.mjs`).
- Deux textes nouveaux partent au téléphone (`CLES_TELEPHONE`) ; deux
  nouveaux à l'écran. Le polonais est à relire par un contributeur.
- Le composant change : il faut redémarrer Home Assistant pour que le serveur
  applique ces règles. Tant qu'il n'est pas redémarré, l'ancien composant
  ignore le drapeau des veilles : l'écran les lit « agissent », la bascule
  leur écrit un drapeau qui n'est pas gardé, et l'interrupteur ne dit pas
  « toutes » — rien ne casse.
