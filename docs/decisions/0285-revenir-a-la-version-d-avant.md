# 0285 — Revenir à la version d'avant

*29 octobre 2026 — à l'essai (idée validée par le propriétaire, vue dans « Glass Cards » ; complète l'export, l'import et la remise à zéro, et l'ADR 0280)*

## Le problème

Loggia n'avait, pour revenir en arrière, que l'export, l'import et la remise
à zéro, tous à la main. Un réglage malheureux — une vue vidée, un agencement
perdu, un import du mauvais fichier — ne se rattrapait que si l'on avait
pensé à exporter juste avant. Personne n'y pense.

« Glass Cards » garde la version d'avant chaque enregistrement, et un clic la
remet. La configuration de la maison chez le propriétaire,
`.storage/loggia_dashboard_config`, pèse environ 213 Ko.

## La décision

**Le composant garde une copie de la configuration avant les écritures, et
deux commandes en remettent une.**

### Ce qui est gardé, et quand

- **La configuration ENTIÈRE.** La partie commune et la section de chaque
  compte : on remet un état cohérent, pas une moitié.
- **Avant l'écriture.** Chaque écriture passe par une seule porte,
  `LoggiaStore._ecrire`. Avant d'écrire, elle garde ce qui est sur le disque :
  le cache, qui n'est remplacé qu'une fois le disque d'accord. C'est valable
  pour `config/set` comme pour les modules (volets, chauffage…).
- **Au plus une copie par quart d'heure.** Une rafale de réglages ne fait
  qu'une copie, celle d'avant la rafale.
- **Une copie identique à la dernière ne s'ajoute pas** : même empreinte
  (SHA-256 du JSON trié).
- **Une configuration vide ne prend pas de place.**
- **Les dix plus récentes restent.**
- **Chaque copie porte** :
  - sa date, en UTC ;
  - le nom Home Assistant du compte qui écrivait (rien pour un module du
    serveur, qui écrit sans compte) ;
  - sa taille en JSON ;
  - son motif : `ecriture`, ou `retour` pour la copie prise avant un retour.

### Ce qu'une copie ne porte pas

Une copie laisse de côté, et un retour garde tels qu'ils sont aujourd'hui
(`versions.GARDEES_AU_RETOUR`) :

- le code administrateur, haché ou en clair ;
- les minuteurs qui tournent ;
- le test de sirène ;
- les fiches des écrans (ADR 0220).

C'est la règle de l'import (`CLES_SERVEUR`, config.js). Un minuteur échu
remis par un retour éteindrait une lampe. Un ancien code rouvrirait l'Admin.

Pour la même raison, « Fermer en cas de fuite » ne change que par sa
commande (`garder_fermer_sur_fuite`) : un retour garde sa valeur du disque.

### Où, et sous quelle forme

Les copies vivent dans un fichier à elles, `.storage/loggia_versions` (un
`Store` de Home Assistant), jamais dans la configuration. Elles en
multiplieraient le poids, et chaque réglage la resérialise.

Chaque copie est **compressée**, zlib niveau 6 puis base64 pour tenir dans
le JSON de Home Assistant. Mesuré sur deux copies réelles de sa
configuration :

| fichier sur le disque | JSON compact | zlib 6 + base64 | temps |
|---|---|---|---|
| 222 951 o | 70 831 o | 12 272 o (17 %) | 1,9 ms |
| 166 183 o | 55 292 o | 11 288 o (20 %) | 1,2 ms |

Les dix copies tiennent donc en 125 Ko environ. En clair, indentées par
Home Assistant, elles pèseraient plus de 2 Mo. Le niveau 9 ne gagne qu'un
pour cent, pour presque deux fois le temps.

La compression tourne dans l'exécuteur de Home Assistant, et au plus une
fois par quart d'heure.

### Les deux commandes

`loggia/versions/liste` et `loggia/versions/rendre` sont **réservées aux
administrateurs de Home Assistant** (`require_admin`), comme l'import et la
remise à zéro. Elles portent le compte des commandes de 55 à 57.

- **`liste`** rend les copies, sans leur contenu.
- **`rendre`** prend un champ `version`, l'identifiant de la copie. Il ne
  s'appelle pas `id`, qui est le numéro du message.
- **Tout se fait sous le verrou du magasin, dans cet ordre** :
  1. la copie est lue et vérifiée ;
  2. l'état actuel est gardé, hors de la règle du quart d'heure, pour qu'on
     puisse revenir sur le retour — s'il ne peut pas l'être, rien ne se
     remet (`versions_indisponibles`) ;
  3. la configuration est remplacée d'un bloc ;
  4. les écrans et les modules l'apprennent comme après une écriture
     (`SIGNAL_CONFIG`, ADR 0067) : les clés communes qui ont changé, puis
     les clés personnelles de chaque compte. `rechargement.py` relance les
     modules dont la clé a bougé.
- **Les refus portent leur code**, que l'écran traduit :
  - `versions_indisponibles` ;
  - `version_inconnue` ;
  - `version_illisible` ;
  - `payload_too_large`.

### Robustesse

Une copie ne retient **jamais** l'écriture de la configuration.

- **Un fichier des versions illisible** est d'abord copié à côté de lui
  (`.corrupt.<horodatage>`), comme `_mettre_de_cote` le fait pour la
  configuration (ADR 0280). Les deux passent désormais par
  `versions.copier_a_cote`.
  - La copie de cette écriture-là se saute, et l'erreur va au journal.
  - La configuration s'écrit quand même.
  - Le fichier des versions repart vide ensuite.
- **Si le fichier illisible n'a pas pu être copié**, plus rien ne s'écrit
  par-dessus avant le prochain redémarrage, et `liste` le dit.
- **Une copie qui ne s'écrit pas** (disque plein) est sautée, et l'erreur va
  au journal.

### À l'écran

Dans Paramètres › À propos, une ligne « Versions précédentes » s'ajoute au
panneau Installation, avec Exporter et Importer. Elle n'apparaît que pour les
comptes qui voient l'import (`isAdmin` : le profil Admin et un compte
administrateur de Home Assistant).

- **Chaque copie** a sa ligne :
  - la date, « il y a 2 h » dans la journée (`Intl.RelativeTimeFormat`),
    sinon le jour et l'heure ;
  - le compte : « Avant un enregistrement de … » ;
  - un bouton « Revenir à celle-ci », confirmé en deux temps comme la remise
    à zéro.
- **Après le retour**, le navigateur oublie sa copie locale, comme après un
  import, puis Loggia se recharge.
- **Pas de boîte dans une boîte** : ce sont des lignes du panneau.

Les Paramètres se chargent à la demande, et le démarrage n'en porte rien.
`src/versions.js` enregistre ses refus en se chargeant.

La démo rend trois copies inventées. Comme pour `loggia/config/set`, elle
n'a pas de composant pour `rendre`, et elle répond le même refus.

## Ce qui ne change pas

- L'export, l'import et la remise à zéro.
- Les droits : seuls les administrateurs de Home Assistant écrivent la
  maison.
- Le format de `.storage/loggia_dashboard_config`.

## Redémarrage

Le composant change : il faut redémarrer Home Assistant après la mise à jour.
Avant ce redémarrage, la ligne dit que les versions ne répondent pas.
