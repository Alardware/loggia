# 0111 — Cinq défauts du quotidien

Date : 30/09/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti.

Suite de l'audit du 29/09/2026, après les trois points de sûreté de la
[décision 0110](0110-ne-pas-agir-sur-ce-qu-on-ignore.md). Ceux-ci ne mettent
rien en danger : ils gênent, tous les jours.

## 1. La caméra murale devenait noire toutes les demi-heures

Ce n'était ni le réseau, ni la caméra. Home Assistant **renouvelle son jeton
d'accès** périodiquement. Le jeton figurait dans les dépendances de l'effet qui
tient le direct :

```js
}, [haid, online, token, conn]);
```

À chaque renouvellement, React rejouait l'effet : session WebRTC fermée, piste
perdue, écran noir le temps d'en rouvrir une. Sur une tablette murale allumée
en permanence, cela revenait toutes les trente minutes environ.

Or **cet effet ne se sert jamais de la valeur du jeton** : il vérifie seulement
qu'on est authentifié, et tout ce qui doit être signé passe par `conn`, qui ne
change pas au renouvellement.

**Décidé :** l'effet dépend d'un booléen, `authentifie`, qui ne bascule qu'à la
connexion ou à la déconnexion.

La vignette (`HaImage`), elle, a bien besoin du jeton **courant** pour signer
son appel. Il se lit dans une référence au moment du `fetch` : hors des
dépendances, donc sans relancer la boucle, et jamais périmé.

## 2. L'orbe reconstruisait son rendu soixante fois par seconde

La boucle d'animation demande à chaque image si le canevas correspond encore à
son hôte. Elle recalculait la taille à sa façon :

```js
const cw = Math.round(stage.clientWidth*DPR);
```

quand `renderer.setSize()` de three pose `Math.floor(taille * pixelRatio)`. Sur
tout DPR non entier — **1,25 et 1,5, soit le cas courant sur tablette et
téléphone** —, les deux se contredisent d'un pixel : 185 px à 1,5 font 277 pour
three et 278 pour la comparaison. Elle échouait donc à chaque image, `resize()`
repartait, et les cibles de rendu étaient détruites puis recréées en continu,
sans que rien n'ait bougé.

Le DPR est plafonné à 1,5 : les deux valeurs à risque sont exactement celles
qu'on rencontre.

**Décidé :** on compare comme three calcule — `Math.floor`. Sinon on ne compare
rien.

## 3. Deux textes sortaient en français dans les six autres langues

**« Absent »**, à quatre endroits, écrit en clair juste à côté d'un
`tr('Présent')`. Le filet i18n ne pouvait pas les voir : ce sont des
expressions dans une ternaire, pas des nœuds de texte JSX.

**« Fêtes d'hiver »**, la catégorie d'ambiances Hue. Elle passe pourtant par
`tr()` à l'affichage (`HUE_CATS()`), mais l'argument est une **variable** : le
filet, qui ne lit que des littéraux, ne pouvait pas réclamer sa clé. Elle
manquait aux six catalogues, et le libellé sortait en français.

**Décidé :** les quatre « Absent » passent par `tr()`, et la clé Hue rejoint les
six catalogues. Le libellé s'écrit désormais entre guillemets doubles, comme le
reste des chaînes contenant une apostrophe : une apostrophe échappée est
invisible à tout filet qui compare des chaînes brutes.

## Ce que ça entraîne

- Cinq tests de plus. Celui de l'orbe fait la démonstration par l'exemple
  (277 contre 278), celui de la caméra interdit à **tout** effet de dépendre à
  nouveau de la valeur du jeton.
- Le filet i18n garde ses deux angles morts — une ternaire et un argument
  variable. Les tests ajoutés ici ferment les cas connus, pas la catégorie.

## 4. Le graphique d'énergie recalculait tout à chaque mouvement de souris

Vingt-quatre heures de relevés font des milliers de points pour trois cents
pixels de large. Deux dégâts, et le second se voyait.

Les bornes se prenaient en étalant le tableau : `Math.min(...tous.map(p => p.t))`
passe chaque point **en argument**. Au-delà de quelques dizaines de milliers,
le navigateur lève une `RangeError` — Safari cède le premier. Une boucle n'a
pas de limite et lit chaque point une seule fois.

Et rien n'était mémoïsé : bouger la souris posait `survol`, donc re-rendait, et
refaisait avec lui les bornes, l'échelle et les tracés de toutes les séries.
Seules la ligne verticale et la bulle dépendent du survol.

**Décidé :** tout le calcul passe dans un `useMemo` sur `series`, et le tracé
est **sous-échantillonné** à deux points par colonne de pixel.

Le sous-échantillonnage garde le plus **bas** et le plus **haut** de chaque
tranche, pas un point sur vingt : c'est justement les pointes de consommation
qu'on vient regarder, et une prise régulière les raboterait. Les deux sortent
dans l'ordre du temps, sinon le trait ferait des allers-retours ; les deux
bouts restent les vrais bouts, l'aire se referme dessus.

La bulle de survol, elle, lit toujours les points **d'origine** : on a allégé
le tracé, pas la mesure.

## 5. Épingler pouvait désépingler

Quatre écrans posaient la punaise, chacun avec sa copie de la liste prise à
l'ouverture. Deux fiches ouvertes, une épingle ajoutée dans l'une : la seconde
écrivait ensuite sa liste d'avant par-dessus, et l'épingle disparaissait sans
un mot.

Pire dans la fiche d'un appareil : elle **écrivait** en comparant l'entité
(`cvId`), mais **lisait** avec `eps.indexOf(x.id)`. Un favori au format typé
`{t, id}` — ce que pose l'éditeur de section — ne s'y reconnaissait pas. La
ligne s'affichait « non épinglée », et le clic pour l'épingler la **retirait**,
puisque la bascule, elle, la trouvait.

**Décidé :** une seule fonction, `basculerEpingle(id)`, qui **relit la maison**
au moment d'écrire au lieu de faire confiance à l'état d'un écran. Les deux
bascules y passent, et toutes les lectures comparent l'entité.

L'éditeur de section garde son écriture propre : il pose la liste entière
réordonnée, ce n'est pas une bascule, et l'unifier de force aurait été
artificiel.

## Ce qui reste de l'audit

Rien de ce qui était signalé côté frontend. Les deux tests de portabilité de
chemin (un espace dans le nom du dossier) passent ici et n'ont pas été
retouchés ; `config_flow.py` n'a toujours pas de test.
