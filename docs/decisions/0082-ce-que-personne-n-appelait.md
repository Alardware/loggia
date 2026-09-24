# ADR 0082 — Ce que personne n'appelait

**Statut** : décidé et appliqué le 2026-09-24 ; gardé en local pour la mise à
jour groupée de correctifs.

Point S7 du plan du 22/09 : « Côté serveur : ce que personne n'appelle ». Trois
griefs, trois sorties différentes — et c'est le point de ce texte, parce qu'on
les aurait volontiers traités tous les trois de la même façon.

## 1. Deux portes que personne n'ouvrait : supprimées

`loggia/config/stats` — une commande WebSocket réservée aux administrateurs,
qui rendait le nombre de comptes, le nombre de clés par compte, la version du
format, et le journal en mémoire de qui avait demandé l'index et quand.
`GET /api/loggia/ping` — une vue HTTP qui répondait `{"loggia": true, "version":
…}`.

Aucune ligne de `src/` ne les appelait. Le README ne les citait pas. Le
diagnostic répondait pourtant à une vraie question — « la découverte arrive-t-elle
aux comptes ordinaires ? » — mais à personne : il n'a jamais eu d'écran, et il
n'a jamais été lu.

Une porte qu'on n'ouvre pas est une porte à tenir vraie pour rien. Elle se
maintient, elle se traduit, elle se teste, et le jour où elle ment personne ne
s'en aperçoit. **Supprimées**, avec ce qu'elles tenaient seules :
`store.async_stats`, le dictionnaire `servis` et sa comptabilité dans
`handle_discovery`, l'import `HomeAssistantView`, l'import `dt_util`, et le
drapeau `data["http"]` qui ne protégeait plus rien.

Le docstring du composant annonce désormais **31** commandes, et le README
**onze** réservées aux administrateurs. Deux tests comparent ces chiffres à leur
source ; ils ont tiré les deux phrases toutes seules.

### Ce que le retrait a révélé

L'enregistrement de la commande est resté derrière elle une minute :
`async_register_command(hass, handle_stats)`, pour une fonction qui n'existait
plus. **La suite Python est restée verte** — elle relit la source, elle n'appelle
jamais `async_register`. Home Assistant, lui, aurait levé un `NameError` au
démarrage et Loggia n'aurait pas chargé du tout.

`test_chaque_commande_est_enregistree` vérifiait un seul sens : chaque commande
déclarée est-elle inscrite. Il vérifie maintenant **les deux** : une inscription
orpheline fait échouer. C'est le trou qui a laissé passer la faute, pas le
retrait.

## 2. Douze méthodes d'arrêt jamais appelées : branchées

Le plan en comptait dix. Il y en a douze — `alertes` n'en avait aucune et
écoutait `state_changed`, c'est-à-dire **tout le bus**, sans garder de quoi se
taire. Un rechargement de l'intégration posait une seconde écoute par-dessus la
première.

`async_unload_entry` ne retirait que le panneau. Les abonnements et les
rendez-vous survivaient au déchargement, et un rechargement ne les recréait même
pas : les modules étaient encore dans `hass.data`.

Ils s'arrêtent donc, et on les **retire** de `hass.data` : le chargement suivant
les rebâtit neufs. `MODULES_VIVANTS` les nomme, un test vérifie qu'ils savent
tous s'arrêter, et un arrêt qui lève est journalisé sans empêcher les suivants.

**Ce qui ne se retire pas n'est pas touché** : les commandes WebSocket, le
service `loggia.scenario` et les chemins statiques du panneau vivent jusqu'à
l'arrêt du process. Leur redonner une chance de s'enregistrer ferait échouer le
rechargement suivant — un bouton « Recharger » de l'interface, geste courant. Le
magasin reste aussi : il porte le fichier et son verrou, et rien ne l'écoute.

*Non vérifié à l'écran* : l'effet réel d'un rechargement demande une vraie
installation Home Assistant. Deux tests relisent la source à la place.

## 3. Deux replis morts : supprimés

`panel.py` retombait sur `register_static_path`, déprécié, et `discovery.py` sur
l'absence du registre des étages. Le minimum annoncé par `hacs.json` est **HA
2024.7** ; le registre des étages existe depuis 2024.4, et la méthode moderne
depuis 2024.6. Ces deux `except ImportError` ne pouvaient plus s'exécuter.

Un repli mort est pire qu'absent : il donne à croire qu'un chemin est couvert.
**Supprimés.**

## Conséquences

- **Redémarrage de Home Assistant requis** : le composant change.
- Une vue HTTP ne se désenregistre jamais : `/api/loggia/ping` répond encore
  jusqu'au redémarrage, même après mise à jour du paquet. C'est normal.
- Si un diagnostic redevient nécessaire, il reviendra **avec son écran**. Une
  commande sans lecteur est ce qu'on vient de retirer.

Tests : 573 au vert côté Python (+1 : les deux portes ont disparu, et le sens
manquant de l'enregistrement). Côté JS, les deux tests de chiffres du README et
du docstring ont été réajustés par les sources, pas à la main.
