# 0100 — Deux abonnements que personne ne refermait

Date : 27/09/2026. Statut : appliqué (local). Aucun redémarrage de Home
Assistant, aucun changement d'`index.html` : un rechargement de page suffit.
Cinquième point de l'audit du 27/09.

Deux fuites d'abonnement WebSocket, de la même famille que l'écoute du bus de
l'ADR 0097 : on ouvre, et le chemin qui devrait refermer ne passe pas.

## 1. Un abonnement de plus par question posée

`views/assistant.jsx` gardait le désabonnement de son flux dans
`desabonnerRef`, et la popup était le **seul** endroit qui le fermait. Chaque
question posée dans une même séance écrasait la référence de la précédente et
laissait son abonnement vivant — avec toute sa fermeture : l'objet `ws`, les
poseurs d'état, la réponse en cours d'écriture.

`annuler()` n'en fermait aucun non plus : il bousculait `tourRef`, ce qui fait
tomber les événements du tour arrêté dans le vide, mais laissait le canal
ouvert.

Rien ne le montrait. La garde `tour !== tourRef.current` en tête de
`surEvenement` faisait que l'écran restait juste, quoi qu'il arrive.

**Mesuré dans la démonstration**, en instrumentant `subscribeMessage` sur le
même scénario — ouvrir l'assistant, poser trois questions d'affilée :

| | Abonnements | Fermés | **Vivants** |
|---|---|---|---|
| avant | 2 | **0** | **2** |
| après | 2 | **1** | **1** |

Avant, la colonne « fermés » reste à zéro quoi qu'on fasse. Après, un flux à la
fois, et plus aucun passé un arrêt.

Le tour précédent se referme donc avant d'en ouvrir un autre, `annuler()`
referme aussi, et le démontage garde son rôle — les trois passent par le même
`fermerFlux`.

### Et la course, pendant qu'on y est

`subscribeMessage` s'attend. Un tour plus récent peut partir pendant cette
attente — on a retapé, ou arrêté. Celui qui se réveille après lui écrasait
alors la référence du tour courant, et c'est le **bon** flux qui devenait
impossible à fermer. Il se ferme maintenant lui-même dès qu'il voit que son
tour est dépassé.

## 2. Un abonnement caméra orphelin par changement rapide

`camera.jsx` attend quatre fois avant de tenir son abonnement : la
configuration ICE, `createOffer`, `setLocalDescription`, puis
`subscribeMessage`. Une garde existait déjà après la configuration ICE — son
commentaire décrit même le piège, mot pour mot.

Après l'abonnement, elle manquait. Si l'on change de caméra entre-temps, le
nettoyage de l'effet appelle `cleanupRtc` alors que `unsub` vaut encore
`null` : il ne ferme que la connexion. L'abonnement arrive ensuite, et plus
personne ne le fermera. Un passage rapide d'une caméra à l'autre en laissait un
par passage, côté navigateur comme, vraisemblablement, côté Home Assistant.

La garde repasse donc dès qu'on tient l'abonnement, et ferme les deux **à la
main** : `cleanupRtc` a pu être remis à `null` entre-temps, et refermer ce qui
l'est déjà ne coûte rien.

### Ce que je n'ai PAS pu vérifier à l'écran

La démonstration ne négocie aucun flux WebRTC : aucun `camera/webrtc/offer`
n'y part, ses caméras sont des images. Ce correctif-ci repose donc sur la
lecture du code et sur son test, pas sur une mesure — contrairement au premier.
Il reproduit une garde que la même fonction porte déjà quinze lignes plus haut,
pour la même raison.

## Les garde-fous

Deux tests, vérifiés dans les deux sens — chacun échoue quand on retire son
correctif :

- `tests/assistant.test.mjs` : `fermerFlux` existe et est appelé aux **trois**
  endroits (nouveau tour, arrêt, démontage), et un tour dépassé pendant
  l'attente ferme le sien au lieu d'écraser la référence du tour courant ;
- `tests/cameras.test.mjs` : la garde existe après l'abonnement, ferme
  l'abonnement ET la connexion, et ne repasse pas par `cleanupRtc` — qui peut
  déjà valoir `null`.

997 tests JS, 579 pytest, lint et audit propres. Le compte d'avertissements
`react-hooks/exhaustive-deps` ne bouge pas (45) : un `eslint-disable-line`
ajouté par réflexe s'est révélé inutile, et il est reparti.
