# 0325 — Des diagnostics qui disent la forme, jamais la maison

*4 novembre 2026 — appliqué (v3.98.0)*

## Le problème

Un ticket arrive avec une phrase et une capture. Pour le ticket #43
(« les vignettes des pièces se rangent par ordre alphabétique »), il a fallu
deviner la configuration de l'utilisateur, puis le constater chez nous : un
profil sans ordre des pièces, un autre qui en avait un. Home Assistant permet
à une intégration de fournir un fichier de diagnostic que l'utilisateur
télécharge et joint ; Loggia n'en avait pas.

La configuration de Loggia est pleine de choses personnelles : le nom des
profils et des pièces (une chambre porte souvent un prénom), les identifiants
des comptes et des écrans, l'adresse du serveur, le service de notification de
chaque téléphone, le hachage du code administrateur.

## La décision

`custom_components/loggia/diagnostics.py` rend :

- les versions (Loggia, Home Assistant, le boot que sert `index.html`) et les
  modules qui tournent ;
- la **forme** de la configuration, commune et par compte (comptes numérotés) :
  chaque clé de réglage, le type de sa valeur, la longueur d'une liste ;
- la découverte **comptée** : zones, étages, appareils, entités par domaine et
  par intégration, drapeaux, services.

On ne recopie que ce qui est sûr, plutôt que d'effacer ce qu'on penserait à
masquer :

- une clé ne sort que si c'est un nom de réglage (minuscule d'abord, sans
  espace ni accent), un numéro de profil ou `*` ; un nom de pièce, une entité,
  un identifiant (hexadécimal, ou tirage de 20 caractères et plus) sont
  seulement comptés ;
- une valeur ne sort que pour une courte liste de réglages (rôle d'un profil,
  mode, thème, format d'écran…) et si c'est un mot, sans point ni espace ;
- le code administrateur est « masqué ».

Vérifié sur une vraie configuration (237 Ko) : aucun texte de la configuration
ne se retrouve tel quel dans le fichier ; deux fuites trouvées à l'essai
(un identifiant d'écran pris pour une clé, une entité dans un réglage « sûr »)
sont fermées, et les tests les épinglent.

Le fichier se télécharge depuis Home Assistant (Appareils et services ›
Loggia › ⋮ › « Télécharger les diagnostics ») ou depuis Loggia, À propos ›
Diagnostics : l'entrée de Loggia (`config_entries/get`), une adresse signée
(`auth/sign_path`), et le navigateur télécharge. Réservé à un administrateur,
comme dans Home Assistant ; absent de la démonstration. Le modèle de ticket de
GitHub le demande.

## Les conséquences

Un redémarrage de Home Assistant est nécessaire pour que le composant charge
`diagnostics.py`. Tests : `tests/python/test_diagnostics.py`,
`tests/diagnostics_ecran.test.mjs`.
