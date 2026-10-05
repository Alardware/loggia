# 0136 — Lancer un scénario depuis l'écran, et un serveur testé en marche

Date : 03/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(décision 0126) : la commande WebSocket et le service changent.

**Le défaut.** La commande `loggia/scenarios/lancer` nommait son scénario `id`.
Or `id` est le **numéro du message** : Home Assistant étend son schéma de base
`{id: entier}` par celui de la commande — la clé de base était donc remplacée
par `str` — pendant que la bibliothèque du navigateur écrase `id` avec son
propre numéro avant d'envoyer. Le scénario demandé n'arrivait jamais, et le
numéro était refusé par le schéma : **tout lancement depuis l'écran** — une
carte scénario de l'Accueil, une ambiance de la veille, un résultat de la
recherche — échouait en « invalid_format ». La démonstration, elle, marchait :
son faux `callWS` laissait passer `id` tel quel. Seul le service
`loggia.scenario`, celui des automatisations, fonctionnait.

**Décidé :** le champ s'appelle **`scenario`** (1 à 64 caractères), côté
serveur, côté écran et dans la démonstration. Le faux `callWS` de la
démonstration écrase maintenant `id` comme la vraie bibliothèque : une telle
collision ne marchera plus nulle part. Le service `loggia.scenario` garde son
champ `id` : c'est l'API publique des automatisations, et `id` n'y entre en
collision avec rien.

---

**Pourquoi personne ne l'avait vu : le serveur n'était jamais exécuté.**
`websocket_api.py` (528 lignes) et `__init__.py` (164) n'avaient été exécutés
par aucun test ; on relisait leur source. L'audit l'a prouvé par deux mutations
qui passaient toute la suite : donner `is_admin=True` à tout le monde dans la
configuration, et accepter n'importe quel code administrateur.

- **`tests/python/test_websocket_api_execution.py`** fait tourner les 31
  commandes comme Home Assistant : une doublure de `websocket_api` étend le
  schéma de base, refuse les clés en trop et applique `require_admin`
  (`tests/python/doublures_ha.py`). Il vérifie qu'aucune commande ne déclare
  `id`, qu'un scénario part tel que le navigateur l'envoie, qu'un compte
  ordinaire ne réécrit pas la maison mais range ses cartes (décision 0125),
  qu'un mauvais code ne passe pas et finit par bloquer, et que le bon ouvre le
  passage vers un profil Admin pour CE compte seulement. Les trois mutations —
  revenir à `id`, `is_admin=True`, `if ok or True:` — font échouer 3, 1 et 2
  tests.
- **`tests/python/test_demarrage.py`** démarre le composant pour de vrai : les
  treize modules naissent et leurs tâches de démarrage tournent sans une
  erreur au journal, le service et le panneau s'enregistrent, le déchargement
  arrête chaque module et retire le panneau, et un rechargement les rebâtit sans
  rien réenregistrer. Quatre mutations — service enregistré deux fois, refus
  muet, arrêt jamais appelé, constructeur cassé — échouent toutes.
- Ces tests demandent `voluptuous`, installé en CI à la version de Home
  Assistant. **En CI, ils ne se sautent jamais** : sans lui, la collecte
  échoue au lieu de passer en silence.
- **`ruff check --select F`** rejoint la CI : noms non définis et imports
  morts. Il n'a trouvé qu'un import inutilisé (`volets.py`), retiré.

**Le service `loggia.scenario` dit ses refus.** Un scénario mal nommé dans une
automatisation, un composant pas encore démarré, un compte illisible : le
service rendait la main sans rien faire, et l'automatisation se déroulait
« avec succès ». Il lève maintenant une `ServiceValidationError` traduite —
section `exceptions` des sept fichiers `translations/*.json` — que Home
Assistant affiche dans la trace de l'automatisation.

**À vérifier chez soi après la mise à jour** : toucher une carte scénario de
l'Accueil. Un écran resté ouvert sur l'ancienne version envoie encore `id` et
échoue comme avant ; recharger la page suffit.
