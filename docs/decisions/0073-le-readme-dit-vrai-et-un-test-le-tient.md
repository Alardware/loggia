# 0073 — Le README dit vrai, et un test le tient

Date : 23/09/2026. Statut : acceptée. Origine : le plan d'évolution du 22/09,
points M4 (deuxième du top 5) avec S1, S3 et M13 ; « continu avec le top 5 ».

## Contexte

La règle de la maison est que les textes de vitrine disent ce que Loggia fait
vraiment. Six affirmations avaient cessé d'être vraies, et rien ne le
signalait : le nombre de commandes réservées aux administrateurs, le nombre de
lectures du jeton d'accès, les services « écrits en dur », la désignation du
distributeur de croquettes, la barre du bas qui ne devait dépendre que du type
d'appareil, et quelques commentaires devenus faux dans le code.

L'audit s'est trompé sur deux points, vérification faite :

- **les cartes template** (S3) ont bien un chemin de création — le composeur,
  onglet « Par carte », « OU UNE CARTE TEMPLATE ». Le README dit vrai ;
- **la vue Croquettes** (S1) n'est pas un oubli : elle a quitté le menu le
  30/08/2026, la fiche d'appareil universelle la remplaçant, et le code le dit.
  Ce qui manquait vraiment était ailleurs.

Le « gros interrupteur » et la « jauge » restent hors catalogue depuis le
31/08, et leur rendu reste : c'est ce que leurs commentaires annoncent, pour
les agencements déjà posés.

## Décision

- **Le distributeur se désigne** (S1) : une section « Distributeur de
  croquettes » dans *Entités de cette vue*, rattachée à **Objets** — là où
  vivent sa carte et sa fiche. Réservoir, poids d'une portion, capteur du jour,
  script, et la table des repas. `loggia_feeder` ne sortait jusqu'ici que de la
  démonstration : sur une vraie installation, la carte n'apparaissait jamais.
  Au passage, un repas s'active par `homeassistant.turn_on/off`, qui marche
  pour une automatisation comme pour un `input_boolean` (la démo désigne le
  second, et l'appel au domaine `automation` échouait en silence).
- **La barre du bas ne répond plus à la largeur** (M13) : trois règles la
  montraient sous 820 px, doublant celles du tactile. Une fenêtre étroite à la
  souris affichait les deux navigations, vu à 768 px. Elles sont retirées ; le
  reste du bloc de largeur, lui, est bien une affaire de largeur.
- **Les textes corrigés** : les services « écrits en dur » gagnent leurs trois
  exceptions explicites (bouton sans fil, service `notify` désigné, plateforme
  d'un robot lue au registre) ; le docstring des commandes WebSocket les
  documente toutes les 32 au lieu de neuf ; le compteur « 11 vues » se calcule ;
  la table des libellés perd une vue « Caméras » qui n'a jamais existé ; le
  commentaire des vues secondaires cesse de parler d'un `ClimatView` disparu.
- **Un test tient le tout** (`tests/readme_vrai.test.mjs`) : chaque chiffre du
  README est comparé à sa source — la liste des commandes admin, le nombre de
  commandes du docstring —, et chaque promesse à son écran — la désignation du
  distributeur, des consommables, du mode invité, la carte template, et
  l'absence de toute règle de largeur qui montrerait la barre du bas.

## Conséquences

- Une vue qui promet une désignation sans l'offrir casse désormais un test.
- Un chiffre du README se démentira à la compilation suivante, pas six mois
  plus tard.
- Reste vrai et non traité : la vue Croquettes existe toujours, hors menu, pour
  un appareil qui l'a mémorisée. La fusionner dans la fiche est une décision à
  part.

Tests : tests/readme_vrai.test.mjs (6) ; edition_en_tete, assistant,
listes_fonctions et generique réalignés.
