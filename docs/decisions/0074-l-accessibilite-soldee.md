# 0074 — L'accessibilité, défaut par défaut

Date : 23/09/2026. Statut : acceptée. Origine : le plan d'évolution du 22/09,
point M7, cinquième du top 5 ; « continu avec le top 5 ».

## Contexte

L'ADR 0063 avait rendu le site et l'Accueil lisibles, et laissé une page
Accessibilité qui disait ce qui restait. L'audit du 22/09 a nommé les défauts
précis, un par un. Le plus lourd : la carte d'une pièce était un
`role="button"` qui englobait deux boutons et un interrupteur. Un rôle bouton
rend sa descendance présentationnelle — volets, chauffage et lumières
disparaissaient d'un lecteur d'écran, sept commandes invisibles sur l'Accueil.

## Décision

- **La carte d'une pièce n'englobe plus rien.** Un bouton de SURFACE, frère
  des contrôles, porte le geste « ouvrir la pièce » et se laisse couvrir par
  eux (le pied est positionné, donc peint après). Rien ne bouge à l'œil ; la
  tabulation passe sur quatre choses distinctes au lieu d'une.
- **L'anneau de focus revient** : six `outline: 'none'` en style en ligne
  battaient la règle `:focus-visible` de la feuille. Le seul qui reste est la
  zone de liste d'un menu, focalisée par programme — ce qui doit s'y voir,
  c'est l'option visée, et elle porte son liseré.
- **Ce qui n'avait pas de nom en a un** : les trois flèches d'un volet dans
  une fiche, la grille d'icônes d'une vue personnalisée, la cloche — qui
  annonce en plus combien de notifications ne sont pas lues, là où le point
  rouge ne se voyait pas.
- **La vue courante s'annonce** : `aria-current="page"` dans le menu latéral.
  *Repris le 23/09* : il n'était posé que sur le premier des trois groupes du
  menu. Un lecteur d'écran ne disait donc rien de la vue courante dès qu'elle
  venait des vues secondaires ou d'une vue personnalisée. Les trois groupes le
  portent désormais.
- **Le bandeau rouge de tête** (connexion perdue, découverte interrompue)
  quitte ses couleurs en dur — 3,77:1, sous le seuil, pour le seul message
  qu'il faut absolument pouvoir lire — et prend `--o-bad`, que la garde de
  contraste protège dans chaque thème.
- **Les titres** : les panneaux de Paramètres et de Règles titraient par un
  `div`, la vue Objets s'annonçait « Objets » même ouverte par « Lumières »,
  « Climat » ou « Médias ». Ce sont des `h1` et des `h2`, à l'œil inchangés.
- **L'orbe respecte `prefers-reduced-motion`** : son temps avance au sixième,
  assez pour dire qu'elle écoute, sans le mouvement continu.

## Ce qui n'a pas pu être fait

Passer les règles `jsx-a11y` **en erreur** — le dernier point du plan. La
dette est soldée (zéro avertissement sur `src/`, les trois exceptions qui
restent sont nommées ligne à ligne), mais un garde-fou de l'environnement
refuse toute modification d'`eslint.config.mjs`. Le changement tient en un
mot, `'warn'` → `'error'`, à la ligne des règles importées de
`a11y.flatConfigs.recommended`.

## Conséquences

- Quatre nouveaux libellés à traduire, posés dans les sept catalogues.
- Une carte de pièce a un bouton de plus dans le DOM ; les tests de rendu et
  la démo le confirment sans changement visuel.
- La page Accessibilité du site a été relue le 23/09 : l'anneau de focus et la
  carte de pièce qui n'avale plus ses commandes y sont dits. Ce qu'elle liste
  sous « ce qui n'est pas fait » n'a pas bougé — aucun essai avec un vrai
  lecteur d'écran, le mode édition pas vérifié au clavier.

Tests : rendu_composants, accueil_banniere réalignés ; la suite complète reste
verte (932 JS).
