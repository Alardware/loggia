# 0171 — Les barres d'un graphe

*8 octobre 2026 — accepté*

## Le problème

Quatre retours successifs sur le même graphe, chacun corrigeant le précédent.

> « Ça ne me plaît pas trop, le fait que ce soit coupé comme ça, mets en barres
> plutôt. »

La journée se traçait en **aires lissées** : la courbe s'arrêtait net à l'heure
courante, un trait qui tombe dans le vide. Une barre absente, elle, ne dit rien
de plus que « l'heure n'est pas passée ».

> « Les barres sont moches, tu as des skills de design. »

Mesure : trois séries sur vingt-quatre heures faisaient **72 barres**, la plus
fine à **2,54 px réels** sur un téléphone. Des traits, pas des barres.

> « Tes barres n'ont pas d'âme, elles sont moches. »

Elles étaient devenues justes — empilées, larges, lisibles — mais **plates** :
un aplat de couleur unie, là où tout le reste du tableau de bord est en
dégradés.

> « Ça déborde. »

Un défaut introduit **par l'empilement** : l'échelle prenait le maximum d'**une**
série, alors qu'une colonne empilée vaut la **somme**. Trois séries de 8 kWh
font une colonne de 24 sur un axe gradué jusqu'à 10.

## La décision

**Empilées, une barre par case.** Côte à côte, chaque barre perdait sa largeur
au profit du nombre de séries. Empilée, elle prend toute sa colonne — 11 px au
téléphone, 26 au large — et ce qu'on compare d'une heure à l'autre devient la
**hauteur totale**, qui est le vrai sujet : heures creuses et heures pleines
s'additionnent, elles ne se comparent pas.

**Seul le sommet est arrondi.** Le bas d'un segment pose sur celui d'en dessous,
ou sur la ligne de base : un coin rond l'en décollerait. Un `rx` de `<rect>`
arrondirait les quatre — d'où un tracé en `path` avec deux arcs. Le rayon se
réduit pour un segment plus court que lui, sinon le tracé se replie.

**Deux px entre segments.** Sans cet écart, deux teintes voisines se touchent et
la pile se lit comme un seul bloc.

**Le vocabulaire de la maison** : un dégradé vertical par série (pleine en bas
où la barre a du poids, allégée vers le haut), un rail de colonne qui donne son
assise — une heure sans rien se lit alors comme une heure vide plutôt que comme
un trou —, et une pousse à l'arrivée, décalée d'une case à l'autre.
`transform-origin` au **pied** de la barre : au centre, elle grandirait aussi
vers le bas, à travers l'axe. Le décalage est plafonné à 0,4 s, sinon la
dernière colonne d'une année arriverait une seconde après la première. Et la
pousse se tait sous `prefers-reduced-motion`.

**L'échelle suit ce qu'on dessine.** En barres, elle se mesure sur les **sommes
par case** ; en aires, qui se superposent sans s'additionner, sur le maximum par
série. C'est la seule formulation qui vaut pour les deux.

```js
const sommes = cases.map((_, i) => vraies.reduce((s, serie) => {
  const v = serie.valeurs[i];
  return s + (v != null && isFinite(v) && v > 0 ? v : 0);
}, 0));
const tous = (mode === 'aires' ? vraies.flatMap(s => s.valeurs) : sommes)
  .concat(veille || []).filter(v => v != null && isFinite(v));
```

## Au passage : l'ombre au survol

> « Pourquoi il y a cet effet d'ombre sur les cartes quand je passe dessus ?
> Enlève s'il te plaît. »

La règle `.o-hov` posait une ombre sur **toutes** les cartes au passage de la
souris. Elle est retirée — pas atténuée : une carte qui n'est pas cliquable n'a
rien à signaler au survol, et celles qui le sont ont déjà leur curseur.

## Ce qu'on n'a pas fait

**Garder les aires en option.** Deux lectures pour la même donnée, c'est un
réglage de plus à comprendre pour personne.

**Un aplat plus clair plutôt qu'un dégradé.** Essayé, mesuré : l'écart entre le
haut et le bas d'une barre est ce qui lui donne du volume ; un aplat plus clair
ne fait qu'un bloc plus pâle.

## Ce que les tests tiennent

`tests/barres_empilees.test.mjs`, onze cas : les quatre périodes en barres, une
barre par case, l'empilement du bas vers le haut, le sommet seul arrondi et son
rayon qui se réduit, l'écart entre segments, le dégradé, le rail, la pousse et
son origine au pied, le plafond du décalage, la coupure sous
`prefers-reduced-motion` — et l'échelle, sur les **sommes** en barres, sur le
maximum par série en aires.
