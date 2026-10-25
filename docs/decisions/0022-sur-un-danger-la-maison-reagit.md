# ADR 0022 — Sur un danger, la maison réagit : lumières, volets, vanne

**Statut** : appliqué (v3.16.0) — `alertes._reagir`, `alertes._async_rendre` (§18, moitié « action »).

**16/10/2026, précisé (à l'essai, rien de publié)** : un `binary_sensor` de classe `moisture` n'est une fuite que s'il n'est pas de la plateforme `template` ni `group` (`alertes._danger_reel`, `PLATEFORMES_CALCULEES`), lue au registre des entités. Chez l'utilisateur, `binary_sensor.dracaena_besoin_eau` et `binary_sensor.schefflera_besoin_eau` sont des modèles de classe `moisture`, sans appareil — « la plante a soif » : allumés, ils auraient dit « Fuite d'eau détectée » et coupé la vanne. La même famille d'erreur que le `safety` de Meteoalarm (ADR 0157). Une entité absente du registre (YAML sans `unique_id`), ou un registre illisible : c'est une fuite — on ne perd aucun vrai détecteur. Les autres classes ne changent pas (`tests/python/test_alertes.py`).

**16/10/2026, l'écran suit (chantier Capteurs, étapes 2 et 3, tâche 12 ; à l'essai, rien de publié)** : la même règle côté écran — `fuiteCalculee` (attention.js), la plateforme lue dans l'index (`plateformeDe`, state.js). « À surveiller » à l'Accueil (`pointsAttention`), « En ce moment » (`deriveNotifs`) et Paramètres › Alertes (le compte des détecteurs de fuite) écartent un `moisture` de `template` ou de `group` ; la règle du préfixe de la base d'une plante reste, pour un modèle que le registre ne connaît pas (`tests/fuite_calculee.test.mjs`).

## Contexte

Le téléphone est prévenu (ADR 0005), mais la maison, elle, ne fait rien :
une fumée à trois heures du matin laisse le couloir noir et les volets
baissés ; une fuite continue de couler le temps qu'on rentre. La moitié
« action » de §18 : lumières à 100 %, volets remontés, vanne coupée.

## Décision

**La maison agit, en tête de l'échelle, et tenu tant que le danger dure.**

| Danger | Lumières à 100 % | Volets remontés | Vanne coupée |
|---|---|---|---|
| fumée, monoxyde | oui | oui | — |
| gaz | **non** — un relais qui claque est une étincelle | oui | — |
| fuite | — | — | oui |
| alarme déclenchée | oui | — | — |

La priorité est la plus haute de l'échelle (`niveau("surete", 19)`) : au-dessus
du vent, au-dessus de tout — sauf une main. Les portes de garage, portails
et portes (`device_class`) ne sont pas des volets : on ne les ouvre pas — ni,
depuis le 19/10, les fenêtres de toit et les stores bannes (voir l'amendement).

**Quand le danger passe, la maison revient à l'état d'avant** — lampe
éteinte, luminosité, position du volet — mais seulement ce que la règle
tient encore : une lampe prise en main pendant l'alerte reste comme elle
est. Deux dangers en même temps : on ne rend qu'à la fin du dernier, et le
second ne « retient » pas l'état que le premier a imposé.

**La vanne reste coupée.** Une fuite s'inspecte avant de rouvrir ; le
journal dit « laisser coupée · la vanne d'eau se rouvre à la main ». La
vanne est la première `valve` d'eau que Home Assistant connaît, ou une
entité désignée (une prise commandée sur l'arrivée d'eau vaut aussi).

Actif d'emblée, avec trois interrupteurs pour débrayer, dans Paramètres ›
Alertes — là où le danger se règle déjà.

## Conséquences

- L'état d'avant vit en mémoire : un redémarrage pendant l'alerte le perd,
  et la maison n'est alors pas rendue — plutôt que d'inventer (ADR 0011).
- Sans vanne connue, la fuite ne coupe rien et le journal le dit ; le
  téléphone, lui, sonne quand même.
- Un capteur qui devient muet pendant l'alerte la termine : depuis l'audit du
  18/09, la maison est rendue (laisser lumières et volets forcés jusqu'à une
  main était pire), et le journal le marque « capteur muet · à vérifier ». La
  vanne, elle, reste coupée. Depuis le 19/10, une entité supprimée ou renommée
  pendant le danger fait de même.

## Amendement du 19/10/2026 — audit des capteurs, lot 2 (ADR 0250)

- **H6 — la fumée n'ouvre que les volets, stores et rideaux** (`shutter`,
  `blind`, `curtain`, `shade`). Jamais une fenêtre de toit (`window`) — l'air
  qui entre attise —, jamais un store banne (`awning`) — une toile tendue
  au-dessus d'une fenêtre en feu. `VOLETS_CLASSES` vient d'`ouvrants.py`, moins
  le store banne.
- **H4 — un danger déjà là au démarrage est traité.** Une fois Home Assistant
  démarré (`async_at_started`), chaque binaire de danger déjà à « on » part
  comme une alerte au téléphone — **sans faire réagir la maison** (son choix
  du 19/10, « Prévenir seulement ») : un danger qu'on n'a pas vu arriver,
  l'écoute CO d'une caméra restée allumée ou Alarmo revenu « déclenché », ne
  doit pas allumer toutes les lumières au redémarrage. La maison ne réagit
  qu'à un passage VU, d'un état connu au danger ; une apparition ou un retour
  sans état connu préviennent seulement.
- **H5 — un retour depuis un état muet n'est pas un événement neuf.** Le
  dernier état connu avant le silence fait foi : une fuite mouillée qui
  décroche puis revient mouillée ne ré-alerte pas, mais la maison, rendue
  pendant le silence, est de nouveau forcée (relecture du lot 2) ; une ouverture
  qui revient du silence dans l'état d'avant n'est pas une ouverture sous
  alarme (Zigbee2MQTT qui redémarre, fenêtre ouverte, alarme armée : rien au
  téléphone) ; fermée avant le silence et ouverte après, si.
- **M5 — un détecteur de sûreté muet depuis 15 minutes** (`DELAI_MUET`)
  envoie une notification ordinaire, « Détecteur muet, à vérifier », une seule
  fois jusqu'à son retour. La maison ne réagit pas : un silence n'est pas un
  danger. Plusieurs tus ensemble : une seule notification qui les nomme ; ceux
  déjà dits survivent au redémarrage.
- **M22 — une catégorie décochée** dans Paramètres › Alertes coupe aussi la
  réaction de la maison. Une installation jamais configurée, ou une catégorie
  que la configuration ne nomme pas, garde le défaut de l'écran : chaque
  danger coché, la maison réagit.
- Et le besoin d'eau d'une plante de `loggia_plants` n'est pas une fuite, quelle
  que soit sa plateforme (M1) : la règle du préfixe de l'écran vaut au serveur.
