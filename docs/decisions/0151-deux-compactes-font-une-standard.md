# 0151 — Deux compactes font une standard

Date : 04/10/2026. Statut : appliqué. Pas de redémarrage de Home Assistant.

**La question 5 de l'audit du 03/10.** Les cartes standard de Pièces, Objets,
Volets, Énergie et des vues personnalisées mesuraient 192 px (186 au
téléphone), pas 184 comme l'Accueil et les Scénarios : l'écart de 16 px entre
les cartes valait aussi entre les rangées, et une standard couvrait 88 + 16 +
88. L'utilisateur : « ok pour 184 mais il faut que 2 compactes puissent être à
côté sans déborder, ça doit être aligné ».

**La décision.** L'écart entre les rangées passe à 8 px dans ces grilles,
téléphone compris ; l'écart entre les colonnes ne change pas. Une standard
fait donc 88 + 8 + 88 = 184, et deux compactes empilées dans une colonne
couvrent exactement sa hauteur, alignées en haut et en bas. Toutes les cartes
tombent sur une même grille de 96 px.

**Mesuré dans la démo**, à 1440, 800 et 390 px, en mode normal et en édition :
standard à 184 partout, deux compactes à côté d'une standard alignées (écarts
0 en haut, 0 en bas, 8 entre elles), rien ne déborde. La grille est dense :
c'est l'ordre des cartes qui décide si deux compactes se rangent l'une sous
l'autre ou côte à côte.

## Relecture

- La carte Agenda d'une vue personnalisée perdait son titre et rognait son
  troisième événement à 184 px : le titre ne rétrécit plus, et l'événement
  tient.
- En mode édition, les pointillés de deux cartes empilées se touchaient : ils
  gardent 2 px d'écart, comme sur l'Accueil.
