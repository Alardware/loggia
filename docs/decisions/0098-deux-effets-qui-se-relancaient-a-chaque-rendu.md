# 0098 — Deux effets qui se relançaient à chaque rendu

Date : 27/09/2026. Statut : appliqué (local). Aucun redémarrage de Home
Assistant : le composant ne change pas, un rechargement de page suffit.
Troisième point de l'audit du 27/09.

`Dashboard` portait deux `useEffect` **sans aucun tableau de dépendances**.
React les rejoue alors à chaque rendu — et `Dashboard` est justement la vue qui
se rend le plus souvent, puisqu'elle suit volontairement le jeu de clés `hass`
le plus large.

## 1. Un `ResizeObserver` détruit et rebâti à chaque rendu

L'effet qui mesure la largeur de la grille des pièces créait un
`ResizeObserver`, l'attachait, et le détruisait au rendu suivant — en forçant
au passage un `getBoundingClientRect()`, donc un calcul de mise en page
synchrone, à ce rythme-là.

**Mesuré dans la démonstration**, en instrumentant `ResizeObserver` : quatre
bascules de lampe espacées de trois secondes provoquaient **cinq observateurs
créés et cinq détruits**. Après correction : **zéro**, pour une grille
strictement identique (3 colonnes, 764 px, 6 cartes).

### Pourquoi un tableau de dépendances ne suffisait pas

La grille vit dans une **section** de l'Accueil : elle arrive parfois après le
premier rendu — on glisse jusqu'à sa page, on active la section, on revient
d'une autre vue. Un effet borné à `[etroitPieces, tactile, wide]` n'aurait plus
rien observé dans ces cas-là, puisque `piecesGrille.current` vaut `null` au
moment où il s'exécute. L'effet sans dépendances rattrapait la situation **par
accident**, en se relançant sans fin.

Une `ref` de rappel le fait exprès : React l'appelle quand le nœud arrive, et de
nouveau avec `null` quand il part. Elle est mémoïsée **à vide** — une `ref` de
rappel qui change d'identité est rappelée par React à chaque rendu, soit
exactement le défaut qu'on retire.

La mesure elle-même passe par une **référence vivante**, remise à jour quand le
format change. L'observateur se pose une fois et lit toujours les réglages du
jour ; changer de format remesure sans le reposer.

Vérifié dans le navigateur : au montage (3 colonnes à 1 440 px, 2 au
téléphone — identique au code d'origine), et **au remontage** après un
aller-retour vers une autre vue, qui est le cas que la `ref` de rappel protège.

## 2. Une écoute du clavier reposée à chaque rendu

L'effet du raccourci Ctrl+Z retirait puis reposait un écouteur sur `window` à
chaque rendu, tant qu'on restait en mode édition.

`annuler` et `refaire` se referment sur `passe`, `futur` et `accL` : ils
changent d'identité à chaque rendu. Les nommer en dépendances aurait reposé
l'écoute exactement aussi souvent. Ils passent donc par une **référence
vivante** — le détour que le projet emploie déjà ailleurs (`systeme.jsx`,
`wx3d.jsx`) et que `tests/dependances.test.mjs` décrit dans son en-tête — et
l'effet ne dépend plus que de `editMode`.

Mesuré : entrer en édition pose **un** écouteur, et plus rien ne bouge ensuite.

## Ce que l'audit n'avait pas vu, et ce qu'il a cru voir

Un balayage de tout `src/` a cherché les autres hooks sans tableau de
dépendances. Onze candidats, **deux vrais** — les deux ci-dessus. Les autres
sont soit des faux positifs du repérage (tableaux de dépendances écrits sur
plusieurs lignes : `App.jsx` 5338, 13456, 14246 ; `vacplan.jsx` 245), soit la
**référence vivante volontaire** de `systeme.jsx:55`, qui n'assigne qu'un champ
et doit se rejouer à chaque rendu.

## Un défaut voisin, PRÉEXISTANT, laissé pour plus tard

En vérifiant, la grille ne remesure pas quand la fenêtre change de taille : à
1 000 px elle reste sur le nombre de colonnes calculé à 1 440. **Le code
d'origine fait exactement pareil** — testé côte à côte, même valeur à chaque
largeur. Ce n'est donc pas une régression de ce changement, et le corriger
demande de comprendre pourquoi l'observateur ne voit pas ce redimensionnement.

À noter pour qui reprendra : **`ResizeObserver` ne se déclenche jamais sur un
changement de taille émulé dans le panneau navigateur** — une sonde posée à la
main y compte zéro tir. Ce chemin n'est pas testable là, il faut une vraie
fenêtre.

## Les garde-fous

Deux tests, vérifiés dans les deux sens — chacun échoue quand on retire son
correctif :

- `tests/pieces.test.mjs` : la grille se pose par une `ref` de rappel mémoïsée à
  vide, la `ref` directe n'est pas revenue, et la mesure garde ses dépendances ;
- `tests/edition.test.mjs` : l'effet du raccourci est borné à `[editMode]`, et
  Maj continue de distinguer refaire de défaire à travers la référence vivante.

993 tests JS, 579 pytest, lint et audit propres. Le compte d'avertissements
`react-hooks/exhaustive-deps` ne bouge pas (45).
