# 0030 — Le haut informe, le milieu contrôle

Date : 16/09/2026 (v3.31.0). Statut : acceptée. Troisième étape de la refonte
de l'Accueil (plan dans l'ADR 0028), avec la sixième pliée dedans.

## Contexte

Sur un écran 1080p, le hero (salutation, nom, avatars, faits, rangée de
chiffres) mangeait plus de deux cents pixels avant la première commande, et
ses six chiffres — export, air, ouvrants, lumières, médias, appareils actifs
— ne menaient nulle part : on les lisait, on ne pouvait rien en faire. Les
scénarios, eux, prenaient deux rangées dès neuf cartes. Principe retenu avec
l'utilisateur : « le haut doit informer, le milieu doit contrôler ». La
bannière avait été déclarée intouchable en août ; l'utilisateur a rouvert ce
point lui-même en validant le plan.

## Décision

- **Le hero baisse d'un quart** sans rien perdre : le fond météo, le nom en
  serif, les avatars sur la ligne du nom, la ligne des faits, la rangée de
  chiffres restent. Seuls les corps et les marges se resserrent (nom 34 → 28
  px sur PC, rangée rapprochée, marges du conteneur réduites). Mesuré en
  démonstration à 1 400 px : 209 → environ 157 px ; sur téléphone, 255 →
  environ 200 px.
- **Chaque chiffre est un bouton** et mène là où l'on agit : l'export à la vue
  Énergie, l'air à la pièce la plus chargée en CO₂, les ouvrants à Sécurité,
  les lumières et les médias à Objets filtré, les appareils actifs à « En ce
  moment » — le panneau du rail sur PC, la seconde page sur téléphone. Même
  dessin qu'avant ; le survol le dit, le libellé accessible aussi.
- **Une seule rangée de scénarios** sur PC et tablette : cinq cartes et la
  tuile « Tous les scénarios », qui porte le compte quand il en manque et mène
  à la vue. Sur téléphone, la rangée défile et tous y passent. Ni catégories
  ni réglage nouveau : « Sur l'Accueil » et l'ordre suffisent.

## Conséquences

La bannière n'est toujours pas une section : elle ne se masque ni ne se
déplace. Les tuiles n'apparaissent que quand il y a quelque chose à dire (la
règle du zéro reste). Non fait : un panneau latéral contextuel par tuile,
comme le proposait la maquette — la vue de destination joue ce rôle.

Même livraison, sur un retour de l'utilisateur (« sur mobile cette partie
revient à la ligne car trop long ») : les tuiles d'état de la carte Sécurité
restent sur une seule rangée au téléphone — autant de colonnes que de tuiles,
l'icône au-dessus, le libellé sur sa propre ligne — au lieu des deux colonnes
forcées qui envoyaient la troisième tuile à la ligne.

## Ajustement du 17/09 (v3.42.1) — la rangée des scénarios

Retour transmis par l'utilisateur : « le bloc Scénarios est trop horizontal […]
le bouton "Tous les scénarios" ressemble presque à une carte de scénario alors
que ce n'en est pas une. Je ferais plutôt : *Scénarios … 9 scénarios →*, et les
autres apparaissent avec un clic / scroll horizontal. »

- **La tuile « Tous les scénarios » quitte la rangée.** Le chemin vers la vue
  devient un lien de l'en-tête, à droite du titre : « 9 scénarios → » (ou
  « Tous les scénarios → » quand aucun n'est coché pour l'Accueil). En mode
  édition, l'en-tête garde « Gérer les scénarios ».
- **Tous les scénarios de l'Accueil tiennent dans UNE rangée qui défile**, sur
  tous les écrans : six visibles sur PC, jamais sous 116 px — sur un écran plus
  étroit on en voit moins, mais un nom ne se tronque plus (à 1200 px les cartes
  faisaient 87 px et coupaient « Tout éteindre ») ; 150 px par carte sur
  téléphone, comme avant. Plus de coupe à cinq.
- **Deux flèches dans l'en-tête, à la souris seulement**, et seulement quand la
  rangée déborde ; chacune n'est active que du côté où il reste quelque chose.
  Au doigt on glisse. La barre de défilement est masquée sur PC ; le clavier
  passe de carte en carte. Un moteur qui n'anime pas le défilement doux ne
  laisse pas la rangée sur place : sans mouvement au bout d'un instant, le
  saut se fait d'un coup.
- Les ombres des cartes ne sont pas coupées par le défilement (rembourrage
  compensé par une marge négative) : la mise en page ne bouge pas d'un pixel.

Garde-fous : `bordsDefilement` (src/scenarios.js, pur, 8 mutations tuées),
tests/accueil_hero et tests/scenarios réalignés.

## Ajustement du 19/09 (v3.59.1) — la rangée des scénarios au téléphone

La rangée défile toujours, mais sans ombre, comme les favoris : `overflow-x:
auto` rognait l'ombre des cartes et traçait un rectangle autour d'elles
(« le contour ça fait carré »). Le ciel qui s'arrêtait net juste au-dessus
est traité dans l'ADR 0059.
