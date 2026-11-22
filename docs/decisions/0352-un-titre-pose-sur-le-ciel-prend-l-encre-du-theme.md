# 0352 — Un titre posé sur le ciel prend l'encre du thème

*12 novembre 2026 — appliqué (v3.100.0)*

## Le problème

Sur l'Accueil, « Favoris », « Scénarios » et ce qui les accompagne à droite
(« Épinglez un appareil depuis sa fiche », « 9 scénarios › ») s'écrivaient au
gris du thème, en italique, sur la photo du ciel. Par ciel clair de jour, ils
étaient presque invisibles, surtout sur tablette, où le ciel descend plus
bas. Seul le cas du thème clair sous un ciel sombre était traité
(`o-sur-ciel`).

## La décision

Toute ligne de titre posée sur le ciel reçoit `o-ciel-titre`, par ciel clair
comme sombre (`wx3d.jsx`, la même mesure qu'avant : au-dessus de 85 % de la
hauteur du ciel). Elle prend l'encre du thème et un halo doux de son fond
derrière les lettres ; en thème clair sous un ciel sombre, l'inverse. Aucune
couleur écrite en dur : chaque thème garde sa paire (`index.css`).

`o-sur-ciel` garde son sens (ciel sombre seulement) et ses règles. Le bouton
d'édition garde sa pastille ; un titre posé sur le fond de la page ne change
pas.

## Les conséquences

Vérifié dans la démonstration, ciel de jour, thème sombre et thème clair, au
PC et sur tablette : les titres se lisent. Sur le téléphone, les titres sont
sous le ciel : rien ne change. Les deux flèches de la rangée des scénarios
gardent leur fond gris. Tests : `tests/audit_1211_lot1b.test.mjs`.
