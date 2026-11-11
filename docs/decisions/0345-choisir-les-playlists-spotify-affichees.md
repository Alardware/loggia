# 0345 — Choisir les playlists Spotify affichées

*11 novembre 2026 — à l'essai (bêta v3.100.0-beta.1)*

## Le problème

« Ça marche ; par contre, pouvoir en édition sélectionner ou décocher des
playlists. » La rangée Spotify (ADR 0344) montrait tout le compte, puis celles
ajoutées par lien : rien ne permettait de n'en garder que quelques-unes.

## La décision

En mode édition (Objets › Multimédia), chaque pochette porte une coche et ne
lance plus rien : un appui la coche ou la décoche. Cochée, un rond bleu plein ;
décochée, un rond vide et la pochette grisée, « Cachée » sous son nom. Dans
l'en-tête, « Tout montrer » (ou « Tout cacher » quand rien n'est caché) ;
« Écouter sur » s'efface le temps de l'édition ; une ligne dit où le choix
s'applique et combien de playlists sont à l'écran. Hors édition, la rangée et
la fiche d'une Echo ne montrent que les cochées ; si toutes sont cachées, une
phrase le dit.

Le choix est un rangement : il suit le PROFIL (`loggia_spotify_cachees`, dans
`PAR_PROFIL` à l'écran et dans `AGENCEMENT` au serveur), et un compte
ordinaire le fait comme un administrateur. On range les playlists CACHÉES, pas
les montrées : une playlist créée demain dans Spotify arrive cochée.

## Les conséquences

La clé s'efface quand plus rien n'est caché ; 200 URI au plus. Une playlist
cachée puis supprimée du compte reste dans la liste sans rien montrer. Un
compte ordinaire n'enregistre son choix qu'après un redémarrage de Home
Assistant (store.py) ; un administrateur, tout de suite. Tests `spotify` et
`reglages_par_profil`.
