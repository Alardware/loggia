# 0343 — Les scénarios de l'Accueil en pastilles

*11 novembre 2026 — à l'essai (bêta v3.100.0-beta.1)*

## Le problème

Sur l'Accueil, les scénarios étaient des cartes de 88 px : l'icône dans un
disque, le nom dessous, le dernier lancement dans le coin. Mais un scénario
n'est pas un appareil qui a un état : c'est un geste. Le 11/11, une capture
montrait une rangée de pastilles — l'icône et le nom sur une ligne —, avec la
question : est-ce mieux ? Deux aperçus sur la démo : A, à la lettre de la
capture (icône blanche), et B (icône dans sa couleur). A a été choisi.

## La décision

Sur l'Accueil, chaque scénario devient une pastille de 44 px de haut :
l'icône dans la couleur du texte, le nom sur une ligne, un fond léger et le
liseré du thème. Chaque pastille prend sa largeur ; la rangée défile comme
avant, avec les flèches de l'en-tête à la souris et le glissement au doigt.
« 9 scénarios › » reste dans l'en-tête. Un scénario en cours prend sa teinte —
lavis et icône — et dit « En cours » au survol.

## Les conséquences

La rangée est deux fois moins haute : les pièces remontent. Le dernier
lancement (« hier », « 01:12 ») ne se lit plus sur l'Accueil, seulement dans
la vue Scénarios, qui garde ses cartes de 184. Le gabarit des cartes (le titre
sous l'icône) ne vaut plus pour cette rangée : ce ne sont plus des cartes.
L'appui long pour ranger et l'édition ne changent pas. Aucun texte nouveau.
Test `scenarios_pastilles`.
