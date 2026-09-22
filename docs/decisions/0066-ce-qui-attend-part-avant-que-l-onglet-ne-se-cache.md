# 0066 — Ce qui attend part avant que l'onglet ne se cache

Date : 22/09/2026 (v3.65.1). Statut : acceptée. Origine : l'audit du 22/09
(plan d'évolution, point A2), sur « go » de l'auteur ; c'est le complément de
l'ADR 0064 — une action différée ne vit jamais dans l'onglet, et ce qui attend
son calme dans l'onglet ne doit pas mourir avec lui.

## Contexte

Deux choses attendaient leur calme avant de partir :

- la consigne d'un champ numérique d'une fiche (`number`, `input_number`) :
  des clics rapprochés sur « + » ne partent qu'une fois, après 450 ms sans
  geste. Mais le démontage de la fiche effaçait le temporisateur : fermer la
  fiche juste après un « + » perdait la valeur, sans un mot. Fermer l'onglet
  pendant ces 450 ms aussi ;
- les écritures groupées de l'accesseur `createConfig` (400 ms), dont la
  fonction `flush()` n'était appelée nulle part.

Le plan supposait que les écritures de configuration du dashboard passaient
par ce regroupement. C'est faux : elles partent tout de suite (`saveCfg`),
et `createConfig` ne sert qu'à l'outil console `window.loggiaConfig.access`.
Le seul cas réel de perte était donc la consigne numérique.

## Décision

- **Ce qui attend est nommé** : la consigne en attente vit dans une référence,
  et le calme (450 ms) ne fait que l'envoyer. Au démontage de la fiche, elle
  part immédiatement au lieu d'être effacée.
- **La page qui se cache vide** : un branchement commun (`brancherVidage`,
  `src/config.js`) envoie ce qui attend dès `visibilitychange` en « hidden »
  (changement d'onglet, application mise en arrière-plan) — la connexion a
  alors le temps de partir — et sur `pagehide` en dernier filet. Il rend la
  fonction qui débranche ; sans fenêtre (un test), il ne branche rien.
- **L'accesseur console suit la même règle** : `createConfig` se branche en
  mode serveur et expose `detacher()`. Son regroupement de 400 ms reste : il
  n'a de sens que si la page reste là.

## Conséquences

- Rien côté composant : pas de redémarrage de Home Assistant, un rechargement
  de la page suffit.
- Le point A2 du plan est réduit à ce qu'il était vraiment : la consigne
  numérique. Les écritures de configuration n'ont jamais été différées.

Tests : tests/config_vidage.test.mjs (4).
