# 0037 — La vue Système d'une machine Home Assistant OS

Date : 17/09/2026 (v3.38.0). Statut : acceptée. Une maquette de
l'utilisateur, « pour la vue système de HAOS » : cinq tuiles de mesure, la
charge des soixante dernières minutes, les versions, les modules
complémentaires, le réseau et le stockage, le journal.

## Contexte

La vue Système tenait en une carte : la machine, quatre chiffres, une courbe
de mémoire, puis un journal qui ne montrait presque rien. Elle ne disait ni
ce qui tourne sur la machine, ni si elle est à jour, ni quand elle a été
sauvegardée — tout ce qu'on va d'ordinaire chercher dans les réglages de
Home Assistant, écran après écran.

La maquette montre des valeurs que Home Assistant ne publie pas toutes
(cœurs et fréquence du processeur, latence de la passerelle). La règle de la
maison tranche : **rien ne s'affiche sans source.**

## Décision

- **Deux sources, pas une de plus.** Les *capteurs* de l'appareil qui publie
  la charge processeur (System Monitor, Glances…) pour le processeur, la
  mémoire, la température, le swap et les débits ; le *Superviseur*
  (`supervisor/api`) pour la carte, le système, le démarrage, le disque, les
  versions, les modules, les sauvegardes et l'adresse. S'y ajoutent trois
  lectures de Home Assistant : `system_log/list` (le journal d'erreurs),
  `system_health/info` (le moteur et la taille de la base), `cloud/status`
  (Nabu Casa). Le Superviseur ne répond qu'à un administrateur : sans lui la
  vue se réduit aux capteurs, elle n'invente rien.
- **Un bloc sans donnée ne se dessine pas.** Pas de tuile Swap quand le
  capteur est désactivé, pas de ligne Nabu Casa sans compte, pas de « latence
  passerelle » — aucun capteur ne la mesure. Le processeur n'a ni cœurs ni
  fréquence ; sa ligne de détail est la moyenne de l'heure, qui se calcule.
- **Les capteurs frères se ramassent seuls.** La table de la configuration
  nomme la charge processeur ; le swap, la mémoire en octets et les débits de
  l'interface branchée se retrouvent sur le même appareil (`capteursHote`,
  `resolve.js`) — par motifs multilingues, unité et `device_class`. La table
  prime toujours ; le ramassage se fait une fois par index, pas à chaque
  rendu. Les interfaces virtuelles (Docker, boucle locale) sont écartées, le
  filaire passe avant le Wi-Fi.
- **Le gabarit des cartes prime sur la maquette.** Tuiles et modules suivent
  le gabarit de la maison : icône en haut à gauche, métrique ou bascule en
  haut à droite, titre sous l'icône, hauteur standard, sans bordure. Les
  couleurs de la maquette s'appliquent en entier (bleu, violet, orange, vert,
  cyan) ; un seuil franchi fait passer le chiffre et la jauge à l'ambre ou au
  rouge. Au téléphone la rangée de mesures reste sur UNE ligne.
- **La charge : une barre par minute.** Home Assistant ne note que les
  changements : une minute sans point reprend la dernière valeur connue ;
  avant le premier point, pas de barre. L'échelle suit le pic. Le choix
  1 h / 24 h / 7 j disparaît avec la courbe, comme sur la maquette.
- **Les gestes qui coûtent restent en deux temps.** Arrêter un module demande
  un second geste (quatre secondes pour confirmer) ; le démarrer, non.
  L'alimentation — redémarrer Home Assistant, redémarrer ou éteindre la
  machine — quitte la page pour une feuille, mêmes deux temps.
- **Les entités de mise à jour se reconnaissent à leur attribut `title`**,
  que l'intégration ne traduit pas, jamais à leur identifiant (qui change
  avec la langue). La quatrième ligne des versions est l'interface que l'on
  regarde : Loggia — sans entité de mise à jour pour elle, la version
  s'affiche sans pastille.
- **Le journal réunit deux fils sur 24 h** : les avertissements et erreurs de
  Home Assistant, et le logbook des entités système (mises à jour, machine en
  ligne). Le compte dit tout, la liste montre les huit plus récents. Le
  journal de la maison reste en pied de page.

## Conséquences

Tout ce qui se calcule vit dans `src/systeme.js`, pur et testé à sec
(tests/systeme_hoas.test.mjs, 54 mutations) ; la vue ne garde que les
lectures et le dessin. Ses lectures passent par une référence vivante : la
dernière dépendance d'effet omise de la vue disparaît de l'inventaire. Un
défaut ancien tombe au passage : un capteur « dernier démarrage » en date ISO
affichait l'heure du démarrage comme une durée (« 10:00 » lu comme dix
heures). Les mesures des modules coûtent un appel par module démarré ; elles
se relisent chaque minute, seulement quand la page se regarde. Non fait : la
latence de la passerelle (pas de source), le choix de la période de
l'historique, l'ouverture d'un module vers sa page Home Assistant.

## Ajustements du 17/09 (v3.39.0)

Retour de l'utilisateur, le jour même :

- **Le graphe prend la hauteur de la carte Versions.** La grille étire les
  deux panneaux d'une rangée ; dans celui de la charge, c'est le cadre des
  barres qui absorbe la différence. Les barres y sont positionnées : des
  hauteurs en pourcent ne se résolvent que contre une boîte de taille connue.
- **Les modules complémentaires n'ont plus de cadre.** Ce sont déjà des
  cartes ; un panneau autour n'ajoutait qu'une boîte dans une boîte. Un
  titre de section, le compte à droite, la grille sur toute la largeur —
  ses colonnes tombent sous celles des tuiles de mesure.
- **Le journal défile dans sa carte, à côté du réseau.** Sa liste ne pèse
  rien dans la hauteur de la rangée : c'est le réseau — ou une hauteur
  minimale — qui fixe la taille, et toute la journée se parcourt (soixante
  lignes au plus) sans allonger la page.
- **Le journal de la maison quitte la vue.** La décision « reste en pied de
  page » ci-dessus ne tient plus.
