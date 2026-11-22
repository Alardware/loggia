# 0372 — Ce que plus rien ne joue ni n'appelle part

*15 novembre 2026 — appliqué (v3.100.0). Audit du 12/11, lot 5a : les points N1 et N5 (« nettoyage »), validés le 12/11. Rien ne change à l'écran : pas de redémarrage de Home Assistant.*

## Le problème

L'audit du 12/11 listait du code « retirable sans risque ». Le code a bougé
depuis : chaque élément a été revérifié le 15/11, par recherche du nom dans
toute la source et dans les tests, avant d'être retiré.

## La décision

**Part, parce que plus rien ne le joue ni ne l'appelle :**

- *Neuf animations* de `src/index.css` qu'aucune règle ni aucun style en ligne
  ne citait : `flowdash`, `floaty`, `m-pulse`, `m-wiggle`, `m-bounce`,
  `m-charge`, `o-popIn`, `np-pulse`, `o-avatarinK`. Une règle générale tient
  maintenant la porte : toute animation définie dans la feuille est jouée
  quelque part.
- *`feederScript`* (`src/state.js`) : le script de ration se devinait au nom ;
  la fiche du distributeur ne passe plus par là.
- *Le mot `export`* de neuf symboles que seul leur propre fichier utilise :
  `report`, `LOCAL_ONLY_KEYS`, `FOND`, `finTexte`, `ENTITE`, `norm`,
  `SYS_SLOTS`, `CLEAN_AREA`, `eauEtatDemo`. Le garde-fou existant
  (`exports_sans_client`) les laissait passer : il compte un nom vu dans un
  commentaire, ou un homonyme, comme un client.
- *Une ligne redondante* de `coverFerme` (`src/voletecran.js`) : « ouvert à
  100 % » rendait déjà « pas fermé » par la ligne suivante. Le seuil de 2 % et
  l'autorité de `closed` ne bougent pas.
- *Un minuteur jamais armé* dans l'en-tête (`chipTimer`), et deux
  commentaires qui décrivaient du code parti.

## Ce qui n'est pas fait

- **La variante de la carte de pièce que plus rien n'affiche**
  (`src/accueil/briques.jsx`) : elle porte une des vingt activations au clavier
  que `tests/clavier.test.mjs` compte dans la source. La retirer demande de
  recaler ce compte : à décider, pas à faire en passant.
- **Le paramètre `compacte` de la grille de l'agenda**, jamais passé :
  `tests/agenda_rail.test.mjs` épingle sa signature.
- **`GlypheHaut`** garde son `export` : un test le monte par son nom.
- **La variable `--rb-rgb`**, jamais lue : trois tests l'épinglent.
- **Les textes traduits que plus rien n'affiche** : 71, et non 19, dont 66
  traduits par le contributeur polonais. Les retirer est permis, mais demande
  de baisser le seuil du test qui garde son travail : sa décision.
- **`onToucher` de l'orbe** : jamais passé, mais l'orbe ne se touche pas.

## Les conséquences

Rien ne change à l'écran. Aucun texte neuf, aucun catalogue touché.
Test : `tests/audit_1211_lot5a_retraits.test.mjs`.
