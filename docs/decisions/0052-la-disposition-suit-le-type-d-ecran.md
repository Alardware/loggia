# 0052 — La disposition des cartes suit le type d'écran, le contenu suit la maison

Date : 18/09/2026 (v3.53.0). Statut : acceptée. Demande : « sur PC, l'écran
d'accueil a ma personnalisation d'emplacement et de disposition des cartes,
dans les appareils aussi. Sur mobile même chose, sauf que dans les appareils,
si je modifie sur mobile ça modifie sur PC, et si je modifie sur PC ça
modifie sur mobile. Ça ne me va pas : chaque appareil a sa propre
disposition, seul l'ajout ou la modification, la suppression d'entité ou de
carte se synchronise. »

## Contexte

L'Accueil gardait déjà une grille par format — ordinateur, tablette,
téléphone — dans sa clé commune (`loggia_accueil`, `formats`). Les vues à
cartes, elles, rangeaient tout au même endroit : l'agencement d'une vue
(`loggia_roomlayout`, `loggia_objlayout`, `loggia_coverlayout`,
`loggia_enlayout`, `loggia_seclayout`) mêlait le contenu — cartes ajoutées,
retirées, renommées — et la disposition — ordre, largeur, taille compacte.
Ranger une vue sur le téléphone rangeait l'ordinateur.

## Décision

- **Deux parts dans un agencement** (`src/disposition.js`) : le CONTENU,
  commun à la maison (`added`, `removed`, `labels`) ; la DISPOSITION, propre
  au format d'écran (`order`, `larges`, `compacts`).
- **Le format est celui de l'Accueil** : la souris fait l'ordinateur, le doigt
  la tablette sur grand écran, le téléphone ailleurs (`formatEcran`, partagé
  par l'Accueil et l'éditeur des vues). Comme l'Accueil, c'est le TYPE d'écran
  qui sépare : deux téléphones partagent la disposition téléphone.
- **L'ordinateur garde les clés historiques** : une installation existante
  retrouve sa disposition telle quelle, sans migration. La tablette et le
  téléphone écrivent dans `formats[format]`, et suivent l'ordinateur tant
  qu'ils n'ont rien rangé : leur première retouche part de ce qu'ils
  montraient. Rien n'est dupliqué d'avance.
- **L'éditeur commun** (`useLayoutEditor` : pièces, Objets, volets, énergie,
  sécurité) lit l'agencement tel que son format le voit (`vueFormat`) et
  range chaque écriture à sa place (`patchFormat`) — les gestes existants ne
  changent pas.
- **Remplacer l'entité d'une carte** lui garde sa place et sa taille sur tous
  les formats (`echangerPartout`).
- **« Toutes les cartes »** rétablit le contenu pour toute la maison, et
  l'ordre et les tailles de CE type d'écran seulement : les autres gardent
  leur disposition.

## Conséquences

Après la mise à jour, la disposition enregistrée devient celle de
l'ordinateur ; le téléphone la suit jusqu'à ce qu'on y range quelque chose.
L'ordre des scénarios, tenu par le composant, restait commun : il n'est pas
passé par cet éditeur (voir l'amendement ci-dessous, v3.54.0). Tests : tests/disposition.test.mjs (7), vérifié en
démo sur ordinateur et en téléphone émulé. Pas de changement côté serveur.

## Amendement (18/09/2026, v3.54.0) — l'ordre des scénarios aussi

Demande : « oui fais pareil pour l'ordre des scénarios ». L'ordre des
scénarios suit le type d'écran, comme la disposition des cartes.

- **L'ordinateur garde l'ordre du composant** (`ordre`, écrit par
  `loggia/scenarios/config`) : une installation existante le retrouve tel
  quel.
- **La tablette et le téléphone ont le leur**, dans la configuration de la
  maison (`loggia_scnordre` = `{ tablette?, mobile? }`, des listes
  d'identifiants), et suivent l'ordinateur tant qu'on n'y a rien rangé
  (`ordreDuFormat`).
- **Un scénario absent de l'ordre** — créé depuis — passe après ceux qu'on a
  rangés, dans l'ordre du composant ; un scénario supprimé n'est plus qu'un
  nom de trop dans la liste, sans effet (`ordonnerSelon`).
- **Une seule liste ordonnée** (`useScenarios` → `tous`) nourrit la vue, la
  rangée de l'Accueil et, par `SCN_ETAT`, la veille et la recherche. Les
  flèches du mode édition passent par `ordonner` : le composant sur
  l'ordinateur, `loggia_scnordre` ailleurs.
- **Créer, modifier, supprimer un scénario reste commun** : c'est le
  composant qui les tient.

Tests : tests/disposition.test.mjs (+2). Vérifié en démo : sur téléphone
émulé, « Avancer Cinéma » écrit `loggia_scnordre.mobile` ; sur ordinateur, la
même flèche passe par le composant, laisse `loggia_scnordre` vide, et la
rangée de l'Accueil suit.
