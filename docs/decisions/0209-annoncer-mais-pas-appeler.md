# 0209 — Annoncer, mais pas appeler

*17 octobre 2026 — accepté, à l'essai (chantier Médias ; rien de publié). La conception : `docs/chantier-medias.md`, M3 A et M9, § 6.7, § 7.2 ; tranché par lui le 17/10 (« M3 A, les appels hors chantier »).*

## Le problème

Sa maquette donne à une Echo trois panneaux : « Dire à Alexa », « Appeler » (l'interphone
vers une autre Echo, un contact Alexa, « En appel » sur la carte) et « Annonce ». Home
Assistant ne sait pas appeler : ni l'intégration officielle ni celle de HACS n'exposent
un appel, un interphone ou l'état « en appel ». Il sait annoncer — l'officielle par une
entité `notify` « Annoncer » sur l'appareil de chaque Echo (et une sur le groupe
« Partout »), celle de HACS par le service `notify.alexa_media` (`data.type:
announce`) — mais il ne raconte pas une annonce : aucun état ne dit qu'une Echo parle.

## La décision

**Appeler, non (M3 A).** Les cadres 1f et 1h ne se construisent pas : rien ne s'invente
qu'une intégration ne sait pas. L'emplacement de l'appel sur la carte porte l'état qui
manquait à la maquette, « Indisponible depuis 14:05 ».

**Annoncer, oui (M9).** Dans la popup d'une Echo, le segment « Dire à Alexa / Annonce »
(« Dire à Alexa » si la jumelle HACS existe ; « Annonce » si une `notify` « Annoncer » ou
la jumelle existe ; un seul des deux, pas de segment) : « Sur » — « Toute la maison »,
choisie par défaut, puis chaque Echo qui sait annoncer, plusieurs se choisissent —, le
champ « Votre annonce : je rentre à la maison », la puce du mégaphone, Entrée envoie,
quatre annonces toutes prêtes en puces (« À table ! », « On part dans 5 minutes », « Au
lit, les enfants », « Je rentre bientôt », traduites dans les sept langues), puis
« Annoncé sur toute la maison : « … » » ou « Annoncé sur {où} : « … » » le temps d'une
avance. Le service, par cible (§ 7.2) : `notify.send_message {message}` sur l'entité
« Annoncer » de l'officielle, sinon `notify.alexa_media {message, target, data: {type:
announce}}` sur la jumelle HACS ; les cibles d'un même service partent en UN appel.

**« Toute la maison » est la `notify` du groupe quand il en existe UN.** Le groupe se
reconnaît à ce que le registre dit qu'il est (`groupe`, resolve.js ; passe bis du 17/10) :
le modèle « Speaker Group », celui que les deux intégrations écrivent pour un groupe
d'enceintes (la famille « WHA » de l'API d'Amazon), vérifié sur les deux appareils de son
« Partout » ; un modèle connu qui dit autre chose (« Echo Dot ») est une Echo. Sans modèle
au registre seulement, sa forme, lue sur les deux appareils de la paire : il sait annoncer
et ne porte rien de ce que seule une Echo physique a — « Parler », la prochaine alarme, la
prochaine minuterie, le prochain rappel, « Drop In », à leurs clés de traduction. La règle
d'avant (« ne porte rien d'autre que son lecteur et sa `notify` ») prenait une Echo seule
pour un groupe et aurait manqué le sien : son « Partout » porte aussi une connectivité,
comme chaque Echo. Home Assistant ne dit pas qui est dans le groupe (aucun bit
`GROUPING`) : on ne l'invente pas. Sans groupe, ou avec PLUSIEURS (lequel serait toute la
maison ?), chaque Echo qui sait annoncer, l'une après l'autre (un appel par service).
Chaque groupe est proposé en puce, après « Toute la maison » et avant les Echo — avec deux
groupes, le second ne disparaît plus ; sa propre popup n'a que « Annonce ». La jumelle
HACS n'est visée que si elle répond : indisponible, l'annonce ne lui part pas.

**Les cartes visées l'écrivent six secondes** — « Annonce : « À table ! » », en accent
doux — dans l'onglet qui a envoyé, le seul qui le sache (`annoncer`, lecteuretat.js : un
magasin, une version, `useSyncExternalStore`, le motif de l'avance des lumières) ; toute la
maison, c'est chaque Echo, et le groupe, qui a sa carte. Une seule annonce ou une seule
phrase en vol à la fois (M13) : l'ordre part tout de suite, la seconde attend la réponse de
la première.

**« Dire à Alexa »** (M19) : les phrases gardées deviennent des puces de 44 px, une étoile
d'or devant, choisie le temps d'une avance quand on l'envoie ; le champ « Autre chose :
mets du jazz », la puce d'envoi et l'étoile « Garder » à côté ; « Envoyé à Alexa :
« … » ». La phrase est celle de l'utilisateur, telle quelle, 200 caractères au plus
(`phraseAlexa`), `play_media {media_content_type: custom}` sur la jumelle HACS.

## Ce que cela coûte

La phrase et l'annonce dépendent d'intégrations précises : la phrase de HACS, l'annonce de
l'officielle ou du service de HACS. Sans elles, les panneaux n'apparaissent pas — rien de
faux, mais rien non plus. L'annonce « quelques secondes » sur les cartes n'est vraie que
dans l'onglet qui l'a envoyée. La reconnaissance du groupe lit un mot du registre, « Speaker
Group » ; une intégration qui changerait ce mot ferait passer ses groupes pour des Echo :
« Toute la maison » annoncerait alors sur chacune, et deux fois sur celles du groupe — le
repli par la forme ne joue que sans modèle. La démo ne parle pas : son faux serveur ne
change aucun état sur une `notify`.

## Ce qu'on n'a pas fait

Les appels, l'interphone, « En appel » (M3 A) ; les groupes dessinés comme des groupes ;
« Prochaine alarme » et « Ne pas déranger » en rangées.

## Ce que les tests tiennent

`tests/fiche_media.test.mjs` (le segment, « Toute la maison » par le groupe en un appel,
les cibles choisies — l'officielle par sa sœur, la jumelle par le service de HACS —, les
cartes visées, une seule en vol, le groupe sans segment ; passe bis : le groupe en puce, deux
groupes → chaque Echo, une jumelle indisponible sans « Dire à Alexa » ni annonce), `resolve`
(le groupe, et lui seul : par son modèle malgré sa connectivité, par sa forme sans modèle,
jamais une Echo seule), `lecteuretat` (l'annonce posée et expirée), `carte_media` (la carte
visée l'écrit).
