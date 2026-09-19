# 0054 — Une taille pour toutes les fiches, une pour toutes les listes

Date : 18/09/2026 (v3.55.0). Statut : acceptée. Demande : « oui fais aussi
les suggestions sous le champ, et j'aimerais que les popups respectent une
même taille, c'est désagréable à l'utilisation : selon le menu, elle est
petite ou grande ». Précisé en deux réponses : les popups visées sont « les
popups, quand on clique sur une carte » ; pour les listes de choix, « même
largeur et même hauteur ».

## Contexte

- Les fiches qu'ouvre une carte avaient toutes la même largeur (480 px), mais
  la hauteur de leur contenu. Mesurées en démo sur un écran de 900 px : de
  129 px (une sirène) à 742 px (la caméra) — 306 pour un détecteur, 493 pour
  un volet, 644 pour un thermostat, 723 pour l'aspirateur.
- Les listes de choix (v3.54.1, ADR 0051) prenaient la largeur demandée par
  chaque écran, de 150 à 340 px, et la hauteur de leurs options.
- Trois champs gardaient une `<datalist>` : sa liste de suggestions, native
  elle aussi, s'ouvrait blanche.
- Le sélecteur des fiches (`MenuDeroulant` : préréglage d'un fil pilote,
  vitesse d'un aspirateur) avait sa propre liste, à sa taille.

## Décision

- **Les fiches** : `BottomSheet` prend `fiche`, et `.o-sheet-fiche` fixe la
  hauteur à `min(760px, 88vh)` — au doigt, `min(760px, 94vh - la barre du
  bas)`. 760 px tiennent les plus longues sur un écran de bureau sans
  défiler ; c'est aussi la hauteur de l'assistant. Vingt-deux feuilles la
  prennent : les fiches des cartes (lumière, prise, volet, climat, fil pilote,
  média et son navigateur, capteur, serrure, ouvrant, caméra, plante,
  distributeur, confort, extérieur, agenda, robot et son planning, fiche
  universelle) et celles qu'ouvre une carte en mode édition (carte, pièce,
  scénario). Les autres feuilles — recherche, ajout de cartes, choix d'une
  entité, réglages — gardent la hauteur de leur contenu.
- **Les listes** : toutes à `LARGEUR_MENU` × `HAUTEUR_MENU` (320 × 320,
  `choix.js`), quel que soit leur bouton ; plus petites seulement si l'écran
  ne les tient pas. La liste courte laisse du vide, la longue défile.
- **Les suggestions** : `ChampSuggere` (ui.jsx) remplace les trois
  `<datalist>` — les entités d'une vue, les capteurs d'une pièce, le fuseau
  horaire des villes. Même panneau, même taille ; le nom lu, l'identifiant
  dessous ; flèches et Entrée ; Échap ferme la liste, pas la feuille. Rien ne
  ressemble à ce qu'on tape : pas de panneau vide.
- **Le sélecteur des fiches** passe par `ListeChoix` : même panneau, même
  taille, même clavier ; son bouton ne change pas.

## Conséquences

Une fiche courte (une sirène, une vanne) laisse du vide sous son contenu :
c'est le prix d'une taille unique, choisie en connaissance de cause (« même
largeur et même hauteur »). Au téléphone, les fiches les plus longues
défilent, comme avant. Tests : tests/choix.test.mjs (+3, le garde-fou
refuse aussi `<datalist>`), cinq fichiers de test réalignés. Vérifié en
démo : les 28 fiches d'Objets à 480 × 760 sur ordinateur et à 390 × 731 au
téléphone émulé ; « Collection » et les suggestions d'une pièce à
320 × 320. Le sélecteur des fiches ne paraît pas en démo : vérifié par le
code et les tests seulement.

## Amendement (19/09/2026, v3.56.0) — la hauteur unique retirée

« Non en fait la hauteur identique partout, c'est pas terrible » : les fiches
suivent de nouveau leur contenu ; seules les feuilles à onglets gardent une
hauteur fixe (ADR 0055). Les listes restent à 320 × 320, et les suggestions
passent toujours par `ChampSuggere`.
