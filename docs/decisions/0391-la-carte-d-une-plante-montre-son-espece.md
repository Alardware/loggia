# 0391 — La carte d'une plante montre son espèce

*23 novembre 2026 — appliqué (v3.101.0) (sa demande du 23/11, après l'ADR 0390 : « et pour le dessin sur la carte ? pour que ça corresponde
également » ; aperçu démo de deux variantes, sa réponse : « les deux, A et B »)*

*Complète les ADR [0390](0390-une-plante-se-juge-sur-les-seuils-de-son-espece.md) (une plante se juge sur les seuils de son
espèce) et [0205](0205-une-plante-se-decouvre-sa-carte-et-sa-fiche.md) (une plante se découvre ; sa carte et sa fiche).*

## Le problème

Depuis l'ADR 0390, une plante a son espèce : ses plages jugent la carte et la fiche, et la fiche montre sa photo. La carte, elle,
n'en montrait rien. Son filigrane venait du seul dessin écrit dans la configuration (`img`), à choisir entre DEUX dessins, un
schefflera et un dracaena ; une plante découverte n'en avait pas. Pour toute autre espèce, la carte n'avait aucun dessin, ou un
dessin faux.

## La décision

**Le dessin suit l'espèce (A).** La bibliothèque passe de deux dessins à vingt, dans le style plat des deux premiers — même pot,
mêmes verts, viewBox 200, des fichiers de `public/plantes/` servis à côté de la page (C34) : monstera, ficus, sansevieria,
cactus, succulente, aloès, retombante (`pothos`), fougère, palmier, orchidée, spathiphyllum, anthurium, calathea, zamioculcas,
chlorophytum, aromatique, pilea, le schefflera et le dracaena d'avant, et un dessin neutre (`plante`). Le GENRE de l'espèce le
choisit (`dessinEspece`, `especes.js`) : le premier mot du `pid` d'Open Plantbook, lu dans une table d'environ cent cinquante
genres d'intérieur ; un hybride (« x graptoveria ») se lit par son genre ; quelques espèces ont le leur (`dracaena trifasciata`, la
langue-de-belle-mère, prend la sansevieria). **Un genre sans dessin prend le dessin neutre** — quelques feuilles dans le même
pot, sans trait d'espèce : jamais un dessin faux.

**Le dessin écrit dans la configuration passe d'abord.** `img` ne s'écrit qu'à la main : c'est un choix fait exprès. Le dessin de
l'espèce vient ensuite ; une plante sans l'un ni l'autre reste sans filigrane, comme avant.

**Le dessin se choisit avec l'espèce, et se garde avec elle** (`espece.dessin`, dans `loggia_plants`) : la table des genres vit
avec la fiche, chargée à la demande, et le démarrage n'emporte que les noms des vingt dessins. `especeValide` ne relit le dessin
que s'il est un mot en minuscules ; la carte ne le montre que s'il est l'un des vingt.

**La photo de l'espèce va dans la plaque (B)**, à la place de la feuille : la même plaque, à la même taille (38 px sur la carte
large et l'étroite, 26 sur la compacte), au même endroit — le gabarit 88 / 184 ne bouge pas. Elle vient d'Open Plantbook, ou de
Plant Monitor (`entity_picture`), gardée par `imageEspece` comme dans la fiche ; elle se charge sans référent. **Quand elle ne
charge pas, la feuille revient.** Elle n'a pas de texte : le nom de la carte dit déjà la plante.

Les deux vont ensemble : la photo, en haut à gauche, dit quelle plante ; le dessin, en bas à droite à 0,14, reste un décor.

## Ce qui ne change pas

- Le jugement, les phrases, les couleurs, la grille des mesures, ce que la carte dit au lecteur d'écran.
- La fiche (la rangée « Espèce » de l'ADR 0390 montre déjà la photo).
- La compacte n'a pas de filigrane.
- Aucun `.py` : pas de redémarrage de Home Assistant.

## Les limites

- Une espèce choisie AVANT cet ADR n'a pas de dessin gardé : elle le prend quand on la choisit de nouveau. Un dessin écrit à
  la main dans la configuration passe d'abord : rien ne change pour la plante qui en a un.
- L'espèce de Plant Monitor (`species`) n'a pas de dessin : elle n'a pas de `pid` d'Open Plantbook. Sa photo, si.
- La photo vient du serveur d'images d'Open Plantbook à chaque affichage, sauf si l'intégration télécharge les images (`/local/`).
  Sur un thème sombre, une photo à fond blanc fait un carré clair.
- La démo n'appelle pas Open Plantbook : le dessin de l'espèce y tient lieu de photo. Son Dracaena a son espèce ; le Schefflera
  n'en a pas, pour essayer le choix.

## Vérifié

`tests/plantes_dessin.test.mjs` : chaque dessin est un fichier au format des deux premiers, sans rien d'extérieur ni
d'exécutable ; la table ne nomme que des dessins qui existent, un genre n'a qu'un dessin ; le genre choisit, l'hybride, les
exceptions, le dessin neutre ; la fiche d'Open Plantbook porte le dessin ; la carte : le dessin écrit d'abord, puis l'espèce, la
photo dans la plaque — large et compacte —, la feuille quand elle ne charge pas, une adresse douteuse écartée ; la table reste
hors du démarrage ; la démo. Assertions modifiées, marquées : `tests/poids.test.mjs` (la ligne de `PLANT_ART`),
`tests/plantes_especes.test.mjs` (l'espèce porte `dessin`).
