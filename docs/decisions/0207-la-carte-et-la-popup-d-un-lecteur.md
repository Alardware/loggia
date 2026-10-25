# 0207 — La carte et la popup d'un lecteur

*17 octobre 2026 — accepté, à l'essai (chantier Médias ; rien de publié). La conception : `docs/chantier-medias.md`, M2 A, M5 à M8, M10 à M13, M15 à M19 ; sa maquette « Cartes médias », cadres 1a à 1e.*

## Le problème

La carte d'un lecteur datait de la vue Médias d'avant : la pochette dans la plaque, un
état en un mot (« Lecture », « En pause » même sur un lecteur qui ne jouait rien), une
bascule sur toute Echo (ses bits on/off ne coupent rien), précédent et suivant sur la
carte, le volume en accent sans son chiffre, `media_play_pause` à l'aveugle. Sa fiche
peignait la pochette floutée en fond, tirait son accent de la pochette, dessinait des
boutons « verre » et des commandes inertes — aléatoire et répéter sur une Apple TV qui ne
sait pas, « Parcourir » sur une Echo qui n'a pas de bibliothèque —, écrivait « 0:00 » et
« — » quand rien ne jouait, et des initiales inventées pour les applications (« D+ »,
« PV »). Au téléphone, la carte n'avait pas la grille commune (ADR 0202). Sa maquette
« Cartes médias » dit autre chose, valeur par valeur.

## La décision

**La carte entre dans le gabarit (M5)** : standard 184 sur 225 de large, compacte 88,
176 au téléphone sur la grille commune 1c (`o-gabarit`, `o-seul-large`, `o-seul-etroit`,
`ChiffreHaut` : le volume en haut, « Muet » quand le son est coupé). C'est la première
carte d'un lecteur dans cette grille. Les tailles ne bougent pas.

**La phrase d'état (M6)** est une fonction pure, `phraseLecteur` (lecteur.js), que la
carte, la compacte, la popup et « En ce moment » partagent, la première qui s'applique :
« Indisponible depuis 14:20 » (rouge, le liseré qui respire), « Annonce : « À table ! » »,
« Éteinte », « Rien en lecture », « En pause · {titre} », « {titre} · {artiste} » — une
série « {titre} · S4 E1 », une radio sa station, une TV sans titre son application. Le mot
« Lecture » comme état part ; un lecteur inactif ne dit plus « En pause ».

**Les états (M7)** : en lecture, en pause, rien en lecture, éteinte, indisponible, une
annonce en cours. Le pied — la puce lecture/pause et la barre de volume — n'existe
qu'allumée ; indisponible, aucune commande, ni sur la carte ni dans la popup. Une TV
`idle` (ou `on`) dans le menu d'une application dit « Rien en lecture » : l'état prime sur un
titre que l'appli aurait prêté ; l'appli reste nommée à sa place de source (passe bis du
17/10 — elle disait « En pause · Netflix » et ouvrait un lecteur avec ses commandes). Au
téléphone, la progression est à la carte large seule : le § 6.2 ne la liste pas, et sous un
nom de deux lignes elle faisait sortir le pied du budget de 150 px (ADR 0202).

**La couleur est celle de la pochette (M8)**. En lecture ou en pause, la plaque porte la
pochette et le lavis prend la teinte dominante de l'image (`pochette.js` : un canvas de
40 × 40, la moyenne pondérée — l'algorithme qui vivait dans la fiche —, mise en cache par
titre et artiste, parce que l'adresse d'une pochette change à chaque état) : sur la carte,
0,20 en haut en lecture, 0,08 en pause, 0,03 en bas (la compacte, 0,16 en lecture) ; sans
pochette, ou si le canvas est souillé (CORS), le rose de la maison (`--o-rose-rgb`) ; le
temps qu'une nouvelle pochette se lise, la dernière teinte connue reste (passe bis du 17/10 :
la carte passait par le rose). La barre de volume reste en accent, comme la maquette. La
popup teinte le panneau du haut du même dégradé (0,22 → 0,06).

**L'interrupteur s'il sert (M10)** : la bascule seulement avec les bits `TURN_ON` et
`TURN_OFF` et hors Echo (`alexa` : « Une Echo ne s'éteint pas ») ; à sa place, en haut à
droite, la source — `app_name` seulement (« Netflix », « Amazon Music ») : `source` d'une
Echo (« Local Speaker ») n'est pas une source. Au téléphone, la bascule part de la carte ;
éteinte, la ligne de commandes porte une puce « Allumer » (`turn_on`) ; l'arrêt est dans
la popup.

**Ce que les bits décident (M11)** — `commandesLecteur` : lecture/pause (`PLAY` ou
`PAUSE`), précédent et suivant, aléatoire et répéter, chercher (`SEEK` et une durée), le
volume si `volume_level` existe, le muet (`VOLUME_MUTE`), « Parcourir » (`BROWSE_MEDIA`
— il quitte donc les Echo), les applications si `applisDe` en trouve, la télécommande si
`telecommandePour` en dessine une. Rien d'inerte à l'écran : ce qu'un lecteur ne sait pas
n'est pas dessiné. Chez lui, l'officielle d'une Echo (5644) ne sait ni lecture ni pause :
c'est sa jumelle HACS (318399) qui commande (ADR 0208).

**17/10 — passe bis 2 (M11).** Sur un lecteur qui dit « Rien en lecture », la puce
lecture/pause n'est PAS dessinée — ni au pied de la carte large, ni sur la ligne de commandes
de la carte étroite (qui garde sa barre de volume et ses 44 px), ni sur la compacte et la
standard de l'Accueil, ni dans la popup (sa rangée de commandes vit dans le panneau de ce qui
joue, absent) : une Echo `idle` montrait une puce « Lire » éteinte, donc inerte, contre M11.
Le volume reste. La règle est celle de `reprenable` (`useVueLecteur`) : quelque chose à
reprendre — en lecture, en pause, ou un titre — et `phraseLecteur` dit « Rien en lecture »
exactement quand il n'y a rien ; en pause SANS titre, elle dit « En pause » (§ 5, ligne 5),
et la carte garde sa puce.

**17/10 — le chiffre du volume suit le doigt (passe bis 2 du chantier Mode enfant, point 1).** Sa
capture : sur la carte large d'une Echo, la barre suit le doigt mais « Volume 50 % » reste figé
jusqu'au relâcher et à la réponse de l'appareil — sa maquette fait suivre le chiffre en direct.
`RmJauge` peignait à la main (le rendu React ne suit pas un doigt à 60 images par seconde) et ne
disait rien du geste à personne : elle annonce maintenant la valeur sous le doigt (`onGlisse` —
au pas, bornée au plafond du mode enfant, une fois par valeur, puis `null` quand le doigt s'en va,
APRÈS l'ordre), et `useVueLecteur` la garde dans un état (`suivre`) que la carte et la popup
dessinent : le mot « Volume {n} % » de la carte large, le chiffre de la carte étroite, le
pourcentage de la popup, ce que dit la surface. La barre reste peinte à la main ; l'ordre
`volume_set` part toujours au relâcher, UNE fois, et `useOptimiste` garde la valeur 4 s. Tirer la
barre d'un son coupé le rend tout de suite : le chiffre ne dit plus « Muet » pendant le geste ni
en attendant la réponse (un optimiste de plus, 4 s, que le bouton « Couper le son » de la popup
partage). La compacte n'affiche pas de volume : rien à suivre. Les lampes n'ont pas ce suivi — leur
pourcentage saute au relâcher, par le geste d'abord — ; `onGlisse` est offert à qui le veut.
`tests/jauge_plafond.test.mjs`, `tests/carte_media.test.mjs` et `tests/fiche_media.test.mjs` le tiennent.

**17/10 — pas de chiffre fantôme (passe bis 3 du chantier Mode enfant, point 1).** La valeur sous
le doigt n'expirait pas : sur une Echo, un geste à 80 % pendant qu'elle devenait indisponible, puis
son retour à 35 % — la carte gardait « Volume 80 % » (aria 80), et « Muet » ne pouvait plus
reparaître. La barre retirée sous le doigt ne reçoit jamais le relâcher (il tombe sur un élément
détaché). Deux gardes : `RmJauge` lâche le doigt — `onGlisse(null)`, sans ordre — quand elle est
démontée ou devient inerte pendant un geste, et reprend alors le dessin du moment ; `useVueLecteur`
oublie la valeur glissée dès que le lecteur n'est plus vivant (indisponible, éteint). Le même
mécanisme sert désormais la luminosité (ADR 0197) et le volume maximum des réglages parent (ADR 0210).
`tests/jauge_plafond.test.mjs` et `tests/carte_media.test.mjs` le tiennent.

**La popup, une page (M12)**, réécrite dans `fichemedia.jsx` (à la demande ; la coquille
`FicheMedia` garde la feuille et pose la frontière Suspense DEDANS, et lui passe la VUE de
la carte, `useVueLecteur`) : l'en-tête commun (`EnteteFiche` : la plaque — la pochette en
lecture —, le nom, « {pièce} · {genre} » où le genre est le modèle du registre, sinon
« Téléviseur » ou « Enceinte » ; la bascule si elle sert, l'épingle, UNE croix) ; le
panneau de ce qui joue (la pochette de 88 px, le titre, l'artiste, « En direct » pour un
flux sans durée qui n'est pas une application, « En lecture · {source} » ou « En pause »,
la progression de 6 px qui se glisse si `SEEK`, au clavier aussi, la valeur lue en temps,
3 s d'avance ; la rangée des commandes 44 · 52 · 68 · 52 · 44, la lecture en accent, la
choisie en bleu plein, « 1 » en exposant sur répéter one ; « Rien en lecture » et la
phrase qui dit quoi faire ; « Éteinte », « Ou lancez une appli : elle allume la TV. » et la
puce « Allumer ») ; le volume (la puce du muet, la barre de la maison en piste 32, « 30 % »
ou « Muet ») ; le panneau d'une Echo (ADR 0209) ; le panneau d'une TV — Applications /
Télécommande, des puces de 56 px avec le nom et, seulement si Loggia connaît la marque
(`marqueDe`), le logo — plus d'initiales (M18) —, la lancée en bleu plein, « Toutes les
applis · {n} », le pavé rond (208, les flèches de 44, l'anneau OK de 76), Retour · Accueil
· Lecture · Veille (`turn_off` ou `turn_on` selon l'état connu) ; la bibliothèque pour un
lecteur qui sait parcourir — les favoris gardés en puces (M19), « Parcourir la
bibliothèque » qui ouvre le navigateur d'avant, inchangé — ; « L'appareil ». Partent le
fond flouté, l'accent de la pochette sur les boutons, les boutons « verre », les boutons
inertes, « 0:00 » et « — », les initiales.

**Les gestes et leur sûreté (M13)** : toucher la surface ouvre la popup ; la puce envoie
`media_pause` si le lecteur joue, `media_play` sinon ; la barre envoie `volume_set` au
relâcher, précédé de `volume_mute {false}` si le son était coupé ; la bascule `turn_on` ou
`turn_off` selon l'état affiché ; le muet sa valeur ; `useOptimiste` : 6 s pour la lecture
et la marche, 4 s pour le volume, 3 s pour la position. Une seule phrase ou annonce en vol
à la fois. Au téléphone, la plaque n'est pas un interrupteur. `media_play_pause` part de la
carte, de la compacte et d'« En ce moment » ; un doigt qui fait défiler ne règle rien
(`pan-y`).

**Le filet du volume (18/10).** Ses 4 s ne couvraient pas la réponse d'une Echo : elle se
règle par sa jumelle HACS, qui rapporte le volume en 1,9 à 2,8 s (mesuré dans son
historique), et le pont ne le voit qu'au relevé suivant (`HASS_POLL_MS`, 2 s). La barre
retombait sur l'ancien volume avant de se poser sur le nouveau (son retour : « il revient
en arrière avant de se mettre là où je l'ai réglé »). Le volume et le muet prennent
désormais cinq secondes de réponse et un relevé — 7 s par défaut ; une réponse, quelle
qu'elle soit (la maison qui ramène au plafond), lève toujours le filet aussitôt.

**L'en-tête de la famille (M15)** : « Multimédia » et « 2 en lecture sur 7 » ou « Rien en
lecture », au pluriel de chaque langue, sans puce d'action, dans son module à la demande
(`entetemedias.jsx`), abonné aux lecteurs visibles et à leurs jumeaux. **L'Accueil ne
change pas (M16)**, sauf ses mots et ses services : la tuile « MÉDIA EN LECTURE » et « En
ce moment » comptent les lecteurs de la maison, lus avec leur jumeau (`compteLecteurs`),
la ligne prend `phraseLecteur`, « Mettre en pause » envoie `media_pause` à l'entité qui
commande. **La compacte (M17)** garde sa disposition, prend la phrase, la pochette et la
teinte ; sa seule commande reste lecture/pause, explicite, et elle lit sa panne dans sa vue.

**Pas de serveur (M20).** Rien de ce chantier n'est différé ni ne survit à l'onglet.

Le mode enfant (M4 A) attend son chantier ; l'ADR 0210 lui reste réservé.

## Ce que cela coûte

La place au démarrage s'est faite d'abord : la phrase pour Alexa, les favoris, le
navigateur de médias et les applications d'une TV, que la fiche seule emploie, ont quitté
App.jsx pour `fichemedia.jsx` et `navigateurmedias.jsx` (le boot : 1 093 138 → 1 071 416
octets, −21 722) ; la carte nouvelle, la lecture d'un lecteur et l'Accueil ont repris
16 418 octets : 1 087 834 à la fin, 12 166 sous la borne (−5 304 depuis le départ). La
teinte d'une pochette se calcule une fois par titre et artiste, dans un canvas ; une
pochette servie d'ailleurs que Home Assistant rend le rose. Le pied de la carte étroite
s'écrit deux fois (les deux écritures de la grille 1c). Les comptes changent : sept cartes
chez lui au lieu de quatorze (ADR 0208). Les textes nouveaux (quatre lots polonais)
attendent Seba882.

## Ce qu'on n'a pas fait

Les appels et l'interphone (M3 A, ADR 0209), le mode enfant (M4 A), un minuteur de mise en
veille (le serveur), les sœurs « Prochaine alarme » et « Ne pas déranger » en rangées de la
popup, les groupes dessinés comme des groupes (aucun bit `GROUPING`), les couleurs par
application et les logos que Loggia ne connaît pas, l'appui long, la tuile d'une pièce et
la fiche universelle (hors les mots de M6 et les services de M13).

## Ce que les tests tiennent

`tests/lecteur.test.mjs` (la lecture fusionnée, les bits, la phrase et ses états, le
volume, la position, le compte), `pochette`, `lecteuretat` (la teinte et son cache,
l'annonce), `carte_media` (la carte large, étroite, la compacte : le lavis, la bascule
selon les bits, le pied allumée seulement, les services explicites, l'abonnement au
jumeau), `fiche_media` (chaque panneau, chaque genre, un lecteur mort, les gestes),
`entete_medias`, `demo_medias` (chaque état de la maquette à toute heure) ; les tests qui
épinglaient l'existant, mis à jour sans être effacés : `lot13_media_scenes`, `lot13_vues_perso`,
`lot16_fiches_panne`, `lot16_etat_unknown`, `feuilles`, `edition_clavier`, `chiffre_carte_etroite`,
`clair`, `regles`, `icone_choisie`, `recharge`, `accueil_onglets`, `accueil_essentiel`,
`favlecture`, `medias`. La suite entière passe de 3 017 à 3 069 tests ; `pytest`
inchangé (2 241 passés, 1 xfail).
