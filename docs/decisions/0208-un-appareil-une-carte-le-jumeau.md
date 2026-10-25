# 0208 — Un appareil, une carte : le jumeau

*17 octobre 2026 — accepté, à l'essai (chantier Médias ; rien de publié). La conception : `docs/chantier-medias.md`, M1 B et M14, § 7.3 ; tranché par lui le 17/10 (« M1 B, un appareil, une carte »).*

## Le problème

Une même enceinte est souvent exposée DEUX fois dans Home Assistant : par son
intégration d'origine et par celle qui la pilote. Chez lui, chaque Echo l'est par
« Alexa Devices », l'officielle (les bits 5644 : le volume, le muet, `play_media` — ni
lecture, ni pause, ni suivant —, et ses sœurs `notify` « Annoncer » et « Parler », ses
capteurs), et par `alexa_media_player`, celle de HACS (318399 : tout le transport, la
phrase `custom`). Au registre ce sont deux appareils ; `resolveMedia` ne fusionnait que
les entités d'un même `device_id` (le compagnon Music Assistant) : rien ne les liait, et
Objets › Multimédia montrait quatorze cartes pour sept appareils — trois Echo en double,
le groupe en double, Spotify (une entrée de compte) et les deux haut-parleurs de sonnette.
La phrase pour Alexa, seule, retrouvait la jumelle HACS (`cibleAlexa`, favlecture.js).

## La décision

**Un appareil, une carte (M1 B).** `resolveMedia` (resolve.js) classe les `media_player`
actifs :
1. **hors Multimédia** : l'entité d'un appareil `entry_type: service` (Spotify), ou d'un
   appareil qui porte une `camera.` (le haut-parleur d'une sonnette : Sécurité le garde
   par sa caméra) ;
2. **le jumeau** (`ma`) : la sœur du même appareil (`pickSibling`, Music Assistant), sinon
   la jumelle que `cibleAlexa` retrouve — l'un des deux identifiants finit par l'autre, ou
   les deux noms portent exactement les mêmes mots —, dans les deux sens ; la carte garde
   pour `haid` l'entité de l'intégration officielle (ses sœurs « Annoncer » et ses capteurs
   sont à elle), jamais la jumelle HACS quand l'autre n'en est pas une ; sans HACS d'aucun
   côté, l'entité d'origine reste la première, et à défaut de tout signe, celle qui sait le
   moins de gestes garde la carte ;
3. le reste, une carte par entité.

Chaque lecteur dit aussi ce que la popup et l'annonce lisent : `alexa` (une Echo, par
l'une ou l'autre intégration), `modele` (le genre, sous le nom), `annonce` (la `notify`
« Annoncer » de l'officielle, reconnue à sa clé de traduction `announce`, jamais à son
nom), `annonceHacs` (la jumelle qui sait `notify.alexa_media`), `groupe` (ADR 0209).

**Le jumeau remplace le compagnon (M14).** `lireLecteur` (lecteur.js) fusionne les deux
entités : `ctl` commande le transport — la jumelle quand elle sait plus de gestes, ou
quand la principale ne répond plus —, `volId` le volume (l'entité qui a le bit et dit son
niveau), ce qui joue se lit sur celle qui joue ; `bits` est l'union des deux ; `indispo`
quand aucune ne répond. La carte, la compacte, la popup, l'en-tête de la famille et
l'Accueil s'abonnent à l'entité ET à son jumeau ; l'identifiant du jumeau ouvre la même
carte ; une épingle ou une vue personnelle qui nommait la jumelle HACS la montre sous la
carte de l'officielle.

**La même liste partout** : `medPlayers()` sert à Objets (les jumelles sont prises avec
leur carte ; une entité `media_player` qui n'en est pas n'a pas de carte, et l'appareil
de la jumelle ne revient pas), à l'Accueil (la tuile, « En ce moment »), aux pièces et aux
scénarios de l'écran. Une configuration `loggia_medias` explicite reste prioritaire, et son
jumeau se retrouve, avec ce que la résolution sait de lui.

**17/10 — passe bis, après deux relectures.** L'écart au § 7.3 est levé : le signal
premier est l'EMPREINTE des identifiants d'appareil. Le serveur (`discovery.py`) transmet,
pour chaque appareil qui porte un `media_player`, `empreintes` : le SHA-256 de la VALEUR
seule de chaque identifiant, sans son domaine, tronqué à douze caractères hexadécimaux —
l'officielle et la HACS d'une même Echo se rejoignent ainsi, et le numéro de série ne quitte
jamais le serveur en clair (`INDEX_VERSION` reste 1 : un champ de plus, posé seulement là).
Côté écran, deux `media_player` d'appareils distincts qui partagent une empreinte forment la
paire ; si plusieurs la partagent, le doute : pas de paire. Le nom (`cibleAlexa`) n'est plus
que le repli, avec une frontière de mot sur le suffixe (`salon_echo` finit par `echo`,
`salon_techo` non) et l'UNICITÉ : une jumelle que deux officielles revendiquent n'est
appariée à aucune, une officielle qui en revendique deux non plus ; deux appareils qui
portent chacun leurs empreintes sans en partager aucune ne se marient pas par le nom. Dans
le doute, pas de paire : deux cartes valent mieux qu'une enceinte commandée à la place d'une
autre (le défaut reproduit : deux Echo officielles dont les identifiants finissaient pareil,
une jumelle HACS au nom par défaut, et la carte de la chambre commandait l'enceinte du
bureau). Un jumeau MORT ne commande pas : Home Assistant garde `supported_features` sur une
entité `unavailable` (une jumelle HACS dont la session a expiré), et la puce de lecture
partait dans le vide — `ctl` exige un jumeau vivant, la phrase et l'annonce ne visent la
HACS que si elle répond. L'ÉTAT d'une paire — lecture, pause, position, titre — se lit sur
`ctl` dès qu'il a des bits de transport, sur l'autre seulement à défaut : l'officielle
restait `playing` et masquait la pause de la jumelle (la démo fait miroiter l'état sur les
deux). Le GROUPE se reconnaît autrement (ADR 0209). `loggia_medias` à la main reste le
dernier recours.

**17/10 — passe bis 2 : deux gardes de plus sur la paire.** **Le repli par le nom n'apparie
QUE la paire Alexa** (`cibleAlexa`, favlecture.js) : le revendicateur est une Echo officielle
(`estAlexa` sans `estEcho`), la jumelle une entité de l'intégration de HACS ; tout autre
lecteur ne s'apparie jamais par le nom. Sans empreintes (Home Assistant pas encore redémarré
après l'installation, ou un appareil sans identifiant), un Sonos `media_player.salon`
revendiquait la jumelle `media_player.echo_salon` — son identifiant finit par `_salon` — :
l'Echo disparaissait, et la jumelle ayant plus de bits de transport, la carte « Salon »
commandait l'Echo. **La réciprocité de l'empreinte** : une paire par l'empreinte n'existe que
si chacun des deux n'a qu'UN partenaire possible — A[X], B[X, Y], C[Y] donnait A+B, C+B ou
personne selon l'ordre de la liste ; désormais personne, et pas de repli par le nom non plus,
l'empreinte a parlé. La configuration `loggia_medias` reçoit la garde `pris` : un jumeau
n'est jamais pris deux fois, ni parmi les cartes configurées ; un jumeau écrit à la main est
gardé tel quel.

## Ce que cela coûte

Sept cartes chez lui au lieu de quatorze : la tuile de l'Accueil et Objets le disent ; son
agencement d'Objets perd les cartes des jumelles. L'appariement par l'empreinte demande le
composant à jour : un fichier Python modifié ne se charge qu'au REDÉMARRAGE de Home
Assistant — jusque-là l'index n'a pas d'empreintes, le nom reste le repli, et une Echo
renommée d'un seul côté ferait deux cartes — rien de faux, deux cartes. La démo porte la paire (l'Echo Dot de la chambre, deux
appareils, deux intégrations, une empreinte commune), l'Echo de la cuisine en jumelle HACS
seule, l'Echo du bureau en officielle seule.

## Ce que les tests tiennent

`tests/resolve.test.mjs` (la paire, Spotify et la sonnette, le groupe, la configuration à
la main et son jumeau ; passe bis : la paire par l'empreinte, le doute, l'unicité et la
frontière de mot du repli, les scénarios de la relecture), `favlecture` (la frontière de
mot, l'ambiguïté), `lecteur` (qui commande, qui porte le volume, ce qui joue ; passe bis :
une jumelle indisponible, l'état lu sur `ctl`), `discovery` (les empreintes jusqu'à
`deviceMeta`), `carte_media` (l'abonnement au jumeau, l'identifiant du jumeau),
`objets_medias` (quatre cartes pour sept entités ; le capteur de la jumelle ne revient pas),
`entete_medias` et `lecteur` (le compte : la paire compte une fois et joue par sa jumelle),
`demo_medias` (huit cartes dans Multimédia ; l'empreinte de la paire, l'état miroité).
Python : `tests/python/test_discovery.py` (deux domaines, même valeur, même empreinte ;
valeurs différentes, empreintes différentes ; sans identifiant, pas d'empreinte ; la valeur
ne voyage pas).
