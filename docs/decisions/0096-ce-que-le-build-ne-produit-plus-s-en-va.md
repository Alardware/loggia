# 0096 — Ce que le build ne produit plus s'en va

Date : 27/09/2026. Statut : appliqué (local). Premier point d'un audit complet
du dépôt : 498 Ko livrés à chaque installation pour rien, dont 160 Ko qui
promettaient des fichiers absents.

## Le constat

`pack_frontend.py` tient deux règles depuis l'ADR 0072 : le CSS est inline dans
`index.html`, et la copie est **additive** — les deux dernières générations de
chaque famille de bundles restent, pour le client au cache périmé qui réclame
encore celle d'hier.

La deuxième règle avait un angle mort. Elle borne les familles **vivantes** à
`GARDE = 2`. Une famille que Vite a cessé de produire compte exactement deux
fichiers depuis le jour de sa mort : elle ne redescend donc jamais sous la
borne, et personne ne la reprend. La retenue gardait « les deux derniers »
d'un module qui n'existait plus.

Mesure du 27/09, dans `custom_components/loggia/frontend/` :

| Ce qui restait | Poids | Depuis |
|---|---|---|
| `aspirateur-*.js` (×2) | 17 Ko | la fiche universelle du 30/08 |
| `meteo-*.js` (×2) | 34 Ko | — |
| `robot-*.js` (×2), devenu `ficherobot-*` | 64 Ko | — |
| `boot-*.css`, renommé `index-*.css` | 25 Ko | 29/08 |
| `fonts/uicons-solid-rounded.css` + `.woff2` | 338 Ko | 23/09 |

**498 Ko**, cités par aucun fichier du paquet. Et pire que du poids : les sept
chunks importaient eux-mêmes six fichiers **absents du dossier** —
`vacplan-DqhCZQ5k.js`, `wx3d-Bu1khYey.js` et quatre autres. Le client au cache
périmé qu'ils prétendaient servir aurait reçu des 404.

La police pleine, elle, échappait à tout : la copie des fichiers venus de
`public/` ne regardait rien du tout. Retirée des sources le 23/09 — `index.html`
dit lui-même qu'elle n'est pas chargée, et aucune classe `fi-sr-` n'existe dans
`src/` — elle partait encore chez chaque utilisateur cinq semaines plus tard.

## La décision

Une troisième règle : **ce que le build ne produit plus du tout s'en va en
entier.**

La règle 2 protège le client d'HIER. Celui d'avant-hier est déjà perdu par elle
— lui garder une famille morte ne le sauve pas, et la fait payer à tout le
monde, à chaque installation, pour toujours.

Deux balayages, tous deux guidés par ce que le build produit **aujourd'hui** :

- `bundles_morts()` compare le contenu du paquet à `atteignables()`, l'ensemble
  déjà calculé de ce que l'`index.html` du jour finit par demander de proche en
  proche. Un fichier absent de cet ensemble est soit la génération d'avant —
  qu'on garde —, soit le reste d'un module disparu — qui part.
- `balayer_publics()` fait le miroir de `public/`. Sans danger ici : ces noms-là
  sont **stables** (`fonts/fonts.css`, `logo.png`, `panel.js`), jamais hachés.
  Aucun client ne réclame un nom que la page ne porte plus, et celui qui
  garderait un html d'avant le retrait a de toute façon perdu ses bundles à la
  règle 2. `assets` et `index.html` gardent leurs propres règles.

## Le piège : un hash peut contenir un tiret

Première version écrite par famille, le nom coupé au **dernier** tiret — le
découpage que le script et son test utilisaient déjà. Elle a supprimé
`demo-B6-lYSYp.js`, un bundle **vivant** : son hash, `B6-lYSYp`, porte un tiret.
Le découpage le rangeait donc dans une famille `demo-B6-` distincte de
`demo-DpsM1nrN.js`, et faisait passer la seconde pour morte — puis la
suppression par préfixe emportait les deux.

Le tri se fait désormais **fichier par fichier**, en essayant toutes les
coupures possibles du nom : si l'une d'elles est aussi le début d'un fichier
vivant de même extension, le module existe encore et le fichier reste. Le doute
profite au client.

## Le garde-fou

Le test qui existait ne bornait que les familles vivantes : une famille morte à
deux fichiers lui échappait par construction. Un second test, dans
`tests/generique.test.mjs`, refait le parcours d'atteignabilité depuis
l'`index.html` du paquet et refuse deux choses :

- un bundle dont le module a disparu — il nomme les fichiers et rappelle la
  commande qui les retire ;
- un fichier du paquet qui en réclame un absent, la forme `./nom-HASH.js` que
  Vite émet. C'est ce qui transforme du poids mort en écran cassé.

Vérifié dans les deux sens : vert sur le paquet corrigé, rouge dès qu'on remet
un seul fichier mort. Depuis un paquet vierge, un passage du pack retire
exactement les neuf fichiers et garde la génération N-1 de `demo` ; un second
passage ne fait plus rien, donc le `git diff --exit-code` de la CI passe.

## Résultat

Paquet livré : 7,8 → **7,3 Mo**. `frontend/` : 6,7 → 6,2 Mo. `assets/` : 56 →
49 fichiers. Aucune référence pendante. 991 tests JS, 573 pytest, lint et audit
propres.
