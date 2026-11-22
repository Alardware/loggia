# 0360 — La carte d'une pièce suit le seuil de CO₂ réglé

*13 novembre 2026 — appliqué (v3.100.0)*

## Le problème

« À surveiller » et le rail de l'Accueil jugent le CO₂ au seuil réglé : celui
de la pièce s'il existe, sinon celui de la veille « Air vicié », sinon
1 400 ppm. La carte de la pièce, elle, jugeait à 1 400 ppm fixes. Avec une
veille réglée à 1 000, une pièce à 1 200 ppm était signalée dans
« À surveiller » pendant que sa carte disait « Tout est éteint » ; avec une
pièce réglée à 1 800, la carte criait « CO₂ élevé » à 1 500 quand le reste se
taisait.

## La décision

La carte d'une pièce lit **le même seuil** : celui de la pièce, sinon celui de
la maison, sinon 1 400. L'Accueil calcule le seuil de la maison une seule
fois, pour les cartes et pour le rail. Un seuil illisible, nul ou négatif
retombe sur 1 400.

## Ce qui ne change pas

La tuile CO₂ du bandeau et la pastille de couleur d'une pièce gardent leur
échelle fixe : elles ne sont pas touchées ici.

Pas de redémarrage de Home Assistant. Tests :
`tests/audit_1211_lot2b_noyau.test.mjs` (B12),
`tests/pieces_parlantes.test.mjs` (assertion modifiée).
