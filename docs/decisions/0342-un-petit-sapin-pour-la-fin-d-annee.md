# 0342 — Un petit sapin pour la fin d'année

*10 novembre 2026 — à l'essai (bêta v3.100.0-beta.1)*

## Le problème

L'idée est venue d'OhMyHA, qui habille son tableau de bord selon la saison.
Trois aperçus sur la démo ont été refusés : la neige et une guirlande, la neige
posée sur les cartes, puis le ciel de l'Accueil en hiver (« horrible »). Le ciel
dit la vraie météo : de la neige pour décorer ferait croire qu'il neige. Un
seul aperçu a plu : un petit sapin dessiné et le compte des jours, rien qui
bouge.

## La décision

Du 1er novembre au 25 décembre, un sapin de 14 px et « J-45 » se posent près de
la date de l'en-tête, sur toutes les vues. Au téléphone, la date de l'en-tête
s'efface : le sapin passe à côté du bonjour de l'Accueil, dans la couleur du
bonjour. Jamais les deux à la fois. Le 25 décembre, il dit « Joyeux Noël » ; le
26, il s'en va. Les couleurs sont celles du thème, rien ne bouge, et le lecteur
d'écran entend « Noël dans 45 jours ».

## Les conséquences

Rien sur les cartes ni sur le ciel. Pas de réglage pour le retirer : il ne
prend que la place de quelques lettres et repart seul. Une fenêtre de PC trop
étroite pour la date n'a pas de sapin. Cinq textes nouveaux dans les six
langues. Test `saison`.
