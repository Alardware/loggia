# 0105 — La carte ne ment plus longtemps

Date : 27/09/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti. Dixième point, ajouté à l'audit du
27/09 par deux retours pendant la mise en production.

## Le retour, et pourquoi il se lisait à l'envers

> « si je ferme mes volets et que je change de page et que je revien la carte
> est ouvert alors que le volet est bien fermé, même chose pour la lumieres et
> surement d'autre »

Puis, quelques minutes après :

> « je ne comprend pas pourquoi celui de la chambre reste a 1% quand il se
> ferme »

Le premier réflexe serait de chercher ce qui se perd au retour sur la page.
C'est l'inverse : **rien ne se perdait au retour, quelque chose se perdait à
l'aller.**

Une carte n'attend pas Home Assistant pour changer d'aspect. On appuie sur
Fermer, elle dit « Fermé » tout de suite — sinon le doigt arrive avant l'image.
Ce mensonge utile ne se vidait que si l'état RÉEL bougeait :

```js
const [ov, setOv] = useState(null);
useEffect(() => { setOv(null); }, [realPos]);
```

Quand l'état réel ne bouge jamais, il tenait **indéfiniment**. Et seul un
changement de page le révélait : le composant mourait, l'état optimiste avec
lui, et la vérité réapparaissait. L'utilisateur croyait donc que le retour
mentait, alors que c'était l'affichage d'avant.

Ce n'est pas les neuf points de l'audit qui l'ont introduit : sur tout leur
diff, `cover` et `light` n'apparaissent que pour le mode CLAIR du thème
(ADR 0104) et la liste de domaines du compteur (ADR 0102). Le défaut était déjà
dans la v3.76.0 publiée, et sans doute bien avant.

## Deux cartes sur quatorze avaient un filet

`RoomLightCard` et `PieceCard` portaient chacune leur minuteur, écrit à la
main, avec son `useRef`, son nettoyage au démontage et son délai en dur.
Douze autres n'avaient rien : `RoomCoverCard`, `RoomCoverSheet`,
`RoomGenericCard`, `RoomClimateCard`, `RoomPilotCard`, `RoomPilotSheet`,
`RoomMediaCard`, `RoomClimateSheet`, `RoomLightSheet` et leurs voisines.

Le retour disait « et sûrement d'autres ». C'était juste, et c'était un défaut
de famille — pas une carte à réparer.

`useOptimiste(reel, delai)` remplace les dix-huit recopies. Il garde la règle
d'avant — **l'état réel reste prioritaire**, quand la maison répond on la croit
— et il ajoute la seule chose qui manquait : passé le délai, la carte redit ce
que la maison dit, quoi qu'il arrive.

Six secondes partout, **quatre** pour la luminosité : l'écho Zigbee rejoue
l'ancienne valeur, et attendre six secondes ferait revenir la vieille
luminosité sous le doigt. C'était déjà le réglage de la lampe ; il est
maintenant dit une fois, au lieu d'être répété.

Un affichage en retard se corrige tout seul. Un affichage faux, non.

## Les 1 % de la chambre : le même défaut, l'autre visage

« Fermé » ne se disait que pour `pos === 0`.

Un volet ne bute pas toujours à zéro. Celui de la chambre s'arrête à 1 %, et
Home Assistant le dit alors `open` — son `is_closed` compare la position à
zéro, pas à « en bas ». Loggia le dessinait donc **ouvert** : lavis violet,
icône violette, « Ouvert à 1 % », sur un volet visiblement fermé.

Le verdict passe par `coverFerme()`, et il change sur deux points.

**L'état de Home Assistant fait autorité quand il dit `closed`.** Loggia le
contredisait, et c'était le plus grave des deux — un désaccord entre deux
écrans de la même maison.

**Et le seuil est RÉGLABLE**, parce qu'il appartient au matériel, pas à Loggia.
Quatre choix (zéro pile, 1, 2, 5 %), deux pour cent par défaut : ce qui a été
mesuré ici, sans rien décider pour une installation qui bute juste. Il joue aux
**deux bouts** — un volet qui plafonne à 99 % est « Ouvert », pas « Ouvert à
99 % », c'est la même butée à l'envers.

Le POURCENTAGE affiché, lui, reste le vrai. Le mot est un verdict, le chiffre
une mesure : mentir sur le chiffre ferait chercher la panne ailleurs.

Cinq marques de la carte suivaient la position brute — le lavis, l'icône, la
couleur du pourcentage, celle du sous-titre, le mot lui-même. Plus trois
ailleurs : la feuille du volet et sa puce (« Fermé » restait creuse sur un volet
fermé à 1 %), la pastille de la tuile pièce (qui proposait « Fermer » sur un
volet fermé) et le « n ouverts » de la vue Volets. Toutes passent par le même
verdict.

## Le réglage ne part pas au serveur, et c'est voulu

Les autres réglages des volets vivent dans le composant serveur : ce sont des
actions différées, elles doivent tourner dashboard fermé. Celui-ci est de
l'**affichage**. Aucune règle ne l'attend, il ne déclenche rien, et il doit
rester lisible quand le serveur ne répond pas — `VoletsReglages` se réduit
alors à « Chargement… ».

Il passe donc par `cfgSet`, qui écrit en local ET côté serveur : le seuil suit
l'utilisateur d'un écran à l'autre, ce qui est juste puisqu'il décrit le
matériel et non la taille de l'écran. Le défaut ne s'écrit pas — une
configuration propre ne porte que les choix.

## Vérifié à l'écran, pas seulement aux tests

Console vide, onglet neuf. Le volet de la chambre mis à `state: open`,
`current_position: 1` — exactement le cas décrit :

| | Avant | Après |
|---|---|---|
| Texte | `Ouvert à 1 %` | **`1 % · Volet chambre · Fermé`** |
| Lavis violet | posé | **absent** (surface neutre) |
| Fond de l'icône | violet | **`rgba(255,255,255,.05)`** |

Et le filet, mesuré sur une commande envoyée dans le vide (`callService`
neutralisé, position réelle figée à 1) :

| Temps | Carte |
|---|---|
| 1,5 s | `100 % · Ouvert` — l'optimisme, légitime |
| 4,5 s | `100 % · Ouvert` — encore dans la fenêtre |
| **8,5 s** | **`1 % · Fermé`** — sans changer de page |

Avant, la troisième ligne serait restée « Ouvert » jusqu'au changement de page.

Un piège du banc d'essai, noté : le premier montage gelait la position en la
réécrivant toutes les 200 ms. La commande faisait quand même bouger l'état une
fraction de seconde, ce CHANGEMENT vidait l'état optimiste, et le filet
semblait agir instantanément. C'est en neutralisant la commande — et non en
forçant l'état — que la fenêtre se voit.

## Ce que je n'ai PAS fait

- **Toucher à `RmJauge`.** Elle peint le DOM directement pendant le geste, ce
  que React ignore, et c'était le premier suspect puisqu'elle sert aux volets
  ET à la luminosité — les deux que le retour nommait. La reproduction l'a
  disculpée : le défaut survivait au démontage, elle non.
- **Inventer le seuil.** Quatre choix offerts, deux par défaut, et la question
  posée avant d'écrire une ligne : Home Assistant dit-il `closed` ou `open` à
  1 % ? La réponse (`open`) est ce qui a rendu le réglage nécessaire — un seuil
  écrit en dur aurait masqué le symptôme sans que personne puisse le corriger
  ailleurs.

1 007 tests JS (six garde-fous en plus, dont cinq échouent sans le correctif),
579 pytest, lint propre (aucun avertissement ajouté), audit propre. Paquet
rebâti, second passage sans effet.
