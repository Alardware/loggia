# 0331 — Un scénario peut enregistrer la maison telle qu'elle est

*6 novembre 2026 — appliqué (v3.98.0) (étape 8 du rapport sur l'usage)*

## Le problème

Retrouver une ambiance demandait de composer un scénario règle par règle,
alors qu'elle était là, sous les yeux.

## La décision

Serveur (`scenarios.py`) : un scénario peut porter des `etats`, appareil par
appareil — une lampe allumée ou non, son niveau, son blanc ou sa couleur ; un
interrupteur déclaré lumière ; un volet, sa position ou ouvert / fermé —,
validés (100 au plus). La commande `loggia/scenarios/capturer`
(administrateur) lit la maison ou une pièce avec les règles d'un scénario
composé : les lumières, les volets, jamais une veilleuse de la règle Nuit, rien
d'injoignable. Au lancement, seul ce qui diffère part, filtré par les droits du
compte.

Écran : « Enregistrer la maison », en tête de la vue Scénarios pour un
administrateur, ouvre une fiche déjà remplie — toute la maison ou une pièce,
lumières et / ou volets, le résumé, « Reprendre l'état actuel ». Il ne reste
qu'à nommer.

## Les conséquences

Redémarrage de Home Assistant (le composant change). « Annuler »
(ADR [0330](0330-annuler-cinq-secondes-apres-un-geste-groupe.md)) marche sur
ce lancement. Tests Python de la capture, de la validation et du lancement ;
test `scenarios_maison`.
