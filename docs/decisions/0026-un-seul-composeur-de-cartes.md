# 0026 — Un seul composeur de cartes

Date : 15/09/2026 (v3.27.0). Statut : acceptée.

## Contexte

Trois « ajouter » cohabitaient : la feuille « Ajouter une entité » (entités
brutes de Home Assistant, 1 800 lignes à plat), le choix de type des Favoris,
le catalogue des vues personnalisées. Les cartes que Loggia compose lui-même
— distributeur (`obj:feeder`), plantes (`plant:…`), zones fil pilote
(`zone:…`) — n'existaient dans aucun des trois : elles n'apparaissaient que là
où Loggia les découvre seul. Chercher « feed » donnait les entités brutes du
distributeur, jamais sa carte. Retour utilisateur : « il faut revoir
complètement l'ajout de carte ».

## Décision

- **Une fabrique pour toute clé.** `useDomainCards.card` rend une entité, une
  zone, le distributeur, une plante — et porte leurs fiches. Objets ne
  compose plus rien de son côté ; une pièce peut donc porter une plante ou le
  distributeur comme n'importe quelle carte.
- **Un composeur, « Ajouter une carte », le même partout** où l'on range des
  cartes : les cartes de Loggia d'abord (peu nombreuses, sous-titre vivant),
  puis les appareils groupés par pièce, la pièce courante ouverte, les autres
  repliées avec leur compte ; des puces de filtre au vocabulaire d'Objets ;
  une recherche qui cherche tout (nom, sous-titre, pièce, identifiant, clé).
  Chaque ligne dit ce qu'elle est et se coche ou se retire d'un tap.
- **Aucun choix de dessin** : un seul type, le standard ; la taille au coin de
  la carte (ADR 0024).
- **Les clés composées posées dans une pièce sont surveillées** comme les
  autres (`cvAggKeys`).

## Conséquences

Les Favoris et les vues personnalisées gardent leur galerie typée avec aperçus
(`CarteAjoutSheet`) : les cartes composées n'y sont pas encore proposées.
Les agencements existants restent valides : les clés n'ont pas changé.
