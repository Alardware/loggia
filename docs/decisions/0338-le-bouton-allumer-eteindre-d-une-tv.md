# 0338 — Le bouton Allumer / Éteindre d'une TV

*8 novembre 2026 — appliqué (v3.99.0)*

## Le problème

Une TV s'allumait et s'éteignait d'un petit interrupteur en haut de sa carte,
le geste d'une lampe.

## La décision

Sur ses captures du 08/11, une TV (`classe === 'tv'`) porte au pied un bouton
de 44 px, « Allumer » ou « Éteindre », `turn_on` ou `turn_off` selon l'état
affiché. Il garde toujours son mot : la ligne ne tient que la lecture/pause et
lui, et la barre du volume passe dans la fiche (son « ça non » sur la ligne
lecture + barre + icône). Allumée, le bleu plein des boutons de Loggia. Les
enceintes gardent leur interrupteur et leur barre. Une TV sous un profil du
mode enfant (budget, pastille, blocage) garde ses écrans : interrupteur, barre
au plafond, temps restant.

## Les conséquences

Écran seulement. Test `carte_media`.
