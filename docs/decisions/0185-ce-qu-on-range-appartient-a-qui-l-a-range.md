# 0185 — Ce qu'on range appartient à qui l'a rangé

*11 octobre 2026 — accepté*

## Le problème

> « Là je modifie en tant que Guillaume, ok ça fonctionne avec le lien
> extérieur, mais ça modifie aussi Luna, qui est un autre profil. Ça ne doit
> pas se produire : toute modification est liée au même profil, il n'a pas à
> synchroniser les autres. »

La veille, l'ADR 0182 avait rangé **le menu** par profil. C'était juste, et
c'était trois clés sur quatorze. Les onze autres — la grille de l'Accueil, les
agencements des cinq vues à cartes, les caméras, les épingles, l'ordre des
scénarios — continuaient de synchroniser tout le monde.

Le correctif précédent ne se voyait donc presque pas : masquer une vue séparait
bien deux personnes, **ranger une carte non**.

## La frontière, qu'il a posée lui-même

> « La seule chose, je dirais, qui est commune à tous, c'est l'ajout, la
> suppression et la modification d'entités. »

Une phrase, et le tri devient évident. **Trois couches**, qui ne se mélangent
plus :

| | | |
|---|---|---|
| la **maison** | ce qui EXISTE | `loggia_rooms`, `loggia_cameras`, les capteurs, les lecteurs, et l'icône choisie pour une entité |
| le **profil** | comment c'est RANGÉ | les quatorze clés d'`AGENCEMENT` |
| l'**appareil** | ce qu'il sait de LUI | ses marges, ses panneaux repliés, et le profil qui le regarde |

Décrire deux fois une pièce n'aurait aucun sens — d'où la première couche. Mais
ce qu'on **range** appartient à qui l'a rangé.

## La correction

Le tri se fait **au passage central**, `cfgVal` / `cfgSet` (`state.js`), et non
clé par clé. C'est la leçon du 10/10 : un découpage écrit à la main dans
`readViewsCfg` ne couvrait que les clés auxquelles on avait pensé. Une clé
ajoutée demain n'a plus qu'à entrer dans `PAR_PROFIL`.

L'appelant ne sait rien de tout cela : il lit la valeur qu'il attend et pose
celle qu'il veut voir, exactement comme avant.

### Un marqueur, pas une devinette

```
{ "__profils": { "0": …, "1": …, "*": … } }
```

Ces clés portent déjà des objets dont ce n'est pas nous qui choisissons les
clés : une grille par format (`pc`, `mobile`, `tablette`), un ordre par vue.
Deviner « est-ce indexé par profil ? » à la **forme** marcherait aujourd'hui et
casserait au premier réglage dont les clés ressemblent à des index. Un marqueur
ne se confond avec rien, et son absence dit « valeur d'avant la bascule ».

Le composant Python n'en sait rien **et n'a pas besoin de le savoir** : c'est
une forme de valeur, pas une clé. Les droits ne bougent pas — ranger ses cartes
reste de l'`AGENCEMENT`, ouvert à un compte ordinaire (ADR 0125) — et aucun
redémarrage de Home Assistant n'est nécessaire.

### Le menu ne s'hérite pas, la disposition si

La part commune `*` est la valeur d'avant la bascule. Elle sert de point de
départ… sauf pour les trois clés du menu :

> « Un profil non admin ne doit avoir que les vues par défaut, et non les vues
> secondaires. » (10/10)

Il s'était retrouvé avec la Climatisation que quelqu'un d'autre s'était
ajoutée, et sans le droit de la retirer. Une vue héritée **ajoute** ce qu'on n'a
pas choisi ; une grille héritée ne fait que donner un point de départ, qu'on
peut toujours ranger. Refuser l'héritage partout ferait repartir tous les
profils sauf le premier sur une grille vide : brutal, et pour rien.

### Un geste de structure traverse toutes les parts

Renommer ou retirer une pièce est **commun** à la maison. Mais chaque profil a
rangé cette pièce à sa façon, et son rangement la **nomme**.

- N'appliquer le renommage qu'à sa propre part laisserait les autres avec une
  grille qui pointe une pièce disparue.
- Appliquer **sa** table aux autres écraserait leur rangement.

D'où une valeur qui peut être une **fonction** : `cfgSet` l'applique part par
part. Le nom change partout, chacun garde son rangement. `ecrirepiece.js` s'en
sert pour `loggia_roomlayout`.

### Changer de profil relit tout

Un `useState(() => cfgVal(...))` ne se réévalue pas davantage parce qu'on a
changé de profil. La racine du rendu porte donc le profil **en plus** de la
première réponse du serveur (ADR 0184) : `key={(servi ? 'srv' : 'local') + ':' + userIdx}`.

## Ce que ça ne corrige pas, et c'est dit

**La grille de l'Accueil ne traverse pas les parts sur un renommage de pièce.**
`loggia_roomlayout` le fait, `loggia_accueil` non : sa seule écriture passe par
`saveAccL`, le passage unique de toute l'édition, avec son annulation et son
rétablissement. Y ajouter un chemin pour un geste rare valait moins que le
risque de l'abîmer.

Conséquence, et elle est cosmétique : après qu'un profil renomme une pièce, les
autres retrouvent cette carte à sa **taille et sa place par défaut** sur leur
Accueil. Rien n'est perdu ailleurs, et un geste la remet où ils la veulent.

**L'apparence reste commune** (thème, mode, langue, barre latérale). Le mode est
lu par `index.html` **avant React**, pour qu'un thème sombre ne s'ouvre pas sur
un éclair blanc ; l'indexer demanderait d'apprendre les profils à ce code de
démarrage. Rien ne l'interdit, ce n'est pas fait.

## Conséquences

- `tests/reglages_par_profil.test.mjs` vérifie le **comportement**, pas la forme
  du code : on range, et on regarde ce que l'autre profil voit. Il tient aussi
  le garde-fou qui compte — toute clé d'`AGENCEMENT` doit être dans
  `PAR_PROFIL`, sinon une clé ajoutée demain resynchroniserait tout le monde en
  silence.
- `tests/pieces_grille.test.mjs` et `tests/pieces_edition.test.mjs` gardent leurs
  propriétés — un seul envoi, la grille ne bouge pas sans la pièce, une table
  vidée s'efface — en les vérifiant sur la part.
- `readViewsCfg` / `writeViewsCfg` perdent leur découpage à eux : superposé au
  tri central, il aurait indexé deux fois la même valeur.
