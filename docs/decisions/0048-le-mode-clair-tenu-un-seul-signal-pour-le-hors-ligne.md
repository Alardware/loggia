# 0048 — Le mode clair tenu, un seul signal pour le hors-ligne, les identités en jetons

Date : 18/09/2026 (v3.50.0). Statut : acceptée. Demande : « go les 3 », sur
les trois suites laissées ouvertes par l'ADR 0047 — les identités encore en
hexadécimal, le style « panne » pour le hors-ligne, la relecture du thème
clair écran par écran.

## Contexte

La relecture s'est faite à la mesure, pas à l'œil : un calcul de contraste
WCAG sur chaque texte visible de chaque vue de la démo, en clair puis en
sombre. En clair, les vraies fautes étaient les couleurs d'identité servant
de texte — la température d'une pièce en 25 px dans la teinte de la pièce
(1,7:1 à 2,9:1), le réservoir des croquettes en orange (2,1:1), le titre en
lecture en rose (3,2:1), l'en-tête « tout est calme » en vert codé en dur
(1,6:1) — et trois jetons de statut juste sous le seuil sur le fond de page
(vert 4,46:1, ambre 4,47:1, or 4,38:1). Le reste tenait. En sombre, rien à
redire.

Deux écrans se dessinent sur du noir quel que soit le thème : la veille et
l'image d'une caméra. Depuis la v3.49.0, leurs pastilles lisaient les jetons
du thème — un rouge assombri pour le blanc, illisible sur du noir en clair.

Et « ne répond plus » se disait de six façons : liseré sur six cartes de
pièce, rien sur le distributeur, la plante et la zone de chauffage, une
opacité sur le hero d'une machine, une phrase dans la fiche du robot, un
point rouge sur la caméra.

## Décision

- **Les identités ont leurs jetons** : `--o-lampe` / `--o-lampe-b` (la lumière
  chaude d'une lampe), `--o-orange` (la chaleur, les croquettes), `--o-rose`
  (les médias), `--o-flux-*` (la palette du flux d'énergie), `--o-text3-rgb`.
  Les vues ne les écrivent plus en hexadécimal ; `hx` les connaît. Restent en
  dur, par nature : les palettes des thèmes prédéfinis, les couleurs de profil
  et d'accent choisies (une valeur enregistrée doit être une couleur), la
  palette des lampes.
- **En clair, les teintes s'assombrissent** : les cinq teintes de pièce, la
  lampe, l'orange et le rose ont une valeur claire qui tient 4,5:1 sur blanc
  et 3:1 sur le fond ; l'accent d'une pièce, en texte, prend la variante
  lisible (`--o-accent-soft`) ; le vert, l'ambre et l'or de statut passent à
  4,5:1 sur le fond de page. Un test calcule ces contrastes à chaque
  exécution.
- **Un îlot sombre** (`.o-sombre`) : la veille et la tuile caméra reprennent
  les jetons sombres quel que soit le thème.
- **Un seul signal pour le hors-ligne** : le liseré rouge qui tourne
  (`o-panne`) — sur les neuf cartes de pièce, le distributeur (réservoir
  muet), la plante (capteur d'humidité muet), la zone de chauffage (thermostat
  muet), le hero d'une machine, la fiche du robot, la tuile caméra (le liseré
  se dessine dans les coins, l'image reste clippée). Les lignes de liste
  gardent leur tiret et leur opacité : une liste n'est pas une carte.

## Conséquences

Visibles en clair : des températures de pièce foncées, un orange et un rose
plus profonds, un vert, un ambre et un or de statut un peu plus sombres. En
sombre : rien. Tests : tests/clair.test.mjs (5), composeur, objets, etats,
evenement réalignés. Pas de changement côté serveur.
