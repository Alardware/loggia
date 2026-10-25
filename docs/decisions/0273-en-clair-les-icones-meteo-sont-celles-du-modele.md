# 0273 — En clair, les icônes météo sont celles du modèle

*25 octobre 2026 — accepté (sa maquette « Cartes météo » en thème clair)*

## Le problème

Le widget météo a été refait sur sa maquette (ADR 0272), mais en thème clair
ses nuages restaient **gris sombre** : « tu n'as pas repris le modèle, tu as
gardé l'ancien ». L'ancien, c'était la réponse du 10/10 à « on distingue mal
en clair » : les Meteocons sont des images dont on ne change pas une couleur,
et leurs nuages (#e6effc sur #f3f7fe) tombaient à 1,12:1 sur une carte
claire — alors on filtrait, `brightness(.58) saturate(1.8)`, 3,12:1 mesuré.
Un nuage lisible, mais plombé.

Sa maquette fait autrement : en clair, elle sert **un second jeu d'icônes**
(`assets/wx/light/`), les mêmes dessins avec un contour gris-bleu — `#93a5bd`,
1,5 px quelle que soit la taille — et le vent aux traits plus foncés. Aucun
filtre. Le nuage reste blanc, c'est son bord qui le pose sur la carte.

## La décision

**Le thème clair a son jeu d'icônes, dérivé du sombre, servi tel quel.**

- Onze icônes changent (les dix à nuage et le vent) ; soleil, lune, aube,
  crépuscule, pluie battante et tornade sont les mêmes dans les deux thèmes.
- Elles sont **dérivées** des sombres de Loggia par une règle unique
  (`tests/icones_claires` la tient), et non copiées du handoff : ses fichiers
  clairs avaient perdu leurs animations à l'export, et cinq conditions de
  Loggia (brouillard, grêle, grésil, neige, pluie d'orage) n'y existaient pas.
  Dérivées, elles tournent comme les sombres, et un dessin retouché d'un côté
  casse le test tant qu'il ne l'est pas de l'autre.
- `WeatherIco` choisit le jeu en **observant la classe `loggia-light`** de la
  racine (`theme.js` la pose sans prévenir personne) : le changement de thème
  bascule l'icône sans recharger. Au rendu serveur, le sombre.
- Le filtre CSS de `html.loggia-light .o-wx-ico` disparaît.

## Ce que ça coûte, et ce qu'on a refusé de payer

Les icônes sombres vivent dans le boot (quatorze en données, trois gros en
fichiers). Onze de plus en données auraient dépassé sa marge de 2,5 Ko ; elles
sont donc importées avec `?no-inline` : le boot n'en porte que les adresses,
le navigateur ne les demande qu'en clair. Le chargeur des tests
(`tests/jsx-hooks.mjs`) apprend qu'une image à suffixe reste une image.

Le contraste mesuré du filtre (3,12:1 sur les pixels du nuage) n'est plus le
critère : un nuage blanc cerné de gris-bleu se lit par son bord, pas par sa
masse. C'est le choix de sa maquette, et le sien.

## Tests

`tests/icones_claires.test.mjs` : chaque icône claire est le dessin sombre au
contour clair, animations comprises ; le dossier n'a ni orphelin ni manquant ;
`wxutil` les importe en fichier sous des conditions que `WX_METEO` connaît ;
plus de filtre en clair ; sans document, le sombre.

## Non fait, et dit

Les petites icônes de la rangée des heures sont figées sur un canvas
(`IcoFigee`) : le contour « non mis à l'échelle » y vaut 1,5 px du canvas,
soit un peu moins à l'écran sur un téléphone à forte densité. Vu en démo sur
PC ; à regarder chez lui au téléphone.
