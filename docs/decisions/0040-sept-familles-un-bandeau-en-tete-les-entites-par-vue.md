# 0040 — Sept familles d'objets, un bandeau d'édition en tête, les entités réglées vue par vue

Date : 17/09/2026 (v3.41.0). Statut : acceptée — la répartition des familles
est une PROPOSITION demandée par l'utilisateur, révisable d'un mot. Quatre
retours du même jour : « je trouve qu'il y a trop de filtres, sur mobile c'est
pas agréable ; déjà caméra on peut l'enlever, capteur peut sûrement en recevoir
plus, je pense aussi que l'on peut faire un IoT — réfléchis-y et propose-moi
quelque chose » ; « la barre mode édition, pourquoi elle n'est jamais au même
endroit ? place-la en haut comme les autres, peu importe la vue » ; « dans
Paramètres supprime la barre mode sombre / clair » ; « retire la section Entités
également, on peut déjà gérer cela sur les pages respectives ; la seule que je
ne peux pas modifier encore, que tu vas ajouter, c'est la météo ».

## Contexte

- **Les filtres de la vue Objets** : treize définis, onze affichés chez lui.
  Au téléphone la rangée défile : une puce qu'il faut aller chercher ne filtre
  plus rien.
- **Le bandeau d'édition** vivait en bas dans une pièce, au milieu dans
  l'Énergie (sous « Postes de consommation »), et se dédoublait dans les Volets
  et la Sécurité, où une seconde barre (`ViewEditBar`) portait « Entités de la
  vue ». Les vues personnalisées avaient la leur, sans « Terminer » ; les
  Scénarios n'en avaient pas.
- **Paramètres** : la barre « Mode Sombre / Clair » du sommaire doublait
  Apparence. L'onglet Entités doublait la fiche « Entités de la vue » de chaque
  page — sauf pour trois listes qui n'avaient AUCUNE fiche joignable (prises
  traitées comme lumières, lecteurs, zones de chauffage : la vue Objets ne
  recevait pas le bouton) et pour la météo, orpheline depuis le retrait de la
  vue Météo.

## Décision

1. **Sept familles** : Lumières · Volets · Chauffage · IoT · Multimédia ·
   Capteurs · Jardin (+ « Tous », et « Favoris » s'il y a une épingle).
   - **IoT** = ce qui se branche et travaille seul : prises et interrupteurs,
     aspirateur, ventilateur, humidificateur, vanne, distributeur, tondeuse.
     Il tient la PLACE des prises dans l'ordre : la grille automatique ne saute
     pas.
   - **Capteurs** reçoit la présence et les plantes — une plante est un
     bouquet de capteurs.
   - **Les caméras n'ont plus de puce** : elles restent sous « Tous » ; leur
     place est la vue Sécurité et l'Accueil.
   - **Jardin reste** : c'est le seul filtre de LIEU, et personne n'a demandé
     son départ. La tondeuse y figure toujours, zone ou pas.
   - **Au téléphone** (≤ 560 px) : l'icône seule, les puces se partagent la
     largeur — UNE ligne, sans défilement (huit puces de 40 px à 390 px). Le
     mot reste dans `aria-label` et `title`, et le titre sous la rangée dit le
     filtre choisi. Ailleurs la rangée garde ses mots et défile si elle déborde.
2. **Un bandeau, une place.** `BandeauEdition` est le PREMIER enfant du
   contenu dans toutes les vues qui s'éditent : Accueil, pièce, Objets,
   Scénarios, Volets, Énergie, Sécurité, vues personnalisées. Il porte
   désormais `onEnt` (« Entités de la vue », libellé `entLabel`) et `texte`
   (le mot d'ordre, là où l'on ne glisse pas de carte). `ViewEditBar` et la
   barre maison des vues personnalisées sont supprimées ; le bouton « Ajouter
   un scénario » quitte l'en-tête pour le bandeau.
3. **Le sommaire des Paramètres n'a plus de barre.** Le mode (Auto / Foncé /
   Clair) se règle dans Apparence, avec le thème qu'il accompagne.
4. **L'onglet Entités s'en va**, avec ce qui ne menait qu'à lui : sa carte,
   le bouton « Entités » des lignes de l'onglet Vues, l'entrée de la recherche
   et le droit `entites` (une case qui n'ouvre rien promet). Aucune liste ne
   reste orpheline :
   - la **météo** entre dans la fiche de l'Accueil, où vit sa carte ; la fiche
     écrit `loggia_weather`, que `weatherEntity` lit partout ;
   - la **vue Objets** reçoit « Entités de la vue » sur ses quatre routes :
     prises-lumières, lecteurs, zones de chauffage (les routes Lumières, Climat
     et Médias n'ouvrent que la leur) ;
   - **« Détecter automatiquement »** suit les pièces dans la fiche de
     l'Accueil ; son calcul devient `detecterCapteursPieces` (src/resolve.js),
     pur : la zone Home Assistant d'abord, le nom ensuite, jamais contre un
     choix qui marche.

## Ce qui part avec l'onglet (dit, pas caché)

- **« Synchronisation entre accès »** (copier / coller le stockage du
  navigateur d'un accès à l'autre) : son texte n'était plus vrai — depuis le
  03/09 la configuration de la maison vit sur le serveur et suit tous les
  accès. L'export et l'import COMPLETS restent dans « À propos ». Les deux
  fonctions `exportLoggiaConfig` / `importLoggiaConfig` restent dans
  `state.js`, sans appelant : à retirer avec leur test si rien ne les reprend.
- **« Rétablir les défauts » des entités** : une remise à zéro de TOUTES les
  listes n'a pas sa place dans la fiche d'UNE vue. « Réinitialiser Loggia »
  reste dans « À propos ».

## Variantes proposées pour les familles

- **B** — sans « Jardin » (six familles) : ses appareils restent sous leur
  famille ; on perd le seul regroupement par lieu.
- **C** — « Prises » à part, IoT = ménager + tondeuse (huit familles) : plus
  lisible pour qui a beaucoup de prises, mais la rangée du téléphone se serre.
- Écartée : fondre « Multimédia » dans l'IoT — la route Médias arrive sur ce
  filtre.

## Conséquences

Ce qui range un appareil reste dans `src/objets.js` (`OBJ_ORDRE`,
`DOMAINES_IOT`, `filtresObjet`), pur et testé à sec. Garde-fous :
tests/edition_en_tete.test.mjs (le bandeau premier enfant dans les huit vues,
une seule barre, chaque section d'entités joignable depuis une vue dont la
route passe `onEnt`, la détection), tests/objets.test.mjs réaligné (aucune
famille sans puce), 34 mutations tuées. Le filtre mémorisé d'une famille
disparue retombe sur « Tous ». Non fait : le compte sur chaque puce, un
bandeau qui resterait collé en haut pendant le défilement.

## Ajustement du 17/09 (v3.41.1) — la réponse

La proposition a été tranchée le jour même : « C, les prises n'ont rien à faire
dans IoT. IoT correspond aux appareils — robot, distributeur ; une prise c'est
une prise. Je vois qu'il y a toujours Jardin aussi, pourtant il y a un robot
dedans et une prise. »

- **« Prises » revient à part** (interrupteurs et `input_boolean` qui ne sont
  pas déclarés lumières), avec son icône de prise.
- **« IoT » = les appareils**, ce qui travaille seul : robot aspirateur,
  tondeuse, distributeur, ventilateur, humidificateur, vanne.
- **« Jardin » s'en va** : c'était la seule famille de LIEU au milieu de
  familles de NATURE, et tout ce qu'elle montrait a déjà la sienne — son robot
  est de l'IoT, sa prise une prise. Être dehors ne range plus nulle part ;
  `filtresObjet` ne lit plus `dehors`.
- **L'ordre** : Lumières · Volets · Chauffage · Prises · Multimédia · IoT ·
  Capteurs — ce que l'on commande d'abord, du plus courant au plus rare, puis
  ce qui mesure. Toujours sept familles ; chez lui huit puces avec « Tous »,
  sur une ligne au téléphone.

La section « Décision · 1 » ci-dessus décrit donc la proposition d'origine ;
c'est cet ajustement qui fait foi. Leçon : un mot technique (« IoT ») ne se
remplit pas par déduction — pour lui ce sont des APPAREILS, pas « ce qui se
branche ». Garde-fous : tests/objets.test.mjs (aucune puce sans appareil
possible, aucun appareil sans puce), 20 mutations tuées.
