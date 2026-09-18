# 0051 — L'écoute des interrupteurs se coupe, les puces choisies en bleu plein

Date : 18/09/2026 (v3.52.0). Statut : acceptée. Demande, en retour de la
v3.51.0 : « pour les interrupteurs, il est toujours à l'écoute ; une fois les
interrupteurs désirés configurés je devrais pouvoir le désactiver, de façon à
ce qu'il n'y ait pas une multitude d'autres interrupteurs qui apparaissent —
peut-être même ajouter un minuteur comme zigbee2mqtt » ; « pour la
navigation, la couleur des boutons ça va pas, mets-les tous en bleu texte
blanc comme sur l'image avec Séjour » ; « pour la carte climat, on pourrait
ajouter la consigne entre les deux boutons + et − » ; « me soutenir en
dessous ».

## Contexte

Le composant inscrivait chaque appui de chaque télécommande de la maison :
la page des Interrupteurs se remplissait de tout ce qui passait, réglé ou non.
Les puces choisies avaient deux dessins selon la vue : bleu plein dans les
Règles, teinte pâle et texte bleu ailleurs (filtres d'Objets, pièces,
onglets). Les cartes climat des pièces n'avaient rien entre − et +.

## Décision

- **L'écoute d'apprentissage** (`interrupteurs.py`) : coupée au démarrage,
  ouverte pour cinq minutes (`ECOUTE_S`, borne `ECOUTE_MAX_S` = 15 min) par
  la commande `loggia/interrupteurs/ecouter` (`duree`, administrateurs
  seulement), refermée d'elle-même. Coupée, **rien ne s'inscrit** — ni
  journal, ni appareil vu ; un bouton déjà réglé **marche toujours** : l'écoute
  ne commande que ce qui s'inscrit, jamais ce qui s'exécute. `etat` rend
  `ecoute: {active, reste}`.
- **À l'écran**, comme l'appairage de zigbee2mqtt : « Écouter 5 min », puis
  « Arrêter l'écoute 04:11 » qui compte à rebours. Écoute coupée, la page ne
  montre que les télécommandes réglées et cache les derniers appuis
  (`appareilsVisibles`) ; le sommaire compte la même chose.
- **Les puces choisies en bleu plein, texte blanc** (`--o-accent-fond`,
  `#fff`) : pièces, filtres d'Objets, composeur de scénarios, options d'une
  liste, modes des Volets, style d'un widget, pièces Hue, Puissance /
  Consommation, onglets de la bibliothèque et de la fiche d'un robot, séries
  du Système, choix de l'éditeur de profil. Restent en couleur les puces dont
  la couleur **dit** quelque chose : zones des robots, modes d'une fiche par
  domaine, icônes teintées d'une pièce.
- **La consigne entre − et +** sur les deux cartes climat des pièces
  (thermostat, fil pilote) : « 19 °C », « 19,5 °C ». Le sous-titre dit l'état
  seul — la valeur n'est plus dite deux fois.
- **À propos** : la pastille Ko-fi, inchangée, passe sous la zone rouge.

## Conséquences

Côté serveur : une commande WebSocket de plus, rangée parmi celles des
administrateurs (test_websocket_api) ; l'écoute se teste sans Home Assistant
(test_interrupteurs, 6). **Redémarrage de Home Assistant requis** pour que
l'écoute se coupe : avant, l'ancien composant écoute toujours, et « Écouter
5 min » répond une erreur. La démo simule l'écoute. Tests JS :
parametres_maquettes.test.mjs (+4).

## Amendement (18/09/2026, v3.52.1) — plus d'exception

Demande : « mets aussi les zones et modes en bleu ». Les puces gardées en
couleur passent au bleu plein, texte blanc : modes d'une fiche (`FichePuces`
perd sa couleur par domaine — le rouge du climat, le violet du volet), modes
du fil pilote, options des menus déroulants, zones et jours des robots, cases
des zones. Une zone garde un petit carré à sa couleur, dans la puce comme dans
la liste : c'est lui qui la relie à la carte. Les icônes d'état des cartes
(RM_ICO) ne sont pas des puces et gardent leurs teintes.

## Amendement (18/09/2026, v3.52.2) — le menu sous son bouton, la barre de confort à la norme

Demande : dans les Scénarios, le sélecteur « Collection » « n'apparaît pas en
bleu comme les autres sélecteurs, et la sélection apparaît en bas de page au
lieu de se dérouler au niveau du bouton » ; dans les Pièces, la barre de
l'indice de confort est « trop épaisse […] qu'elle respecte les mêmes normes
que dans Scénario ».

- Le bouton du menu déroulant passe au bleu plein, texte blanc.
- Le menu est rendu dans `<body>` (`createPortal`). Le flou de `.o-bar`
  (`backdrop-filter`) faisait de la barre le repère de son `position: fixed` :
  le menu se plaçait 450 px trop bas. Un appui dans le menu ne compte plus
  comme un appui dehors ; z-index 9000, au-dessus des feuilles (200) ; il
  porte son propre flou.
- La barre de confort prend la hauteur de la barre des scénarios, 59 px :
  10 px de marge, anneau de 34 px, pastilles de 36 px. Le nom de la mesure
  reste au-dessus de sa valeur, en plus petit — à côté, quatre mesures
  passaient sur deux rangées. Au téléphone, rien ne change.

## Amendement (18/09/2026, v3.54.1) — une seule liste de choix, aux couleurs du thème

Demande : « il y a un souci avec les menus dans Alertes, pourquoi sont-ils
blancs comme ça », trois captures — le choix du téléphone et celui de la
vanne s'ouvraient en liste blanche ; le menu « Collection » servait de
modèle.

- Le menu d'un `<select>` natif est dessiné par le système : blanc sous
  Windows, quel que soit le thème, et rien ne le stylise. Les Alertes en
  avaient deux ; Présence (l'alarme à armer), Veilles (le tarif des heures
  creuses) et le formulaire d'un événement (l'agenda), un chacun.
- Le menu de « Collection » devient la liste commune, `ListeChoix`
  (`ui.jsx`, logique pure dans `choix.js`), et remplace les cinq : rendu
  dans `<body>`, au-dessus des feuilles, sous son bouton — au-dessus quand la
  place manque en bas. Le bouton garde l'allure de son écran : pastille bleu
  plein dans les barres d'outils, champ dans les formulaires.
- Une option peut porter un identifiant, lu en petit sous son nom, et un
  groupe, lu en capitales au-dessus de sa suite. Au-delà de douze options, un
  champ filtre la liste — nom ou identifiant, accents ignorés : la vanne
  proposait tous les `switch.*` de la maison.
- Clavier : flèches, Début, Fin, Entrée ; Échap et Tab referment et rendent
  la main au bouton. Échap ne ferme que le menu, pas la feuille qui le
  contient. Sur un écran tactile, le filtre n'est pas focalisé d'office : le
  clavier du téléphone ne surgit pas à l'ouverture.
- Le groupe « Prises commandées » devient « Prises et interrupteurs » : il
  listait tout `switch.*`, pas seulement des prises. Les deux groupes sont
  triés par nom affiché, plus par identifiant.
- Reste une `<datalist>` (la feuille des entités d'une vue, en mode
  édition) : des suggestions de saisie sous un champ, pas un menu. Elle n'a
  pas été touchée.

Tests : tests/choix.test.mjs (7), dont un garde-fou — plus aucun `<select>`
dans `src/`. Vérifié en démo : Alertes (téléphone ; vanne filtrée et choisie
au clavier), Présence, Veilles, « Collection », l'éditeur d'un scénario dans
sa feuille, et au téléphone émulé. Le choix de l'agenda ne paraît pas en démo
(un seul agenda modifiable) : son remplacement n'est vérifié que par la
lecture du code et le garde-fou.

Suite en v3.55.0 (ADR 0054) : la `<datalist>` remplacée elle aussi, et une
seule taille pour toutes les listes.
