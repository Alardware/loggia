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
