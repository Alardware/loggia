# 0188 — La carte et la fiche du volet

*12 octobre 2026 — accepté, à l'essai (plan 2 du chantier Volets, rien de publié)*

## Le problème

> « dans le même esprit que pour les radiateurs, le temps que je test le
> chauffage » — 12 octobre

> « par contre garde les tailles actuel de mes cartes » — 12 octobre

Sa maquette « Cartes volets » (cadres 1a à 1e) donnait au volet ce que le
chauffage venait de recevoir : une carte qui dit ce qui va se passer, et une
fiche à onglets. La carte d'avant (`RoomCoverCard`) montrait une glissière et
un mot d'état ; sa feuille (`RoomCoverSheet`) trois puces et une jauge. Rien ne
disait quand le volet bougerait, ni qui l'avait bougé.

## La décision

**La maquette, dans le gabarit et aux tailles actuelles (V1).** 184 de haut ;
225 de large dans la grille d'Objets, 176 au téléphone ; la compacte, 88. La
plaque seule en haut à gauche, un petit volet dessiné en haut à droite qui suit
la position, le nom SOUS l'icône avec de l'air, la phrase d'état, le
pourcentage en grand ; Monter, Stop, Descendre en bas, et plus de glissière.
Une requête de conteneur adapte le contenu de la carte étroite, sous 188 px de
contenu : le petit volet s'efface, le pourcentage monte en haut à droite, la
phrase passe sur deux lignes (remplacé le 15/10 : le pourcentage reste à droite
du nom, la phrase tient sur une ligne — voir plus bas), le mot « Stop » ne garde
que son carré. La carte garde sa taille. Monter et Descendre, inertes en bout de
course, le sont par `aria-disabled` et non par `disabled` : devenus `disabled` à
l'arrivée d'une course, ils faisaient tomber le focus sur la page.

**15/10 — le pourcentage d'un volet prend la place de la température d'un
radiateur.** Son retour, au téléphone : « pourquoi le % et en haut entre l'icone et
le toggle, pour le volet de la chambre aussi alors que les radiateur lui c'est bien
placé ». Sous 188 px de contenu, le pourcentage ne monte plus en haut à droite, et la
phrase ne passe plus sur deux lignes : la carte prend la disposition étroite du
radiateur, comme celle d'une lumière (ADR 0197, même date). Le pourcentage s'écrit UNE
fois (`ChiffreVolet`, sans variante haute), à la première rangée, deuxième colonne de la
grille du milieu (`RM_MILIEU`) : à droite du nom, en 20 px et « % » en 12, à 4 px de lui ;
le nom en 13 px sur deux lignes au plus, passé à la ligne entre deux mots ; la phrase
dessous, sur toute la largeur, en UNE ligne — 12 px, puis 11 d'après sa longueur
(`--o-n`) —, « … » si elle ne tient pas à 11 px ; la ligne du haut ne porte plus que la
plaque, le petit volet restant caché. Budget en hauteur, celui du radiateur : 38 + 10 +
32 + 2 + 15 + 9 + 44 = 150 px. Une carte large ne change pas. Mesuré dans la démo
(390, 360 et 320 px ; français, allemand, polonais ; Objets › Volets, Pièces › Bureau et
Chambre) : 184 px, rien ne dépasse, aucun mot coupé dans le mot, et 0 px d'écart avec la
température d'un radiateur de la même grille, à nom de même nombre de lignes.
« … » restent, à 11 px : « Ouvre demain à hh:mm » à 320 px en français (114 px pour 107 à
113), « Öffnet morgen um hh:mm » en allemand (127,9 px, jusqu'à 360 px dans Objets),
« Ochrona przeciwsłoneczna » et « Otworzy się jutro o hh:mm » en polonais.

**15/10, le soir — la carte étroite suit la grille commune (passe téléphone, ADR 0202 ;
« ok pour 1c »).** Ce que le paragraphe précédent dit de la carte ÉTROITE est REMPLACÉ ;
la carte large ne change pas. Sous 188 px de contenu, le pourcentage monte en haut à
droite, face à la plaque (`ChiffreHaut`, 22 px) ; le nom passe EN ENTIER sur toute la
largeur, en 14 px sur deux lignes au plus ; la phrase dessous, sur une ligne, de 12 à
10,5 px ; Monter, Stop et Descendre se partagent la ligne du bas, « Stop » sans son mot,
le petit volet caché.

**La compacte garde sa disposition** — l'icône, ▲ ▼ — et ne prend que la phrase
d'état et la position de la course. Sur un téléphone de 320 px, sa case fait
141 × 88 pour 113 px de contenu, et l'icône, ▲ et ▼ en demandaient 120
(26 + 9 + 38 + 9 + 38) : ▼ passait à la ligne, la rangée montait à 89,9 px et
cinq éléments sortaient de la carte. Sous 120 px de contenu, ▲ ▼ passent de 38 à
32 px (108 px), la rangée retombe à 59,9 px et plus rien ne sort. L'icône
reste : le thermostat compact l'avait perdue, et il l'avait redemandée.

**La phrase d'état, et son ordre (§ 4).** Une seule décision (`ligneVolet`,
`voletecran.js`) : muet, en course, à l'abri du vent, protection solaire,
fermeture en attente d'une porte, le prochain mouvement UTILE (ni l'ouverture
d'un volet ouvert, ni la fermeture d'un volet fermé), rien de prévu, le mot
d'aujourd'hui. Deux jeux de mots : courts sur la carte, au démarrage ; longs
dans la fiche, chargés avec elle.

**L'en-tête d'Objets › Volets**, chargé à la demande, compte les volets (« 2
volets · 1 ouvert ») et lance Tout ouvrir, Tout fermer et, pendant une course,
Tout arrêter — pour les volets que le filtre montre, jamais pour un garage ni
un portail (V3). Au téléphone, le mot des puces s'efface et l'icône reste ; à
760 px et moins, l'en-tête ne dit plus « · n en mouvement » : chaque carte dit
déjà « En fermeture », et avec lui l'en-tête passait de 40 à 67 px le temps
d'une course — les cartes descendaient de 27 px, ce que la règle « rien ne
saute » refuse. Le compte passe à la ligne dans sa colonne (« 4 Rollläden · 3
offen »).

**La fiche à trois onglets** — Accueil, Planning, Historique —, chargée à la
demande (`fichevolet.jsx`).

- **L'Accueil.** Le grand chiffre ; la fenêtre, qu'on glisse au pas de 5 % ou
  qu'on touche, avec ses repères ; Monter, Stop, Descendre ; puis Prochain
  mouvement, Porte devant, Dernier mouvement, L'appareil. Au clavier, la fenêtre
  se règle par RAFALE : chaque touche vise un pas plus loin que la cible en
  cours (celle de la rafale, sinon du geste, de la course, de la position), la
  cible en tirets et « Relâchez pour aller à n % » la suivent, et UN seul ordre
  part, quand la touche est relâchée ou après 500 ms sans touche — aucun si la
  rafale revient d'où elle partait. Il en partait un par touche, compté depuis
  la position dessinée : quatre appuis depuis 60 % envoyaient quatre fois 55,
  une flèche tenue 361 ordres en 12 s. « Porte devant » parle du mouvement
  UTILE, celui de la phrase et de « Prochain mouvement » : le salon ouvert saute
  son ouverture du matin, sa fermeture du soir attendra. La phrase datée (« Si
  elle l'est encore à 20:54, la fermeture attendra. ») ne vaut que pour une
  fermeture d'aujourd'hui.
- **Le Planning.** Comme les autres · Heures à lui · Jamais ; la semaine,
  calculée par le jumeau du serveur (`voletsplanning.js`) ; les décalages et
  les jours ; la façade et la porte devant, qui allument leur règle (V11) ; le
  mode de la maison. Pour un compte ordinaire, tout se lit et rien ne s'écrit
  (V10) : un appui dit le refus, qui nomme la clé `loggia_volets`, SOUS la
  rangée touchée — en tête d'un onglet qui défile, il se lisait hors de vue.
  Les écritures passent en FILE, sur une lecture fraîche : le serveur remplace
  les tables qu'il reçoit, et un patch bâti sur le dernier sondage effaçait ce
  qu'un autre appareil venait d'écrire. Avant la première écriture d'une série,
  la configuration se relit ; chaque patch se bâtit au moment d'écrire, sur
  celle que rend l'écriture précédente (après un échec, sur une relecture) ; une
  seule écriture en vol. L'affichage, lui, se montre d'avance et expire
  (`useOptimiste`).

  14/10 — une relecture qui échoue n'écrit plus rien (trouvé par la relecture
  finale des prises) ; une réponse dépassée garde le cache.
- **L'Historique.** 24 h ou 7 jours ; la courbe en escalier ; les manœuvres et
  qui les a faites. Les positions se lisent SANS filtre
  (`significant_changes_only=0`) : sans lui, un passage de 60 à 30 % sans
  changer d'état disparaissait. Des changements à moins de 4 minutes font une
  seule manœuvre (la bascule Netatmo et la position qui arrive deux minutes
  après) ; un groupe qui revient à la position d'avant n'en est pas une. Qui
  l'a faite : la ligne du journal (`loggia/volets/manoeuvres`) de 180 s avant à
  60 s après — de 360 s avant quand l'état n'a pas basculé : une protection
  solaire ne le fait pas, son groupe date de l'arrivée de la position, et à
  185 s l'ancienne fenêtre concluait « À la main » à tort. Une ligne ne fait
  qu'une manœuvre. Sans ligne, « À la main » ne se dit que si le journal couvre la
  fenêtre utilisée ; sinon, pas de pastille : on ne dit pas « à la main » sans
  le savoir.

**Les colonnes suivent les mots longs.** Mesurées dans la démo à 360 et 320 px,
en français, en allemand et en polonais, les colonnes de la fiche débordaient ou
coupaient leurs mots ; elles suivent maintenant le plus long. La colonne des
repères de l'Accueil se règle sur son mot le plus long (« Geschlossen » sortait
de 13 px de ses 64 px). Au Planning, le « − valeur + » de « Heures à lui » passe
sous son titre quand la place manque, les rangées › font passer leur valeur à la
ligne (seul un nom d'entité, la porte, peut finir en « … »), la colonne des
heures prend sa place, et l'échelle de la semaine efface ses quarts (6 h, 18 h)
quand la piste est trop étroite pour qu'ils ne se touchent pas. À l'Historique,
la pastille « qui » passe SOUS le texte de la manœuvre — à côté, elle l'écrasait
jusqu'à un mot par ligne, ou le recouvrait en polonais —, et la colonne des
étiquettes de la courbe prend la largeur de son mot le plus long.

**Le garage et le portail gardent les leurs (V3).** Un volet se reconnaît à sa
classe (`shutter`, `blind`, `shade`, `curtain`, `awning` ; ADR 0137) ; les
autres `cover` gardent leur carte (`RoomCoverCard`) et leur feuille
(`RoomCoverSheet`). Une icône choisie reste (V7) ; sinon l'icône suit l'état.

**Ce qui part** — la maquette ne le montre pas, et on le dit. De la carte d'un
volet : la glissière. De sa fiche : la glissière horizontale, les puces Fermé /
Mi-course / Ouvert, la rangée « Auto lever / coucher » et sa bascule (remplacées
par Comme les autres / Heures à lui / Jamais), « Position · Course mesurée par le
moteur », « Stop · Arrête le moteur là où il est », et « Dernier changement »
(remplacé par « Dernier mouvement »).

**La borne du démarrage tient.** Elle avait 3 025 octets de marge pour un écran
qui en demandait près de 15 000 (+14 968, mesurés sur une copie). Elle ne s'est
pas relevée : trois écrans que l'Accueil n'affiche pas passent à la demande —
l'écran de veille (−6 903), la saisie du code d'un profil Admin (−3 635), le
formulaire d'un rendez-vous (−4 131), chaque gain mesuré seul —, et l'en-tête
d'Objets › Volets comme la fiche naissent à la demande. Au 13/10, le boot pèse
1 096 761 octets pour 1 100 000.

**Le contrat avec le serveur** est celui du plan 1 (`a_venir`,
`protection.position`, `manoeuvre`, `loggia/volets/manoeuvres`) ; la durée de
`manoeuvre` est celle de l'ADR 0192. L'écran ne lit pas `protection.position`.

## Ce qu'on n'a pas fait

- **Relever la borne du démarrage** : c'est une décision à part, et elle
  n'était pas nécessaire.
- **L'appui long** sur les cartes (V9, § 13) : un chantier à part, pour toutes.
- **Sortir de Paramètres les réglages volet par volet (V2)** et faire remplacer
  par les jours d'un volet ceux de la maison (V5) : ils attendaient son accord
  à l'écriture de cette décision. Il les a acceptés le 13/10 : c'est l'ADR 0191,
  et la fiche est désormais le seul endroit où un volet se règle.
- **La barre de position** de la maquette, optionnelle et éteinte par défaut.

## Ce que les tests tiennent

`tests/voletecran.test.mjs` (la phrase, chaque ligne du § 4),
`tests/voletsetat.test.mjs`, `tests/carte_volet.test.mjs` (la carte, la
compacte à 320 px, l'en-tête et sa version téléphone, la fabrique, Monter et
Descendre en `aria-disabled`), `tests/voletsfiche.test.mjs` (la phrase longue,
les patchs, la file des écritures, les manœuvres et leur fenêtre de 360 s),
`tests/fichevolet.test.mjs` (la fiche jouée : la rafale du clavier, le refus
sous la rangée, « Porte devant », les colonnes des mots longs, la file des
écritures sur le vrai magasin),
`tests/demo_volets.test.mjs` ; et la borne, `tests/lot14_chargement.test.mjs`,
avec `tests/recharge.test.mjs`.
