# 0230 — Le plan 3D s'importe, et se relie

*17 octobre 2026 — accepté*

## Le besoin

La section Pièces de l'Accueil avait un bouton **Cartes / Plan** depuis le
30/09, et « Plan » ne montrait qu'une phrase : « Le plan de la maison arrive
prochainement ». L'auteur a fait le plan 3D de sa maison pour floor3d-card, et
l'a demandé dans Loggia. Puis il a posé la règle :

> « La mécanique, c'est que n'importe qui possédant un plan 3D puisse
> l'importer dans Loggia. »

Son modèle n'est donc qu'un cas. Rien dans le code ne connaît une maison.

## Ce qui est décidé

1. **Un bouton « Importer un plan »**, réservé aux administrateurs. Il accepte
   `.glb` / `.gltf` tels quels, et `.obj` + `.mtl` (Sweet Home 3D, floor3d-card),
   convertis en un seul `.glb` **dans le navigateur** (GLTFExporter). Un `.glb`
   part tel quel : sa compression (meshopt) est gardée. Le Draco est refusé
   avec un motif nommé.
2. **Les plans vivent hors de `/config/www/`.** Tout ce qui s'y trouve est
   servi en `/local/…` sans connexion : un plan de maison n'a pas à être en
   libre accès. Ils vont dans `/config/loggia/plans/<étage>.glb`, servis par
   une vue HTTP **authentifiée** du composant (`/api/loggia/plan/<étage>`,
   lecture pour tout compte connecté, dépôt et retrait pour un
   administrateur, 40 Mo au plus, écriture temporaire puis renommage). Le
   fichier ne passe jamais par le magasin ; sa fiche, si (`loggia_plan3d`).
3. **Automatique d'abord, puis toucher pour relier.** Loggia lit ce que le
   modèle porte : un objet nommé comme une entité (`light.salon`, convention
   floor3d), un groupe nommé comme une zone, un sol `sol_<pièce>` — par son
   nom, sinon par la pièce qui le recouvre vu du dessus. Ce que les noms ne
   disent pas se relie en mode édition : toucher un objet, choisir un appareil
   ou une pièce, ou le délier. La liaison porte sur le **nom** de l'objet,
   vit sur le serveur (clé commune, administrateur) et survit à un nouvel
   import du même modèle. Le manuel prime toujours.
4. **Un plan par étage** de Home Assistant, choisi par les puces d'étage déjà
   là ; « Tous » montre le plan `maison`.
5. **Le plan montre, il ne commande pas.** Lumières (l'ampoule et une lueur),
   volets (les lames suivent `current_position`), température de chaque pièce
   (le sol prend la couleur de sa zone de confort). Toucher une pièce l'ouvre
   comme sa carte ; une lampe ou un volet ouvre sa fiche. Rien ne s'allume
   d'un toucher sur le plan.
6. **La démo a sa maison**, inventée et générée par un script
   (`scripts/maison_demo.mjs`) — jamais le modèle d'un utilisateur.

## Ce que le premier modèle réel a appris

- GLTFLoader **retire les points des noms** (`light.salon` → `lightsalon`) :
  le nom d'origine se lit dans `userData.name`.
- Seul le nœud le plus haut est l'appareil : `light.salon_cordon` n'en est
  qu'une pièce. Délier un appareil emporte son contenu.
- Deux lampes qui partagent un matériau s'allument ensemble : chaque appareil
  reçoit sa copie. (La déduplication de gltf-transform les avait fusionnés.)
- Un volet enregistré **ouvert** a ses lames empilées dans le coffre : on les
  étale du bas du coffre au bas des coulisses.
- Les fils et cordons de suspension ne captent pas le toucher : il passe à la
  table derrière.
- Le cadrage se calcule à la taille réelle du cadre, coins de la maison
  projetés ; un cadre large regarde la maison de face, un téléphone en
  diagonale.

## Les portes et fenêtres (le correctif de Claude Design, même jour)

Le modèle découpe ses ouvertures en battants `*_ouvrant`, chacun posé sur sa
charnière (son origine). Un objet relié à un capteur d'ouverture
(`binary_sensor`), ou à un `cover` qui n'est pas un volet à lames, pivote
autour de la verticale :

- enregistré **tourné** (les fenêtres à 80°, la baie à 50°) : cet angle est
  l'ouverture, et fermer le ramène à 0° ;
- enregistré **à plat** (les portes) : il s'ouvre à 90° **vers la pièce qu'il
  nomme** (`porte_chambre_ouvrant` → `sol_chambre`, la plus longue l'emporte),
  sinon du côté où il ne rentre pas dans un mur ;
- ouvert, il prend une **teinte ambre** — la porte dessinée des pièces ;
- un battant que **rien ne relie** est montré **fermé** : un modèle enregistré
  fenêtres ouvertes les aurait sinon laissées ouvertes à vie.

Le test qui l'épingle a trouvé un défaut que l'essai à l'œil avait laissé
passer : une porte de 4 cm, rognée de 2 cm par côté pour mesurer ce qu'elle
touche, devenait une boîte vide dont le centre vaut 0 — la pièce nommée ne
jouait plus, et le bon sens ne tenait qu'à la règle des murs.

## Addendum du 20 octobre — le plan se masque

« Dans Paramètres → Apparence → Affichage, on pourrait ajouter l'option pour
afficher ou non la partie plan. » Une ligne **« Plan 3D de la maison »**, à
côté de la barre de navigation : coupée, le bouton « Plan » disparaît de la
section Pièces et les pièces restent en cartes ; le choix enregistré
revient tel quel quand on la rallume. Le réglage vit dans `look`
(`LOOK_DEF.plan`, vrai par défaut) : comme la teinte ou les fonds, il suit
le profil et un écran peut avoir le sien (ADR 0223). Rien côté serveur.

## Ce qui reste ouvert

- Ajouter la vue HTTP demande un **redémarrage de Home Assistant**.
- Les textes polonais nouveaux sont à faire relire.
