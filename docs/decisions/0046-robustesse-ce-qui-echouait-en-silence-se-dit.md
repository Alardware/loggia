# 0046 — Robustesse : ce qui échouait en silence se dit

Date : 18/09/2026 (v3.48.0). Statut : acceptée. Demande : « analyse Loggia à
la recherche de bugs système et graphiques, vois que tout concorde ». Suite
de l'audit du 18/09 (ADR 0045 pour la sécurité) : la revue du composant
Python et du front à la recherche des échecs silencieux et des courses.

## Contexte

Un panneau domotique tourne des mois sans qu'on le regarde. Un geste qui rate
sans le dire n'est pas un bug bénin : c'est un chauffage qui ne se rend pas,
une ration de croquettes en double, une remise à zéro sans sauvegarde, une
alerte de sûreté qui ne part pas. L'audit a relevé une vingtaine de cas où
l'échec était avalé — `except: pass`, `.catch(() => null)`, un historique
illisible rendu comme un historique vide — et quelques courses entre
écritures concurrentes.

## Décision

Côté composant :

- **Le magasin ne se corrompt plus** : une sauvegarde ratée ne laisse pas la
  mémoire en avance sur le disque (copie à l'écriture : l'état ne change
  qu'après que le disque a répondu) ; une valeur non sérialisable est refusée
  à l'entrée (`ValueError`) au lieu d'empoisonner le fichier ; un premier
  chargement concurrent ne se fait qu'une fois (verrou).
- **La vérification du code est sérialisée par compte** : deux essais en vol
  ne contournent plus le limiteur.
- **Alertes** : un capteur de danger qui devient muet PENDANT une alerte rend
  la maison et l'écrit au journal (« capteur muet, à vérifier ») — le danger
  n'est pas levé, il n'est plus observé.
- **Fenêtres** : un chauffage partagé par deux pièces attend la dernière
  fenêtre fermée, la valeur coupée passe à l'autre pièce encore ouverte.
- **Règles** : une commande refusée par Home Assistant est notée au journal
  (« commande refusée par Home Assistant ») ; le journal est écrit à l'arrêt
  de Home Assistant (plus de vingt secondes perdues) ; la mémoire des
  commandes émises est bornée ; les veilles ont une vraie priorité.
- **Volets** : la remise en place après une mise à l'abri ne lève plus de
  `KeyError` quand l'attente a disparu.
- **Découverte** : la version du composant se lit de `const.py`, plus du
  disque dans la boucle d'événements ; les drapeaux ZHA / deCONZ disent si le
  composant est chargé.
- **Ce qui reste silencieux devient un avertissement** dans le journal de Home
  Assistant (`_LOGGER.warning`, avec la trace) : nuit, présence, volets,
  veilles, robots, alertes, interrupteurs.

Côté écran :

- **Un échec se dit** : un scénario refusé ou raté remonte au toast global
  (« Scénario refusé », « en partie exécuté — n commande(s) refusée(s) ») ;
  exclure un volet du planning ne cache plus un refus ; un historique
  illisible affiche « Historique indisponible pour le moment » (fiche,
  carte graphique, robot, CO₂) au lieu d'un graphe vide ; une découverte
  interrompue se dit en console et en bandeau.
- **Pas de faux départ** : les réglages des alertes de sûreté ne se chargent
  PAS « par défaut » quand la lecture rate (rien n'est chargé, et l'écran le
  dit) ; sans sauvegarde possible, pas de remise à zéro ; sans lecture du
  serveur, ni export ni import.
- **Pas de doublon** : le bouton Distribuer se verrouille 2,5 s après un
  appui ; la feuille (BottomSheet) ne ferme qu'une fois ; le compteur de
  règles ignore les réponses d'un effet dépassé ; le sélecteur d'entités ne
  retrie plus à chaque battement de Home Assistant.
- **Cohérence** : l'écoute des rejets reste dans la fenêtre du panneau (plus
  de `window.top`) ; les libellés de l'alarme et du toast passent par la
  traduction ; les heures du journal et des règles suivent la langue choisie.

## Conséquences

Aucune migration. Un chauffage partagé ou une alerte pendant un capteur muet
changent de comportement — dans le sens de la prudence. Tests :
tests/python/test_robustesse.py (17), test_alertes.py et test_fenetres.py
enrichis ; tests/robustesse_front.test.mjs (14) relit les garde-fous du
front. Redémarrer Home Assistant.
