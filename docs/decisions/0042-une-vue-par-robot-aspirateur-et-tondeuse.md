# 0042 — Une vue par robot : l'aspirateur et la tondeuse, en onglets

Date : 17/09/2026 (v3.43.0). Statut : acceptée. Quinze maquettes fournies par
l'utilisateur — l'application d'un robot aspirateur, en bleu, et celle d'une
tondeuse, en vert : un accueil (anneau de batterie, état, « Démarrer » et
« Base », zones, prochain passage, semaine, entretien recommandé), une carte
et ses pièces à cocher, une planification, un historique, un entretien, des
réglages, une barre d'onglets en bas — avec une consigne : « pour les robots
aspirateur et tondeuse ».

## Contexte

Loggia avait une vue « Aspirateur » écrite pour UN robot : le plan, les pièces,
trois boutons, des capteurs cherchés par leur nom. La tondeuse n'avait que sa
carte et sa fiche. Or deux robots ne publient pas les mêmes choses. L'aspirateur
de l'installation de référence annonce ses pièces, une image de carte, cinq
consommables en pourcentage, la surface et la durée du passage ; sa tondeuse,
des interrupteurs d'aire, des lames comptées en heures avec un seuil d'alerte,
une hauteur de coupe, une détection de pluie, un signal Wi-Fi. Ni l'un ni
l'autre ne publie de planning. Et Home Assistant écrit les identifiants dans la
langue de l'installation au moment où il les crée : un motif sur `filter` ne
trouve pas `temps_restant_filtre`.

## Décision

- **UNE vue pour les deux robots** (`src/views/robot.jsx`), deux routes :
  `aspirateur` et `tondeuse` (nouvelle ; masquée tant qu'aucun `lawn_mower`
  n'existe). Ce qui sépare les robots n'est pas leur nature mais ce qu'ils
  savent dire. L'ancienne vue Aspirateur est supprimée.
- **Quatre onglets et une roue** : Accueil · Carte (« Zones » sans image de
  carte) · Historique · Entretien ; les réglages s'ouvrent par la roue de
  l'en-tête et se quittent par « Retour », comme sur les maquettes. **Un onglet
  sans donnée n'existe pas.** Les onglets sont EN TÊTE de la vue, pas en bas :
  Loggia a déjà sa barre de navigation en bas du téléphone, deux barres
  empilées se disputeraient le pouce. Sur téléphone ils tiennent sur une ligne,
  l'icône au-dessus du mot.
- **Tout se lit dans les entités SŒURS du robot** — celles du même appareil —,
  reconnues d'abord à leur **clé de traduction**, la même dans toutes les
  langues, ensuite à leur identifiant. Le composant la transmet désormais
  (`key`), l'index la garde (`translationKey`). Rien n'est écrit en dur, ni
  identifiant ni modèle.
- **La disposition des maquettes, les teintes de Loggia** (leçon de l'ADR
  0038) : surfaces, filets et ombres des autres vues ; l'accent du thème pour
  l'aspirateur, le vert d'état pour la tondeuse (`--rb-rgb`, `--rb-doux`,
  `--rb-fond`). L'anneau de batterie suit la règle de la fiche des robots : **la
  couleur dit l'état, pas le niveau** — la panne et la batterie à plat d'abord,
  puis le travail, le retour.
- **L'accueil du robot** : l'anneau (si une batterie est publiée), la puce
  d'état (« en charge » seulement si un capteur le dit), « Démarrer · n zones »
  / « Mettre en pause » / « Reprendre » et « Base », les zones en puces, deux
  tuiles — « Dernier passage » et « Cette semaine » — et l'alerte « Entretien
  recommandé » quand une pièce passe sous 35 %. Sur grand écran la carte se
  montre dès l'accueil ; sur téléphone elle n'y est pas montée.
- **Les zones.** Aspirateur : les pièces que le robot annonce. Si le foyer a ses
  interrupteurs et son script de pièces (`vacuumScripts`), ils gardent la main ;
  sinon Loggia envoie la commande que l'INTÉGRATION attend (`ecovacs`,
  `roborock`, `dreame_vacuum`, `xiaomi_miio`) — il n'existe pas de service
  commun. Intégration inconnue : les pièces se lisent, ne se cochent pas ;
  aucune commande au hasard. Tondeuse : les interrupteurs d'aire de son
  appareil ; les allumer, c'est les choisir.
- **L'historique se tire de l'historique d'ÉTAT du robot** (quatorze jours) :
  une session commence quand il se met au travail et dure tant qu'il travaille,
  fait une pause ou rentre ; « terminée » s'il a regagné sa base,
  « interrompue » s'il s'est arrêté ailleurs, « erreur » s'il l'a dit. La durée
  est celle du travail ; moins d'une minute est un faux départ. La surface
  d'une session est le maximum du capteur de surface pendant qu'elle durait —
  sans capteur, l'historique compte en durée et n'affiche pas « 0 m² ».
- **L'entretien** : un capteur en % est une jauge ; un temps d'usage ET son
  seuil d'alerte (les lames) donnent ce qu'il reste avant le seuil ; un temps
  restant n'a de jauge que si le fabricant documente la durée de vie ; sinon le
  temps seul. « Remplacé » n'apparaît que si l'appareil expose le bouton qui
  remet le compteur à neuf, et demande deux appuis. Les compteurs de l'appareil
  (totaux, cycles) suivent, tels qu'il les nomme.
- **Les réglages** : le nom, la puissance d'aspiration, puis les interrupteurs,
  listes et nombres de l'appareil qui changent le TRAVAIL (mode, débit d'eau,
  tapis, hauteur de coupe, pluie, faune…) ; le reste se déplie (« Tous les
  réglages de l'appareil »). La fiche technique dit le modèle, le micrologiciel
  (lu sur l'entité de mise à jour) et le Wi-Fi — ce que l'appareil en dit.
- **La carte d'un robot mène à sa vue** (Objets, pièces, Sécurité, recherche) ;
  le robot tapé est mémorisé — une maison peut en avoir deux. La FICHE de
  l'appareil (l'épingle, Stop, Localiser, toutes ses entités) reste joignable :
  c'est la dernière ligne des réglages du robot.

## Ce que les maquettes montrent et qui n'est pas là

Rien sans source.

- **La planification** (l'onglet, « Prochain passage », « Ne pas déranger », le
  report en cas de pluie) : aucun des deux robots ne publie son planning, et
  Home Assistant n'a pas de service commun pour l'écrire. Ce sera un
  planificateur de Loggia, côté serveur — la tranche suivante. D'ici là, la
  tuile « Prochain passage » est « Dernier passage ». *Fait en v3.44.0 : voir
  l'ADR 0043.*
- **Le plan schématique, les m² et le type de sol de chaque pièce** : aucune
  géométrie n'est publiée. La vraie carte du robot est utilisée quand son image
  existe.
- **« ≈ 3 semaines », « Remplacer tous les 150 h »** : une estimation
  demanderait un rythme d'usure que personne ne mesure.
- **« Localiser »**, que l'ancienne vue portait : absent des maquettes, il reste
  sur la carte et sur la fiche du robot.

## Conséquences

Ce qui se calcule vit dans `src/robots.js`, pur et testé à sec
(tests/robots_vue.test.mjs, 86 mutations tuées) ; la vue ne garde que le
dessin. Elle suit en direct les sœurs du robot (`robotKeys`). Le chargement à la
demande est enfermé dans une frontière `Suspense` : sans elle, un clic du menu
finissait dans l'écran d'erreur — défaut latent de l'ancienne vue.
`vacSensors` (state.js) double en partie la reconnaissance de `robots.js` : la
fiche de l'appareil s'en sert encore, à unifier. Vérifié en démo seulement, à
390 et 1440 px, pour les deux robots.
