# 0319 — Petits correctifs de lecture : Electricity Maps à sa clé, préréglages traduits, rien d'un téléphone dans Objets, un seuil sans plafond

*1er novembre 2026 — appliqué (v3.97.0) (lot 14 du rapport « Gladys comparé au catalogue », 31/10 : D15, D16, E1, Z1, D21 ; plus une demande ajoutée)*

## Le problème

Cinq lectures fausses ou fragiles, relevées par le rapport, et une sixième demandée :

- **D16, E1.** La vue Énergie trouvait la part d'énergies fossiles d'Electricity Maps à son
  NOM : un capteur `sensor.*` dont l'identifiant contient « fossil », en %. Contraire à
  l'ADR 0164 : renommé, la tuile « Électricité bas-carbone » disparaissait. L'intensité
  carbone du réseau (gCO₂eq/kWh), que l'intégration publie aussi, n'était lue nulle part.
- **D15.** L'ancienne feuille d'un `climate` (`appareils/fiches.jsx`) et la feuille d'une zone
  (`cartes/chauffage.jsx`) écrivaient les préréglages bruts : « frost_protection »,
  « comfort-1 ». Un radiateur qui ne se règle que par préréglages (Heatzy, Muller Intuitiv…)
  les montrait ainsi.
- **Z1.** Objets pouvait montrer un capteur de l'application Home Assistant d'un téléphone
  (`mobile_app`). Le baromètre d'un iPhone y entrait (classe `pressure`, sans catégorie). La
  glycémie et la tension (Health Connect) n'en étaient tenues à l'écart que par leur catégorie
  « diagnostic » : la tension a aussi la classe `pressure`.
- **D21.** Le seuil des consommables plafonnait à 90 à l'écran (`views/veilles.jsx`). Le serveur,
  lui, n'a pas de borne haute (`veilles.py`, `_poser_patch`) : un réservoir compté en
  millilitres ne pouvait pas recevoir un seuil de 150.
- **Demande ajoutée** (avec son accord). `app/derive.jsx` cherchait la progression de la tondeuse
  au NOM de son capteur (`/(progress|progression)/`), pour un objet, `machines.tondeuse`,
  qu'aucun écran n'affichait. L'Accueil ne lit que `machines.lv`.

## La décision

**Electricity Maps** (`src/carbone.js`, neuf, chargé avec la vue Énergie seule). Ses capteurs
sont ceux de la plateforme `co2signal`, reconnus à leur clé de traduction :
`fossil_fuel_percentage` (la part fossile) et `carbon_intensity` (l'intensité). C'est ce que dit
le registre de l'installation d'essai. Sans clé (une version ancienne de l'intégration), l'unité
départage : `%`, ou `gCO2eq/kWh`. Avec deux entrées d'Electricity Maps, c'est la première du
registre qui compte. Jamais le nom. La part bas-carbone se calcule comme avant. Une tuile
« Intensité carbone » la suit, avec la valeur arrondie et l'unité du capteur, écrite
« gCO₂eq/kWh ». Elle s'affiche dès que le capteur se lit, même quand la part bas-carbone ne se
calcule pas. La démo porte les deux capteurs (38 %, 56 gCO₂eq/kWh).

**Les préréglages** (`motPreset`, `chauffageecran.js`). Le mot de Home Assistant d'abord, pour
les siens (eco, comfort, away, boost…). Sinon, celui de l'ordre fil pilote que le préréglage
écrit, avec les mots de la carte (`motMode`) : « frost_protection » donne Hors-gel,
« comfort-1 » donne Confort −1. La table est celle du serveur (`OPTIONS`,
`chauffage_familles.py`), mise à plat de la même façon (`modeDOption`, comme `canonique`).
Sinon, le préréglage tel que l'appareil l'écrit (« turbo », « overnight »). Les deux feuilles
d'avant et la fiche de chauffage (qui avait sa propre règle) appellent la même fonction.

La démo garde sa copie de la table (`GRAPHIES_CHA`). La faire importer de `chauffageecran.js`
sortait ce module du démarrage en morceau à part (67 Ko) : le chiffre du boot baissait sans
rien gagner au chargement. Un test tient les trois tables ensemble (serveur, écran, démo).

**Rien d'un téléphone** (Z1). Une règle explicite : une entité de la plateforme `mobile_app` ne
fait pas de carte dans Objets (`vues/objets.jsx`), ni dans la grille d'une pièce
(`app/decouverte.jsx`, si un téléphone a été posé dans une pièce). Le téléphone garde ses autres
usages : la personne qu'il suit compte dans la présence, ses notifications passent par le
service `notify`, ses piles étaient déjà écartées à leur plateforme (`piles.js`). Un traceur
d'objet (ADR 0318) n'est pas un `mobile_app`.

**Le seuil des consommables** (D21). Plus de plafond à 90. Comme au serveur : 1 au moins, et 10
pour ce qui n'est pas un nombre (vide, zéro, l'infini). Le plafond suit l'unité : 100 quand
TOUS les capteurs désignés sont en pour-cent, aucun sinon. Le serveur reste sans borne haute.

**La tondeuse.** `machines.tondeuse` et la recherche de sa progression au nom sont retirées de
`deriveAccueil`, ainsi que le capteur de progression des entités que l'Accueil suit
(`mowerKeys`, App.jsx). Rien ne les lisait, tests compris, sauf une assertion qui épinglait le
texte (`etats.test.mjs`, ASSERTION MODIFIÉE). La carte du robot lit déjà la progression à sa clé
(`progress`, ADR 0313) et s'abonne elle-même. La batterie et la charge de la tondeuse restent :
le journal (« Retour à la base », « En charge ») et l'Accueil les lisent.

Écarté : retirer aussi `machines.aspirateur`, qu'aucun écran ne lit non plus. Hors du lot, il
reste à lui.

## Les conséquences

- Aucun fichier Python. Pas de redémarrage de Home Assistant.
- Démarrage : 1 059 644 octets, contre 1 059 858 avant le lot (−214). Le retrait de la tondeuse
  rend 992 octets ; le reste du lot en coûte 778, surtout la table des graphies et `motPreset`.
- Un texte nouveau, « Intensité carbone », dans les six autres langues (pl : un ajout). Aucun
  texte au téléphone.
- Tests : `tests/gladys_lot14_lecture.test.mjs`. Une assertion modifiée : `etats.test.mjs`.
- Non vérifié chez lui : rien n'a été vu dans un navigateur.
