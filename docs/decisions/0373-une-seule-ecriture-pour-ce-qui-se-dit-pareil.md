# 0373 — Une seule écriture pour ce qui se dit pareil

*15 novembre 2026 — appliqué (v3.100.0). Audit du 12/11, lot 5b : les points N2, N7, et ce qui, dans N3 et N4, ne change rien à l'écran. Validés le 12/11. Pas de redémarrage de Home Assistant.*

## Le problème

Quatre familles de petites fonctions étaient recopiées de fichier en fichier ;
quarante-huit avertissements du contrôle de code attendaient d'être relus un
par un ; le code et la feuille de style ne s'accordaient pas, à un pixel près,
sur ce qu'est un téléphone.

## La décision

**Regrouper ce qui rend exactement la même chose — et rien d'autre.** Chaque
copie a été comparée à sa référence sur des entrées variées, dans les sept
langues, avant d'y être branchée. Les noms que des appelants ou des tests
utilisent restent, en alias d'une ligne.

- *La durée lisible* : `dureeMinutes` (`src/format.js`). `dureeLisible`
  (robots), `dureePrise` (prises), `dureeTexte` (mode enfant) y passent.
- *L'heure « 14:20 »* : `heureCourte` (`src/format.js`), à la place de treize
  copies.
- *La pièce d'un appareil* : `nomZoneDe` (`src/state.js`), à la place de neuf.
- *« Sans accents »* : `sansAccents` (`src/outils.js`) pour les applications
  d'un lecteur et les scènes.

**Ce qui dit autre chose reste chez soi** : l'heure au fuseau de la maison
(`heureMaison`), les heures reçues en secondes, `zoneDe` (qui ne trouve pas
une entité masquée — un comportement, pas une copie), les « il y a » (ils
arrondissent chacun à leur façon), les sondages d'état (quatre copies qui
divergent, des tests sur leur texte), la lecture du stockage (un test interdit
tout import dans `verre.js`).

**Les avertissements, relus un par un** : aucun vrai défaut. Trente-huit sont
voulus et restent. Neuf faisaient recalculer un mémo pour rien — un `[]` ou un
`{}` de repli, neuf à chaque rendu — : le repli devient une constante gelée du
module. Un était douteux et il est corrigé : le mémo de la configuration
dépendait de « la découverte est prête » alors qu'il lit son index ; depuis que
la découverte se relance (lot 2b), la zone et l'icône d'une pièce pouvaient
rester celles d'avant. Le compte passe de 48 à 38 ; le cliquet reste à 48.

**Un téléphone, à un pixel près.** La feuille dit « téléphone » jusqu'à
760 px INCLUS, et jusqu'à 640 inclus ; le code excluait la borne. La vue
Énergie et l'écran de veille (760), l'écran d'installation (640) suivent
maintenant la feuille.

**Sans toucher au dessin.** La bascule de la vue Fenêtres, copie locale sans
rôle pour un lecteur d'écran, est celle de `ui.jsx` — même dessin. Le petit
rail de « Comparer » s'écrit une fois. À la borne, les boutons − / + des
fiches se disent coupés sans l'être : le focus du clavier ne tombe plus.

## Ce qui n'est pas fait

- **Le seuil de 1180 px** (`src/index.css`, marges du puits d'Énergie) : la
  feuille dit « tablette » à 1180 quand le code dit « large ». C'est la
  largeur d'une tablette : la corriger se voit. À montrer avant.
- **Les tailles 88, 184, 44** : environ 130 endroits, épinglés tels quels par
  des tests. Laissés.
- **Les onglets de l'Énergie** sur une seule écriture : la vue et son
  historique ne sont pas dans le même paquet.
- **Ce qui change le dessin** (trois bascules de 42×24, trois croix de
  fermeture) : un lot à part, après un avant / après.

## Les conséquences

Rien ne change à l'écran, sauf à 760 et 640 px de large exactement. Aucun
texte neuf, aucun catalogue touché. Une assertion existante est modifiée :
deux lignes retirées de la liste des dépendances omises
(`tests/dependances.test.mjs`), puisqu'elles ne le sont plus. Tests :
`tests/audit_1211_lot5b_regroupes.test.mjs`,
`tests/audit_1211_lot5b_effets.test.mjs`.
