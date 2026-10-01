# 0122 — Deux capteurs ne s'empilent pas

Date : 01/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti.

La barre de confort d'une pièce (ADR 0039) empile ses pastilles au téléphone :
icône au-dessus, valeur dessous. Cet empilement existe pour tenir **quatre**
mesures sur 375 px.

À deux, il ne fabriquait que des tuiles hautes et à moitié vides.

**Décidé :** c'est le NOMBRE de mesures qui décide, pas la largeur seule. Deux
ou moins, les tuiles restent en ligne — icône à côté du texte, et un peu plus
grande, puisqu'elle a la place. Trois et quatre gardent l'empilement.

Le test épingle les deux cas **et leur ordre** dans la feuille : la règle
particulière doit suivre la générale, sinon elle serait écrasée sans que rien
ne le dise.
