# ADR 0084 — Traduire ce qui s'affiche, et rien d'autre

**Statut** : décidé et appliqué le 2026-09-24 ; gardé en local pour la mise à
jour groupée de correctifs.

Point S6 du plan du 22/09 : « 412 traductions anglaises orphelines ». Il y en
avait **413**, et six langues les portaient — **2 478 lignes** traduites pour des
textes que plus aucun écran n'affiche.

## Comment on reconnaît une clé morte

La clé EST le texte français. Une clé est donc vivante si ce texte se retrouve
quelque part dans le code qui l'appellera : `src/` pour l'interface, les `.py`
du composant pour les mots et les gabarits du journal (ADR 0070), `scripts/`
pour la liste des clés du téléphone.

**On ne cherche pas seulement dans `tr('…')`.** Beaucoup de textes transitent par
une table — `MESURES_NOMS`, `WX_NOMS`, les paliers de `confort.js` — avant d'y
arriver. Chercher le littéral, où qu'il soit, est la seule méthode qui ne tue
pas de vivant. C'est pour cela que le plan comptait aussi « 144 incertaines » :
ici elles sont comptées vivantes, et le restent.

Reste un piège : une clé peut être orpheline **par une apostrophe**. `'` contre
`’`, une espace fine contre une ordinaire — `tr()` ne la trouverait jamais, et
l'écran sortirait en français sans rien dire. Un second passage, accents et
apostrophes normalisés, en a isolé trois. Les trois étaient de fausses alertes,
dont un vrai doublon : `Aujourd'hui` (droite) est appelée, `Aujourd’hui`
(courbe) ne l'a jamais été.

## Ce qui a été fait

**413 clés retirées des six catalogues.** L'anglais passe de 145 Ko à 117 Ko,
2 652 clés à 2 241 — c'est ce que les anglophones téléchargent.

**Deux clés ajoutées**, trouvées par le garde-fou en naissant : `tr('Rechercher')`
et `tr('Nom')`, deux étiquettes de lecteur d'écran, sortaient en français dans
les six langues.

## Le garde-fou : `tests/tout_tr_traduit.test.mjs`

Trois contrôles, deux secondes, et ils ferment la boucle dans les deux sens :

1. **Tout texte passé à `tr()` ou `trN()` a sa clé.** 1 953 textes extraits des
   sources — pas une liste recopiée. Les ternaires comptent :
   `tr(n > 1 ? 'des' : 'un')` s'écrit à trois endroits, et une extraction qui ne
   les voit pas laisserait six textes sans garde.
2. **Le balayage voit plus de 1 500 appels.** Sans cela, une expression
   régulière cassée rendrait le premier contrôle toujours vert — et muet.
3. **Aucune clé de catalogue que plus rien n'appelle.** L'inverse du premier.

Les deux ensemble tiennent les catalogues exactement à la taille de ce qui
s'affiche.

## Vingt-quatre listes recopiées à la main

Le plan en nommait une : « la liste de cinquante libellés recopiée dans
`tests/systeme_hoas.test.mjs` ». Il y en avait **vingt-quatre**, toutes bâties
sur le même patron — un tableau de libellés, et `en.includes("'" + k + "':")`.

L'intention était bonne. La liste, elle, ne se met pas à jour toute seule :
**six des dix-sept libellés de l'accueil n'existaient plus à l'écran**, et le
test les tenait pour vivants. `Très chaud` aussi, alors que l'échelle de
température s'arrête à `Trop chaud`.

Ces listes sont donc parties — le nouveau test les couvre toutes, plus
largement, et ne peut pas rouiller. Sept tests qui n'affirmaient plus que leur
liste ont disparu avec elle.

### Ce qui n'est PAS parti, et pourquoi

- `tests/edition_cartes.test.mjs` : son `en` n'est pas le catalogue, c'est le
  bloc `EnergieContent`. Son `en.includes(...)` est une vraie assertion.
- `tests/robustesse_front.test.mjs` : sa boucle vérifie que six libellés
  d'alarme sont **écrits `tr('…')`**. Qu'ils aient une traduction est désormais
  vérifié ailleurs ; qu'ils passent par `tr()` n'était vérifié que là. Seule la
  ligne redondante est partie.
- `tests/minuteur.test.mjs` : son `assert.ok(!en.includes('tant que Loggia reste
  ouvert'))` est une NÉGATION — elle dit qu'une ancienne phrase ne traîne plus.
  Elle reste.
- `tests/historique.test.mjs` : son contrôle que la traduction du pluriel garde
  son jeton `{n}` reste — c'est la forme, pas la présence.

## Conséquences

- **Aucun changement à l'écran, aucun redémarrage de Home Assistant.** Une clé
  retirée ne peut pas manquer : son texte n'existe plus nulle part.
- Ajouter une langue coûte 413 phrases de moins.
- Un texte nouveau sans traduction fait échouer la suite en nommant son fichier.
  Une clé traduite pour rien aussi.

Tests : 948 au vert côté JS, 573 côté Python, lint propre,
`node scripts/textes_serveur.mjs --check` à jour, `npm run build` passe.
