# 0160 — Les vues personnalisées s'éditent comme les autres

Date : 06/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis** ;
le paquet est rebâti.

## Deux mécaniques pour un même geste

Loggia avait deux façons d'éditer une carte.

**Les vues de la maison** — Pièces, Objets, Volets, Énergie, Sécurité —
remplacent la carte par une **tuile** : on l'attrape pour la déplacer, on la
clique pour ouvrir sa fiche, et tout s'y règle.

**Les vues personnalisées** gardaient la vraie carte, rendue inerte, sous une
surface et une **barre d'outils flottante** posée dessus.

« je veux comme pour les vues lumieres, objets etc... » — « ouiiiiiiiii c'est
ce que je te dit depuis tout a l'heure ».

## Ce qu'on a fait

Plutôt que de recopier la tuile, on donne à `CustomView` **l'interface
d'agencement que `EditableCard` attend** (`dragId`, `dragStart`, `dragMove`,
`dragEnd`, `move`, `remove`, `estLarge`, `basculerLarge`, `estCompact`,
`basculerCompact`), construite au-dessus de sa liste de cartes.

Tout ce que l'ancienne forme protégeait vient désormais du composant partagé,
qui le porte pour **cinq vues à la fois** : commandes non tabulables en
édition, poignée nommée, anneau de focus visible, appui long qui ne sélectionne
pas le texte ni n'ouvre le menu du téléphone. Le clavier en double (`clavierCv`,
`deplacerCv`) est parti avec — les flèches passent par `move`.

Deux choses que la tuile ne pouvait pas deviner :

- **Le sous-titre.** Une vue de la maison lit le domaine de son entité ; une
  vue personnalisée pose des CARTES, et ce qu'on vient y changer est le TYPE —
  « Grand chiffre », « Caméra », « Chips (groupe) ». La tuile reçoit donc un
  sous-titre, et garde le sien quand personne n'en passe.
- **L'entité.** La clé d'une carte n'est pas toujours un `entity_id` : une
  horloge ou un groupe de pastilles n'en ont pas. L'icône et le domaine se
  lisent sur l'entité quand il y en a une, sur la clé sinon.

La **fiche** reprend celle des vues de la maison, avec ce qui a du sens ici :
le nom en titre, la bascule « Carte compacte », le segment « Largeur », et deux
boutons — « Changer la carte » et « Supprimer ».

## Un clic n'est pas un relâcher

Premier essai livré, et aussitôt renvoyé : « si je clique sur les 2 boutons
simple/compact et simple/double sa mouvre a chaque fois la popup de
modification, c'est penible ».

Les boutons de coin arrêtent l'appui (`pointerdown`), **pas le relâcher**
(`pointerup`) : celui-ci remontait jusqu'à la carte, qui concluait au clic.
Pire, l'adaptateur répondait l'inverse de ce qu'il fallait — il disait « clic »
précisément quand **aucun** appui n'avait été pris sur la carte.

L'agencement des vues de la maison ne connaissait pas ce défaut : il ne répond
« clic » que si un appui a vraiment été enregistré. On s'aligne sur lui, avec
**deux conditions** :

- la carte a **pris l'appui** — `debutDrag` répond désormais, et refuse un
  appui qui vient d'un bouton ;
- elle **n'a pas bougé** — sinon déposer une carte ouvrirait sa fiche en
  arrivant.

## Ce qu'on a appris

**Deux mécaniques pour un même geste finissent par diverger.** Celle des vues
personnalisées avait ses propres protections d'accessibilité, ajoutées une à
une par le lot 13 ; elles n'étaient pas fausses, elles étaient en double. Une
seule tuile, c'est une seule place où corriger.

**Reprendre une interface, c'est aussi reprendre ses réponses.** Le défaut du
clic ne venait pas de la tuile mais de l'adaptateur écrit autour : il remplissait
la forme sans en respecter le contrat. Le test le dit maintenant, avec la raison
à côté — c'est le genre de détail qu'on réintroduit six mois plus tard.

**Ce qui n'a pas été vérifié est dit.** Le rendu n'a pas pu être observé à
l'écran : la démonstration n'a pas de vue personnalisée, et la navigation du
panneau ne répondait pas aux clics de l'outillage. La vérification s'arrête au
lint, aux tests et à la relecture — et c'est l'utilisateur qui a trouvé le
défaut du clic, en une minute.

1890 tests JavaScript, 1431 tests Python, lint et audit propres.
