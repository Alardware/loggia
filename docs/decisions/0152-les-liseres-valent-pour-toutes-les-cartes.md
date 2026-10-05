# 0152 — Les liserés valent pour toutes les cartes

Date : 04/10/2026. Statut : appliqué. Pas de redémarrage de Home Assistant.

**La demande.** « Ajoute aussi les bordures sur les cartes qui n'en ont pas,
trait de 1 px autour des cartes et tableaux » — l'utilisateur venait de
trouver le réglage « Liserés » (Paramètres → Apparence). Ce réglage
(`look.hairline`, activé par défaut) ne pose qu'une variable, `--o-bw` : 1 px
activé, 0 coupé. Or une bonne partie des cartes écrivait `border: 'none'` en
dur et l'ignorait : liserés activés, la moitié des cartes n'avait pas de trait.

**La décision.** Un jeton partagé, `LISERE` (`src/styles.js`), porte le trait
de toutes les cartes et de tous les panneaux : gabarits communs (cartes de la
maison, des vues personnalisées, des pièces, panneaux de Système et de la
fiche du robot) et chaque `border: 'none'` d'une surface de carte. Liserés
activé : 1 px du jeton de bordure du thème, partout ; coupé : aucun trait,
exactement le dessin « sans bordure » du gabarit. La taille ne bouge pas
(`box-sizing: border-box` : 88 et 184 restent exacts). Les boutons, les
puces et les décors ne sont pas des cartes.

Deux choix de l'utilisateur :
- **Atrium** dessinait déjà un anneau d'un pixel par l'ombre de ses cartes :
  il aurait fait 2 px avec le trait. Son anneau vaut désormais
  `calc(1px - var(--o-bw, 1px))` : il s'efface quand le trait est là, et
  revient quand on coupe les liserés. Un seul trait.
- **iOS, Neumorphix et Material** déclarent « pas de trait » : le thème
  décide, et le réglage n'y change rien.

Le réglage étant activé par défaut, toutes les cartes prennent le trait à la
mise à jour ; il se coupe d'un geste dans Apparence.

**Mesuré dans la démo**, liserés activés : aucune carte ni aucun panneau sans
trait sur l'Accueil (téléphone et édition compris), les Scénarios, Objets, une
pièce, les Volets, l'Énergie, la Sécurité, le Système, la bibliothèque et les
dix pages de Paramètres ; coupés, aucun trait.

## Relecture

La carte « Chip » des vues personnalisées était restée sans trait — et sous
Atrium, sans contour du tout. Elle prend le liseré. Le test balaie désormais
chaque `border: 'none'` de `src/` et refuse ceux d'une surface de carte.
