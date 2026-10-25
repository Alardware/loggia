# 0203 — Les capteurs binaires en groupes : Ouvertures, Sécurité, Présence

*16 octobre 2026 — accepté, à l'essai (chantier Capteurs, étapes 2 et 3 ; rien de publié). La conception : `docs/chantier-capteurs-etapes-2-3.md`, C20 à C25, C27, C28, et le § 19, tranché le 16/10.*

## Le problème

Sous Objets › Capteurs, la section Maison montrait une carte par capteur binaire :
chez lui, quatre portes, la vigilance MeteoAlarm (« Tout va bien »), et, s'ils étaient
dans les états, deux « Besoin Eau » de modèle qui s'écrivaient « Aucune fuite ». Chaque
carte disait l'état d'un seul appareil ; aucune ne disait « une porte est ouverte », ni
« un détecteur ne répond plus », ni « du mouvement il y a 3 minutes ». Sa maquette
« Cartes capteurs » (cadres 1a, 1c, 1d, 1f) regroupe : une carte Ouvertures, une carte
Sécurité, une carte Présence, chacune avec sa popup.

## La décision

**Les groupes remplacent les binaires dans Objets (C20).** Sous « Tous » comme sous
« Capteurs », un binaire d'une famille de groupe ne fait plus de carte, qu'il entre dans
son groupe ou non. Trois cartes le remplacent, `groupe:ouvertures`, `groupe:securite`
et `groupe:presence`, chacune présente si elle a un membre. Un binaire d'aucune famille
garde sa carte (une vibration, un sabotage seul) ; un binaire posé à la main dans
l'éditeur aussi. Les filtres ne changent pas : les groupes sont sous « Capteurs », IoT
reste celui des appareils. Un groupe compte ses MEMBRES dans les chiffres d'Objets
(« appareils reliés », « actifs », les puces) : le compte ne baisse pas (`poidsObjet`,
`compteObjets`, objets.js). Les pièces et la vue Sécurité ne changent pas (C2).

**Qui entre (C21, § 19.3).** La classe, jamais le nom (`groupes.js`, pur) : Ouvertures
= `door`, `window`, `garage_door`, `opening` ; Sécurité = `smoke`, `carbon_monoxide`,
`gas`, `moisture`, `safety` ; Présence = `motion`, `occupancy`, `presence`. Le binaire
est porté par un appareil PHYSIQUE (pas un service, la règle de C14), ni masqué, ni
désactivé, ni de catégorie. Présence prend AUSSI les détecteurs portés par une caméra
(son mouvement, sa sonnette en `occupancy`) : elle est neutre, son bruit ne dérange
personne, et il compte ses caméras parmi ses détecteurs. Le sabotage (`tamper`) n'est
d'aucun groupe : il se dit sur la ligne de sa porte, et ne fait pas de carte quand une
sœur de son appareil est membre. Les modèles sans appareil (« Besoin Eau », MeteoAlarm)
n'entrent nulle part ; la vigilance météo a sa carte dans Dehors (C28, § 19.5).

**Les phrases.**
- Ouvertures (C22, § 19.1) : « {n} ouvertes sur {total} » en AMBRE dès qu'une est
  ouverte, de jour comme de nuit — la langue de la maison (les tuiles de Sécurité, la
  porte dessinée) ; le total compte celles qui répondent. Sinon « {nom} ne répond plus »
  (ambre), sinon « Tout est fermé » (neutre). Les puces : les ouvertes avec leur heure,
  les muettes, puis « {k} fermées ».
- Sécurité (C23) : un détecteur qui sonne, « Fumée détectée · {nom} » en rouge, avec les
  mots de la table de sûreté de l'Accueil (`motsSurete`, attention.js) ; sinon « {nom} ne
  répond plus » en ambre ; sinon « {n} détecteurs · rien à signaler » en neutre. Jamais
  « Tout va bien ». Une pile faible ne met pas la carte en alerte : la carte Piles la dit
  (ADR 0206).
- Présence (C24) : « Mouvement · {pièce} · en ce moment », « … · il y a {n} min » dans
  l'heure, sinon « Rien depuis {durée} » ; toujours neutre, la plaque à l'accent pendant
  un mouvement. Sans préposition devant la pièce : « dans {pièce} » demanderait au
  polonais de décliner. Le dernier mouvement vient du JOURNAL de Home Assistant
  (`useDerniersEvenements`, ADR 0031), jamais de `last_changed`.

**La carte** (`CarteGroupe`, App.jsx) : une seule pour les trois groupes, et pour Piles,
dans `RM_CARD` et la grille commune de la carte étroite (`o-gabarit`, ADR 0202) : la
plaque, le chiffre en haut sur la carte étroite (`ChiffreHaut`), le nom sur deux lignes,
la phrase, les puces de la carte large seulement — une rangée, le reste en « +{k} »
(`pucesQuiTiennent`, mesuré en em). Le lavis seulement en alerte. La `Surface` qui ouvre
la popup dit ce que la carte affiche (ADR 0074). La compacte : la plaque, le nom, la
phrase, le chiffre à droite — sans les classes de CvCard, qui lui restent réservées.
Chaque carte s'abonne à SES membres (`useHass`), jamais au domaine entier : la leçon des
prises.

**Maison et « à regarder » (C25, précisé au § 19.1).** L'ordre : Ouvertures, Sécurité,
Présence, puis ce qui est à part, dans l'ordre de l'éditeur. « À regarder » compte ce qui
demande un geste ou signale une panne — un ouvrant ou un détecteur muet, un détecteur qui
sonne —, jamais une porte qu'on a ouverte (un état choisi) ; Présence ne juge pas
(neutre), comme une pression. La section juge par `jugerObjet` ce qui n'est pas une
mesure ; l'enveloppe vivante (`SectionsCapteursVive`) s'abonne aux membres des groupes
qu'elle juge — pas à ceux de Présence, neutre : chaque mouvement d'une caméra redessinait
les en-têtes (passe bis du 17/10). À l'Accueil, deux choses changent, voulues par le
§ 19.8 et l'ADR 0022 : « En ce moment » et la cloche (`deriveNotifs`) disent une pile
faible au seuil de la veille des piles — le même que la carte Piles (ADR 0206) —, et un
`moisture` calculé par un modèle ou un groupe n'y est plus une fuite ; le bandeau, la
ligne de sécurité, les tuiles et le rail ne changent pas.

**Les popups (C27)** — `fichegroupe.jsx`, à la demande, sur le patron de `FicheMedia` :
la coquille (`FicheGroupe`, App.jsx) garde la feuille et pose la frontière Suspense
DEDANS ; le contenu n'importe jamais App.jsx. L'en-tête commun (`EnteteFiche`), une
croix, pas d'épingle (un groupe n'est pas une entité). En haut le mot, la phrase et un
conseil seulement s'il est vrai (la nuit, une ouverte ; un chauffage coupé par la règle
des fenêtres, lu dans `loggia/fenetres/etat`). Puis une rangée par membre — sa plaque,
son nom, sa pile, son état —, avec la bande du jour pour Ouvertures et Présence ; une
ouverture y porte son petit dessin. L'historique du jour se lit UNE fois, à l'ouverture,
pour tous les membres (`journee.jsx`, `history/period/{minuit}` en `minimal_response`) :
il fait foi pour « depuis » et « dernière ouverture ». Une rangée ouvre la fiche de son
binaire, par-dessus. Partent les notes de la maquette qui ne disent pas vrai chez lui.

**La vigilance météo va dans Dehors (C28, § 19.5)** — `vigilance.js`, pur. La carte
« Vigilance météo » lit, dans l'ordre, le capteur d'alerte départementale de Météo-France
(son état est le niveau), sinon le `binary_sensor` MeteoAlarm (`safety`, reconnu par la
règle de l'Accueil : `awareness_level`, l'attribution, à défaut l'identifiant). Au calme
elle écrit le NIVEAU (« Vigilance verte »), jamais « Tout va bien » ; sans niveau connu,
« Aucune alerte en cours » ; en alerte, ambre, orange ou rouge avec l'événement. Elle
garde sa clé d'entité : son agencement la range déjà.

## Ce que cela coûte

Son agencement d'Objets perd les quatre portes et voit arriver les groupes en fin de
grille. Sur la carte étroite, une carte de groupe n'a que sa plaque, son nom et sa
phrase : le pied reste vide (les puces sont celles de la carte large). Mesuré dans la
démo (Objets › Capteurs ; 390, 360 et 320 px ; français, allemand, polonais) : la phrase
de Sécurité « Eingang antwortet nicht mehr » finit en « … » dès 390 px en allemand (10,5
px, 149 px de texte pour 142 de carte — remesuré le 17/10, passe bis : l'ADR disait 360) ;
« Entrée ne répond plus » et « Wejście nie odpowiada » tiennent à 390 et à 360 px ;
à 320 px (141 px de carte), « Entrée ne répond plus » et « Aucune alerte en cours »
finissent en « … », comme les phrases longues des autres cartes (ADR 0202).
La muette de Sécurité se nomme par sa pièce quand elle y est seule (« Entrée ne répond
plus »), comme les membres d'Ouvertures : c'est la règle de `nomsMembres`. Le journal peut exclure une entité (`logbook`) : Présence dirait « Rien depuis
plus de 24 h » à tort. « Ouverte depuis » sur la carte vaut l'heure du redémarrage de
Home Assistant si la porte était ouverte avant lui ; la popup lit l'historique et fait
foi. Un ouvrant sans appareil (un MQTT écrit à la main) compte au bandeau de l'Accueil
et pas dans Ouvertures — rare, chez lui aucun.

**Le démarrage (C34)** : la place s'est faite AVANT d'ajouter. Les dessins des cartes
(`PLANT_ART`, `VIEW_ART`, `DEVICE_ART`) sont devenus des fichiers servis à côté de la
page (`public/plantes/`, `public/dessins/`) : le boot passe de 1 094 737 à 1 070 912 octets.
Les cartes de groupe, la vigilance, la découverte des plantes, la carte Piles et leurs
lectures entrent ensuite au démarrage ; les popups et les fiches restent à la demande.
À la fin des deux étapes, le boot pèse 1 092 749 octets (−1 988 octets par rapport au
départ), 7 251 octets sous la borne de 1 100 000, qui ne se relève pas. Le serveur
ne fait rien de nouveau (C35) : l'historique et le journal de Home Assistant donnent
« depuis », la bande du jour et le dernier mouvement.

## Ce qu'on n'a pas fait

La carte « Vibrations » et la carte « Vigilance météo · Aujourd'hui · Demain » de la
maquette ; la carte Sécurité dans la vue Sécurité (après son essai, hors chantier) ; les
groupes dans le composeur, les vues personnelles, les épingles et la recherche ;
`CvOuvrants`, `CvPresence`, `CvAir` ; l'appui long. « CO₂ élevé » à l'Accueil
(`airPalier`) reste tel quel, à lui soumettre à part.

## Ce que les tests tiennent

`tests/groupes_membres.test.mjs` (qui entre, et pourquoi), `tests/groupes_cartes.test.mjs`
(les trois phrases, les puces, la carte large et la compacte, les trois popups jouées :
la journée lue une fois, l'en-tête sans épingle, la coquille qui garde la feuille),
`tests/objets_groupes.test.mjs` (les groupes dans Objets, leurs chiffres, Maison et son
« à regarder »), `tests/vigilance.test.mjs` (la vigilance dans Dehors), `tests/demo_capteurs.test.mjs`
(la maison de la démo : les six ouvrants et leurs piles, les détecteurs, la fumée muette,
le radar). La maison de test est `tests/maison_capteurs.mjs`. La suite passe de 2 942
à 3 007 tests.
