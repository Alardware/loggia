# 0323 — Le rangement des pièces s'hérite, les favoris tiennent au téléphone, une lampe simple garde sa bascule, un ventilateur garde son mode

*2 novembre 2026 — appliqué (v3.97.0) (ticket #43)*

*Complète les ADR [0221](0221-la-mise-en-page-s-herite-reglage-par-reglage.md), [0202](0202-la-carte-etroite-une-grille-commune.md) et [0276](0276-un-compte-home-assistant-son-profil.md).*

## Le problème

Quatre retours du même ticket :

1. « Sur la version mobile, dans la section Favoris, les 2 vignettes ne se
   centrent pas, du coup le côté droit de la vignette est tronqué. »
2. « Le souci pour la disposition des vignettes des pièces est revenu avec la
   dernière version. J'ai un ordre personnalisé sur le PC et sur le
   téléphone, les vignettes se rangent par ordre alphabétique. »
3. Au téléphone, les interrupteurs des cartes de lampe disparaissent.
4. « Avant je pouvais mettre la ventilation en automatique. Maintenant,
   c'est soit niveau 50 %, soit éteint. » (purificateurs Levoit, VeSync)

Les causes :

1. Les tuiles des favoris faisaient 225 px fixes : deux tuiles et leur écart,
   460 px, sur un écran de 390.
2. Le correctif de l'ADR 0221 n'a pas été défait. Depuis l'ADR 0276, chaque
   compte ouvre SON profil : un écran a changé de profil sans rien demander,
   et le rangement fait jusque-là est resté dans l'ancien. Le profil du compte
   lisait une part sans ordre. Constaté sur notre installation : le
   rangement vit dans le profil Admin d'un autre compte, celui du compte
   ouvert n'a ni ordre ni places. Deux défauts voisins : l'ancien éditeur
   recopiait la grille entière dans la part d'un format, `piecesOrdre: []`
   compris, et cet ordre vide masquait celui de l'ordinateur ; et la grille
   d'un écran nommé (`appareils`, ADR [0222](0222-un-ecran-peut-ranger-sa-propre-mise-en-page.md))
   n'était pas relue, puis effacée par le geste suivant.
3. Voulu (ADR 0202) : sur la carte étroite, la plaque de l'icône est
   l'interrupteur. Pour une lampe sans variateur, rien ne le disait.
4. Loggia n'a jamais proposé le mode d'un ventilateur, et sa bascule
   l'allumait d'un `turn_on` nu : VeSync repart alors en manuel.

## La décision

1. Au téléphone (≤ 760 px), les favoris se partagent la ligne : 184 px au
   plus, 8 px d'écart ; une tuile large prend la ligne ; à partir de trois, la
   rangée défile.
2. **Un rangement vide n'est pas un choix : c'est le défaut.** Pour l'ordre,
   les places et les tailles des pièces de l'Accueil :
   - `accueilDuProfil()` (state.js) : un profil sans rangement reprend celui
     de la part commune, sinon du premier profil Admin qui en a un, réglage
     par réglage. Un profil Famille ne sert pas de source. Rien ne s'écrit ;
     au premier rangement, ce qu'il voit devient le sien.
   - `grilleDuFormat` : un rangement vide dans la part d'un format hérite de
     l'ordinateur ; `poserGrille` ne le fige pas au geste suivant.
   - L'Accueil relit `appareils`.
   Écarté, à sa demande : un bouton « Reprendre la disposition de… » (« il
   faut que ce soit automatique »).
3. Sans variateur, la bascule reste sur la carte étroite, à droite (rien n'y
   est : ni chiffre, ni barre). La plaque commande toujours. Le thermostat
   reste tel que l'ADR 0202 l'a voulu.
4. La fiche d'un ventilateur qui publie `preset_modes` les propose en puces
   (`fan.turn_on` avec `preset_mode`) ; « auto », « sleep », « manual »,
   « pet » ont leurs mots (Automatique, Nuit, Manuel, Animaux), les autres
   leur nom. Les bascules des deux cartes (`generique.jsx`, `CvCard`) le
   rallument dans son dernier mode (`ventilo.js`). La démo a un purificateur
   au salon.

## La personnalisation reste à chaque profil (ajout du 02/11)

« Je modifie sur mobile en tant que Guillaume, ça modifie aussi sur PC en
Admin (autre profil), et vice versa » ; « l'interface est propre à chacun ».
Depuis le 20/10, ce qu'un profil Admin ajoutait ou retirait partait chez tous
(`contenupartage.js`) : les Favoris, et sur l'Accueil les sections masquées
et les widgets ajoutés. Ils quittent ce partage : chacun garde les siens, même
quand c'est un Admin qui agit. Seules les cartes ajoutées ou retirées sur une
vue restent partagées (la demande du 20/10). Ce qui a déjà été recopié n'est
pas défait : chaque profil diverge à son prochain geste.

## Les conséquences

Sans redémarrage de Home Assistant : rien ne change côté composant. Tests :
`rangement_pieces_herite.test.mjs` ; l'assertion de la bascule de la lampe
(`lot13_generique_lampe.test.mjs`) et celles des Favoris et de l'Accueil
(`contenu_partage.test.mjs`) sont modifiées. Les pastilles des pièces en
tête de la vue d'une pièce restent par nom : les faire suivre l'ordre choisi
est un autre changement. Le curseur de vitesse d'un ventilateur n'est pas fait.
