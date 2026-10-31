# 0301 — Les notifications vont aux bonnes personnes, et la collecte se rappelle la veille

*30 octobre 2026 — à l'essai (rien de publié) (chantier G2 : rapport « 24 intégrations Gladys », défaut D2, améliorations S1 et S2 ; ses choix « Notifications par personne » et « Poubelles : rappel la veille »)*

## Le problème

- **S1.** `regles.prevenir` envoyait tout à UN service `notify.*`, choisi dans
  Paramètres › Alertes. La fumée ne réveillait qu'un téléphone ; la demande de
  l'enfant pouvait tomber chez quelqu'un qui n'est pas parent ; la fin du
  lave-linge sonnait chez qui était au bureau.
- **D2.** Le bandeau de collecte de l'Accueil reconnaissait son calendrier à
  des mots français écrits sans accents : rien dans cinq des sept langues de la
  démo, ni pour « Déchets », « Poubelles », « Ordures ». `lireCollecte` (les
  capteurs `daysTo`, `Days_until`) n'était appelé par aucun écran.
  « C'est sorti » vivait dans un `useState` : perdu au rechargement, et chaque
  écran avait le sien. « avant 20:00 » était une heure inventée.
- **S2.** Le rappel ne pouvait venir que d'un écran allumé.

## La décision

**Qui reçoit quoi, sans réglage** (`destinataires.py`). Chaque `person` est
suivie jusqu'à son téléphone : ses `device_trackers`, l'entité de la plateforme
`mobile_app` et son appareil au registre, l'entrée de configuration
`mobile_app` (`device_name`), d'où Home Assistant tire
`notify.mobile_app_<nom en slug>` — **vérifié** par `has_service`. Une personne
sans traceur relié retrouve son application par son `user_id`. Aucune liste de
marques.

`prevenir(…, pour=)` :

- `tous` — la sûreté (`alertes.py`, et le monoxyde chiffré des veilles) ;
- `admins` — le mode enfant : la demande, l'insistance au volume et au
  rallumage (les administrateurs de Home Assistant, `user_id` → compte →
  `is_admin`). **Jamais élargi** : sans administrateur joignable, c'est le
  repli, jamais le téléphone de l'enfant ;
- `presents` — la fin d'un cycle (`prises.py`), le rappel de collecte, les
  veilles ordinaires (CO₂, piles, consommables, heures creuses) : les personnes
  à `home` ; si aucune ne peut recevoir, tout le monde.

Le service de Paramètres › Alertes devient le **repli** : rien de découvert
pour ce public, ou un envoi refusé par Home Assistant (une fois par
notification). Le repli se dit au journal de Home Assistant en debug.

**La sûreté part TOUJOURS aussi au repli** (relecture du 30/10) : un groupe
`notify.famille` dont un seul téléphone est trouvé, un Telegram, un vieux
téléphone qui ne lève rien, une personne sans compte — le repli les servait
avant ce chantier, et une alerte de sûreté ne doit jamais atteindre moins de
monde qu'avant. Quand le repli s'ajoute à des téléphones trouvés, un `tag`
commun (`loggia-<aléa>`) laisse l'application compagnon fondre les doublons ;
le repli déjà trouvé ne part pas deux fois. Le son
critique, le silence des heures calmes et les boutons sont des clés de
l'application compagnon : ils vont aux services `mobile_app_*` et au repli
(qui les recevait déjà, et peut être un groupe de téléphones), jamais à un
service choisi à la main pour une personne (Telegram, courriel).

Paramètres › Alertes montre « Qui reçoit quoi » (administrateurs seulement,
`loggia/notifications/destinataires`) : les trois publics, chaque personne, à
la maison ou non, administrateur ou non, ses téléphones. On **corrige**
(`loggia_alertes.personnes`) : choisir le service d'une personne — s'il
disparaît, les téléphones trouvés reprennent —, ou retirer un appareil d'un
PUBLIC, le mode enfant ou les notifications ordinaires. La sûreté ne se retire
jamais : sa puce reste cochée, et l'écran le dit. Un administrateur sur
plusieurs appareils est signalé — une tablette d'enfant ou un écran mural
ouverts sous son compte recevraient les demandes de l'enfant, boutons compris ;
on ne devine pas lequel. « Téléphone cible » se décrit comme le repli, qui
reçoit toujours la sûreté. La fiche d'une prise et les veilles disent
« personne à qui parler » d'après la découverte et le repli
(`regles.a_qui_parler`), plus d'après le repli seul.

**Le bandeau, rebranché** (`collecte.js`). La plateforme d'abord
(`waste_collection_schedule`, `afvalbeheer`, par l'index des entités : son
calendrier, puis ses capteurs), puis un calendrier reconnu à son nom — affiché
ou identifiant —, en MOTS ENTIERS sans accents dans les sept langues (avec les
composés allemands et néerlandais : « Abfallkalender », « Restmüll » ; plus
« Familie Müller » ni « Tonte des bordures ») ; enfin les capteurs qui portent
un jour de passage (une classe date,
une clé connue, un état qui est une date — un poids de déchets n'en est pas un),
`Days_until` compris. Une seule liste, que `collecte.py` recopie (un test les
compare). « ce soir » tant qu'aucune heure n'est réglée.

**Le rappel, par le serveur** (une veille, `veilles.py` ; le calcul dans
`collecte.py`). Éteint par défaut ; Paramètres › Veilles › « Rappel de
collecte » : l'heure (19:00) et, pour corriger, le calendrier ou les capteurs.
La veille au soir, « Demain : Verre, Recyclables » part aux personnes
`presents`, notification ordinaire (heures calmes respectées), avec un bouton
« C'est sorti » (`mobile_app_notification_action`, l'identifiant porte le
jour). Le calendrier se lit par `calendar.get_events` sur la journée de demain ;
des capteurs, ceux dont la date tombe DEMAIN (le verre d'aujourd'hui ne cache
plus le papier de demain). Un verrou : le rendez-vous du soir et le rattrapage
du démarrage ne font qu'un rappel. « Observer sans agir » le simule, retenu en
mémoire seulement : il ne bloque pas le vrai rappel si l'observation est
coupée le même soir.

**Un seul « sorti », pour tous les écrans.** `loggia_collecte` dans la partie
COMMUNE du magasin : `{sorti, rappele}`, deux jours ISO. Le bouton du téléphone
et celui du bandeau (`loggia/collecte/sorti`, ouvert à tout compte — sortir les
bacs n'est pas un privilège) y écrivent ; le signal de la configuration fait
relire les autres écrans. Jamais deux fois : `rappele` persiste au redémarrage ;
rien ne part si c'est déjà sorti ; un démarrage plus de trois heures après
l'heure saute le rappel (l'idée d'Afvalbeheer), et jamais après minuit. La clé
reste au serveur : ni dans un export, ni rendue par une version précédente.

Écarté : `blocking=True` pour savoir si un push a échoué — l'application
compagnon note ses échecs de push sans lever, et attendre chaque téléphone
retarderait les autres. Écarté aussi : des notifications par personne dans le
journal de Loggia (le nombre de téléphones atteints y est, pas leurs noms).

## Les conséquences

- **Redémarrage de Home Assistant** : deux commandes WebSocket nouvelles
  (`loggia/notifications/destinataires`, administrateurs ;
  `loggia/collecte/sorti`, ouverte) — 59 au lieu de 57, épinglées. Un écran
  devant un composant pas encore redémarré : le bandeau garde « sorti » pour
  lui seul jusqu'au rechargement, et Paramètres dit de redémarrer.
- Chez qui n'a pas d'application mobile, rien ne change : le repli reçoit tout,
  comme avant.
- Chez qui l'a : la sûreté réveille désormais chaque téléphone de la maison, et
  la fin d'un cycle ne part plus chez l'absent.
- Textes du téléphone : « Demain : {types} » et le bouton « C’est sorti »
  (`scripts/textes_serveur.mjs`, sept langues). Deux clés parties : l'ancienne
  description du téléphone cible et l'ancien avertissement des veilles.
- Tests : `test_destinataires.py`, `test_collecte.py`,
  `tests/collecte_bandeau_g2.test.mjs` (chaque langue de la démo, « Déchets »,
  « SIVOM » par sa plateforme, les capteurs d'Afvalbeheer).
