# 0221 — La mise en page s'hérite réglage par réglage

*17 octobre 2026 — accepté (tranche 2 de `docs/chantier-synchronisation.md`)*

## Le problème

> « Il arrive (pas tout le temps) que j'aie les pièces dans un ordre précis sur
> le navigateur du PC et par ordre alphabétique sur le smartphone. Par exemple,
> pour les lumières Salon, sur le PC, c'est la 1re tuile et sur le smartphone,
> la tuile se retrouve tout en bas de la liste. » — ticket #34

La disposition suit le type d'écran depuis le 18/09 : l'ordinateur range dans
les clés historiques, la tablette et le téléphone dans `formats[format]`, et
« suivent l'ordinateur tant qu'ils n'ont rien rangé eux-mêmes ». La règle était
juste ; elle s'appliquait **en bloc**.

- `vueFormat` : dès qu'un format avait une part, toute clé absente de cette
  part **effaçait** celle de l'ordinateur. Une carte passée en compact au
  téléphone, et l'ordre disparaissait — l'écran retombait sur le tri par nom.
- `patchFormat` : la première retouche **recopiait** ce que montrait
  l'ordinateur. Le téléphone tenait ensuite une copie qui ne suivait plus
  jamais rien ; une carte absente de cette copie passait en bas.
- « Toutes les cartes », depuis le téléphone, écrivait des vides : une part
  vide, qui effaçait tout et ne suivait plus l'ordinateur.
- L'Accueil faisait de même avec sa grille, recopiée en entier à la première
  retouche.

« Pas tout le temps » s'explique : seules les vues où le téléphone avait déjà
rangé quelque chose étaient touchées.

## La décision

**Chaque réglage s'hérite seul.** L'ordre, les cartes larges et les compactes
sont trois réglages indépendants ; une part ne porte que ce que **ce** format a
lui-même changé.

| Dans la part | Ce que voit le format |
|---|---|
| clé absente | celle de l'ordinateur — il n'a rien dit |
| `[]` | rien — il a **choisi** le vide |
| une liste | la sienne |

Sans la deuxième ligne, retirer la dernière compacte du téléphone ferait
réhériter celles de l'ordinateur. L'éditeur écrit `null` quand une liste se
vide (`vide`) : sur un format, `patchFormat` le range en `[]`.

**Revenir à l'ordinateur, c'est retirer la part** (`sansPart`), jamais y écrire
des vides. « Toutes les cartes » le fait désormais sur une tablette ou un
téléphone : la liste automatique revient partout, et ce format retrouve l'ordre
et les tailles de l'ordinateur.

**Retirer ou remplacer une carte ne recopie pas un ordre hérité.** Les deux
gestes nettoyaient l'ordre : sur un format qui l'héritait, ils l'auraient
recopié et figé. Ils ne le touchent que si le format le possède (`possede`) ;
`echangerPartout` change déjà l'identifiant dans tous les formats.

**L'Accueil s'hérite clé par clé**, par les mêmes règles :
`grilleDuFormat` superpose la part à la grille de l'ordinateur, `poserGrille`
n'y range que ce qui change. Un geste qui rend la grille entière
(`grilleAvecPiece`) ne fait pas passer l'héritage dans la part : une clé
inchangée garde le même objet, et une clé encore héritée reste dehors.

## Ce que cela entraîne

- **Le cas du ticket** : le téléphone garde sa compacte et suit l'ordre de
  l'ordinateur, maintenant et quand il change.
- **Les parts déjà enregistrées** sans `order` héritent désormais de l'ordre
  de l'ordinateur. Celles qui l'avaient recopié le gardent : on ne distingue
  pas « recopié » de « rangé à la main », et rien ne bouge sous les yeux de
  personne. « Toutes les cartes » ou « Suivre l'ordinateur » permettent d'en
  sortir.
- **Les grilles d'Accueil recopiées** en entier restent ce qu'elles étaient,
  pour la même raison.
- Aucun changement côté composant ; aucun redémarrage de Home Assistant.

## Ce qui n'est pas fait ici

- Un bouton « Suivre la mise en page de l'ordinateur » dans l'éditeur des vues,
  séparé de « Toutes les cartes » : il demanderait un texte nouveau dans les
  sept langues, et le polonais se fait relire. L'Accueil a déjà le sien.
- La mise en page propre à un appareil nommé (tranche 3).

## Corrige

La règle du 18/09 (`disposition.js`) dans sa lettre — « suivent l'ordinateur
tant qu'ils n'ont rien rangé eux-mêmes » — en l'appliquant réglage par réglage.
