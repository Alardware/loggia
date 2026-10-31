# 0300 — Ce que la comparaison avec Gladys a corrigé : télécommande, chiffre et zone, monoxyde, chauffe-eau, présence ; l'alarme à secteurs, NON corrigée

*30 octobre 2026 — à l'essai (rien de publié) ; chantier G1, d'après `audit/gladys-integrations-3010.md` (« Oui, les 9 »)*

## Le problème

La comparaison avec 24 intégrations Gladys a servi de liste de contrôle. Elle a
montré neuf défauts ; ce chantier en corrige cinq et laisse D9 NON corrigé (D2,
D3 et D4 vont à d'autres chantiers) :

- **D1** — la touche « Lecture » d'une Android TV en ADB envoyait `RESUME`, qui
  vaut 224 dans `androidtv.constants.KEYS` : KEYCODE_WAKEUP, le réveil.
- **D5** — la zone d'une mesure se jugeait sur la valeur brute, le chiffre
  s'écrivait arrondi : 39,6 % s'affichait « 40 % · Bon », quand 40 est « Idéal »
  sur la jauge.
- **D6** — le monoxyde de carbone se lisait en ppm quelle que soit son unité :
  300 µg/m³ (Airly), un air sain, aurait été « Danger ». Le serveur, lui, ne
  suivait que les ppm. Et le commentaire de la table attribuait 9 et 35 ppm à
  l'OMS.
- **D7** — un chauffe-eau (`water_heater`) s'écrivait par son état brut, « eco »
  dans les sept langues, et Objets le comptait « actif » faute de `hvac_action`.
- **D8** — toute personne hors de la maison était « Absent » : dans une zone de
  Home Assistant, ou quand son téléphone se taisait. Pour `presence.py`, un
  téléphone muet n'est pas une maison vide.
- **D9** — « alarme armée » voulait dire « n'importe quel panneau armé » : le
  garage seul armé, ouvrir la porte de la maison envoyait « Ouverture pendant
  que l'alarme est armée ».

## La décision

**D1.** La Lecture d'Android TV en ADB est `input keyevent 85`
(KEYCODE_MEDIA_PLAY_PAUSE) : l'intégration passe tel quel au shell ADB ce que
`KEYS` ne connaît pas. Précédent et suivant ne sont pas dessinés par le pavé de
la télécommande (la piste passe par le lecteur, `media_previous_track`) ; leurs
valeurs AVANCENT dans la vidéo chez plusieurs intégrations (REWIND /
FAST_FORWARD, `skip_*` de pyatv, Rev / Fwd de Roku) : un commentaire le dit, et
un test rappelle de les revoir le jour où le pavé les dessinerait.

**D5.** Partout où un chiffre et son mot s'affichent ensemble — la carte d'une
mesure, sa compacte, sa fiche, Objets, la fiche de confort d'une pièce et sa
barre, le CO₂ de l'Accueil et de la bannière —, la zone se juge sur le chiffre
**tel qu'il s'écrit** : arrondi à la précision affichée (une décimale pour une
température, aucune ailleurs), dans l'unité du capteur, avec l'arrondi de
l'écriture (`Intl`, la moitié s'éloigne de zéro), puis ramené au repère de la
table (`arrondiMesure`, `valeurEcrite`, confort.js). Le bruit binaire d'une
conversion s'efface : 73,4 °F valent 23 °C, « Idéal ». `zoneMesure` reste un juge
exact de ce qu'on lui donne : les tests aux bornes ne bougent pas.

**D5 pour le monoxyde : vers le haut, jugé en ppm.** Son chiffre s'arrondit vers
le haut, comme le message de la veille du serveur (`math.ceil`) : 35,4 ppm s'écrit
« 36 » et se dit « Danger ». Sa zone se juge sur son **ppm arrondi vers le haut**,
`Math.ceil(versPpmCo(n))`, quelle que soit l'unité du capteur ; le chiffre, lui,
reste écrit dans l'unité du capteur. `ceil(ppm) > 35` exactement quand la valeur
lue dépasse 35 ppm : la carte, la carte Sécurité de Maison (`coDanger`, sur la
valeur lue) et le téléphone disent la même chose ; un danger ne s'arrondit jamais
à la baisse. Prix accepté : sous 9 ppm, une valeur non entière (8,2) se dit
« Moyen · aérez » — le prudent. (Relecture de G1 : juger l'arrondi dans l'unité
faisait de 40,01 mg/m³, soit 34,92 ppm, un « 40,1 » — 35,003 ppm, « Danger » —
quand la carte Sécurité et le serveur se taisaient.)

**D6.** La famille `co` n'accepte que des ppm, ou une unité qui s'y ramène, à
25 °C et 1 atm : mg/m³ × 24,45 / 28,01 (≈ 0,873), µg/m³ mille fois moins, ppb ÷ 1000.
Une unité écrite à la main se reconnaît (« PPM », « ug/m3 », le mu grec) ; une
unité absente ou inconnue ne se devine pas — la mesure reste hors de la table,
sous son nom « CO », dans la section Air d'Objets, sans zone, et n'entre pas dans
la carte Sécurité. Le chiffre
s'écrit dans l'unité du capteur (une décimale en mg/m³), les repères de la barre
aussi (10 et 40 mg/m³). Une seule table, des deux côtés : `VERS_PPM_CO`
(unites.js) et `UNITES_CO` (unites.py). Le serveur suit désormais les monoxydes
de ces unités et prévient en ppm. Les seuils ne changent pas (9 et 35 ppm) ; le
commentaire dit d'où ils viennent : les normes de l'**EPA** ; l'OMS dit 10 mg/m³
sur 8 h et 35 mg/m³ sur 1 h.

**D7.** Sur la carte générique et la pastille, un chauffe-eau dit son mode
traduit — les sept modes standard : Éco, Électrique, Gaz, Pompe à chaleur, Forte
demande, Performance, Arrêt —, puis la température relevée et la consigne, comme
un climat : « Pompe à chaleur · 52,5° → 55° » ; arrêté, la consigne se tait. Un
mode propre au fabricant reste tel quel. Il n'est **actif** (Objets, lavis de la
carte) que si un attribut connu dit qu'il chauffe : `hvac_action` à `heating` ou
`preheating`. Home Assistant n'en publie aucun pour un `water_heater` : sans lui,
jamais. La carte « Eau chaude » complète est le chantier G3.

**D8.** L'état d'une personne ou d'un traceur se dit en un mot (`motPresence`,
presence.js) : à la maison, « Absent » pour `not_home`, le **nom de la zone**
Home Assistant tel quel — jamais traduit, c'est le nom que la maison lui a donné —,
et « Inconnu » pour `unavailable`, `unknown`, vide ou une entité absente — la
liste `MUETS` de presence.py. Partout où une personne se dit : sa carte, la carte
générique (un traceur y écrivait `not_home`), la pastille, la carte Présence et
sa feuille, l'avatar de l'Accueil, le journal. Le compteur « 1 / 3 » et l'avatar
estompé restent : seul `home` est la maison.

**D9 — NON corrigé.** La règle d'avant G1 reste : avec plusieurs
`alarm_control_panel`, un panneau armé, et **n'importe quel ouvrant prévient**
(« Ouvert, alarme armée » à l'écran, « Ouverture pendant que l'alarme est
armée » au téléphone). Le garage seul armé, la porte de la maison prévient donc
toujours.

Pourquoi : **Home Assistant ne relie pas un ouvrant à un secteur.** Rien, dans
ses registres, ne dit quel panneau couvre quelle porte ; tout rattachement est
une supposition, et chaque supposition essayée a perdu une intrusion :
- par la **zone** : la Maison armée sans zone, le Garage zoné et désarmé — la
  porte d'entrée se taisait ; puis la centrale armée rangée dans « Cave », un
  second panneau désarmé dans « Entrée » — la porte de l'Entrée se taisait. La
  zone d'une centrale dit où elle est POSÉE, pas ce qu'elle protège ;
- par l'**étage** : la centrale rangée à la cave, armée, un second système au
  garage du rez-de-chaussée — l'entrée et le salon se taisaient ;
- par l'**appareil** : une centrale filaire désarmée, simple passerelle de ses
  capteurs, et Alarmo (avec son appareil) armé — la porte, capteur de la
  centrale, se taisait.

**Une alerte de trop vaut mieux qu'une intrusion perdue.** Un panneau
`unavailable` ou `unknown` ne compte jamais comme armé : c'était déjà vrai avant
G1 (son état n'est pas « armé »), ce n'est donc ni un changement ni une perte, et
aucun code ne l'ajoute. Le code de rattachement (`panneauxCouvrants`, `lieuDe`,
`panneaux_couvrants`, `_lieux`) est retiré ; `attention.js`, `state.js`,
`securite.jsx` et `alertes.py` sont revenus à leur état d'avant G1.

Piste pour plus tard : un réglage manuel « cet ouvrant appartient à ce
secteur », en CORRECTION seulement (règle « tout opérationnel sans configurer ») —
sans lui, tous les panneaux comptent, comme aujourd'hui.

Choix pris sans lui demander (règle « une question ne bloque pas ») :
- le monoxyde arrondi vers le haut plutôt qu'au plus proche (voir D5) ;
- un monoxyde sans unité n'est plus de la famille (« rien ne dit des ppm ») ;
- D9 laissé NON corrigé (décision finale de G1b, après trois règles de
  rattachement qui perdaient chacune une intrusion — voir D9) ;
- la démo porte D6 (un monoxyde en µg/m³ au bureau), D7 (un chauffe-eau dans la
  salle de bain) et D8 (Alex au « Travail », le téléphone de Sam muet) ; D9,
  non corrigé, n'a rien de nouveau à montrer.

## Les conséquences

- **Redémarrage de Home Assistant** : oui — `veilles.py` et `unites.py`
  changent (`alertes.py`, lui, est revenu à son état d'avant G1).
- Tests : `tests/telecommande.test.mjs`, `tests/g1_chiffre_zone_co.test.mjs`,
  `tests/g1_chauffe_eau_presence.test.mjs`, `tests/g1_alarme_secteurs.test.mjs`,
  `tests/python/test_g1_co_unites.py`, `tests/python/test_g1_alarme_secteurs.py`.
  Assertions modifiées, commentées « ASSERTION MODIFIÉE (30/10, G1-D5/D6) » : des
  sources épinglées (`zoneCo2`, la fiche de confort, `versRepere`) et
  `cleMesure('carbon_monoxide')` sans unité, qui vaut désormais `null`.
- Catalogues : quatre clés nouvelles dans les six langues — « Électrique »,
  « Pompe à chaleur », « Forte demande », « Performance » ; « Éco », « Gaz »,
  « Arrêt », « Inconnu » existaient. Polonais nouveau, aucune valeur réécrite.
- Pas fait : D9 (voir plus haut) ; la carte « Eau chaude » (G3) ; la liste des secteurs dans la popup
  de l'alarme (S3 de l'audit) ; précédent / suivant d'une télécommande, pas
  dessinés.
