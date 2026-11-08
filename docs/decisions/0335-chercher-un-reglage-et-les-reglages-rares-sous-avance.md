# 0335 — Chercher un réglage, et les réglages rares sous « Avancé »

*7 novembre 2026 — appliqué (v3.98.0) (étape 12 du rapport sur l'usage)*

## Le problème

Un réglage se cherchait section par section. Son souhait : « on tape veille
et on y est ».

## La décision

`src/reglagesindex.js` nomme 68 réglages par les mots de leur rangée (le
même réglage ne s'appelle pas pareil sur PC et au téléphone), leur section,
l'onglet des Règles qui le montre, et « Avancé » s'il le faut ; les sections
fermées au profil ne se proposent pas. Le champ « Rechercher un réglage » est
en tête du rail (PC) et au-dessus des onglets (téléphone) : choisir ouvre la
section, déplie ce qu'il faut, centre la rangée et l'allume 1,8 seconde. Ctrl+K
trouve aussi les réglages, depuis toute vue.

« Avancé », replié, sur les deux formats : la page de démarrage, le plan 3D,
les marges de l'écran. « Langue et démarrage » devient « Langue et
navigation ».

## Les conséquences

Écran seulement. Une clé de session, `loggia-par-reglage`, le temps
d'ouvrir les Paramètres (page des cookies). Test `reglages_recherche`.
