# 0252 — Les fiches des capteurs disent la même chose que leurs cartes

*19 octobre 2026 — accepté, à l'essai (audit des capteurs, lot 4, le dernier ; rien de publié). Complète les ADR 0031 (le dernier événement vient du journal), 0048 (le liseré qui respire), 0200 (la fiche d'une mesure) et 0251 (le lot 3).*

## Le problème

Le lot 4 de l'audit du 19/10 (sondes `audit-B`, `audit-D`) a trouvé des
fiches qui ne racontaient pas ce que leurs cartes racontaient :

- **deux sources pour un mouvement** : la carte Présence lisait le journal de
  Home Assistant sur 24 h, sa popup l'historique depuis minuit. À 00:30, la
  carte disait « il y a 40 min », la popup « Rien aujourd'hui » ; une rangée
  écrivait « Il y a 300 min » (M19) ;
- **deux couleurs pour un muet** : « Indisponible » en ambre dans la rangée
  d'une popup de groupe, en rouge dans la fiche du même capteur ;
- **plusieurs mots pour un danger** : « CO détecté » à l'Accueil, « Monoxyde
  détecté » dans la fiche ; « Boîtier ouvert ou déplacé » et « Sabotage » ;
  « Libre » et « Vide » ; « Pile faible » et « Faible » ; « appareils » puis
  « cartes » dans l'en-tête d'Objets › Capteurs ;
- **une heure fausse** : la puce « Baie · 23:48 » de la carte Ouvertures
  lisait `last_changed`, l'heure du redémarrage de Home Assistant, quand sa
  popup lisait l'historique du jour ;
- et des fiches qui devinaient : un binaire que l'historique ignore « fermé
  toute la journée » (M17), un capteur de confort muet « pas configuré », un
  historique lu une seule fois (M18).

## La décision

**1. Une source par fait.**
- *Le dernier mouvement* vient du **journal** (`logbook/event_stream`, 24 h),
  pour la carte ET la popup : la coquille de la popup (`FicheGroupe`) s'y
  abonne comme la carte (`useDerniersEvenements`) et passe `derniers` au
  contenu. Le journal, et non l'historique du jour : il franchit minuit, il
  vit (un mouvement pendant que la popup est ouverte s'y voit), et c'est déjà
  la règle de l'ADR 0031. L'historique du jour ne sert plus qu'à la bande et
  à « Quelqu'un depuis ».
- *L'heure d'une ouverture* vient de l'**historique du jour**, pour la carte
  ET la popup (`depuisQuand`, journeelue.js) : la carte relit l'historique de
  ses seules ouvertes, quand une porte s'ouvre ou se ferme. Ouverte depuis
  hier, la puce tait son heure ; avant la lecture aussi.
  Relecture : si le dernier état lu n'est pas l'état d'aujourd'hui
  (l'enregistreur écrit toutes les 5 s), c'est `last_changed` qui date le
  changement ; rien de lu — pas encore, refusé, ignoré —, la carte et la popup
  se taisent toutes deux ; la journée se relit à minuit.

**2. Une couleur pour un muet** (C26) : son état, « Indisponible », en
**rouge**, partout où c'est l'état de CE capteur — sa carte, sa fiche, la
rangée d'une popup de groupe (Ouvertures, Sécurité, Présence, Piles) ; sa
plaque en gris, comme dans sa fiche. L'**ambre** reste au **groupe** (C22,
C23, C32) : le mot du panneau du haut (« 1 détecteur muet »), la phrase et les
puces de la carte (« ne répond plus », « muette »). Le § 4.3 de la conception
disait l'ambre pour la rangée ; C26 l'emporte : une décision du tableau prime
sur la description d'un écran.

**3. Un mot pour une chose.** La table de sûreté (`motsSurete`, attention.js)
est la seule : l'Accueil (`deriveNotifs`, dont la copie est partie), la fiche
et la carte d'un binaire (`BIN_ETATS`) et la carte Sécurité la lisent —
« Monoxyde détecté », « Fuite détectée », « Boîtier ouvert ». Le téléphone
garde ses phrases longues (« Monoxyde de carbone détecté : … »), plus claires
hors de l'écran. Une rangée de popup prend les mots de `BIN_ETATS` : « Vide »
(et non « Libre »), « Pile faible », « Pile en forme ». Objets › Capteurs
compte des « cartes », même avant que son module n'arrive.

**4. La sonnette** (§ 19.3) se reconnaît à sa clé de traduction,
`doorbell`, sur un binaire `occupancy` — celle d'UniFi Protect, la même dans
toutes les langues ; jamais au nom. Elle dit « Quelqu'un à la porte · en ce
moment », puis « … · il y a 3 min » dans l'heure, devant le mouvement de sa
propre caméra ; un mouvement ailleurs, plus récent, reprend la phrase. Sans
la clé, une `occupancy` reste une présence.

## Conséquences

- La popup Présence s'abonne au journal : un abonnement de plus, popup
  ouverte seulement. La carte Ouvertures lit l'historique du jour de ses
  ouvertes : une lecture par porte qui s'ouvre ou se ferme. La lecture du jour
  et `depuisQuand` passent dans `journeelue.js`, au démarrage ; la bande et la
  fiche restent dans `journee.jsx`, à la demande.
- La vue Présence prend la bascule commune et un champ nombre qui part à la
  sortie (`ChampNombre`) : borné, la virgule lue, jamais 0 quand on le vide.
- `loggia_roomhidden` ne se lit plus : plus rien ne l'écrivait, il ne vivait
  que sur un appareil. « Tout réafficher » remet l'agencement de la pièce.
- Cinq textes nouveaux à l'écran (la sonnette, « Boîtier ouvert ») ; cinq
  clés orphelines retirées des catalogues. Le polonais nouveau est à relire.
- Rien ne change côté serveur : pas de redémarrage de Home Assistant.
