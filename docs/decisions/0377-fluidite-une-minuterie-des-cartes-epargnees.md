# 0377 — Fluidité : une minuterie, des cartes épargnées, Objets sur sa signature

*19 novembre 2026 — appliqué (v3.100.0)*

## Le problème

> « Vois pour optimiser, fluidifier un peu plus le dashboard. »

Rapport de fluidité du 19/11, points 1 à 3 retenus (« 1 à 5 » ; les points 4
et 5, la vue Énergie, font un lot à part). Home Assistant rend un `hass` neuf
à chaque changement de N'IMPORTE QUELLE entité :

1. Objets relisait alors toute la maison — découverte des lumières, des
   chauffages, des volets, tri, comptes —, même pour une puissance qui bougeait
   de 3 W.
2. Toutes les cartes d'une vue se redessinaient, même inchangées : une seule
   carte de tout Loggia était protégée (`memo`).
3. Chaque `useHass` avait sa minuterie de 2 s — près de 140 sur Objets,
   déphasées, autant de rendus séparés —, qui tournait aussi tablette en veille
   ou appli en arrière-plan.

## Décidé

1. `signatureMaison` (vues/objets.jsx) : Objets ne se relit que si sa
   signature change — l'état, `hvac_action`, la position, le nom, la classe de
   chaque entité ; d'un capteur chiffré, seulement s'il répond et, pour une
   puissance, s'il passe 10 W ; l'index, la découverte et la configuration par
   leur identité. Une porte qui s'ouvre change la signature ; 3 W de plus, non.
2. `memeCarte` (appareils/fiches.jsx) : les neuf cartes d'entité de la fabrique
   commune ne se redessinent que si leurs propriétés, l'état de leur entité, de
   son appareil ou des membres d'un groupe, la connexion, la langue ou la
   minute ont changé. La minute garde à jour un « il y a 3 min ». `ouvrir` lit
   l'état du moment. Les versions protégées se créent au premier usage : les
   fichiers de cartes et la fabrique s'importent l'un l'autre.
3. `abonnerPont` (app/noyau.jsx) : une minuterie pour tout le pont. Un tic
   relève `hass` une fois et le passe à tous ; leurs mises à jour tombent dans
   le même rendu. Écran caché, elle se tait ; au retour, un tic aussitôt.

## Conséquences

- Même cadence de 2 s à l'écran ; rien ne change à l'œil.
- Un réglage de Paramètres qu'une carte lit sans l'avoir en propriété ne la
  redessine qu'à son prochain changement d'état, ou à la minute suivante.
- Tests : `tests/fluidite_lot_a.test.mjs`. Épingles adaptées, marquées
  « ASSERTION MODIFIÉE » : le texte de la fabrique et le nom des cartes
  (capteurs, carte_mesure, carte_prise, carte_volet, edition_cartes,
  lot13_generique_lampe, objets, dependances), la portée donnée à `useHass`
  (distributeur_finition, lot16_config_abimee), et le compte des minuteries
  (prises_gestes : une pour tous, vérifiée par les rendus).
- Une horloge remplacée (les tests en posent une par cas) fait repartir la
  minuterie commune de zéro ; dans un navigateur, cela n'arrive pas.
