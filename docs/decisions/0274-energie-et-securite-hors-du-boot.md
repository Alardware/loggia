# 0274 — Énergie et Sécurité hors du boot

*25 octobre 2026 — à l'essai (rien de publié)*

## Le problème

> « Sortir du boot ce qui peut se charger à la demande, sans toucher à la
> borne. »

Le boot (`tests/lot14_chargement.test.mjs`, borne 1 100 000 octets) pesait
1 099 360 octets. Il restait 640 octets : la prochaine livraison qui ajoute au
démarrage allait bloquer. Le boot est presque entièrement App.jsx, et App.jsx
portait encore deux vues qu'on ouvre d'un tap et que l'Accueil n'affiche
jamais : la vue Énergie (≈ 29 Ko minifiés, avec son schéma de la maison, ses
câbles et ses pastilles) et la vue Sécurité (≈ 9 Ko).

## Décidé

Les deux vues sortent dans `src/views/energie.jsx` et `src/views/securite.jsx`,
chargées par `lazyRecharge` derrière un `<Suspense>` dont le repli est la
`loggia-content` vide de la vue Système. Chacune part avec ce qu'elle SEULE
utilise ; le code est celui d'App.jsx, déplacé sans retouche.

Ce qu'elles partagent avec le reste de l'interface — l'éditeur d'agencement,
les cartes éditables, `Num`, la carte d'alarme, les caméras… — reste dans le
monolithe. Une vue sortie ne peut pas importer App.jsx (boucle) : App.jsx pose
ces pièces dans `OUTILS_VUES` (`src/outilsvues.js`) à son évaluation, en fin de
fichier, avant tout rendu ; la vue les y reprend à son chargement. Une
liste-fonction (`CAMERAS`) s'y prête appelée, `cameras: () => CAMERAS()`.

`enDevices` reste dans App.jsx : la signature des capteurs bruyants et
`enKeys` le lisent.

Les tests qui lisent le monolithe pour y trouver une fonction lisent
`App.jsx + VUES_SORTIES` (`tests/monolithe.mjs`, une seule liste). Ceux qui
épinglaient une ligne d'import d'App.jsx (bilan, piles, relevé, lecteur du
jour, attention) la cherchent maintenant dans la vue.

## Résultat

Boot : 1 099 360 → 1 055 317 octets (marge 44 683). Énergie : morceau de
37 076 octets, Sécurité : 9 211, chargés au premier passage sur la vue.
Aucun comportement visible ne change, aucune clé de langue ne bouge. La borne
de lot14 n'a pas bougé.

## Pour la suite

Une vue de plus à sortir suit le même chemin : ses dépendances exclusives
partent avec elle, les partagées passent par `OUTILS_VUES`, et elle s'ajoute à
`VUES_SORTIES`. Candidates mesurées : la bibliothèque des cartes (≈ 14 Ko), la
vue Objets (≈ 18 Ko), la recherche (≈ 6 Ko).
