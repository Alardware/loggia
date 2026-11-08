# 0337 — Les cartes pièces de l'Accueil, sur sa maquette

*8 novembre 2026 — appliqué (v3.99.0)*

## Le problème

La carte standard d'une pièce disait peu de chose : une icône nue, une
température teintée, « 4 lumières » et un badge en ppm. Le réglage Arrondi ne
la touchait pas : son rayon était écrit en dur.

## La décision

Sur ses captures du 08/11, la carte standard (184) porte une plaque à la teinte
de la pièce, la température en blanc, l'humidité dessous, puis le CO₂ comme
ailleurs dans Loggia : la valeur, le point et le mot de la zone. La ligne d'état
s'écrit en toutes lettres, sur deux lignes au plus (`phrasePiece`) : « 4 lumières
allumées · Musique en cours », « CO₂ élevé · pensez à aérer » dès 1 400 ppm. La
musique seule se dit en bleu. Au pied : l'ampoule, le nombre de lampes
allumées, l'interrupteur de la carte compacte. L'en-tête des Pièces gagne
« Tout éteindre » : les pièces à l'écran, veilleuses et prises protégées
épargnées, rattrapable cinq secondes. Le rayon suit `--o-radius`, pointillés
d'édition compris. La carte compacte (88) ne change pas.

Écartés, après les avoir vus : une seule ligne de mesures sous la température ;
les mesures en bas à gauche des cartes sans minis, dont le bas reste vide. Pour
les lampes sans variateur, la compacte par défaut et le dessin d'une ampoule en
fond : elles restent à 184.

## Les conséquences

Écran seulement. Tests `ambiance`, `pieces`, `pieces_parlantes`, `clavier`.
