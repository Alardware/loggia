# 0148 — Ce qu'on ne regarde pas ne tourne pas

Date : 04/10/2026. Statut : appliqué. Pas de redémarrage de Home Assistant :
seul l'écran change.

Le lot 14 de l'audit du 03/10 : la performance. Une tablette reste allumée
des jours sur l'Accueil ; tout ce qui tourne sans être vu se paie en batterie,
en chaleur et en fluidité. Rien de visible ne change : la question 9 de
l'audit (résolution réduite du fond météo, réécriture en WebGL brut) n'a pas
reçu de réponse, ni l'une ni l'autre n'est faite.

Toutes les mesures sont prises dans la démo factice (`?demo`), jamais dans la
maison réelle. « Avant » et « après » dans la même situation, 1440 × 900 sauf
mention.

**Les signaux sans fin** (liseré « ne répond plus » de l'ADR 0048, point
LIVE des caméras, pastille de la cloche) animaient `box-shadow` et une
propriété personnalisée : le navigateur recalculait et repeignait la page à
chaque image, même hors de l'écran et sous l'écran de veille. Désormais :
- un seul observateur pour toute la page (`src/horsecran.js`) marque ce qui
  sort de l'écran (`data-o-hors`), et la feuille met son animation en pause ;
  l'écran de veille met tout en pause par sa classe ;
- le point LIVE s'anime en `transform` et `opacity` seulement (le halo est un
  disque qui grandit, sur `::before`) : le compositeur le prend en charge.

Le signal reste le même à l'écran. Mesuré : 7 → 0 animation en marche hors
de l'écran ; au repos, de 5 642 à 515 peintures en 5 s ; hors écran, de 3 150
à 16.

**Le fond météo** demandait une image à chaque rafraîchissement de l'écran
(117 à 139 par seconde) pour en dessiner 26, et continuait entièrement hors
de l'écran. Il dort jusqu'à l'image suivante (`setTimeout` puis
`requestAnimationFrame`), s'arrête hors de l'écran (IntersectionObserver),
sous la veille et dans un onglet caché, et repart au retour. Mesuré : hors
écran 29 → 0 image par seconde ; en haut de page, même cadence. Son shader se
compile avant la première image (`compileAsync`) : plus de gel de 1,3 à 2,8 s
au premier affichage. Le fond et l'orbe rendent leur contexte WebGL au
démontage (`forceContextLoss`) : 0 contexte vivant après un changement de vue.
L'orbe ne change pas autrement.

**Les caméras** gardaient leur direct ouvert toute la nuit sous l'écran de
veille, et une vignette se rechargeait toutes les 2 s dans un onglet caché.
Le flux se coupe sous la veille et dans un onglet caché, après 30 s de grâce :
un retour rapide ne coupe rien, et rouvrir un direct prend quelques secondes
(`src/regard.js`, pur et testé). Mesuré sur trois caméras simulées : 1 759
images décodées en une minute de veille avant, 0 après ; vignettes 93 → 0 ;
au réveil, les trois directs rouvrent en 3 s.

**La page sautait au chargement** (CLS 0,329 à 1440 px, 0,51 sur une
tablette tactile). La cause principale : `useHass` rendait `null` au premier
rendu alors que Home Assistant était déjà là, et le rail se remplissait après
coup. Il lit `getHass()` dès le premier rendu. S'y ajoutent des réserves de
place, de la taille exacte du contenu attendu, jamais une carte fantôme : la
rangée des scénarios (si elle était pleine la dernière fois sur cet appareil,
un indice qui ne s'exporte pas), les avatars, la ligne Max · Min et les heures
de la météo, le micro de l'assistant. La classe tactile se pose avant la
première peinture. « Home Assistant n'est pas joignable » attend 4 s et un
vrai échec, la barre latérale dit « Connexion… » le temps d'un tic au lieu de
« Hors ligne ». Mesuré : CLS 0,001 à 1440 px, 0,0075 sur tablette tactile ;
le dessin final est identique, élément par élément.

**Le chargement** :
- la police d'icônes et Manrope (latin) sont préchargées par la page au lieu
  d'être demandées après le premier rendu de React (`font-display: block`
  gardé, ADR 0078) ;
- hors français, le catalogue de langue et le boot se téléchargent ensemble
  (préchargement du boot et de vendor, nommés à la construction), l'ordre
  d'évaluation restant le même (le catalogue avant le boot). Le script
  d'empaquetage reconnaît l'entrée quel que soit l'ordre des attributs ;
- mesuré en réseau lent, anglais : l'écran complet, icônes comprises, arrive
  4,2 s plus tôt (15,7 → 11,5 s) ; en Fast 4G, 0,9 s ; en réseau local,
  ~0,1 s ;
- un test borne le boot à 1 100 000 octets (1 053 333 aujourd'hui). S'il
  grossit au-delà, le chemin est celui de l'ADR 0104 : charger à la demande.

**Comment c'est vérifié.** Cinq fichiers de tests nouveaux
(`tests/lot14_*.test.mjs`) et un test Python d'empaquetage, chacun rouge sur
le code d'avant le lot. Deux tests restent rouges jusqu'au repack final,
voulu : la page LIVRÉE doit précharger son boot, et le paquet ne doit pas
traîner de bundles disparus.

**Reste** : le saut à l'entrée de la vue Scénarios (0,16 à 1440 px, un bloc
qui descend au chargement de son contenu), l'icône animée de la carte Météo,
et le chargement à la demande des vues (ADR 0104).

## Relecture

Une relecture contradictoire en cinq angles a confirmé sept constats, tous
de gravité basse, et en a écarté un.

- **`compileAsync` sans l'extension** du pilote (rendu logiciel, GPU écarté)
  faisait écrire à three « extension not supported » à chaque affichage de
  l'Accueil, pour ne rien gagner. Il n'est appelé que si l'extension existe.
- **Au réveil**, le direct d'une caméra se renégocie et la tuile restait vide
  le temps de la piste : une vignette tient la place, seulement après une
  coupure par le regard (le premier chargement ne change pas).
- **Pendant « Connexion… »**, la barre latérale disait encore « Home
  Assistant · En ligne » en vert à quatre endroits, même Home Assistant
  injoignable : l'attente est un état neutre, en gris, partout.
- **Panne au démarrage** : la réserve de la rangée des scénarios partait à
  4 s et faisait remonter la page de 94 px. Elle n'est posée que si une
  connexion existe.
- **« Pas joignable »** relit le pont à l'échéance : avec un intervalle du
  pont réglé haut (jusqu'à 60 s), un Home Assistant déjà là ne passe plus pour
  une panne.
- **Les tests du chargement** lisaient `dist/`, ignoré par git et parfois
  périmé : il ne compte que s'il est plus récent que les sources (la règle du
  script d'empaquetage). Leur message rattache chaque piste à l'ADR qui la dit.
