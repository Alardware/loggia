# 0210 — Le mode enfant des médias : un profil par pièce, tenu au serveur

*17 octobre 2026 — accepté, à l'essai (chantier Mode enfant ; rien de publié). La conception : `docs/chantier-mode-enfant.md`, E1 A tranché par lui le 17/10, E5 à E11 et E15 à E21 ; § 5, § 6, § 7, § 12 ; sa maquette, écrans 2a à 2d.*

## Le problème

Sa demande du 17/10 : « je ne voie pas pour la protection enfant ». Sa maquette donne à la
chambre de Lino une pastille « Mode enfant » sur les cartes de l'Echo Dot et de l'Apple TV,
un plafond de volume hachuré sur la barre, le temps d'écran qui reste, « Coucher · revient à
07:30 », une popup qui dit où l'on en est et une feuille de réglages. Tout cela doit tenir
écran fermé : l'Echo obéit à la voix, l'Apple TV à sa télécommande, et un onglet de Loggia
ouvert sur une tablette ne garde rien (ADR 0064 : ce qui est différé vit au serveur). Il faut
donc une règle de la maison — et la première règle qui touche un appareil que l'enfant a lui-
même sous la main.

## La décision

**Un profil par pièce (E1 A), sur une zone de Home Assistant (E6).** Le profil s'applique
aux `media_player` dont l'entité, sinon l'appareil, porte la zone de la pièce — les DEUX
entités d'une Echo, l'officielle et celle de HACS, puisque les deux publient un volume —,
plus les appareils que le parent ajoute d'ailleurs (une Apple TV), chacun avec sa jumelle
retrouvée par l'empreinte des identifiants d'appareil (ADR 0208). Un lecteur qui quitte la
zone quitte le profil au recensement suivant ; un appareil de service ou de caméra n'y entre
jamais. Le profil se crée depuis la popup de tout lecteur qui a une pièce — la rangée « Mode
enfant · Désactivé » ouvre la feuille, et le premier enregistrement le fait naître avec le
nom de la pièce (E20) ; rien dans Paramètres, qui ne liste pas les profils. Un lecteur sans
pièce ne crée pas de profil : il s'ajoute à un profil existant.

**Un module `enfant.py` et son `enfant_calcul.py` pur (E5)**, sur le modèle des prises : la
configuration commune `loggia_enfant` (`config_defaut`, `lire_config` qui écarte l'illisible,
`poser_patch` qui refuse sans rien écrire), SON fichier d'état `.storage/loggia_enfant_etat`
(version 1 : par profil, les secondes d'écran du jour, la demande, « levé jusqu'à », les
minutes accordées, les ramenés, les préventions, les coupures, le titre gardé ; relu par
`normaliser`, qui repart propre d'un fichier abîmé et le dit), le recensement au registre
après `async_at_started`, la fenêtre de démarrage de l'ADR 0198 (deux minutes où un état relu
n'est pas un geste : rien ne se ramène ni ne se coupe ; à sa fermeture, la maison regarde où
elle en est), `rechargement.py` qui reprend le module quand `loggia_enfant` change par un
import, l'arrêt propre (`MODULES_VIVANTS`). Le calcul est pur : l'heure, la configuration et
l'état entrent, la décision sort ; `decision_volume` garantit un volume STRICTEMENT plus bas
que celui lu, et le test le tient.

**Trois règles, et la reprise.** *Le plafond* (E7) : un `volume_level` publié au-dessus du
plafond, sur n'importe quelle entité du profil, redescend au plafond par `volume_set` sur
CETTE entité — elle vit et elle a le bit, puisqu'elle vient de publier ; jamais si la valeur
lue est déjà sous le plafond, jamais une valeur plus haute ; un ordre par appareil physique
toutes les cinq secondes, le reflet de la jumelle (l'officielle qui sonde encore l'ancien
volume) ignoré soixante secondes après un ramené ; au coucher le plafond devient `min(plafond,
20)` (le 20 est un réglage du profil). *Le temps d'écran* (E8) se compte sur l'ÉTAT : un
écran du profil (`device_class: tv`, ou ajouté comme écran) compte les secondes où il n'est ni
`off`, ni `standby`, ni muet ; le compteur repart à minuit et s'écrit toutes les 60 s au plus ;
le budget est celui du jour (semaine ou week-end) plus les minutes accordées ; au redémarrage,
le temps de l'arrêt ne se compte pas. *La coupure et le coucher* (E9, E10) : écoulé, ou hors
des heures, l'écran s'éteint (`turn_off`) après la voix de l'Echo (ADR 0212) ; rallumé, la
maison attend vingt secondes puis l'éteint de nouveau, une fois par minute au plus ; hors des
heures, l'Echo baisse à 20 % et ce qui commence à jouer est mis en pause vingt secondes après
(`media_pause` sur l'entité qui a le bit, sinon `media_stop`, sinon rien — et le journal le
dit), SAUF le son pour dormir que Loggia a lancé par ses deux puces (la phrase pour Alexa sur la
jumelle HACS ; le premier titre qui joue dans les 90 s est gardé jusqu'au matin) ; une annonce
de la maison passe. *La reprise* à l'heure dite : rien à envoyer — la maison n'allume rien —,
le plafond remonte, le journal le note.

**Le serveur appelle les services LUI-MÊME (E11)**, avec son propre `Context()`, et note au
journal (`regles.noter`, module `enfant`) — comme les minuteurs, PAS par `regles.agir` :
`agir` respecte la main (une entité touchée avec un `user_id` est gelée trente minutes), et la
main de l'enfant sur la barre de la tablette gèlerait précisément l'Echo que la règle doit
ramener. Cette règle est la seule à passer à côté du gel, et elle est bornée : le volume et la
coupure, sur un profil explicite, jamais une montée, jamais un allumage, jamais une bascule —
un test de source tient que `turn_on`, `media_play`, `volume_up` et `toggle` n'existent pas
dans le module. « Observer sans agir » vaut ici aussi (`simulation` de `loggia_enfant`, dans
la liste de Paramètres › Règles) : le journal note ce qui serait parti, rien ne part.

**La carte d'un lecteur sous profil (E15, E16, E17).** La pastille « Mode enfant » (ou
« Limites levées ») prend la place de la source ; la phrase d'état gagne deux lignes dans
`phraseLecteur`, avant « Éteinte » : « Coucher · revient à 07:30 » et « Temps écoulé · demain
07:30 » (« · demande envoyée » quand elle l'est) ; en lecture au coucher, « Coucher · {titre} ».
Sur un écran à budget, le pied porte le temps — « Temps d'écran », « 35 min restantes », la
barre de 8 px, « 55 min utilisées · sur 1 h 30 » — à la place de la barre de volume, qui
reste dans la popup ; bloqué, la plaque passe en gris avec une lune ou un sablier, sans lavis.
Sur une enceinte, la barre de volume gagne la zone hachurée, le trait et le cadenas (`RmJauge`
reçoit `plafond` ; le curseur ne dépasse pas le plafond, `aria-valuemax` le dit) et « Volume
30 % · max 40 % ». La carte étroite (grille 1c) met en haut le volume, ou le temps qui reste
(« 35 min », « 1 h 25 »), ou la lune ou le sablier ; bloquée, sa ligne de commandes dit
« Revient à 07:30 », inerte, plutôt qu'un « Allumer » que la maison déferait. La compacte prend
le glyphe seul de la pastille et la phrase.

**La popup, vue enfant (E18), et la feuille (E19).** Un panneau nouveau, « Mode enfant »,
entre le volume et le panneau du genre, quand le profil agit ou que les limites sont levées :
le bandeau de la levée, le temps d'écran en grand, ou « C'est fini pour aujourd'hui » /
« C'est l'heure de dormir » avec « Demander 15 min de plus » ou les puces des sons pour dormir,
les rangées « Coucher », « Annonces de la maison » (la sœur « Annonces » de l'officielle, E23)
et « Réglages parent » ; sous la barre de volume, « Le volume s'arrête à 40 % » ; sous
Applications, « Les applications se verrouillent dans les Réglages de l'Apple TV
(Restrictions), pas ici. » La vue enfant est la vue de tous : le code sépare les réglages, pas
l'affichage. La feuille « Réglages parent » (`ficheenfant.jsx`, à la demande) est une seconde
`BottomSheet` montée après le contenu, la maquette 2d panneau par panneau : la bascule « Mode
enfant », le volume maximum et sa phrase, le temps d'écran (30 min, 1 h, 1 h 30, 2 h,
Illimité), les heures autorisées (semaine, week-end, au quart d'heure), les sons pour dormir,
la voix, les annonces, les appareils du profil (ceux de la pièce « ajoutés tout seuls », ceux
du parent, « Ajouter un appareil »), « Lever les limites 30 min », « Code parent ». Elle écrit
par `loggia/enfant/config`, une commande en vol à la fois ; chaque refus se dit, nommé.

**L'état à l'écran (E21)** suit le motif des prises : un magasin `enfantetat.js`
(`loggia/enfant/etat`, 60 s, 15 s la popup ouverte, reposé après chaque commande), le décompte
qui tourne depuis `maintenant` du serveur, et une réponse donnée depuis le téléphone qui se
voit sur la tablette au sondage suivant — dit tel quel. Écart avec la conception : le magasin
est au démarrage, pas importé à la demande ; mais `useEtatEnfant(actif)` ne sonde que si la
maison a un profil (`cfgVal('loggia_enfant')`) : une maison sans mode enfant n'appelle rien.

*17/10, passe bis — ce que deux relectures ont corrigé, et qui change la décision ci-dessus.*
- *Le rallumage (E9, point 1).* La grâce de vingt secondes ne s'arme que sur la TRANSITION éteint →
  allumé. Avant, chaque événement d'état d'un écran allumé et bloqué (`media_position`, `app_name`,
  le volume) recalait la grâce et faisait taire le tic : un Chromecast ou une Android TV qui publie
  sa position n'était JAMAIS rééteint, et chaque événement comptait pour un rallumage. Déjà allumé,
  le tic de la minute rééteint une fois par minute ; seul un vrai rallumage compte pour l'insistance.
- *Le plafond relu (E7, point 4).* La maison regarde où elle en est (`_regarder`) au passage du
  coucher et après un réglage du parent : une Echo qui joue à 30 % redescend à 20 au coucher, ou à
  25 quand le parent baisse `volume_max`, sans attendre son prochain événement — vers le bas
  seulement, un ordre par enceinte, le reflet de la jumelle ignoré, rien pendant la fenêtre de
  démarrage.
- *Minuit (E8, point 5).* La minute à cheval sur minuit va au jour d'AVANT : une TV allumée de 23:58
  à 00:02 compte 120 s le jour nouveau, plus 180. *Le décompte (E21, point 6)* : l'état lu ajoute le
  temps depuis le dernier tic pour un écran allumé ; l'écran ne saute plus d'une minute au sondage.
  *Le journal (point 8)* : un écran sans le bit `TURN_OFF` note « sans interrupteur » une fois par
  blocage, plus à chaque tic.
- *La carte (E15, E16, points 3, 9, 11).* Le budget d'écran suit ce qui AGIT : un profil désactivé
  ou des limites levées n'ont plus de pied du temps ni d'« Écoulé » (§ 6.3). La puce « Revient à
  08:30 » de la carte étroite mesurait 143 px pour 142 de contenu à 390 px (127 à 360, 107 à 320) :
  rembourrage de 10 px, et sous 148 px de contenu — où une des sept langues ne tient plus (l'espagnol
  fait 148) — l'heure seule avec la lune ou le sablier, le chiffre du haut disant déjà l'état. Les
  barres disent le plafond au lecteur d'écran (`aria-valuetext` : « max 40 % », « Muet · max
  40 % »).
- *La popup (E18, E19, points 10, 12, 13).* La seconde ligne de l'en-tête suit la maquette :
  « Mode enfant · profil de Lino », ou « Limites levées jusqu'à 18:10 » ; le panneau garde le détail.
  La feuille « Réglages parent » a sa coquille (`FicheEnfant`, fichemedia.jsx) sur le modèle de
  `FicheMedia` : le `BottomSheet`, la frontière Suspense DEDANS avec un repli de hauteur, le contenu
  seul à la demande (ficheenfant.jsx n'exporte que lui) — avant, rien ne s'affichait pendant le
  chargement et un morceau manquant tombait dans la barrière du lecteur. Au passage, la ligne sous le
  nom de toute fiche (`EnteteFiche`) ne coupe plus un mot au milieu (« Schlafzimm / er » à 320 px).
- *La place (§ 12, point 14).* La pastille, le glyphe du haut, le pied du temps et la puce « Revient
  à » vivent dans `carteenfant.jsx`, UN import à la demande (`CarteEnfant quoi=…`) monté sous profil
  seulement dans un `Suspense` au repli nul ; la hachure du plafond passe dans la feuille
  (`o-jauge-plafond`). Le boot passe de 1 096 857 à 1 095 061 octets (−1 796 ; 2 Ko étaient visés —
  reste au démarrage ce que la carte dit avant le module : le mot du reste pour la surface, la
  borne du geste, le magasin). Le levier suivant reste le magasin à la demande.

*17/10, passe bis 2 — la dernière relecture, et ce que ses essais ont ajouté.*
- *Minuit pour chaque écran (E8, point 3).* Le partage de minuit ne valait que pour le PREMIER
  écran du tic : celui-ci faisait basculer le jour, et le second recevait tout l'intervalle sur le
  jour neuf — deux écrans allumés à 23:58 comptaient 0 et 60 s à minuit, au lieu de 0 et 0.
  `_avancer` scinde sur `depuis < minuit <= t` seul, et le jour d'avant ne reçoit sa part que
  s'il n'a pas encore basculé ; le cas d'un événement après minuit qui fait basculer le jour avant
  le tic est tenu aussi. *Un écran qui quitte le profil* emporte sa ligne « sans interrupteur ».
- *La carte du mode enfant, un décor (§ 12, point 4).* `CarteEnfant` est un `lazyRecharge` avec
  `{ decor: true }`, comme l'orbe et le fond météo : un morceau introuvable après le rechargement
  unique ne rend rien, au lieu de jeter — aucune barrière ne sépare la carte de la vue, et
  « Cette vue n'a pas pu s'afficher » valait pour toute maison sous profil.
- *Le rallumage, l'interrupteur, le chiffre* changent l'ADR 0212 (un état muet n'est pas un
  rallumage ; un écran bloqué n'a plus d'interrupteur) et l'ADR 0207 (le chiffre du volume suit le
  doigt).

## Ce que cela coûte

Le boot passe de 1 090 410 à 1 096 857 octets (+6 447 : la carte, la jauge, le pied du
temps, le magasin), 3 143 sous la borne de 1 100 000 : il ne reste pas de réserve nommée ; le
levier suivant est l'import à la demande du magasin (§ 12 de la conception, écrit mais pas
pris) ou l'historique à la demande. *(17/10, passe bis : 1 095 061 octets, 4 939 sous la borne ; passe bis 2 : 1 095 168, 4 832 sous la borne.)* Une règle qui contourne le gel — bornée, et la seule. Le
sondage de l'écran à 60 s. Le temps d'écran compte tout ce qui n'est pas éteint, menu compris.
`volume_level` sur une Apple TV dépend du téléviseur : sans lui, pas de plafond sur la TV (la
carte ne dessine pas de barre), le temps compte quand même. Une Apple TV « Chambre » qui ne
serait pas celle de Lino compterait les parents : à lui de choisir l'appareil. Les tests : la
suite JS passe de 3 098 à 3 132, pytest de 2 244 à 2 329 (et un `xfail` d'avant) ; passe bis 2 : 3 142 et 2 359.

## Ce qu'on n'a pas fait

Par lecteur (E1 B) ou par personne (E1 C) ; un budget par application, un temps d'écoute sur
une Echo, un plafond par heure du jour ; plusieurs enfants dans une pièce (un second profil est
une seconde zone) ; une vue dédiée au mode enfant (« un appareil = sa carte + sa popup ») ; le
« Ne pas déranger » et la prochaine alarme en rangées. Le temps d'écran de la feuille est UN
segment, qui écrit le même budget en semaine et le week-end (la conception en voulait deux) ;
la popup ne redit pas « par vous » dans le bandeau de la levée.

## Ce que les tests tiennent

`tests/python/test_enfant_calcul.py` (le défaut est la maquette ; `lire_config` et
`poser_patch` ; les heures, minuit franchi, la reprise ; le plafond au coucher ; un volume
redescend au plafond, jamais plus haut ; un profil éteint ou levé ne ramène rien ; un ordre par
appareil toutes les cinq secondes, le reflet ignoré ; le temps d'écran et le budget ; la
coupure une fois par minute ; `normaliser` ; la vue d'un lecteur), `test_enfant.py` (le
recensement par zone et par ajout, la jumelle ; une Echo qui change de pièce ; le volume monté
à la voix redescend sur l'entité qui a publié ; le temps compté sur l'état, l'écran éteint à la
fin, rallumé il attend vingt secondes ; au coucher le plafond baisse et l'Echo se met en pause
sauf le son pour dormir ; la fenêtre de démarrage ; un fichier abîmé ; `enregistrer` ; l'arrêt ;
le module ne connaît ni `turn_on` ni `media_play` ni `volume_up`), `test_rechargement`,
`test_demarrage`, `test_robustesse` ; `tests/lecteur.test.mjs` (les deux phrases),
`enfantetat` (le magasin, le budget, les durées), `jauge_plafond` (la zone hachurée, le
cadenas, `aria-valuemax`), `carte_media` (la pastille, le pied du temps, la carte étroite
bloquée, la compacte), `fiche_media` (le panneau, la ligne du plafond, la rangée, la phrase des
Restrictions), `fiche_enfant` (la feuille, panneau par panneau), `chauffage_observer`
(« Observer sans agir » compte le mode enfant), `feuilles` et `recharge` (une feuille à la
demande de plus).
