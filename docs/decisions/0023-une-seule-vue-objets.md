# ADR 0023 — Une seule vue Objets, filtrée, remplace Lumières, Climat et Médias

**Statut** : appliqué (v3.19.0) — `ObjetsView`, `objetsDeLaMaison`, `src/objets.js`.

## Contexte

Le dashboard avait quatre vues pour piloter des appareils : Lumières, Climat
(avec les volets embarqués), Médias, et Objets — un hub à agencement libre
(sections, renommage, cartes libres) réservé aux robots, au distributeur et
aux plantes. Chacune avait ses cartes, son éditeur de mise en page, sa clé de
configuration. La refonte de la Vue Pièce (v3.17.0) a donné à tous les
appareils une même carte : bascule, glissière, boutons, fiche. Les trois vues
de domaine ne racontaient plus rien que la pièce ne dise déjà, en trois
dessins différents.

## Décision

**Une seule vue Objets, aux cartes de la pièce, avec des filtres.** Tous,
Favoris (les épingles), Lumières, Volets, Chauffage, Prises, Multimédia,
Capteurs, Caméras, Sécurité, Ménager, Jardin, Plantes — seules les puces qui
ont quelque chose à montrer s'affichent. En tête : le nombre d'appareils,
de pièces et d'actifs, les scènes, les entités absentes.

Les appareils viennent des **mêmes sources que la Vue Pièce** : zones de
chauffage, lumières découvertes, volets et lecteurs configurés, puis tout le
registre — une carte par appareil, sans les entités cachées, désactivées ou
de configuration, capteurs choisis par classe —, le distributeur et les
plantes de la configuration. La grille se lit pièce par pièce, dans l'ordre
des zones de la maison.

Les routes `lumieres`, `climat` et `medias` **restent** : elles ouvrent
Objets avec le filtre posé, pour les tablettes qui les ont mémorisées, la
recherche et les liens. Leurs vues, leurs éditeurs de mise en page et
l'agencement libre de l'ancienne vue Objets sont retirés. La vue Volets
reste : elle porte la barre de modes et le planning.

## Conséquences

- Un appareil n'a plus qu'un dessin dans tout le dashboard : la carte de sa
  pièce, et sa fiche.
- Ce qui range un appareil sous ses filtres, ce qui compte comme actif et
  l'ordre de la grille sont des fonctions pures (`src/objets.js`), testées
  sans React.
- Les clés `loggia_lightlayout`, `loggia_climlayout`, `loggia_medlayout` et
  `loggia_objlayout` ne sont plus lues ; elles restent dans le magasin sans
  effet.
- Perdu, assumé : le grand lecteur de la vue Médias (la fiche du lecteur
  garde les commandes), les cartes de zones de la vue Climat (les cartes de
  la pièce les remplacent), les sections et renommages de l'ancienne vue
  Objets.
