# 0388 — Les ouvertures ont leur tuile, leur popup et leur rappel au téléphone

*22 novembre 2026 — appliqué (v3.100.0) (sa consigne « pour les ouvertures », trois maquettes du 22/11)*

## Le problème

Le 22/11, trois maquettes de l'utilisateur, avec ces mots : « pour les ouvertures ».
- « Ouvertures — tuiles » : la tuile d'une porte, d'une fenêtre, d'un garage, sous « OUVERTURES · 1 ouverte ». La pile en haut à
  droite, l'état avec un point qui pulse (« Ouverte depuis 4 min »), l'heure (« ouverte à 17:21 », « depuis 09:12 », « Pile
  faible : à changer », « plus de signal depuis 16:55 »), le dessin en bas à droite, la tuile entière à l'ambre quand elle est
  ouverte, éteinte quand elle est muette.
- « Ouverture — popup (ouverte, alerte) » et « (fermée) » : le dessin en grand et l'état ; l'alerte passé le délai ; la journée
  (ouvertures, temps ouvert, dernière, une bande de 0 h à 24 h, la liste) ; les sept derniers jours ; « Me prévenir si elle
  reste ouverte » (Jamais, 5, 10, 30 min) et « Prévenir dès l'ouverture la nuit » ; le dernier signal, la pile, l'appareil.

Jusque-là, un capteur d'ouverture prenait la carte générique (`RoomGenericCard`) avec son dessin en filigrane (« j'aime bien
l'illustration en arrière-plan », 15/09), et la fiche de tout capteur binaire (`RoomBinarySheet`) : le mot, « depuis », une bande
du jour, le dernier signal et la pile. Rien ne prévenait d'une porte restée ouverte.

## La décision

**La tuile** (`carteouverture.jsx`, chargée à la demande par `RoomGenericCard` — partout où une ouverture se pose : Sécurité,
une pièce, les favoris, une vue à soi). La maquette, dans le gabarit de la maison : plaque en haut à gauche, pile en haut à
droite, nom sous la plaque, 184 px. L'heure vient de l'historique du jour (`useJournee`), jamais de `last_changed` seul (ADR
0031) ; sans changement aujourd'hui, « fermée toute la journée », ou, ouverte dès minuit, « Ouverte depuis plus de 9 h 12 ».
Ouverte, l'ambre en entier : lavis en biais (au réglage « Teinte »), liseré, plaque, point qui pulse. Muette : 0,6 et le liseré
qui respire (ADR 0048). Sur la carte étroite du téléphone (1c, sous 188 px), le dessin descend à 42 px dans la place de la ligne
de commandes ; l'état et l'heure rétrécissent pour tenir.

**Le dessin** (`dessinouverture.jsx`) : la porte (porte, garage) ou les deux vantaux (fenêtre, ouvrant sans nom), fermés au gris
du trait, ouverts à l'ambre — le battant qui pivote, le vantail qui glisse —, éteints muets. Jetons du thème seulement.

**La popup** (`ficheouverture.jsx`, chargée à la demande par `FicheBinaire` pour les classes `door`, `window`, `garage_door`,
`opening`) : sans onglets, à la hauteur de son contenu, l'en-tête commun (`EnteteFiche`, une croix), puis la maquette. Une
lecture de l'historique sur sept jours à l'ouverture, relue quand l'état change ; l'état vivant complète la lecture que
l'enregistreur n'a pas encore écrite. Ouverte, « depuis 12 min 03 s » bat à la seconde.

**Le rappel** (`ouvertures.py`, module neuf). Une minuterie ne vit pas dans un onglet : le composant écoute. Le réglage est
une table de la configuration commune, `loggia_ouvertures = {entité: {delai, nuit}}`, écrite par la popup (réservée aux
administrateurs, comme toute clé de la maison : le panneau ne se montre qu'à eux) et reprise aussitôt (`rechargement.py`).
- Délai choisi : au bout du délai, une notification (« {nom} est ouverte depuis {n} min »), puis un rappel toutes les 15
  minutes, quatre au plus — un capteur bloqué ouvert ne sonne pas toute la journée.
- La nuit cochée : de 22:00 à 07:00, ou maison vide (`tous_absents` : au moins une personne suivie et joignable), une
  notification dès l'ouverture (« {nom} vient de s'ouvrir »).
- Une vraie ouverture seulement (`off` → `on`) : un retour depuis un état muet compte le délai, sans alerte de nuit. Au
  démarrage, une ouverture déjà ouverte recompte son délai.
- Des envois ordinaires, jamais critiques, aux personnes présentes (tout le monde maison vide) ; aux heures calmes, sans son.
- Rien de choisi : rien ne part. Par défaut « Jamais » et la nuit coupée.

**La vue Sécurité** titre la section « Ouvertures » en petites capitales et compte les ouvertes à l'ambre, comme la maquette.

## Ce qui diffère des maquettes, et pourquoi

- Tuile : 184 px (196 dessinés), rembourrage 16, plaque 38, nom en 14, arrondi du thème — le gabarit de la maison, celui de ses
  voisines de grille. L'icône reste celle de l'appareil (choisie, sinon sa famille), pas le glyphe unique de la maquette.
- Téléphone : la maquette n'a pas de carte étroite ; à 176 px, le dessin de 56 × 70 passait sur le texte.
- Popup : l'en-tête commun de toutes les fiches (plaque de 40, épingle et croix de 34 au même point partout) ; les délais en
  puces à l'arrondi de la maison, sans filet ; la liste du jour s'arrête à six lignes (« {n} de plus aujourd'hui »).
- Le rappel : par défaut « Jamais » (la maquette montre 10 min cochées) ; quatre rappels au plus ; le panneau caché à un compte
  ordinaire, qui ne peut pas l'écrire.
- Un ouvrant sans nom (`opening`) se dit au masculin, comme la table des binaires.

## Les conséquences

- **Redémarrage de Home Assistant** : un module neuf (`ouvertures.py`), câblé dans `__init__.py` et `rechargement.py`. Sans
  redémarrage, la tuile et la popup marchent ; le réglage s'enregistre ; rien ne part au téléphone.
- Trois textes au téléphone (`CLES_TELEPHONE`, `textes_catalogue.py` régénéré), traduits dans les six catalogues.
- La démo : la porte d'entrée et la baie vitrée préviennent à 10 min, la nuit ; les six ouvertures ont leur semaine ; la popup
  de la baie, ouverte depuis 47 min, montre l'alerte.
- `IlluOuvrant` reste pour les rangées de la popup du groupe « Ouvertures », hors des maquettes.
- Tests : `tests/ouverture.test.mjs`, `tests/python/test_ouvertures.py` ; assertion modifiée : `test_lot16_alertes_traduites`
  (le module parle au téléphone).
