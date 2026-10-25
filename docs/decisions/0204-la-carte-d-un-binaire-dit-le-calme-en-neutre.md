# 0204 — La carte d'un binaire dit le calme en neutre ; sa fiche perd les lignes de Home Assistant

*16 octobre 2026 — accepté, à l'essai (chantier Capteurs, étapes 2 et 3 ; rien de publié). C26 de `docs/chantier-capteurs-etapes-2-3.md`.*

## Le problème

Dans les pièces et dans Sécurité, la carte d'un capteur binaire écrivait son calme en
vert : « Fermée », « RAS », « Tout va bien » (`BIN_ETATS`, `safety` éteint), avec le
lavis. Le calme d'une porte fermée n'est pas une bonne nouvelle à célébrer : c'est
l'état normal, celui qui ne doit rien dire (sa règle : jamais de « Tout va bien »
permanent, C5). Sa fiche alignait les trois lignes de Home Assistant — l'identifiant, la
classe, la dernière mise à jour — à la place de ce qui compte : depuis quand, la journée,
le dernier signal, la pile.

## La décision

**Le calme en neutre.** Fermé, sans fumée, sans mouvement : en neutre (`--o-text2`),
sans lavis. Ouvert : en ambre, comme le dessin. Un mouvement : en accent. Un danger : en
rouge, avec son lavis. Muet : « Indisponible » en rouge, avec le liseré qui respire
(ADR 0048). « Tout va bien » sort de `BIN_ETATS` : `safety` éteint devient « Normal »,
`problem` éteint « Aucun problème ». Le dessin de l'ouvrant reste (C2) : la porte ou la
fenêtre en fond, ambre ouverte, grise fermée.

**Sa fiche** prend la forme de celle d'une mesure (ADR 0200) : l'en-tête commun, l'état
et depuis quand, la bande du jour (`journee.jsx`, une lecture de `history/period` à
l'ouverture), le dernier signal (`dernierSignal`), la pile, et L'appareil, qui ouvre la
fiche universelle. Partent les trois lignes de Home Assistant. Le contenu vit dans
`fichecapteur.jsx`, à la demande ; la coquille (`FicheBinaire`, App.jsx) garde la
feuille et pose la frontière Suspense dedans.

## Ce que cela coûte

Un œil habitué au vert cherchera l'état : il est dans la phrase et dans le dessin. Les
mots qui ont changé (« Normal », « Aucun problème ») ont été ajoutés aux sept langues ; le
polonais est marqué « à relire par Seba882 ».

## Ce que les tests tiennent

`tests/binaire_calme.test.mjs` : chaque classe au calme en neutre, l'ambre d'une ouverture,
l'accent d'un mouvement, le rouge d'un danger ; « Tout va bien » absent de `BIN_ETATS` ;
la fiche d'un binaire — l'état, depuis quand, la bande du jour, le dernier signal, la pile,
L'appareil — et plus aucune ligne de Home Assistant.
