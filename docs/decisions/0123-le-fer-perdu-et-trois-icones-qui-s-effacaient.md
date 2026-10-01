# 0123 — Le fer perdu, et trois icônes qui s'effaçaient

Date : 01/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti.

Revérification de l'issue #6, « Pouvoir choisir l'icône d'une entité ». Deux
trous, aucun signalé par les tests.

**Le fer à repasser avait disparu.** Il était entré avec les familles de prises,
puis il est reparti dans le revert qui a précédé la v3.78.0 — et personne ne l'a
remis. Une prise nommée « fer à repasser » retombait donc sur la famille
générique. Il est de nouveau là, avec ses mots entiers et le polonais
`zelazko`, comme les autres familles depuis la décision 0118.

**Trois dessins retirés du catalogue laissaient un trou.** `smart-speaker`,
`voice-assistant` et `smart-display` ont quitté `dessins.js`. Une carte dont
l'utilisateur avait CHOISI l'une de ces icônes n'affichait plus rien : le nom
était toujours dans sa configuration, le dessin n'existait plus, et rien ne
disait pourquoi la carte était vide.

**Décidé :** un dessin retiré du catalogue garde un repli dans `FI_MAP`, vers un
voisin neutre — enceinte, microphone, écran. Jamais vers une marque : le nom
choisi décrivait un type d'appareil, pas un produit, et le repli ne doit pas en
inventer un.

La règle vaut pour tout retrait futur. Supprimer un dessin sans son repli ne
casse rien à la compilation ni aux tests : ça vide la carte de quelqu'un, en
silence, des mois plus tard.
