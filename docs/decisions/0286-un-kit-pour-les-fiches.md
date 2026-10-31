# 0286 — Un kit pour les fiches

*29 octobre 2026 — à l'essai (audit de consolidation du 28/10, lot 6, partie a : M7 et M9)*

## Le problème

Les fiches des maquettes recopiaient leurs styles chacune chez elle :
`PANNEAU` dans onze fichiers, `RANGEE`, `TITRE`, `SOUS`, `EN_BOUTON`,
`ALERTE`, `CADRE_TUILE`. Dans le volet, la prise, la lumière et le capteur,
ces lignes étaient identiques à l'octet près. Un réglage du dessin des fiches
devait se refaire fichier par fichier, et une copie oubliée se voyait à
l'écran.

La saisie du code d'alarme existait deux fois : sur la carte de l'alarme
(`CvAlarm`, cartescustom/cartes.jsx) et dans sa ligne de la fiche d'un
appareil (`LigneEntite`, appareils/fiches.jsx), au pixel près la même.

Le cliquet des couleurs en dur (ADR 0281) laissait 130 couleurs à résorber.

## La décision

**`src/fichekit.js`**, le kit des fiches : `PANNEAU`, `CADRE_TUILE`,
`RANGEE`, `RANGEE_SERREE`, `EN_BOUTON`, `TITRE`, `SOUS`, `ALERTE`. Seul ce
qui était vraiment pareil y est venu :

- le volet, la prise, la lumière, le capteur, la météo, la plante, le média,
  le groupe et le chauffage prennent leur panneau, leurs rangées, titres et
  sous-titres au kit ; le robot et le distributeur leur tuile ;
  `fichecommune.jsx` son `SOUS` ;
- la rangée des fiches serrées (capteur, météo, plante : 16 px à gauche au
  lieu de 18) s'appelle `RANGEE_SERREE` ;
- restent chez elles les constantes qui s'écartent : le `PANNEAU` à ombre du
  socle (`fichecommune.jsx`), celui du robot (rembourré), de l'enfant et de
  la vanne, les `RANGEE` du groupe, de l'enfant, du chauffage et de la
  vanne, le `EN_BOUTON` du média et du chauffage, et toutes les `PUCE`, qui
  sont toutes différentes.

Aucun alias d'import (`X as Y`) : les tests qui compilent une fiche lisent
ses imports nom par nom. Le chauffage écrit donc `PANNEAU`, `TITRE`, `SOUS`
là où il écrivait `PANNEAU_FICHE`, `TITRE_RANGEE`, `SOUS_RANGEE`.

Au build, le kit se range dans le morceau de `fichecommune` : aucun fichier
de plus à charger.

**`SaisieCodeAlarme`** (cartescustom/cartes.jsx), un seul pavé pour les deux
endroits : le champ, « Valider », la croix ; Entrée valide, Échap renonce.
`serre` donne le dessin de la ligne de la fiche (champ de 130 px au plus,
croix de 28 px) ; la carte garde sa croix de 30 px. `onValider` vérifie
qu'un code a été tapé. Boot −705 octets.

**Les couleurs, là où le rendu ne bouge pas** :

- la pastille du schéma d'Énergie écrit son mot à l'encre de l'îlot sombre
  (`className="o-sombre"`, `fill="var(--o-text)"`) : son fond est sombre
  dans tous les thèmes, et `.o-sombre` donne `#eaf0fb`, la valeur d'avant.
  La classe est posée sur le `<text>` seul : sur le groupe, elle aurait
  aussi changé le trait des pastilles, qui suit le thème ;
- la pastille des panneaux solaires prend `--o-flux-panneau` (`#ffa63c`),
  à côté des autres couleurs de flux dans `:root` ;
- le point de la température intérieure de l'écran de veille prend
  `var(--o-cyan)`, que l'îlot sombre de la veille fixe à `#54c8f0`.

Plafonds du cliquet : `views/energie.jsx` 3 → 0 (retiré de la liste),
`ecranveille.jsx` 6 → 5. Le total passe de 130 à 126.

## Ce qui reste, et pourquoi

Le reste n'a pas de variable qui rende la même chose dans tous les thèmes et
les deux modes :

- `views/parametres.jsx` (61) : les pastilles des 18 thèmes, les quatre
  accents qu'on choisit, la pastille Ko-fi (sa règle) ;
- `ui.jsx` : la couleur de chaque profil, qui ne doit pas changer avec le
  thème ;
- `boot.jsx` et `demo.js` : ce qui s'affiche avant le thème ou sans lui ;
- les décors (ciel, soleil, lune, feuilles, aperçus des caméras, écran de
  veille), les icônes des conseils du dehors, les aperçus de la
  Bibliothèque : les passer à `--o-cold` ou à `--o-text` changerait le mode
  clair et les thèmes.

Deux puces choisies écrivent encore en `#06121f` sur l'accent
(`edition/feuilles.jsx`, `Onboarding.jsx`), contre la règle des puces
(texte blanc) : le corriger se voit, ce n'est pas l'objet de cette partie.

## Vérifié

La démo d'avant et celle d'après, 14 scènes (Accueil, une pièce, la fiche
d'un volet, Paramètres, le mode édition, la feuille d'une carte, le
composeur, l'historique, la Bibliothèque, Énergie, Sécurité, les fiches
lumière, chauffage et capteur), à 1440 et 390 px, en sombre et en clair,
heure et hasard figés : identiques au pixel, hors le curseur clignotant du
champ « Nom » de la feuille d'une carte et un flou d'arrière-plan instable
qu'une seconde passe donne identique.
