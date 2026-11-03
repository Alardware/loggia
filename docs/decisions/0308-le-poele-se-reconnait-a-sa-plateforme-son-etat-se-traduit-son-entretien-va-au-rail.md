# 0308 — Le poêle se reconnaît à sa plateforme : son état se traduit, son entretien va au rail, le conseil Éco n'est que pour lui

*1er novembre 2026 — à l'essai (rien de publié) (lot 4 du rapport « Gladys comparé au catalogue », 31/10 : P2, P3, P4)*

*Complète l'ADR [0307](0307-un-defaut-d-appareil-se-voit-et-le-sabotage-sous-alarme-part-au-telephone.md) : après l'alarme du poêle, ce qu'il fait et son entretien.*

## Le problème

- **P2.** Un poêle MCZ Maestro (intégration `maestro_mcz`) envoie son état
  tel que le nuage du fabricant l'écrit, en italien. La fiche de l'appareil
  affichait « Start 1 a Freddo », « Potenza 5 », « Spegnimento ». Relevé sur
  dix jours dans l'historique d'un poêle : StandBy, Spegnimento, Potenza 1 à
  5, Load / Start 1 / Start 2 a Freddo, Load / Start 1 a Caldo,
  Stabilizzazione, Raffreddamento, Clean a Freddo / a Caldo, Pulizia High,
  et une alarme « A01 - Mancata Accensione ».
- **P3.** Le capteur « Next Maintenance » compte les heures de fonctionnement
  avant l'entretien (752 h ce jour-là, une heure de moins par heure de
  chauffe). Aucune veille ne le suivait. Le même relevé montre que le poêle
  envoie parfois **0** pendant quelques instants entre deux vraies valeurs
  (cinq fois en dix jours).
- **P4.** Le conseil « Éco conseillé pour un poêle à granulés » s'affichait
  pour tout thermostat qui comprend l'Éco et ne refroidit pas : un radiateur
  électrique en thermostat le recevait aussi.

L'intégration MCZ ne donne ni clé de traduction ni classe à ces capteurs.
Leur `unique_id` est `<code du poêle>-<champ>`, et le champ est stable :
`state`, `ore_prox_manut` (lu dans son `models.py`).

## La décision

- **Reconnaître le poêle, jamais par un nom** (`chauffage_familles.py`) :
  - `PLATEFORMES_POELE = {maestro_mcz, palazzetti}` : des intégrations qui
    ne pilotent que des poêles à granulés ; `est_poele(plateforme)`. Une
    plateforme de plus ici, et son appareil en profite ;
  - `CAPTEURS_POELE` : par plateforme, la fin de l'`unique_id` de chaque
    capteur connu (`-state` → `etat`, `-ore_prox_manut` → `entretien`) ;
    `capteur_poele(domaine, plateforme, unique_id)`. L'identifiant reste au
    serveur.
- **P2 — l'état traduit.** Le composant pose `etat_poele: true` dans l'index
  sur le capteur d'état (`discovery.py`) ; l'écran le lit (`estEtatPoele`,
  state.js). `texteEtatPoele` (src/poele.js, pur) dit : « Allumage » (Load,
  Start 1 / 2, à froid ou à chaud, Stabilizzazione), « Nettoyage » (Clean,
  Pulizia…), « Chauffe · puissance N » (Potenza N), « Extinction »
  (Spegnimento), « Refroidissement » (Raffreddamento), « En veille »
  (StandBy, Auto Eco), « Éteint » (Spento), « Alarme A01 » (un code
  d'alarme, que la notice du poêle explique). Une valeur inconnue s'écrit
  telle quelle. La fiche de l'appareil (`LigneEntite`, donc aussi les
  entités épinglées) l'applique au seul capteur reconnu.
- **P3 — l'entretien dans le rail.** Une veille du serveur (`veilles.py`,
  `_async_entretien`), au passage horaire des piles et des consommables, sans
  réglage, toujours suivie :
  - sous **100 h** (`SEUIL_ENTRETIEN`, seuil compris), deux passages
    horaires DE SUITE, la clé `entretien:<capteur>` rejoint ce qui a été
    signalé — un 0 d'un instant ne compte pas ;
  - elle s'en va quand le compteur repart franchement au-dessus (111 h,
    l'hystérèse des veilles) : l'entretien est fait ; une valeur muette ne
    change rien ; la clé se garde sur le disque comme les autres, et le
    passage en « Observer sans agir » ne l'efface pas (rien n'est simulé) ;
  - l'Accueil la lit (`pointsAttention`, règle 7) : « Entretien du poêle
    dans 38 h », au nom de l'appareil, une info ; à 0 h ou moins,
    « Entretien du poêle à faire », une alerte. Le point ouvre Objets.
  - **Pourquoi 100 h** : en hiver, un poêle tourne 10 à 15 h par jour ; 100 h,
    c'est une semaine de grand froid, deux à trois semaines en demi-saison.
    Assez pour prendre rendez-vous avec un technicien ou faire soi-même le
    nettoyage, sans que le point reste des mois dans le rail.
  - **Rien au téléphone.** Les veilles d'usure qui y partent (piles,
    consommables) ne le font que si on les allume dans Paramètres ; une
    veille allumée d'office n'a pas à notifier. Le rail seul.
- **P4 — le conseil réservé au poêle.** L'état d'un chauffage (`chauffage.py`,
  `_etat_un`) dit `poele`, d'après la plateforme de son intégration ; la
  fiche (`fichechauffage.jsx`) ne montre le conseil qu'à `poele === true`.
  Un serveur d'avant, sans le drapeau : pas de conseil. La démo le pose sur
  son poêle.

Écarté : reconnaître le poêle à son nom (« poêle », « stove ») ou au mot
« pellet » d'un modèle — un utilisateur renomme, et un nom ne prouve rien ;
poser l'entretien sur le seul chiffre côté écran — le serveur seul voit
l'`unique_id`, et lui seul peut attendre un deuxième passage.

## Les conséquences

- Redémarrage de Home Assistant (le composant change : index, veilles,
  chauffage).
- Tests : `tests/poele_en_entier.test.mjs`,
  `tests/python/test_poele_en_entier.py`, un test dans
  `tests/python/test_chauffage.py` ; la fixture du poêle de
  `tests/fichechauffage.test.mjs` porte `poele: true`, et les clés de l'état
  dans `tests/demo_chauffage.test.mjs` gagnent `poele`.
- Pas fait : les poêles d'autres intégrations (Edilkamin, Duepi, Fumis…),
  faute d'avoir lu leurs identifiants ; leur conseil Éco et leur entretien
  attendent qu'on les ajoute aux deux tables. Pas de réglage du seuil
  d'entretien dans Paramètres. La fiche 24 h d'un capteur (`FicheCapteur`)
  ne traduit pas l'état : seule la fiche de l'appareil le fait.
