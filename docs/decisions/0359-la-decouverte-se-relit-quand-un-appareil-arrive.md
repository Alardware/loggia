# 0359 — La découverte se relit quand un appareil arrive

*13 novembre 2026 — appliqué (v3.100.0)*

## Le problème

Loggia lit les registres de Home Assistant (pièces, appareils, entités) une
seule fois, à l'ouverture. Un appareil ajouté pendant qu'une tablette reste
allumée n'apparaissait donc pas : un volet, un thermostat, un lecteur, une
caméra ou un robot ne se montraient nulle part avant un rechargement de la
page ; une ampoule apparaissait, mais rangée dans « Autres » plutôt que dans
sa pièce.

## La décision

Quand le **nombre d'entités** de Home Assistant diffère de celui du dernier
chargement, la découverte se relit **dix secondes plus tard** :

- un seul minuteur ; un nouveau nombre le réarme (Home Assistant qui démarre,
  une intégration qu'on ajoute, arrivent par vagues) ;
- revenu au nombre déjà lu, il n'y a plus rien à relire ;
- un chargement raté garde la découverte d'avant, et retient son nombre : il
  ne se relance pas en boucle ;
- le relevé ordinaire (toutes les deux secondes) ne relit jamais rien.

Loggia ne s'abonne pas aux événements des registres : rien ne garantit qu'un
compte ordinaire les reçoive.

## Ce que cela ne couvre pas

Un appareil **déplacé** d'une pièce à l'autre, ou une pièce renommée, sans que
le nombre d'entités change : il faut encore recharger la page.

Pas de redémarrage de Home Assistant. Tests :
`tests/audit_1211_lot2b_noyau.test.mjs` (B17).
