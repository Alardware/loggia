# 0106 — Le paquet ne promet plus de fichiers absents

Date : 27/09/2026. Statut : appliqué. **Redémarrage de Home Assistant
requis** (mise à jour d'un composant personnalisé) ; seul le paquet livré change. Trouvé pendant la vérification finale de la
v3.77.0, **par le garde-fou que le point 1 avait lui-même posé**.

## Ce que le point 1 avait réparé, et ce qu'il avait laissé

L'ADR 0096 a introduit la règle 3 : ce que le build ne produit plus du tout
s'en va en entier. Elle visait les familles **mortes** — `aspirateur-*`,
`meteo-*`, `robot-*` —, ces modules que Vite avait cessé de produire et dont
la retenue gardait pieusement « les deux derniers ».

Elle laissait intacte une hypothèse de la règle 2, jamais écrite nulle part :
**que les familles tournent ensemble.**

Elles ne le font pas. Vite hache chaque fichier sur son contenu. `wx3d-*`, qui
n'a pas bougé depuis des semaines, garde son empreinte d'une compilation à
l'autre ; `boot-*`, qui embarque l'écran, en change à chaque fois. Au bout de
quelques versions, `boot` en est à sa cinquième génération quand `wx3d` en est
à sa deuxième.

La règle 2 garde alors les deux dernières **de chaque famille** — c'est-à-dire
`boot` n°4 et n°5, `wx3d` n°1 et n°2. Or `boot` n°4 importe `wx3d` n°1 par son
nom haché... qui vient justement d'être emporté par la rotation de sa propre
famille.

## La mesure

Sur le paquet de la **v3.76.0 publiée**, celui qui est parti chez les
utilisateurs : **36 renvois morts**.

```
boot-C64gKv5O.js   → wx3d-CKceJpgu.js, systeme-dvQkLAb1.js, parametres-B0j6ilYM.js…
index-YtcRP48k.js  → en-Com9YkpF.js, de-CcHYRJX_.js, nl-BIOoIL1y.js, it-BWuur9nD.js
assistant-Dcrs8Z2J.js → orbe-BJPnbPLV.js, boot-BH6wy5QB.js, index-C9E_2mrq.js
```

La génération N-1 existe pour une seule raison : servir le client dont le
navigateur garde encore l'`index.html` d'hier. Une génération N-1 **trouée** ne
sert personne — elle lui donne exactement les 404 qu'elle prétendait éviter.
C'est du poids mort qui se fait passer pour un filet.

## La règle 4

`renvois_morts()` retire, **jusqu'au point fixe**, tout fichier gardé dont une
référence manque. Le point fixe n'est pas une coquetterie : retirer un fichier
peut en condamner un autre, qui le réclamait.

Trois précautions :

- La génération **vivante** est protégée. Si elle est trouée, ce n'est pas à ce
  balayage de la réparer : c'est la compilation qui est fautive, et le refus qui
  suit le dit déjà en toutes lettres.
- Elle passe **après** la rétention, qui vient peut-être de retirer ce qu'une
  génération gardée réclamait. Le test épingle cet ordre.
- Une référence ne compte que si elle porte une **empreinte** : `index.css` ou
  `panel.js` sont des noms stables, pas des bundles, et les condamner viderait
  le paquet.

Résultat sur le paquet du jour : **10 fichiers retirés**, 39 restants, **zéro
renvoi mort**. Second passage sans effet.

## Pourquoi un onzième commit, et pas une reprise du point 1

Le correctif appartient au sujet du point 1. Mais les dix commits étaient faits,
et rejouer neuf commits pour en corriger un aurait échangé un défaut mesuré
contre un risque non mesuré — sans compter le paquet, qu'il aurait fallu
rebâtir de toute façon.

Il vaut mieux que l'histoire dise ce qui s'est passé : le point 1 a posé le
garde-fou, et le garde-fou a trouvé ce que le point 1 n'avait pas couvert. C'est
exactement ce qu'on lui demande.

## Ce que ça dit du contrôle de la CI

`npm run build && python scripts/pack_frontend.py && git diff --exit-code` ne
voit **pas** les fichiers non suivis. Un paquet auquel il manque un fichier que
le build produit passe ce contrôle sans broncher — c'est ainsi qu'une erreur de
découpage a failli passer, et c'est le test qui l'a arrêtée.

Le garde-fou de `tests/generique.test.mjs` tient donc les deux bouts
maintenant : le **résultat** (aucun renvoi mort dans le paquet du jour) et le
**mécanisme** (la règle 4 existe, boucle, et passe après la rétention). Le
premier dit que c'est vrai aujourd'hui ; le second, que ça le restera.

1 007 tests JS, 579 pytest, lint propre, audit propre. Paquet rebâti, second
passage sans effet.
