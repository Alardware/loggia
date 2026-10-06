# 0159 — La taille et la largeur se règlent sur la carte, partout

Date : 06/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis** ;
le paquet est rebâti.

## Ce qui manquait de chaque côté

Deux familles de vues, deux moitiés d'un même réglage :

| | taille (88 ↔ 184) | largeur (simple ↔ double) |
|---|---|---|
| Pièces, Objets, Volets, Énergie, Sécurité | bouton de coin | dans la fiche seulement |
| Favoris de l'Accueil, vues perso | **nulle part** | bouton de la barre |

Dans une vue perso, la hauteur découlait du seul type de carte : impossible de
rendre compacte une carte qui ne l'était pas. Dans une vue métier, la largeur
exigeait d'ouvrir la fiche.

Chaque famille a donc reçu ce qui lui manquait.

## Une règle révisée, et pourquoi

Le 04/10, la règle posée était nette : « le bouton ⤢ bascule compacte ↔
standard, **jamais la largeur**, celle-ci reste dans la fiche ». Un test
l'épinglait, et il a sauté aujourd'hui — comme prévu.

Le 06/10 : « ajoute le bouton simple double ». La règle est révisée par celui
qui l'avait posée.

**L'esprit tient, et le test le dit encore** : chacun son bouton. Celui de la
taille ne change toujours pas la largeur ; le second a sa propre icône. Ce qui
était interdit, c'était la confusion entre les deux, pas la présence du
réglage. Le test vérifie maintenant les deux boutons séparément — il lit le
bloc du bouton de taille et refuse d'y trouver `basculerLarge`.

## Revenir à la taille du type EFFACE le réglage

Dans les vues perso, une carte posée n'avait pas de hauteur propre : elle la
tenait de son type (`CV_ROWS`). Le choix explicite l'emporte désormais, mais
revenir à la valeur du type **retire la clé** au lieu d'écrire le chiffre.

Sans cela, une carte réglée « standard » puis changée de dessin aurait gardé
une hauteur qui n'était plus la sienne. En effaçant, elle retrouve celle de son
nouveau type — ce qu'on attend d'un réglage qu'on remet à zéro.

## Ce qu'on a appris

**Une règle d'interface appartient à celui qui s'en sert.** Celle du 04/10
était bonne quand il n'y avait qu'un bouton ; elle devenait une privation dès
qu'on voulait les deux. Un test qui saute parce que l'intention a changé fait
son travail : il force à écrire pourquoi, au lieu de laisser la règle se
dissoudre en silence.

1890 tests JavaScript, 1431 tests Python, lint et audit propres.
