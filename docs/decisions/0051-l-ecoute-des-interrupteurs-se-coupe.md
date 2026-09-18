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
