# 0061 — Les caméras se disposent, la bibliothèque dit vrai

Date : 20/09/2026 (v3.61.0). Statut : acceptée. Demandes : « l'ombre derrière
les scénarios va pas, comme s'il y en avait 2 dont un très cubique, à
supprimer », « actualise la bibliothèque, certaines cartes ne sont plus et
d'autres sont arrivées à la place », « pour les caméras, moi j'en ai 2 mais
d'autres en ont peut-être plus, on pourrait ajouter un réglage d'affichage
comme ceux-ci, et un clic pourrait la zoomer, l'afficher en plus gros ».

## Contexte

Trois points, du plus petit au plus gros.

1. **L'ombre carrée des scénarios.** La rangée des scénarios défile
   (`overflow-x: auto`). L'ombre du thème y mesure 32 px de flou pour 26 px de
   rembourrage : le débordement la coupait net, en rectangle. On voyait bien
   deux ombres — la vraie, courte, et le bord franc de la coupure. Le correctif
   de l'ADR 0060 n'existait que dans le media du téléphone ; l'ordinateur, qui
   défile aussi, gardait le défaut.
2. **La bibliothèque.** Elle annonce « toutes les cartes de Loggia » et n'en
   montrait plus la moitié des nouveautés : la carte d'un scénario (ADR 0052),
   la standard d'un capteur avec sa jauge (ADR 0057), les widgets du côté de
   l'Accueil (ADR 0041, 0044), la sirène, la tuile caméra 16/9, la météo,
   « À surveiller », la carte chips. Pire : la carte **chips** ne pouvait plus
   être POSÉE — la galerie d'ajout ne la proposait plus alors que ses outils
   d'édition étaient toujours branchés.
3. **Les caméras.** Deux colonnes en dur sur l'Accueil et dans la vue Sécurité,
   une seule au téléphone, et un bouton d'agrandissement de 36 px dans un coin.
   Deux caméras y tiennent ; six font six vignettes hautes à dérouler.

## Décision

- **L'ombre courte de la rangée vaut à toutes les largeurs.** Pas zéro : sans
  ombre, la carte se confond avec la page sur un thème clair (1,01:1).
- **Un réglage « caméras par ligne »** (`src/camdispo.js`, pur) : automatique,
  1, 2, 3 ou 4. Il suit le TYPE d'écran comme les autres dispositions
  (ADR 0053) et vit dans la maison (`loggia_camdispo`), pas dans le navigateur.
  « Automatique » ne s'écrit pas et vaut ce que Loggia faisait déjà : deux par
  ligne sur grand écran, une au téléphone — une installation qui n'y touche pas
  ne voit rien changer. Un format ne propose que ce qu'il peut montrer (trois
  au maximum sur tablette, deux au téléphone), et se replie s'il hérite d'un
  choix plus large.
- **Le menu est un `ListeChoix`**, comme tous les menus de Loggia, avec le
  SCHÉMA de chaque disposition en regard de son nom : une forme se reconnaît
  avant de se lire. Il se tient là où l'on regarde les caméras — l'en-tête de
  la section, des deux côtés —, jamais enterré dans les Paramètres, et il
  n'apparaît qu'à partir de deux caméras.
- **Toute la tuile agrandit.** Le ⤢ du coin n'est plus qu'un repère : deux
  boutons l'un sur l'autre donnaient deux cibles pour un seul geste. Idem pour
  la carte caméra 1×1 du catalogue. Serrées (deux par ligne au téléphone, ou
  trois partout), les vignettes resserrent leur pied et effacent le repère.
- **La bibliothèque est refaite** : section Scénarios, standards de capteur
  avec jauge, section Widgets du rail, météo, chips, tuile 16/9, sirène,
  « À surveiller ». La carte **chips revient dans la galerie d'ajout**.

## Conséquences

- Le CSS du téléphone ne force plus une colonne aux grilles de caméras : un
  `!important` y rendrait tout choix sans effet. Le défaut est désormais dit
  par `CAM_AUTO`, en JavaScript, et un test l'épingle.
- `loggia_camdispo` rejoint `LOGGIA_SYNC_KEYS` : le réglage voyage avec la
  sauvegarde de configuration.
- `ListeChoix` accepte un dessin facultatif par option (`ico`) — rétrocompatible.
- Restent absentes de la bibliothèque, faute de données : l'agenda et le
  journal, qui vivent du vrai serveur.

Tests : tests/cameras_grille.test.mjs (6), tests/accueil_ciel_fondu.test.mjs.
