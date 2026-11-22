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

Le 9 novembre, sur sa capture : une Apple TV n'a aucune classe dans Home Assistant et
gardait donc l'interrupteur, sans « Éteindre » à côté de la pause. Un boîtier à
télécommande (les intégrations de `TOUCHES_TV`) sans classe compte désormais comme
une TV ; la classe de Home Assistant prime quand elle existe. La démo déclarait son
Apple TV en `tv`, ce qui cachait le cas : elle n'a plus de classe, comme les vraies.

## Les conséquences

Écran seulement. Tests `carte_media`, `lecteur`, `resolve`, `demo_medias`.
