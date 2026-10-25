# 0251 — L'audit des capteurs, à l'écran

*19 octobre 2026 — accepté, à l'essai (audit des capteurs, lot 3 ; rien de publié). Décisions D3 et D5 de l'utilisateur, déjà tranchées. Complète les ADR 0200 (la fiche d'une mesure), 0206 (une seule règle des piles) et 0250 (le lot 2, côté serveur).*

## Le problème

L'audit du 19/10 a rejoué le classement et l'affichage des capteurs sur des
maisons fabriquées (sondes `audit-A`, `audit-E`). Les défauts tenaient en
quelques familles :

- **ce qui n'est pas l'air d'une pièce était jugé comme lui** : le frigo de la
  cuisine « Trop froid », la sonde d'un processeur « Trop chaud », pour
  toujours « à regarder » ; et la découverte des pièces prenait la première
  température de la zone — le frigo, la température interne d'une prise
  (H8, H9) ;
- **des familles manquaient** : un monoxyde de carbone en ppm n'apparaissait
  nulle part, ni les COV en ppb, ni PM1, NO₂, l'ozone, la pression
  atmosphérique (H10, M7) ;
- **le dehors parlait pour rien** : une vigilance au calme était jugée
  « bonne » et Dehors disait « Rien à signaler » presque toujours ; une plante
  de balcon y tombait (M10, M11) ; le dehors se reconnaissait à quelques noms
  (« Backyard », « Cour » n'en étaient pas ; « Jardin d'hiver » si) (M15) ;
- **deux vocabulaires du CO₂** : la bannière gardait trois paliers, lisait
  « QUALITÉ AIR · ÉLEVÉ » (« bonne qualité »), « BON » sans mesure, ignorait le
  seuil de la veille et celui de la pièce, qui se perdait (H7, M16) ;
- **la carte d'un appareil** se choisissait par ordre alphabétique, C16 et
  C17 ne valaient que pour la table, une sœur Météo-France faisait disparaître
  la vigilance, la carte Piles comptait les batteries rechargeables et un
  `min_max`, l'Accueil comptait les groupes de Home Assistant (M8, M9, M12,
  M13, M14).

## La décision

**1. Deviner d'abord, corriger à la main ensuite (D5).** La découverte devine
qu'une mesure n'est pas l'air de sa pièce (`horsair.js`) : une entité de
catégorie, un nom ou un modèle qui dit un frigo, un congélateur, une cave à
vin, un processeur, un disque, la buse ou le plateau d'une imprimante 3D, un
point de rosée, un ressenti, une sonde interne, un aquarium, une piscine —
dans les sept langues, hors les mots du nom de sa pièce —, ou un appareil qui
a un autre rôle (`water_heater`, un `switch`, une puissance mesurée). Une telle
température ou humidité reste visible, NEUTRE, sous son nom de Home
Assistant ; la découverte des pièces ne la prend pas, et préfère une
`state_class: measurement`. La sonde d'un thermostat ou d'un humidificateur
(tado, Nest, Ecobee, Sensibo) EST l'air de la pièce : jugée comme lui, et prise
par la découverte à défaut d'un thermomètre à part (relecture du lot 3). Deux réglages servent seulement à corriger, dans
la configuration de la maison (réservée aux administrateurs ; un refus nomme
la clé) :
- « Pièce du dehors » — Auto, Oui, Non — dans la fiche d'une pièce
  (`loggia_rooms[].dehors`), qui l'emporte sur les noms ;
- « Ne pas juger cette mesure » dans la fiche d'une mesure
  (`loggia_mesures_nonjugees`, `{ entity_id: vrai | faux }`), dans les deux
  sens.

Le dehors se reconnaît à une liste élargie (la cour, le potager, la piscine,
l'allée, le porche, le carport ; « Backyard », « Hof », « Oprit », « Cortile »,
« Huerto », « Podwórko »…) ; un mot court ne vaut qu'entier (« cour » n'est pas
« couloir ») ; un jardin d'hiver, une véranda, une pièce « côté jardin » restent
dedans. « Couvert » ne rentre que la piscine : une terrasse, un balcon, un
patio couverts restent dehors. Le garage n'est pas dehors.

**2. Dehors au calme ne dit rien (D3).** Une vigilance au calme est neutre ;
Dehors ne parle que pour une vigilance active (jaune ou plus) ou muette :
« 1 à regarder ». Jamais « Rien à signaler ». Une plante et la carte Piles
restent dans Plantes et piles, même au balcon. MeteoAlarm au vert ne lève plus
« Vigilance météo » à l'Accueil.

**3. Le monoxyde de carbone en ppm est une famille de la table** (`co`) : sous
9 ppm « Bon » (la valeur guide de l'OMS sur huit heures), de 9 à 35 ppm
COMPRIS « Moyen · aérez » (sa valeur sur une heure), AU-DELÀ de 35 « Danger ».
Au palier Danger, il SONNE dans la carte Sécurité de Maison, dont il est
membre (`coDanger`) — sa popup le dit, et ouvre la fiche de la mesure. Son
choix du 19/10, « Téléphone, sans réaction » : au-delà du même seuil
(`SEUIL_CO`, veilles.py, épinglé à la table par un test), la veille du serveur
envoie UNE notification, par le canal critique, jusqu'au retour franchement
sous le seuil ; la maison ne réagit pas (ni lumières, ni volets). Découverte :
classe `carbon_monoxide`, unité ppm, appareil physique ; « Observer sans
agir » la simule ; la catégorie « co » décochée la tait. `alertes.py` ne
change pas.

**4. Les autres familles d'air entrent, NEUTRES** : PM1, PM10, l'indice de
qualité de l'air, les COV en ppb ou en µg/m³ (la table ne lit qu'un indice de
0 à 500), NO₂, l'ozone — dans Air ; la pression (`pressure`,
`atmospheric_pressure`) dans Confort. Aucune n'a d'échelle qui vaille pour
tous les capteurs : elles disent leur chiffre et leur courbe, sans zone.

**5. La carte d'un appareil, par priorité de classe** (vue d'une pièce,
Objets) : CO₂ > CO > PM2,5 > COV > PM10 > PM1 > NO₂ > ozone > température >
humidité > indice > bruit > luminosité > pression. C16 et C17 valent pour
tous les capteurs : un appareil physique, et pas dans une zone que Loggia ne
compte pas. La vigilance n'entre jamais dans ce dédoublonnage.

**6. Le seuil CO₂.** Le seuil d'une pièce (`haid.co2seuil`) survit à
`normRooms` et à la fiche de la pièce, et l'Accueil le lit comme un nombre ;
sans lui, le seuil réglé dans la veille CO₂ (`seuilCo2`), sinon 1 400 ppm. La
bannière et le badge disent le mot et la couleur de la table
(`zoneMesure('co2')`) ; rien pendant le chargement.

**La lumière d'une plante** se juge sur le maximum que tient la plante de
Home Assistant (`max_brightness`), sinon sur le lux du moment, soleil levé ET
midi solaire passé (`sun.sun`, `rising` faux) : ni la nuit, ni l'aube. Sans
`sun.sun`, elle ne presse pas.

**Et, au passage :** la carte Piles exige un appareil physique et écarte une
prise branchée (`plug`), une puissance de charge, un onduleur (`nut`,
`apcupsd`) — `veilles.py` suit la même règle ; l'Accueil écarte les groupes
de Home Assistant et les entités masquées ; une température en kelvins se
convertit ; un nombre se lit strictement (« 1,659 » ne vaut plus 1 ;
« Valeur illisible » sinon) ; la sonde d'un thermostat n'écarte que sa
température et son humidité ; la phrase d'une température ne redit
l'humidité de son appareil que si celle-ci est bonne (« Bon · 68 % » se
lisait comme un jugement de l'humidité) — dehors, toujours ; les barres d'une
pile et la fiche d'une plante lisent la seule règle des piles ; une seule
table des classes de binaires (attention.js) et une seule source de noms
(confort.js, `nomClasse`) ; la fiche d'une pièce est chargée à la demande.

## Conséquences

- La démo porte les cas : des particules muettes au bureau, une vigilance
  Météo-France jaune, une vibration à part, un monoxyde à 2 ppm ; son indice
  de qualité de l'air, sur la station du jardin, ne passe plus sous zéro.
- Une mesure sans appareil physique quitte Objets, quelle que soit sa classe
  — un indice de qualité de l'air d'un service, une pression calculée.
- Six textes nouveaux à l'écran ; le polonais est à relire par un
  contributeur.
- Le composant change (`veilles.py`) : il faut redémarrer Home Assistant pour
  que la veille des piles suive la nouvelle règle et que le monoxyde chiffré
  prévienne le téléphone. Un texte nouveau part au téléphone
  (`CLES_TELEPHONE`).
