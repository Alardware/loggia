# 0147 — Une carte n'avale plus ses commandes

Date : 04/10/2026. Statut : appliqué. Pas de redémarrage de Home Assistant :
seul l'écran change.

Le lot 13 de l'audit du 03/10 : la structure des cartes et des modales, pour
un lecteur d'écran et pour qui pilote à la voix. L'ADR 0074 avait réglé la
carte d'une pièce ; les autres cartes étaient restées comme elle était avant.

**Ce qui se passait.** Une carte qui s'ouvre était elle-même un bouton
(`role="button"`, ou un vrai `<button>` pour la lampe). Or un rôle bouton rend
sa descendance présentationnelle : l'interrupteur et le curseur d'une lampe,
« Fermer » d'un volet, − / + d'un thermostat, « Pause » d'un robot pouvaient
disparaître d'un lecteur d'écran. axe-core, dans la démo : 23 cartes
englobantes sur Objets, 39 en mode édition, 5 dans le salon, 3 sur Volets, 3
sur l'Accueil, 1 sur Scènes (le réglage de luminosité contenait ses boutons).

Et leurs noms taisaient ce qu'elles affichent : « Ouvrir Volet salon » pour
une carte qui montre « Volet salon · Ouvert à 60 % », alors que le bouton
« Ouvrir » juste à côté LÈVE le volet ; « Voir l'énergie » pour une tuile qui
affiche « ↑ 460 W Export réseau ». Qui pilote à la voix nomme ce qu'il voit
(WCAG 2.5.3) ; la commande « Export réseau » ne trouvait rien.

**Le motif, un seul pour toutes les cartes** (`src/ui.jsx`) :
- `Surface` : le geste « ouvrir » passe par un bouton transparent, FRÈRE des
  commandes, premier enfant de la carte. Il la couvre et passe sous tout
  enfant positionné : les commandes, `position: relative` une à une — pas
  leur rangée, dont les écarts ne répondaient plus (relecture du lot 13) —,
  reçoivent leurs clics ; le texte laisse passer le clic vers lui. Rien ne
  bouge à l'œil — mesuré : styles calculés et géométrie identiques à 1440 et à
  390 px, et chaque point de chaque carte tombe soit sur la surface, soit sur
  une commande.
- `nomCarte` : la surface s'appelle par ce que la carte affiche, nom puis
  état (« Volet cuisine, Ouvert à 60 % ») ; `aria-haspopup="dialog"` dit
  qu'elle ouvre une fiche. Les commandes nomment leur appareil (« Fermer Volet
  cuisine », « Supprimer Plafonnier Bureau »).
- Une carte SANS commande intérieure (plante, météo, barre de confort) garde
  son rôle bouton : ce n'est pas un défaut. Seul son nom change, selon la même
  règle.

Converties : les cartes d'appareil (générique, lampe, machine, distributeur,
volet, thermostat, fil pilote, lecteur), le kit et les pièces du mode
édition, les sections et tuiles de l'Accueil en édition, « En ce moment »,
« À surveiller », les cartes des vues personnalisées et leur éditeur, l'écran
de veille, les jours de l'agenda et les passages planifiés du robot.

**Deux défauts trouvés en mesurant**, présents depuis l'ADR 0074 :
- l'anneau de focus d'une surface ne se voyait jamais : tracé 2 px dehors, il
  était rogné par la carte (`overflow: hidden`). `.o-surface` le trace en
  dedans ;
- `button:active` rétrécissait la surface DANS la carte qui se rétrécit déjà :
  un appui près du bord, relâché hors d'elle, n'ouvrait rien. La surface ne
  s'enfonce plus d'elle-même ; la carte garde son enfoncement au press, rendu
  par une règle à elle (elle n'est plus un `[role="button"]`).

**Les tuiles de la bannière** disent leur valeur, leur libellé, puis où elles
mènent : « ↑ 460 W, Export réseau, Voir l'énergie ». Le libellé, écrit en
capitales dans le dessin, se lit en casse de phrase : une synthèse vocale
épelle volontiers un mot court en capitales.

**Les deux modales faites main de Paramètres** (« Modifier ce profil », « Vue
personnalisée ») deviennent des feuilles (`BottomSheet`) : rôle, nom, Échap,
fond inerte, focus rendu au bouton qui les a ouvertes. Leur « Annuler », qui
ne faisait que fermer, part (une seule croix). Les huit pastilles de couleur
s'appelaient toutes « Couleur du profil » : chacune dit sa couleur et
`aria-pressed` celle qui est prise. Une seule clé nouvelle, « Orange ».

**Texte polonais NOUVEAU à soumettre à Seba882** (aucune de ses valeurs
n'est touchée, ADR 0141) : « Orange » → « Pomarańczowy », sur la forme de
ses « Zielony », « Różowy », « Fioletowy ».

**Le menu de l'assistant** passe par `ListeChoix`, qui gagne une prop
`disabled` : on ne change pas d'assistant pendant une réponse ni pendant
l'écoute. Le bouton-titre garde son dessin. L'identifiant en petit de
l'option choisie passe en blanc plein : à 78 %, il tombait à 3,54:1 sur le
bleu (4,7:1 en blanc, la règle des puces choisies). Les autres appelants de
`ListeChoix` ne changent pas.

**Après le lot**, axe-core dans la démo : `nested-interactive` à zéro sur
toutes les vues mesurées (Objets, édition, salon, Volets, Scènes, Accueil,
Sécurité) ; aucun nom manquant, aucune feuille sans nom.

**Comment c'est vérifié.** Dix fichiers de tests nouveaux
(`tests/lot13_*.test.mjs`), chacun rouge sur le code d'avant le lot ; une
dizaine d'épingles réalignées sans changer leur intention ; un filet qui
refuse une modale plein écran faite main hors de `ui.jsx`. Dans la démo :
clics réels (le volet se ferme sans ouvrir de fiche, le texte de la carte
l'ouvre), Échap et retour du focus, glisser et clavier du mode édition.

**Reste, hors du lot** : les compteurs des filtres d'Objets (opacité 55 %) et
le texte `#06121f` des boutons principaux manquent le contraste — lot 15.

## Relecture

Une relecture contradictoire en cinq angles a confirmé 21 constats, presque
tous de gravité basse ou faible, et en a écarté deux. Chaque correctif a été
préparé puis contesté, et ses tests échouent sur l'état d'avant.

- **Le bouton de taille en mode édition** annonçait l'inverse de son état
  (« Deux rangées, enfoncé » sur une carte d'une rangée). Il garde un nom,
  « Une rangée · X », et dit son état par `aria-pressed`, dans le même sens
  sur les cartes et sur les pièces.
- **En mode édition, le contenu de l'Accueil** était inerte au doigt mais
  pas au clavier : Tab menait à « Lancer Soirée », et Entrée le lançait. Le
  contenu des sections, la rangée des scénarios et les favoris sont `inert`
  en édition ; « Gérer les scénarios » reste joignable. La barre d'outils des
  favoris nomme sa carte, et sa bascule de largeur garde un nom.
- **Une consigne de thermostat** (« 22 °C ») n'ouvrait plus la fiche, ni les
  écarts entre les boutons : la rangée entière était positionnée. Ce sont
  désormais les commandes, une à une.
- **L'aperçu de la galerie d'ajout** gardait un bouton dans un bouton : il
  devient un conteneur, choisi par sa propre surface (`aria-pressed`).
- **Des noms** : la plante dit son humidité, les tuiles de pièce de l'Accueil
  disent leur température et leur état (la clé « Ouvrir la pièce {piece} »,
  plus appelée, sort des catalogues), un capteur en panne dit
  « Indisponible » au lieu de lire « — », un verdict n'est plus lu en
  capitales, le bouton lecture d'une vue personnalisée dit « Lire » (un
  geste) et plus « Lecture » (un état). La météo et la barre de confort,
  restées boutons, décrivent le reste de ce qu'elles affichent
  (`aria-describedby`).
- **Le repère de pile** passe au-dessus de la surface : sa bulle « Pile N % »
  revient, et un appui ouvre toujours la fiche. L'intertitre en édition
  retrouve le rebond de son enfoncement. Sur l'écran de veille, toucher
  l'horloge vibre de nouveau.
- **Le piège de focus des feuilles** ignore les boutons désactivés : pendant
  l'écoute de l'assistant, Maj+Tab sortait de la feuille. Après
  « Supprimer » un profil, le focus va au titre de la vue au lieu de tomber
  sur la page.
