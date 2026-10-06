# 0158 — La carte Lovelace ne peut pas vivre dans un cadre

Date : 06/10/2026. Statut : appliqué — la carte est **retirée**.
**Redémarrage de Home Assistant requis** ; le paquet est rebâti.

## Ce qu'on retire

La « Carte Home Assistant », livrée la veille (ADR 0156, §4), part avec son
éditeur, son lecteur YAML (`miniyaml.js`), son composant (`cartelovelace.jsx`),
leurs deux fichiers de tests et les huit clés de langue qui les servaient.

## Pourquoi

Elle ne pouvait pas fonctionner. Pas « elle a un défaut » : **la voie était
sans issue**, et il a fallu trois corrections pour l'apprendre.

Les cartes de Home Assistant sont des composants **Lit**. Au montage, Lit pose
ses styles par `adoptedStyleSheets`, et une feuille de style construite
**appartient à un seul document**. Or `panel.js` monte Loggia dans une iframe :
la carte est fabriquée par les aides dans la page de Home Assistant, puis
connectée dans notre cadre. Le navigateur refuse :

```
Uncaught NotAllowedError: Failed to set the 'adoptedStyleSheets' property on
'ShadowRoot': Sharing constructed stylesheets in multiple documents is not
allowed
    at css-tag.ts → createRenderRoot → connectedCallback (lit-element)
```

`connectedCallback` échoue, la carte occupe sa place et **ne dessine rien**.

## Le chemin, parce qu'il instruit

Trois correctifs successifs, chacun juste, aucun suffisant :

1. **Les ressources Lovelace.** Un type `custom:` n'existe qu'une fois son
   fichier chargé ; Home Assistant ne le charge qu'en ouvrant un tableau de
   bord. On lisait donc `lovelace/resources` pour poser les manquants.
2. **La fenêtre.** `window.loadCardHelpers` n'existe pas dans une iframe — il
   vit dans la fenêtre du dessus. Toute carte répondait « Home Assistant n'a
   pas fourni ses cartes ».
3. **Le document.** Les ressources devaient être posées dans le document de
   Home Assistant, pas dans le nôtre : c'est lui qui tient le registre.

Après quoi la carte se créait vraiment — et restait vide. Le mur était deux
couches plus bas.

**On ne pouvait pas la poser non plus.** Détail révélateur : le type était au
catalogue avec son rendu, son éditeur, son nom et six tests, mais absent de la
galerie comme de `cvTypesPour` — rien ne permettait de l'ajouter. L'utilisateur
a collé son YAML dans le formulaire « carte template », le seul endroit qui
proposait d'écrire du texte, et a obtenu sa configuration affichée en clair.
C'était la **deuxième fois** : `chips` avait connu le même sort le 20/09, et un
commentaire du code le racontait déjà. `tests/cartes_posables.test.mjs` reste —
il exige désormais qu'une carte nommée au catalogue ait un chemin d'ajout, et
il attrape le défaut (vérifié en le cassant).

## Ce qu'on a écarté

- **Charger le frontend de Home Assistant dans le cadre**, pour que les cartes
  y soient créées et stylées. Plausible, mais plusieurs mégaoctets téléchargés
  une seconde fois et un pari sur le comportement d'un frontend chargé deux
  fois.
- **Sortir Loggia de l'iframe.** La solution de fond, et disproportionnée : les
  styles de Loggia et ceux de Home Assistant se retrouveraient dans le même
  document, dans les deux sens, pour permettre de poser des cartes tierces
  alors que le catalogue en compte vingt-quatre.

Le choix revient à l'utilisateur, et il a tranché pour le retrait.

## Ce qu'on a appris

**« Vérifié » doit vouloir dire vérifié.** L'ADR 0156 annonçait : « Vérifié :
une carte montée prend bien la surface de Loggia. » C'était vrai avec des
**aides simulées**, et cela ne prouvait rien du cas réel — aucune vraie carte
n'avait jamais été montée. Une vérification qui ne passe pas par le chemin
réel n'est pas une vérification, c'est une mise en scène.

**Le contexte d'exécution fait partie de la conception.** Loggia vit dans une
iframe : ce fait était écrit dans `panel.js`, et aucun des quatre chantiers du
05/10 ne l'avait consulté avant de promettre d'accueillir l'écosystème.

**Ce qui a servi reste.** La leçon des cartes posables est épinglée par un test,
et la v3.87.0 — qui annonce la fonctionnalité dans ses notes — doit être
corrigée : une release ne promet pas ce qui ne marche pas.

1890 tests JavaScript, 1431 tests Python, lint et audit propres.
