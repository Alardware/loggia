# 0102 — Ce qui recalculait pour rien

Date : 27/09/2026. Statut : appliqué (local). **Redémarrage de Home Assistant requis** ; `index.html` ne change pas, mais `src/` oui — **le paquet est
rebâti**. Septième point de l'audit du 27/09.

## Ce qui coûtait, et ce qui ne coûtait pas

Trois calculs repartaient à **chaque rendu** : `deriveAccueil` (cent trente
lignes — pièces, lumières, chauffage, volets, plantes, machines, alarme,
caméras, médias), `deriveNotifs`, et le compte d'appareils de la barre
latérale, qui boucle sur toutes les entités de la maison avec un test sur huit
préfixes de domaine. La barre latérale est **toujours** montée, quelle que soit
la vue affichée.

Le premier réflexe serait de dire « l'Accueil se rend plusieurs fois par minute
dans une vraie maison, donc ces calculs tournent plusieurs fois par minute ».
C'est vrai, et ce n'est pas le problème : **quand la maison bouge, refaire le
calcul est juste.** Mesuré, quatre bascules de lampe provoquent quatre
recalculs — avant comme après. Tant mieux.

Le gaspillage est ailleurs : tous les rendus où `hass` n'a pas changé du tout.

**Mesuré sur la démonstration**, en comptant les appels, `hass` identique d'un
bout à l'autre (vérifié par identité d'objet) :

| | Avant | Après |
|---|---|---|
| Aller-retour en mode édition | **4 recalculs** des trois | **0** |
| Trois changements de puce de filtre (vue Objets) | **2** balayages complets | **0** |
| Quatre bascules de lampe (la maison bouge) | 5 | **4** — légitime |

Rien n'avait changé dans la maison, et l'on refaisait tout quatre fois.

## La vue Objets

Elle sert **cinq** entrées de menu — Lumières, Climat, Volets, Médias, Objets.
Sa chaîne enchaîne un `Object.keys` complet sur les entités
(`objetsDeLaMaison`), un tri, puis deux passes de comptage. Tout cela repartait
même quand seul un état **local** avait bougé : changer de puce de filtre
rescannait la maison entière.

### Stabiliser les entrées d'abord

Mémoïser ne sert à rien si les entrées sont neuves à chaque rendu, et
`ajoutes` comme `ordrePieces` étaient des tableaux reconstruits. Ils passent
donc par leur **signature** avant d'entrer dans les dépendances.

Les épingles posaient un problème différent : elles étaient lues **dans**
`objetsDeLaMaison`, donc invisibles à `exhaustive-deps`, alors que le résultat
en dépend. Elles sont maintenant lues par la vue et **passées en paramètre** :
la dépendance devient visible et vérifiable.

## L'inventaire des avertissements ne bouge pas

C'était la contrainte du projet, et elle a guidé la forme des correctifs :
« cinquante-six avertissements permanents rendent la règle inaudible »
(`tests/dependances.test.mjs`). Toutes les dépendances écrites ici sont
**complètes** — `cfg` et `loggiaRuntime` étaient déjà mémoïsés, les autres
entrées ont été stabilisées exprès. Le compte reste à **45**, à l'identique.

## `React.memo` : non, et pourquoi

L'audit relevait que `memo` n'est employé nulle part. Je ne l'ai pas ajouté, et
ce n'est pas un oubli.

La grille d'Objets ne rend pas un composant par objet : elle appelle `carte(o)`,
une fonction locale. Il n'y a donc **pas de frontière de composant** à
mémoïser — `memo()` n'aurait rien où s'accrocher. Ailleurs, les cartes
reçoivent des objets reconstruits à chaque rendu : `memo` y serait un coût net,
pas un gain.

Ce qui a changé en revanche, et qui rendra `memo` utile plus tard : les objets
de la liste ont désormais une **identité stable** entre deux rendus où `hass`
n'a pas bougé. Le moment d'ajouter `memo` est celui où les cartes sortiront
dans `src/cartes/` — étape 2 du découpage d'`App.jsx`.

## Un rappel appris à la dure

Après ces modifications, **1 002 tests et le lint étaient verts alors que
l'application ne démarrait plus** : `nbAppareils is not defined`, écran de
secours. La cause n'était pas le code mais un module périmé du serveur de
développement, après beaucoup d'allers-retours sur le fichier — confirmé en
relançant Vite et en ouvrant un onglet neuf : application montée, console vide,
« 29 APPAREILS EN LIGNE » dans la barre latérale, les six cartes de pièce en
place.

La leçon tient quand même, et c'est la même qu'au 23/09 (`Ico` non exporté) :
**ni le lint ni les tests ne voient un écran qui ne s'allume pas.** Toute
extraction se vérifie dans le navigateur.

Vérifié ensuite à l'écran : la vue Objets affiche « 34 appareils répartis dans
6 pièces · 12 actifs », ses trois tuiles de comptage, ses huit puces avec leurs
nombres (Tous 34, Lumières 6, Volets 3, Chauffage 2, Prises 2, Multimédia 1,
IoT 4, Capteurs 13) et sa grille vivante.

## Le garde-fou

Un test dans `tests/dependances.test.mjs` — le fichier qui parle déjà des
dépendances — fige les trois mémoïsations, la chaîne d'Objets, et les trois
signatures qui stabilisent ses entrées. Vérifié dans les deux sens : il échoue
dès qu'on retire une seule d'entre elles.

1 002 tests JS, 579 pytest, lint propre (45 avertissements, inchangé), audit
propre. Paquet rebâti, second passage sans effet.
