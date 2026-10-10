# 0180 — Une ligne dans le shader du ciel

*10 octobre 2026 — accepté*

## Le problème

> « Le ciel se casse en rectangles sur téléphone, pas sur ordinateur. »
> — Seba882, [issue #25](https://github.com/Alardware/loggia/issues/25),
> 6 octobre.

Le fond météo est un shader repris **verbatim** d'un travail publié par son
auteur. La règle, jusqu'ici, était de n'y pas toucher : un shader se lit mal,
se teste mal, et chaque retouche est une dette envers l'original.

Le rapport décrivait pourtant un défaut réel, avec son mécanisme. `hash21`
multiplie la coordonnée par ~443 avant `fract`. Or `fbm` l'enchaîne quatre
fois (`p * 2.02 + 11.3`) et le vent y ajoute le temps : elle **grandit sans
fin**. Passé un certain ordre de grandeur, le flottant n'a plus de quoi
distinguer deux cases voisines — elles rendent la même valeur, et le ciel se
casse en aplats rectangulaires au lieu de nuages.

## La mesure

Comptage des valeurs **distinctes** rendues par `hash21` sur 256 points, en
float32 strict, à la quatrième octave :

| | sans repli | avec `mod(p, 256.0)` |
|---|---|---|
| à l'ouverture | 232 / 256 | 256 / 256 |
| après une heure | 193 / 256 | 254 / 256 |
| après une journée | **4 / 256** | 256 / 256 |
| après une semaine | **1 / 256** | 251 / 256 |

*(Chiffres de Seba882. Les nôtres, échantillonnés autrement, donnaient
226 → 4 à la quatrième octave : même effondrement.)*

## La décision

**Une ligne**, en tête de `hash21`, avant la multiplication :

```glsl
p = mod(p, 256.0);
```

Placée après, elle ne servirait à rien — c'est la multiplication qui épuise la
précision. Elle ne change rien là où la précision suffisait ; elle sauve
l'image quand elle manque.

**La règle du verbatim cède ici, et c'est la première fois.** Elle protégeait
contre les retouches de goût, pas contre les défauts mesurés. Un shader qu'on
ne corrige pas quand il casse n'est plus une dépendance respectée, c'est une
dépendance abandonnée. La ligne porte son commentaire : ce qu'elle répare, et
le chiffre qui l'a établi.

## Le test, et ce qu'il dit de lui-même

`tests/wx3d_hash.test.mjs` **refait la mesure** plutôt que d'épingler la ligne.
Il simule le float32 opération par opération (`Math.fround` à chaque étape),
rejoue les quatre octaves, et compte les valeurs distinctes à l'ouverture,
après une heure, une journée, une semaine.

Deux choix de son auteur méritent d'être notés :

- **Il lit les deux multiplicateurs dans le shader** au lieu de les recopier.
  Si le hash change un jour, le test suit au lieu de mentir.
- **Il dit ce qu'il ne fait pas.** Le cas « sans repli » ne protège rien : il
  *documente la panne*, pour que la ligne ne soit pas retirée un jour comme une
  coquetterie.

## Ce qui reste non expliqué, et qu'on ne prétend pas expliquer

En float32 strict, **à l'ouverture**, le hash ne s'effondre presque pas (232 sur
256). Ce que Seba882 voyait sur son téléphone dès le premier instant ne vient
donc pas de la magnitude seule, mais d'un pilote qui calcule plus court qu'il
n'annonce. Ni lui ni nous ne savons le prouver, et le correctif vaut dans les
deux cas.

Reste aussi une question ouverte : la mesure donne 4 valeurs sur 256 après une
journée, et déjà 145 après une heure — mais c'est une mesure sur le hash, pas
sur ce qu'on voit. La dégradation n'a jamais été constatée à l'écran sur une
tablette laissée allumée en continu. Si elle finit par se montrer, le test dira
depuis quand.

## Ce qu'on n'a pas fait

**Le second point de l'issue** — la densité des nuages selon le rapport de
l'écran — est laissé de côté, sur la suggestion de son auteur : l'interface
bouge trop en ce moment pour y toucher.

**Reconstruire le bundle dans sa branche.** Notre contrôle « paquet embarqué =
build du commit » ne peut pas être satisfait par un contributeur extérieur : le
bundle dépend de l'arbre entier. Le commit de reconstruction est donc posé par
le dépôt, par-dessus le sien, qui garde son attribution.
