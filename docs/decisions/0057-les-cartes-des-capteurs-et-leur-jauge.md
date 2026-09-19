# 0057 — Les cartes des capteurs : la carte de base et une jauge ; une seule table de seuils

Date : 19/09/2026 (v3.57.0). Statut : acceptée. Demande, captures à l'appui
(une carte « Chambre CO2 · 1280 ppm · Qualité d'air · ÉLEVÉ » de la démo,
quatre jauges d'une application Netatmo — qualité de l'air, température,
humidité, bruit — et une pile en cinq barres) : « je sais pas ce que tu
penses de la carte capteurs mais ça ne me va pas trop […] il faut revenir à
la carte de base, celle-ci ; pour le CO₂ ajouter une jauge en dessous comme
sur ces images ». Puis, sur une maquette : « pour les jauges, je voudrais un
trait pas un rond, et les chiffres sont les uns sur les autres » ; et, à la
question des seuils : « les valeurs sont inscrites sur les photos ».

## Contexte

- Depuis le 15/09, la carte d'un capteur de CO₂ qui appartient à une station
  (Netatmo : température, humidité, CO₂, bruit) portait ses mesures sœurs en
  puces au pied. La démo n'a pas de station : sa carte était restée « de
  base ».
- Trois échelles de CO₂ coexistaient : la carte et la bannière (`airPalier`,
  800 / 1 200), la barre de confort et sa fiche (`confort.js`, 800 / 1 000 /
  1 200 / 1 400), le point « À surveiller » et la veille du serveur (1 200).
  À 1 280 ppm, la carte disait « ÉLEVÉ » en rouge, la barre « Élevé » en
  orange.

## Décision

- La carte capteur redevient la carte de base : la mesure en grand en haut à
  droite, le nom, le verdict — plus de puces sœurs. La température et
  l'humidité d'une station vivent dans la barre de confort de la pièce.
- Sous le texte, une JAUGE pour les mesures que la table connaît (CO₂,
  température, humidité, bruit) : les paliers bout à bout, un TRAIT à la
  valeur, les repères des captures dessous. Une pile a ses cinq barres. La
  compacte a une jauge fine, sans chiffres.
- UNE table de seuils, celle des captures (`confort.js`) :
  - CO₂ : 900 · 1 150 · 1 400 · 1 600 ppm — Excellent (bleu), Bon, Moyen,
    Élevé, Confiné ;
  - température : 15 · 16 · 17 · 18 à 23 (l'idéal) · 26 · 27 · 29 °C, le
    rouge des deux côtés ;
  - humidité : 15 · 20 · 30 · 40 à 50 (l'idéal) · 60 · 70 · 80 % ;
  - bruit : 50 · 65 · 70 · 80 dB — Calme (bleu), Modéré, Animé, Bruyant,
    Très bruyant ;
  - pile : une barre par 20 %, au plus proche — cinq vertes, quatre vert
    clair, trois jaunes, deux orange, une rouge.
  Les couleurs sont des jetons du thème : `--o-cold` pour le bleu de
  l'idéal, puis `--o-ok`, `--o-warn`, `--o-warn2`, `--o-bad`.
- Tout la lit : la carte (mot, couleur, lavis du CO₂, jauge), la compacte, la
  barre de confort et sa fiche (barres et repères), la carte « Qualité air »
  du catalogue, la bannière et le badge d'une pièce (`airPalier` : 1 150 /
  1 400), le point « À surveiller » (`SEUIL_CO2` = 1 400, le début
  d'« Élevé ») et le défaut de la veille CO₂ du serveur (1 400). Un seuil
  réglé dans une veille reste le sien.
- Les chiffres ne se chevauchent pas : l'échelle est linéaire, bornée comme
  sur les captures, et reste lisible dans une carte de téléphone (barre de
  144 px).

## Conséquences

- L'indice de confort sur 100 se recale : le plateau de l'idéal vaut 100
  (courbes de `confort.js`). Une chambre à 19,6 °C, 49 % et 1 280 ppm passe
  de 67 à 78.
- À 1 280 ppm, le CO₂ ne déclenche plus « À surveiller » (il le faisait dès
  1 200) : il le fait à 1 400, là où la carte dit « Élevé ». La démo passe
  la chambre à 1 480 ppm pour garder de quoi montrer.
- Chez l'utilisateur, la veille CO₂ du serveur est coupée, avec un seuil de
  1 200 enregistré : il n'est pas réécrit. La carte CO₂ du rail (aération)
  lit ce seuil.
- La température, l'humidité, le bruit et les piles n'ont de carte que si on
  les ajoute (vues, favoris, ajout dans une pièce) : la découverte ne les
  montre pas d'elle-même.

Tests : tests/jauges.test.mjs (8) ; capteurs, pieces_confort, attention,
ambiance, accueil_attention, accueil_co2 et test_veilles (Python) réalignés.
Vérifié en démo : Objets → Capteurs (538, 1 480, 612 ppm) ; la Chambre
(barre, fiche de confort aux repères des captures) ; l'Accueil (« CO₂ élevé ·
Chambre 1 480 ppm », « QUALITÉ AIR · ÉLEVÉ ») ; dans le Salon, après ajout,
le bruit, l'humidité, la température, une pile et trois compactes — à
l'ordinateur et au téléphone (390 px), sans chiffre qui en chevauche un
autre.

## Amendement (19/09/2026, v3.57.1) — la compacte sans jauge, une barre plus épaisse

Demande, deux captures (la compacte de la maquette, où le chiffre écrasait
le nom ; la compacte de la bibliothèque, « Température séjour 21,4 °C ») :
« pourquoi ? laisse comme sur la 2e photo et épaissis légèrement la
graduation sur les autres ».

- La compacte (`CvCard`) retrouve son dessin d'avant : icône, nom, valeur —
  plus de jauge fine. La première capture venait de la maquette ; sa jauge
  fine était aussi passée dans la vraie compacte.
- La barre de la jauge des cartes standard passe de 6 à 8 px ; le trait,
  de 16 à 18 px, la dépasse toujours.

Tests : tests/jauges.test.mjs (réaligné : pas de jauge dans la compacte, une
barre de 8 px). Vérifié en démo : la compacte « Salon CO2 · 612 ppm » sans
jauge ; une carte standard à 1 330 px et à 360 px — la jauge tient dans la
carte, les chiffres restent séparés.

## Amendement (19/09/2026, v3.58.0) — les piles et batteries dans la vue Énergie

Demande : « dans Énergie, à la suite des postes de consommation, on pourrait
ajouter les nouveaux capteurs de batterie, non ? ».

- Après « Postes de consommation », une section « Piles et batteries » : un
  titre, le nombre de capteurs, et la grille des Objets (176 × 184 au
  téléphone) avec la carte standard à cinq barres — un toucher ouvre sa
  fiche. Pas de cadre autour ; sans pile, pas de section.
- La liste (`piles.js`, `pilesMaison`) : les capteurs de classe `battery`,
  jamais reconnus à leur nom ; les entités masquées ou désactivées restent
  dehors, celles de diagnostic non — c'est la catégorie de presque toutes
  les piles Zigbee. La plus basse d'abord, les capteurs muets à la fin : une
  pile à plat se tait souvent.

Tests : tests/piles_energie.test.mjs (3). Vérifié en démo : la section suit
les postes, « Pile porte entrée » (9 %, une barre rouge, « Pile faible »)
puis « Basilic pile » (81 %, quatre barres) ; la fiche s'ouvre au toucher ;
au téléphone, deux colonnes de 176 px, rien ne déborde.

## Amendement (19/09/2026, v3.58.1) — sans les téléphones

Demande : « retire les téléphones de la liste des piles ».

- Les batteries de l'application Home Assistant (intégration `mobile_app` :
  téléphones et tablettes) quittent la section « Piles et batteries ».
  Reconnues à leur intégration, lue dans le registre des entités — jamais à
  leur nom.
- Chez l'utilisateur : 27 capteurs de pile, dont 5 de `mobile_app` et 5
  masqués ou désactivés.

Tests : tests/piles_energie.test.mjs (réaligné).
