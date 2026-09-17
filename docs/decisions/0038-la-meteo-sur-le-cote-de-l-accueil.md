# 0038 — La météo sur le côté de l'Accueil

Date : 17/09/2026 (v3.39.0). Statut : acceptée. Une capture fournie par
l'utilisateur — le lieu, la température en grand, le ciel, « Max · Min »,
puis six heures — avec une consigne : « ajoute ceci sur l'accueil, sur le
côté, avec En ce moment, À surveiller, etc. ».

## Contexte

La vue Météo et la vignette de la bannière ont disparu le 15/09 : trop de
place pour une information qu'on lit d'un regard. Il ne restait du temps
qu'il fait que le fond de la bannière et une carte du catalogue, sans
prévision. Or c'est la prévision des prochaines heures qui décide d'un
volet, d'une lessive ou d'une veste.

## Décision

- **Une section du rail, `meteo`, sous « À surveiller ».** Elle se range, se
  déplace et se retire comme les autres. Sur un accueil déjà enregistré elle
  naît en tête du rail, pas tout en bas : elle vient d'être demandée « sur le
  côté ». Sans entité `weather` qui réponde, la section n'existe pas — ni sa
  poignée en édition. Sur téléphone elle vit sur la seconde page, avec le
  reste du rail.
- **Le dessin fourni, en entier.** Le lieu et la température à gauche — une
  décimale, comme la capture —, l'icône, le ciel et « Max · Min » à droite,
  un filet, puis « Maint. » et les cinq heures pleines qui suivent : libellé,
  icône, température. Le fond bleu ardoise s'applique tel quel, plus profond
  la nuit ; le texte y est blanc dans les deux thèmes. Sans bordure, comme
  les autres cartes. Un tap ouvre la fiche de l'entité.
- **Le lieu est le nom de l'entité**, jamais une ville écrite en dur.
- **Les prévisions arrivent par abonnement** (`weather/subscribe_forecast`) :
  Home Assistant les pousse quand elles changent, rien n'est sondé. La carte
  ne demande que les types que l'entité dit savoir donner
  (`supported_features`) ; l'abonnement lit le `hass` du moment par une
  référence vivante.
- **Rien sans source.** Pas de prévision quotidienne : pas de ligne « Max ·
  Min ». Pas de prévision horaire : pas de rangée d'heures — une case seule
  ne dit rien. Le maximum et le minimum sont ceux d'AUJOURD'HUI en date
  locale ; à défaut, on ne prend pas demain à la place. Une condition
  inconnue ne se dessine pas, plutôt qu'un nuage qui affirmerait un ciel
  couvert.
- **La nuit se lit dans `sun.sun`** : une heure de nuit « partiellement
  nuageuse » montre une lune voilée, pas un soleil.
- **Le chiffre suit la largeur de la carte**, pas celle de l'écran (requête
  de conteneur) : le rail fait 330 px ou 276 px. La température ne cède
  jamais sa place ; c'est le libellé du ciel qui passe sur deux lignes.

## Conséquences

Ce qui se calcule vit dans `src/meteo.js`, pur et testé à sec
(tests/accueil_meteo.test.mjs, 33 mutations) ; `src/cartemeteo.jsx` ne garde
que l'abonnement et le dessin. La vue Météo ne revient pas : c'est une carte
sur le côté. La carte simple du catalogue (`CvWeather`) reste telle quelle.
Non fait : la pluie attendue (probabilité, cumul) et le vent, que la capture
ne montre pas.

## Ajustement du 17/09 (v3.40.0)

Le fond bleu de la capture avait été repris tel quel, texte blanc compris.
Retour de l'utilisateur : « applique les mêmes teintes que pour les autres
cartes, c'est ridicule là ». La carte prend la surface, le filet et l'ombre
des cartes voisines du rail (`railPanel`) et les couleurs de texte du thème,
clair comme sombre ; plus aucune couleur en dur. La DISPOSITION de la
capture reste. Leçon : une capture venue d'ailleurs donne une mise en page,
pas une palette — la règle « la couleur d'une maquette s'applique en entier »
vaut pour une maquette dessinée POUR Loggia.
