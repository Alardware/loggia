# 0333 — La taille du texte, Normale ou Grande, sur cet écran

*7 novembre 2026 — appliqué (v3.98.0) (étape 10 du rapport sur l'usage, reprise le 08/11)*

## Le problème

Une tablette se lit de loin, un téléphone de près, parfois avec une vue moins
bonne. Les tailles de Loggia sont écrites en pixels : une police racine n'y
changeait rien.

## La décision

Paramètres › Apparence › Taille du texte : Normale ou Grande (115 %),
propre à cet écran (`loggia-texte`, ni exportée ni importée). Le texte grandit,
la disposition ne bouge pas.

À la construction, `scripts/taille_du_texte.mjs` fait passer chaque taille de
police de `src/` par `var(--o-texte, 1)`, que `tailletexte.js` pose sur la
page : les nombres, les pixels, les variables (les chiffres des cartes), les
parts de la boîte (tuiles, météo). Une taille ajustée à sa colonne
(`clamp(…, …100cqi…, max)`) n'agrandit que sa borne haute : elle grandit
quand la place le permet, sans couper — tout agrandir coupait huit textes de
plus aux cartes étroites du téléphone. Les icônes ne bougent pas, les cartes
(88 / 184) gardent leur hauteur, la barre du bas du téléphone mesure ses
libellés avec le facteur.

Écartés : zoomer le cadre de `panel.js` (juste dans Chrome, pas dans l'app
iPhone / iPad) ; « Très grande » (130 %), retirée le 08/11 (« très grand
c'est pas ouf ») — un écran qui l'avait passe à Grande.

## Les conséquences

Écran seulement. Tests `taille_texte` (le greffon recense ce qui reste fixe
sur les vraies sources) et `barre_mobile_courte`.
