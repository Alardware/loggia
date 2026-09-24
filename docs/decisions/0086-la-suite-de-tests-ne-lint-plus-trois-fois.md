# ADR 0086 — La suite de tests ne lint plus trois fois

**Statut** : décidé et appliqué le 2026-09-24 ; gardé en local pour la mise à
jour groupée de correctifs.

Point S8 du plan du 22/09 : « Le dossier `dist` local, et les lints déguisés en
tests ». Deux griefs, et il faut les séparer : **le premier était déjà réglé,
le second avait quadruplé.**

## 1. Le dossier `dist` : rien à faire

Le plan le décrivait à **3 149 fichiers et 331 Mo**, avec 354 générations
d'`index.js`, parce que `vite.config.js` gardait `emptyOutDir: false`.

C'est corrigé depuis : `emptyOutDir: true` (M2 partie (a), ADR 0072), et
`dist/` tient aujourd'hui en **5 entrées et 28 fichiers d'assets**. La rétention
vit dans `custom_components/loggia/frontend/`, où `pack_frontend.py` garde deux
générations. **Rien à vider** — et c'était de toute façon ton geste, pas le mien.

## 2. Les lints déguisés en tests : 53 s à deux, 10 s après

Le plan mesurait 18 s sur 21,6 s cumulés. Mesuré le 24/09, quatre versions plus
tard :

| Fichier | Avant | Après |
|---|---|---|
| `dependances.test.mjs` | 45,2 s | **9,4 s** |
| `poids.test.mjs` | 8,2 s | **~0,5 s** |
| `listes_fonctions.test.mjs` | 2,4 s | inchangé |

Ce sont les chiffres qui comptent : ils isolent la cause et se reproduisent.

**Le total de la suite, lui, est à lire avec précaution.** Mesuré le jour même,
il passait de 45,3 s à 26,0 s. Relu à l'audit du soir, il est remonté à **38 s**
— sans que rien ne régresse : six fichiers de test se sont ajoutés dans la même
journée, et `--test-concurrency=1` paie un démarrage de processus par fichier,
sur 109 fichiers. La charge de la machine varie aussi (deux serveurs de
développement tournaient).

Un total de suite n'est donc pas un indicateur fiable ici. Les deux lignes du
tableau, si.

La cause n'était pas le principe, c'était la répétition : **trois passes ESLint
complètes sur tout `src/`**, dans trois tests, pour lire les mêmes messages.

- `dependances.test.mjs` en lançait **deux**, une par test — l'une cherche les
  expressions posées en dur dans un tableau de dépendances, l'autre l'inventaire
  des dépendances omises. Elles lisent le même relevé. La promesse est
  maintenant retenue : le second attend le premier.
- `poids.test.mjs` en lançait une **troisième**, pour le seul
  `no-unused-vars`. Ce contrôle a déménagé dans `dependances.test.mjs`, où il
  partage la passe existante — et où il est chez lui : ce fichier tient
  l'inventaire de ce qu'ESLint voit et qui ne doit pas bouger. Son propre
  commentaire le disait déjà.

**Aucune garantie n'a changé.** Les assertions disent exactement la même chose
qu'avant, sur le même relevé.

### Ce qui aurait été mieux, et que l'environnement refuse

Le vrai remède pour `no-unused-vars` est de le passer de `warn` à **`error`**
dans `eslint.config.mjs`. Il est invisible sous le `--quiet` de `npm run lint`,
d'où le test qui relançait ESLint rien que pour le relire ; en erreur, le lint
que la CI exécute déjà s'en chargerait, et l'échec arriverait là où on l'attend.

**Un garde-fou de l'environnement bloque toute modification de
`eslint.config.mjs`** — il lit « modification » comme « affaiblissement », alors
que ce changement RENFORCE la règle. C'est le même mur que l'ADR 0074 a
rencontré pour passer `jsx-a11y` en erreur. Deux changements d'un mot attendent
maintenant derrière lui.

## 3. Ce qui a été mesuré, et laissé tranquille

Le plan reprochait aussi à `orbe.test.mjs` d'épingler 41 valeurs numériques
WebGL, et à `test_robustesse.py` de compter un mot par fichier.

**Les deux coûtent des millisecondes.** `orbe.test.mjs` tourne en 367 ms, et
ses dix-huit tests portent chacun un nom qui dit ce qu'il protège — un fichier
que personne ne peut vérifier en le regardant. Le compte de mots de
`test_robustesse.py` est un proxy grossier, mais c'est le seul garde-fou des
lignes de journal que l'ADR 0079 a ajoutées.

Les retirer ne gagnerait rien de mesurable et perdrait de la couverture. **Non
touchés**, et c'est dit ici pour qu'on ne les rouvre pas sans raison.

## Conséquences

- Les deux fichiers coûtaient 53 s à eux seuls ; ils en coûtent 10. Sur la CI
  comme sur un poste.
- `poids.test.mjs` n'importe plus ESLint ; un renvoi y indique où le contrôle
  est parti.
- `dependances.test.mjs` devient explicitement le fichier qui tient
  l'inventaire ESLint de `src/` — tout nouveau contrôle de ce genre y va, pour
  ne pas rouvrir une passe.
- **Aucun changement dans `src/` ni dans le composant** : pas de redémarrage de
  Home Assistant, rien à l'écran.

Tests : 955 au vert côté JS le jour même, 970 à l’audit du soir ; 573 côté
Python, lint propre, audit propre.
