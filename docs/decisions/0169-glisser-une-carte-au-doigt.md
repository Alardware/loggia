# 0169 — Glisser une carte au doigt

*7 octobre 2026 — accepté*

## Le problème

> « Il est difficile sur tactile de déplacer les cartes, car c'est la barre de
> défilement qui prend le dessus plutôt que ce soit la carte en déplacement et
> la barre de défilement qui suive le geste. » — 7 octobre.

L'agencement se faisait à la souris. Au doigt, le même geste a deux lectures
possibles : **faire défiler la page** ou **déplacer la carte**. Le navigateur
tranche pour la première, et il tranche vite : dès que le doigt bouge de
quelques pixels, il s'approprie le geste et ne le rend plus. La carte restait
sur place pendant que la page filait.

Deux manques s'ajoutaient à cela :

- une carte attrapée près d'un bord n'avait **aucun moyen d'atteindre** le haut
  ou le bas d'une longue page : il aurait fallu lâcher, faire défiler, reprendre ;
- rien ne distinguait un **appui pour lire** d'un **appui pour déplacer**.

## La décision

`src/glisser.js`, quatre outils, chacun pour une de ces questions.

**`bloquerDefilement()`** — un écouteur `touchmove` **non passif** qui appelle
`preventDefault()`. C'est la seule façon de reprendre le geste au navigateur : un
écouteur passif, celui que React pose par défaut, n'en a pas le droit. Posé au
début du déplacement, retiré à la fin — jamais en permanence, sinon la page ne
défilerait plus du tout.

**`defileurAuto()`** — tant que le doigt reste dans une bande près d'un bord, la
page défile d'elle-même, d'autant plus vite qu'on est près du bord. C'est ce qui
permet de traverser une longue page sans lâcher la carte.

**`pasDefilement()`** et **`conteneurDefilant()`** — de quoi savoir si le geste a
vraiment bougé, et dans quel conteneur il se produit.

Le tout est branché dans `poserFantome`, là où le déplacement commence déjà pour
la souris : **un seul chemin** pour les deux pointeurs, pas deux moteurs à tenir
d'accord.

## Ce qu'on n'a pas pu vérifier à l'écran

Le volet d'aperçu envoie des **clics de souris**, même en mode téléphone : un
geste tactile ne s'y rejoue pas. La mécanique est donc vérifiée par les tests,
et c'est l'utilisateur qui a confirmé sur son matériel — « ok ça fonctionne
bien ».

## Ce que les tests tiennent

`tests/glisser_tactile.test.mjs` : l'écouteur est **non passif** (c'est tout le
sujet), il est retiré à la fin, le défileur accélère près du bord et s'arrête
au-delà, et le branchement passe bien par le chemin commun.
