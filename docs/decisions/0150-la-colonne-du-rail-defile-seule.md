# 0150 — La colonne du rail défile seule

Date : 04/10/2026. Statut : appliqué. Pas de redémarrage de Home Assistant.

**La demande.** Sur l'Accueil d'un grand écran, avec peu ou pas de caméras,
le rail de widgets (À surveiller, horloge, météo, CO₂, En ce moment,
Rappels, Agenda) faisait une grande bande à droite, et du vide à côté du
contenu principal : la grille étirait ses deux colonnes à la hauteur de la
plus haute, presque toujours le rail. Trois pistes ont été dessinées par
l'utilisateur ; il a retenu « la colonne qui défile simplement, tous les
widgets restant dépliés » — ni repli en lignes compactes, ni mosaïque sous
les caméras.

**La décision.** À partir de 1180 px (ordinateur, tablette en paysage), la
cellule du rail ne compte plus dans la hauteur de la page (`contain: size`) ;
la colonne colle 16 px sous l'en-tête, se borne à la fenêtre et défile seule.
- Sa hauteur suit l'en-tête (`--o-hdrh`, qui se masque en descendant :
  `html.loggia-hdr-cache`), la barre du bas d'une tablette (`--o-navh`), et
  les deux bouts de la page : page en haut, la colonne ne dépasse jamais le
  bas de l'écran ; en fin de page, elle raccourcit au lieu d'être poussée.
  Ces deux bornes s'écrivent en variables CSS à chaque image au plus
  (`src/railcolonne.js`), sans état React : le défilement ne refait jamais le
  rendu de l'Accueil.
- Pas de fondu en bas : un masque éteint le verre dépoli de toutes les cartes
  du rail (mesuré). La suite se devine à la carte coupée net, comme dans la
  rangée des scénarios. Les cartes du rail prennent l'ombre courte de cette
  rangée (ADR 0059) ; « Ombres portées » coupé l'éteint aussi.
- Au doigt, le défilement de la colonne n'entraîne pas la page ; à la
  molette, la page reprend au bout de la colonne.
- En mode édition, la colonne redevient une liste ordinaire : le glisser des
  widgets ne change pas. Le téléphone et la tablette en portrait (deux pages
  glissées) ne changent pas.

**Mesuré dans la démo**, 1440 × 900 : la page passe de 2 069 px (quel que soit
le nombre de caméras) à 1 294 avec 4 caméras, 1 140 avec 2, 948 sans ; en
tablette tactile, de 1 728 à 1 363, 1 119 et 836. Le dernier widget reste
joignable à toute position, à la molette, au doigt et au clavier. CLS 0,001.

## Relecture

- Sous Neumorphix, sans liseré, les cartes de la colonne perdaient le relief
  du thème pour l'ombre générique : le thème a désormais un relief réduit
  pour ce qui défile (`--o-shadow-rangee`, 2 px / 5 px, logé dans le
  rembourrage de la colonne) ; la rangée des scénarios le prend aussi.
- Quand le bas de la colonne tombait dans l'écart entre deux cartes, rien ne
  disait qu'il restait des widgets plus bas. Un indice de suite s'y pose : un
  léger flou de ce qui est derrière, effacé sur tous ses bords, qui ne peint
  aucune couleur — un voile de la couleur du fond faisait une bande visible
  sur les dégradés et les photos (mesuré sur seize fonds). Le masque est posé
  sur l'indice seul : le verre dépoli des cartes reste intact. Il s'éteint en
  fin de colonne et ne capte aucun clic.
- En mouvement réduit, l'en-tête glissait encore 0,3 s et recouvrait la
  première carte : il ne glisse plus.
