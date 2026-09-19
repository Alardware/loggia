# 0055 — Une seule croix, sur la ligne d'en-tête ; la hauteur fixe aux seules feuilles à onglets

Date : 19/09/2026 (v3.56.0). Statut : acceptée. Demandes : « non en fait la
hauteur identique partout c'est pas terrible, par contre là où il faut que ce
soit identique c'est quand une popup a plusieurs onglets : elle ne s'adapte
pas et reste grande. Autre point : toutes les popups n'ont pas le même bouton
pour fermer, ni au même endroit, ça va pas. » Puis, sur une première version
où la croix montait à côté de la poignée : « pourquoi ils ne sont pas
alignés ? et horizontalement » et « même chose ici » — deux captures : la
croix au-dessus, l'épingle et la roue en dessous, décalées.

## Contexte

- La v3.55.0 (ADR 0054) donnait la même hauteur à toutes les fiches qu'ouvre
  une carte : une sirène s'ouvrait aussi haute qu'une caméra.
- Les feuilles fermaient de cinq façons : une croix ronde de 44 px à gauche du
  titre (fiche d'un appareil, capteur, confort, extérieur, fil pilote, média,
  robot, choix de cartes, entités d'une vue) ; un carré arrondi de 38 px à
  droite (les fiches des maquettes du 14/09 : volet, climat, lumière, prise,
  ouvrant, serrure, caméra, plante, distributeur) ; un petit rond
  (historique, agenda, navigateur de médias) ; un carré dans l'assistant ; et
  des « Annuler » ou « Terminé » en bas, qui ne faisaient que fermer (carte,
  pièce, scénario, entités d'une vue, affectation d'un interrupteur, villes
  de l'horloge, composeur de cartes). Certaines n'en avaient aucune
  (recherche, planning d'un robot, alimentation, choix d'un capteur).

## Décision

- **Une croix, un composant** : `CroixFeuille` (ui.jsx) — 34 px, rayon 10,
  fond `--o-s1` : la taille et le fond de l'épingle. Elle se pose EN DERNIER
  sur la ligne d'en-tête de chaque feuille, et ferme la feuille qui la
  contient (contexte de `BottomSheet`). `TitreFeuille` fait la ligne d'un
  titre simple ; `FicheEntete` la porte après l'épingle ; une feuille qui
  passe `title` à `BottomSheet` reçoit la ligne toute faite. Les croix
  propres à chaque feuille sont retirées.
- **Alignée sur ses voisins** : l'épingle, la roue des réglages, les flèches
  de l'agenda, les boutons de l'assistant — même ligne, même taille. Une
  première version posait la croix à côté de la poignée, au-dessus de
  l'épingle et décalée : abandonnée.
- **Au même endroit** : 28 px sous le haut de la feuille, 23 px du bord droit,
  dans toutes les fiches. La barre de défilement des feuilles est masquée
  (on défile à la molette, au doigt, au clavier) : une feuille qui défile ne
  décale plus sa croix, et la pochette d'un média garde ses bords. Écarts
  voulus : la recherche (la croix se centre sur le champ, plus haut qu'un
  bouton) et l'assistant (sur ses boutons de 36 px).
- **Plus de bouton en bas qui ne fait que fermer** : « Annuler » et
  « Terminé » partent ; les actions restent (Enregistrer, Supprimer, Remettre
  d'origine…). Échap et un appui à côté de la feuille ferment toujours.
- Restent deux « Fermer » qui ne ferment pas une feuille : la commande d'un
  volet, et la croix du formulaire d'événement, DANS la fiche de l'agenda,
  qui referme le formulaire. Le navigateur de médias garde son retour.
- **Le focus** : à l'ouverture, le premier élément du contenu, pas la croix
  (`data-croix`) ; un champ qui a déjà le focus (la recherche) le garde.
- **La hauteur** : les feuilles suivent leur contenu. Seules les feuilles à
  onglets gardent une hauteur fixe (`onglets`, `min(760px, 88vh)`) : la
  fiche d'un robot, « Ajouter une carte », et la fiche d'une lumière qui a
  des blancs ET des couleurs. Changer d'onglet ne la fait plus grandir ni
  rétrécir.

## Conséquences

Tests : tests/feuilles.test.mjs (5 : la croix commune, chaque feuille la
porte, l'inventaire des « Fermer » de `src/`, plus de bouton qui ne fait que
fermer, le navigateur de médias), tests/choix.test.mjs (la hauteur fixe aux
seules feuilles à onglets), six fichiers de test réalignés. Vérifié en démo :
les 28 fiches d'Objets ont une seule croix, à 28 px du haut et 23 px du bord,
ses voisins exactement sur la même ligne et à la même taille — sur ordinateur
et au téléphone émulé ; l'agenda, l'assistant, la recherche, un formulaire
qui défile ; les six onglets du robot et les deux de la lumière restent à
760 px.
