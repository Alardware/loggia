# 0043 — Le planning des robots, tenu par Loggia

Date : 17/09/2026 (v3.44.0). Statut : acceptée. Suite de l'ADR 0042 : les
maquettes des robots montrent un onglet Planification — des passages à heure
fixe, leurs jours, leurs pièces, un interrupteur chacun —, une ligne « Ne pas
déranger », pour la tondeuse un « Capteur de pluie », et sur l'accueil du robot
une tuile « Prochain passage ».

## Contexte

Aucun robot ne publie son planning dans Home Assistant, et aucun service commun
ne permet de l'écrire : celui de l'application du fabricant reste invisible
d'ici. L'ADR 0042 avait donc laissé l'onglet de côté — rien sans source. La
seule source possible est Loggia lui-même. Un planning tenu par l'écran ne
vaudrait rien : personne n'a le tableau de bord ouvert à 9 h 30. Le composant,
lui, tourne toujours, et il a déjà le socle qu'il faut (`regles.py`) : un
journal qui survit aux redémarrages, le respect du geste manuel, des priorités.

## Décision

- **Le planning vit côté serveur** (`custom_components/loggia/robots.py`, clé
  partagée `loggia_robots`) : des passages `{heure, jours, zones, actif}` par
  robot, vingt-quatre au plus. Lundi vaut 0, comme le `weekday()` de Python. Un
  tic par minute, posé seulement s'il existe un passage actif.
- **Ce qui retient un départ, et le journal le dit à chaque fois** : le robot
  est injoignable ; il est déjà en route ; l'heure tombe dans sa plage « Ne pas
  déranger » ; il pleut (tondeuse) ; une MAIN vient de se poser sur lui — le
  socle le gèle, le planning ne passe pas par-dessus. « Pourquoi n'est-il pas
  parti ce matin ? » a une réponse dans le journal de la maison.
- **Un départ manqué ne se rattrape pas.** Home Assistant redémarrait à cette
  minute-là : tant pis. Un robot qui part à l'improviste est pire qu'un passage
  sauté.
- **Les pièces d'un aspirateur** : le passage garde les segments tels que le
  robot les numérote, et le serveur envoie la commande que l'INTÉGRATION attend
  (les quatre de l'ADR 0042). L'écran ne propose des pièces que si le serveur
  saura les commander ; le script maison et ses interrupteurs, qui gardent la
  main pour un départ à l'écran, n'entrent pas dans un planning — le serveur
  n'a pas de sélection à lire. Intégration inconnue : passage complet, dit au
  journal.
- **Les zones d'une tondeuse** sont ses interrupteurs d'aire : le serveur allume
  les choisies, éteint les autres — celles de SON appareil, reconnues à leur
  clé de traduction —, puis lance la tonte. Sans zone choisie, elle tond celles
  qui sont allumées.
- **« Ne pas déranger » est une plage PAR ROBOT** (22 h – 7 h par défaut,
  éteinte), qui peut enjamber minuit. Ce n'est pas un doublon des heures calmes
  de la maison : celles-là taisent les notifications, celle-ci retient un
  moteur. Un passage pris dans la plage l'affiche sur sa carte : « ne partira
  pas ».
- **La pluie.** Si la tondeuse a son propre capteur, la ligne « Capteur de
  pluie » de l'onglet EST son interrupteur : c'est le robot qui rentre, Loggia
  n'ajoute rien. Sinon, et seulement si la maison a une météo, une règle de
  Loggia : pas de départ planifié quand la météo annonce la pluie. Sans météo,
  rien à proposer.
- **Lire est ouvert, écrire est réservé aux administrateurs**
  (`loggia/robots/etat`, `loggia/robots/config`) — le planning est celui de la
  maison. Un refus se dit à l'écran. Tout ce qui s'enregistre est relu : une
  valeur illisible est refusée ; au chargement, un fichier abîmé perd la ligne
  illisible, pas le reste.
- **L'onglet Planning n'existe que si le composant répond** (un composant plus
  ancien n'a pas la commande : pas d'onglet vide). Il se place entre la carte et
  l'historique, comme sur les maquettes. Les jours suivent l'ordre de la
  langue ; on les bascule sur la carte du passage, l'heure et les zones dans une
  feuille ; supprimer demande deux appuis. Le chemin d'ajout est un lien de
  l'en-tête, pas une fausse carte.
- **La tuile « Prochain passage »** remplace « Dernier passage » dès qu'un
  passage est planifié — deux tuiles, comme sur les maquettes ; le dernier
  passage reste en tête de l'historique. Elle mène à l'onglet.

## Conséquences

Le calcul de l'écran (prochaine échéance, résumé des jours et des zones, plage
qui enjambe minuit, capteur de pluie) vit dans `src/robots.js`, pur :
tests/robots_planning.test.mjs, 49 mutations tuées. Le serveur :
tests/python/test_robots.py, 54 tests, 60 mutations tuées. Les commandes
WebSocket ne s'enregistrent qu'une fois par vie du process : il faut
REDÉMARRER Home Assistant après la mise à jour. Non fait : rattraper un passage
manqué, plusieurs plages « Ne pas déranger », un passage « une seule fois », le
journal des départs dans l'onglet (il est dans le journal de la maison).
Vérifié en démo seulement.
