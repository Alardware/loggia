# 0217 — L'arrivée d'eau et ses détecteurs

*25 octobre 2026 — accepté, à l'essai (chantier IoT, étape 3 : l'arrivée d'eau ; rien de publié). Son choix I1 A du 18/10 : l'eau se construit en dernière étape, **vérifiée dans la démo seulement** — il n'a ni vanne ni détecteur de fuite. La conception : `docs/chantier-iot.md`, I1, I11, I27 à I33, I36, § 6 (`phraseVanne`), § 7.9, § 8, § 9, § 10, § 11 ; sa maquette « Cartes IoT », cadres 1a (la carte) et 1f (la popup, fermée sur fuite) ; le plan : `docs/chantier-iot-plan-4-eau.md`. Le serveur change (`eau.py`, `eau_calcul.py`, `alertes.py`, deux commandes WebSocket ; à la passe bis, aussi `store.py`, `regles.py`, `rechargement.py`) : **Home Assistant doit être REDÉMARRÉ à l'installation** ; jusque-là, l'écran montre la vanne sans sa cause, « Fermer en cas de fuite » attend, et une vanne d'eau fermée DEMANDE toujours avant de rouvrir (passe bis).*

## Le problème

Une vanne n'avait pas de carte à elle. La carte générique d'une pièce lui donnait une bascule qui
envoyait `valve.open_valve` d'un seul appui — après une fuite comme avant —, la compacte d'une vue
personnelle un bouton « Ouvrir », et la popup était la fiche universelle. Rien ne disait POURQUOI
l'eau était coupée : Home Assistant dit qu'une vanne est fermée, pas que la maison l'a fermée sur
une fuite sous l'évier il y a quatre heures. Les détecteurs de fuite ne se voyaient qu'un par un,
dans les capteurs.

Côté sûreté, la règle de fuite d'alertes.py (ADR 0022) coupait, faute d'une vanne choisie, « la
première `valve` d'eau » par ordre d'identifiant : une vanne d'arrosage pouvait passer avant
l'arrivée, et l'arrivée restait ouverte sur la fuite. Et « Vanne d'eau coupée » vivait dans
Paramètres › Alertes, loin de la vanne.

## La décision

**Un carnet de l'eau, tenu au serveur (I28).** `eau.py` (et `eau_calcul.py`, pur) suit les vannes
d'eau de la maison — toute `valve` de classe `water`, et la vanne désignée dans « Quelle vanne »,
une prise comprise (éteinte = eau coupée) — et les détecteurs de fuite, à la règle d'alertes.py : un
`moisture` de modèle ou de groupe n'en est pas un, ni le besoin d'eau d'une plante. Il note chaque
changement avec son contexte : la fermeture sur fuite (alertes.py lui ANNONCE la cause et le
détecteur avant d'agir ; l'annonce vaut deux minutes, pour une fermeture, une fois), une personne
(le compte du contexte), une automatisation ou un script (le nom que leur contexte porte),
l'appareil lui-même (aucun contexte) ; et chaque détecteur mouillé, puis sec. Il garde la cause tant
que la vanne reste fermée, et le journal du jour (cent lignes) dans `.storage/loggia_eau_etat`, écrit
en différé et à l'arrêt. **Il ne commande rien** (un test de source le tient). `loggia/eau/etat`,
ouverte à tout compte sous ses droits de LECTURE : la cause de chaque vanne, ses détecteurs, le
journal, la règle.

**Toutes les vannes d'eau, faute d'une choisie (I30 ; ADR 0022 amendée).** Fermer est le sens sûr :
plus de vannes fermées sur une fuite, jamais moins. Le danger passé, elles restent toutes coupées.
Jamais une ouverture : un test de source refuse `open_valve` dans alertes.py. « Chaque popup le dit »
s'entend à partir de DEUX vannes d'eau : avec une seule, « toutes » n'apprend rien (choix gardé à la
passe bis, et écrit).

**« Fermer en cas de fuite » déménage dans la popup (I29, I32).** C'est la même valeur
(`loggia_alertes.actions.vanne.actif`). Elle s'écrit par une commande ÉTROITE, `loggia/eau/regle
{actif}` : un booléen, réservé aux administrateurs, fondu au serveur dans `loggia_alertes` TELLE
QU'ELLE EST SUR LE DISQUE, sous le verrou du magasin, la clé signalée aux écrans (ADR 0067) — jamais
la clé entière depuis le cache d'un onglet (la leçon de la roue des robots, ADR 0218 : une écriture
faite avant que la configuration soit lue effaçait toute une clé de la maison). La rangée attend
tant que l'état du serveur n'est pas lu ; un refus nomme la clé ; un compte ordinaire lit « Activé »
ou « Désactivé ». Paramètres › Alertes n'en garde qu'une ligne qui dit où elle se règle, et garde
« Quelle vanne » (dont le défaut s'écrit maintenant « toutes les vannes d'eau »). `actions.vanne.actif`
ne s'écrit que par `loggia/eau/regle` : depuis la passe bis, `loggia/config/set` de `loggia_alertes`
reprend la valeur du DISQUE sous le verrou du magasin (`store.py`, `garder_fermer_sur_fuite`) — un
import ne la change donc plus non plus.

**La carte d'une vanne (I5, I8, I11, I12, I31 ; 1a).** Toute vanne a SA carte, au gabarit des cartes
IoT (ADR 0213), chargée à la demande : la plaque `water` — cyan ouverte, rouge et un lavis rouge
fermée sur fuite, grise sinon —, le nom, la phrase de § 6 (`phraseVanne` : « Indisponible depuis
14:20 », « Ouverte · fuite : {détecteur} », « Fermeture… », « Ouverte · aucune fuite » — « Ouverte »
seul sans détecteur —, « Fermée · fuite à 14:02 », « Fermée à 14:02 », « Fermée depuis hier ») ; pas
de chiffre ; UNE puce au pied. « Fermer l'eau », en encre rouge, d'un appui : c'est le sens sûr.
« Rouvrir l'eau » DEMANDE après une fuite (« La fuite est réparée ? » · « Annuler » · « Rouvrir », sur
la carte large ; la question se referme seule au bout de 10 s) et tant qu'un détecteur voit encore
de l'eau, même fermée à la main (« {nom} voit encore de l'eau. Rouvrir quand même ? ») ; la carte
étroite et la compacte n'ont pas la place de demander : l'étroite ouvre la popup sur la question, la
compacte n'a AUCUNE commande (un appui de travers couperait l'eau de la maison). Une autre vanne garde
la même carte, simple — « Ouverte » / « Fermée », « Fermer » / « Ouvrir » — et ouvrir le GAZ demande
« Ouvrir le gaz ? ». Toujours un service explicite (`valve.close_valve` / `open_valve`,
`switch.turn_off` / `turn_on`), jamais `toggle`, toujours un `entity_id`. Le geste est PARTAGÉ (I33,
`optimiste.js`) : la carte large, l'étroite, la compacte et la popup lisent le même ; deux appuis, une
commande ; il tient 30 s plus un relevé du pont, se lève quand la vanne ATTEINT son sens (`closed`,
`open` — passe bis : pendant `closing` / `opening` elle tourne encore, la puce reste choisie et
inerte), et tombe sur un refus. Un appareil muet n'a pas de puce, ni un sens que `supported_features`
refuse. Partout : Objets, une pièce, une vue personnelle, la fiche universelle (dont la carte de
l'appareil demande sur place).

**La popup (I27 ; 1f).** Sans onglets, à hauteur du contenu : l'en-tête commun (la plaque, « {pièce} ·
vanne d'eau », l'épingle, UNE croix) ; le panneau de tête dit POURQUOI — « Fermée » (rouge sur fuite)
et « Depuis 14:02 · fuite : Sous l'évier », « · fermée à la main », « · par la maison », « · sur
l'appareil », sur le rouge à 0,08 après une fuite — et sa puce ; la question de « Rouvrir » nomme le
détecteur sec et depuis quand (« Le détecteur {nom} est sec depuis 14:40. La fuite est réparée ? » ·
« Pas encore » · « Oui, rouvrir l'eau ») ; la personne décide, la maison jamais. « DÉTECTEURS DE
FUITE » : le résumé (« 3 détecteurs · tous secs », « 1 détecteur voit de l'eau », « 1 détecteur
indisponible ») et une rangée par détecteur — « Cuisine · pile 76 % · sec depuis 14:40 », la pile à la
règle des piles (ADR 0206), « Sec » NEUTRE (ADR 0204), « Fuite » rouge, « Indisponible » gris. « Fermer
en cas de fuite », et la phrase d'I30 quand aucune vanne n'est choisie. « JOURNAL DU JOUR » : les plus
récentes d'abord, la pastille de qui — « Détecteur », « Automatisme », le NOM d'une personne (la règle
commune aux prises et aux lumières, « Un compte » sinon), « Appareil ». En pied, « L'appareil » (la
fiche universelle).

**L'en-tête d'Objets › IoT (I14)** ajoute « · eau fermée sur fuite » quand une vanne de la liste l'est,
d'après le carnet.

**Le démarrage n'en porte rien** : la carte, la popup, leurs calculs (`eau.js`) et leur état
(`eauetat.js`, à part : l'en-tête IoT le partage) vivent à la demande (`vanne.jsx` porte la carte et la popup) — la valeur des cartes IoT y
est recopiée d'App.jsx et tenue par un test de source. La carte et la branche d'une vanne quittent
`RoomGenericCard` et `CvCard`, qui la rouvraient d'un appui. Mesuré : 1 097 500 octets avant,
1 097 437 après (§ « La borne », dans le plan) ; 1 097 477 après la passe bis (la garde des
commandes ; une seule coquille pour la carte et la popup).

**La démo porte chaque cas (I36)** : la vanne ouverte et trois détecteurs secs, leurs piles (76, 91,
54 %) ; `?demo&eau=fuite`, `mouillee`, `fermee`, `plusieurs`, `prise`, `gaz`, `muet` ; `?compte=ordinaire` ;
le faux serveur rend `loggia/eau/etat`, refuse `loggia/eau/regle` au compte ordinaire, et une vanne y
tourne trois secondes.

## Passe bis (25/10, deux relectures)

Ce que la passe bis change, après une relecture de conformité et une relecture de qualité :

- **Rouvrir demande tant que le carnet ne sait pas.** Une vanne d'EAU fermée demande « Rouvrir
  l'eau ? » quand le carnet est muet (Home Assistant pas encore redémarré), pas encore lu, sans fiche
  pour elle, en retard (il la voit encore ouverte), ou l'a vue fermée sans savoir qui. **Avant le
  redémarrage de Home Assistant, une vanne d'eau fermée demande donc TOUJOURS avant de rouvrir.**
  Seule une fermeture dont le carnet connaît la main (une personne, une automatisation, l'appareil),
  tout sec, rouvre d'un appui. La carte et la popup relisent `loggia/eau/etat` dès que la vanne
  change d'état.
- **Pendant `closing` / `opening`, la puce est inerte** (choisie, `aria-disabled`, sans geste) : `closing`
  comptait comme fermée, le geste partagé se levait, et la puce proposait « Rouvrir l'eau » d'un appui.
- **La prise désignée ne se rallume jamais d'un appui.** La garde vit au moment de l'ordre, dans le
  moteur des commandes (`actions.js`, `lancerUn` : `commander` et `commanderService` y passent) :
  `turn_on` sur la vanne désignée ne part pas, et l'en-tête de la vue ouvre sa fiche, qui est la popup
  de la vanne sur sa question (`ficheprise.jsx`, chargée à la demande) — la recherche, une ligne de la
  fiche universelle, une carte posée avant que la configuration soit lue. Le gros interrupteur d'une
  vue personnelle cède à la carte de la vanne. Fermer part toujours. Ce qui reste : un appui dans
  l'instant où la configuration n'est pas encore lue et sans copie locale ne peut pas la reconnaître.
- **La carte large** : la rangée de sa question n'est plus une rangée de puces de robot (sous 200 px
  de contenu, leurs mots se cachaient : deux boutons vides sur une carte de 226 px) ; le cas d'un
  détecteur encore mouillé ouvre la popup sur sa question (trop longue pour la ligne d'une carte).
- **Paramètres** n'a plus de relecture avant d'écrire : le serveur garde `actions.vanne.actif` (voir
  plus haut). La bascule revient de nouveau après un refus (régression de l'audit du 03/10), et deux
  réglages rapides sur deux clés ne se perdent plus. Sa ligne ne nomme plus « Objets › IoT ».
- **Le carnet** écrit tout de suite une fermeture sur fuite ; l'annonce de la règle ne vaut que pour la
  fermeture de Loggia (son contexte, `Regles.est_mien`) et tombe quand la vanne rouvre ; il lit la
  classe avant le registre ; `loggia_plants` le recharge ; une prise retirée de « Quelle vanne » quitte
  le carnet. La popup et la règle lisent `actif` et `fuite` de la même façon, et une `vanne` abîmée
  dans la configuration garde son défaut au lieu de faire tomber la règle.

## Passe bis 2 (25/10, relecture de contrôle)

Sa règle commande tout : **la maison ne ROUVRE jamais l'eau seule ; rouvrir, c'est une personne,
depuis la popup de la vanne, après la question.**

- **Au serveur, un garde unique.** `regles.agir` — l'entonnoir des règles, des plannings, des veilles
  (« Heures creuses › prises à allumer »), de la nuit, de la présence, des fenêtres, des robots, des
  distributeurs — retient toute cible qu'un ordre ROUVRIRAIT : la prise désignée
  (`loggia_alertes.actions.vanne.entite`) et toute `valve` de classe `water`, pour `turn_on`, `toggle`,
  `open_valve` et `set_valve_position` au-dessus de 0 (`regles.a_ne_pas_rouvrir`,
  `Regles.eau_retenue` ; au socle, pas dans le carnet, qui ne nomme aucun service). Rien n'est appelé pour elles, le reste de l'ordre part ; la ligne du journal
  de Loggia dit « Loggia ne rouvre jamais l’eau seule », et celle de Home Assistant l'écrit aussi.
  Les deux modules qui appellent les services sans `agir` passent par le même garde : les scénarios
  (`scenarios.py`, une famille « lumières » qui viserait une prise déclarée lumière) et les boutons
  sans fil (`interrupteurs.py`). Fermer passe toujours. Les autres appels directs ne visent que leurs
  propres appareils (un chauffage, un robot, un lecteur du mode enfant, une sirène) ou ne font
  qu'éteindre (minuteurs) ; un scénario LIÉ ne lance qu'une scène ou un script, dont le contenu
  appartient à Home Assistant. La popup, elle, appelle Home Assistant elle-même (`commanderVanne`,
  `eauetat.js`) : le garde ne la voit jamais.
- **À l'écran, les trous de la garde.** Elle vit dans `sansVanne`, à l'entrée de `lancerCommande` et
  sur la route directe de `commanderService` : un ordre GROUPÉ (le bouton des lumières d'une pièce)
  perd la prise désignée et part pour les autres, `toggle` et `open` sont gardés comme `turn_on`, et un
  `turn_on` qui porte un champ de plus ne passe plus à côté. Quand plus rien ne part, le rappel
  `surEchec` tombe : la bascule de la fiche universelle (`fichecommune.jsx`) retire son avance au lieu
  de dire « allumé » 6 s pour rien.
- **La popup qui ne s'ouvrait pas.** L'en-tête s'inscrit monté et se retire démonté (`surVanne` rend de
  quoi s'en retirer). Sans en-tête monté, l'appui retenu dit pourquoi : le toast « Loggia ne rouvre
  jamais l’eau seule » (`eau_seule`, `refus.js`).
- **Avant que la configuration soit lue**, `cfgVal('loggia_alertes')` lit déjà la copie locale qu'un
  enregistrement de Paramètres › Alertes laisse sur l'écran (`cfgBrute`, `state.js`) : elle garde. On
  n'en fabrique pas d'autre : une copie de la configuration du serveur laissée dans le stockage local
  remonterait au serveur par `completerDepuisLocal` dès que la clé y manquerait, et déferait une
  remise à zéro faite d'un autre écran. **Reste un trou connu** : sur un écran qui n'a jamais
  enregistré les alertes, pendant la toute première seconde (avant la réponse de `loggia/config/get`),
  la garde de l'écran ne reconnaît pas la prise désignée. Une `valve` reste gardée, et la prise
  aussi, par le serveur pour tout ce que la maison commande ; seul un appui d'une personne à cet
  instant-là partirait, comme il part d'une carte de prise.
- **La place du démarrage** : seize liserés écrits en toutes lettres dans `App.jsx` reprennent
  `LISERE` (`styles.js`, la même chaîne) pour que le démarrage tienne sous 1 097 500 octets.

## Ce que cela coûte

Deux modules serveur et deux commandes de plus (53) ; un redémarrage de Home Assistant à
l'installation. Un module à la demande de 22 Ko pour une maison qui a une vanne, aucun pour les autres.
La carte se dessine un instant vide (son repli a sa taille) avant d'arriver. Les sept langues portent
une cinquantaine de textes neufs ; le polonais nouveau attend Seba882.

## Ce qu'on n'a pas fait

Rien n'a été vu sur une vraie vanne : une prise câblée à l'envers (allumée = fermée), une vanne qui
dit son état sans le mesurer ou qui met plus de 30 s à tourner tromperaient la carte. Le journal ne
dit pas « Loggia » : un geste d'une personne porte son compte, que l'écran ne peut pas distinguer d'un
geste de l'application Home Assistant (la règle des prises). La position d'une vanne
(`set_valve_position`), une vanne d'arrosage avec son planning, un point « L'eau reste coupée » dans
« À surveiller » restent hors chantier (§ 17).

## Ce que les tests tiennent

- `tests/python/test_eau_calcul.py`, `tests/python/test_eau.py` — le carnet : chaque cause, l'annonce,
  le journal du jour, un détecteur de modèle écarté, la relecture, l'écriture étroite, rien de commandé ;
- `tests/python/test_alertes.py` — toutes les vannes d'eau, la cause dite avant d'agir, jamais
  d'ouverture ; `test_websocket_api.py`, `test_websocket_api_execution.py` — les deux commandes et leurs
  droits ;
- `tests/eau.test.mjs`, `tests/eauetat.test.mjs` — la phrase, la plaque, le geste qui demande, le geste
  partagé, la question, la commande étroite ;
- `tests/carte_vanne.test.mjs`, `tests/fiche_vanne.test.mjs` — la carte jouée et la popup ;
- `tests/entete_iot.test.mjs`, `tests/regles.test.mjs`, `tests/parametres_maquettes.test.mjs` — l'en-tête,
  Paramètres ; `tests/demo_eau.test.mjs` — la démo ; `tests/langues_iot_etape3.test.mjs` — les langues ;
- passe bis : `tests/vanne_prise_jamais_rallumee.test.mjs` (la garde des commandes),
  `tests/parametres_alertes_ecriture.test.mjs` (Paramètres joué : le refus, deux réglages rapides),
  `tests/python/test_eau.py` (l'horloge fixe, l'écriture immédiate, l'annonce, la configuration
  générale qui garde la bascule), `tests/python/test_eau_calcul.py` (une seule lecture des défauts) ;
- passe bis 2 : `tests/python/test_eau_rouvrir.py` (le calcul, une règle, la veille des heures creuses,
  un scénario, un bouton sans fil : rien ne rouvre, fermer passe), `tests/vanne_garde_trous.test.mjs`
  (l'ordre groupé, `toggle`, `open`, la route directe, `surEchec`, le toast sans en-tête, la copie
  locale et le trou de la première seconde).

## Trois défauts du 25/10

La garde ne lisait que `entity_id`. Un bouton sans fil réglé avec `area_id`, `device_id`, `floor_id`,
`label_id`, un bloc `target` ou `entity_id: all` passait donc sans elle : un `turn_on` sur une pièce
rallumait la prise désignée. Maintenant, `interrupteurs.py` résout la cible d'un service OUVRANT
(`est_ouvrant`, `regles.py`) en entités par les registres (`resoudre_cible`), comme Home Assistant :
une entité est dans une pièce si son `area_id` y est, ou si elle n'en a pas et que son appareil y est.
Les entités de réglage, masquées ou désactivées sont écartées, et un service de domaine ne garde que
les siennes. L'eau en sort, le reste part en `entity_id` explicite. Une cible qui ne se résout pas
(registre illisible, forme inconnue, `homeassistant.*` sur `all`) ne part pas, et le journal de Home
Assistant le dit. Fermer passe toujours tel quel. `regles.agir` et `scenarios.py` ne reçoivent que des
listes d'entités : ils n'ont pas changé. Tests : `tests/python/test_eau_rouvrir.py` (une pièce, un
appareil, un étage, une étiquette, `target`, `all`, une liste à virgules, l'illisible, fermer). Un
redémarrage de Home Assistant à l'installation.

Seulement quand il y a de l'eau à garder (`Regles.eau_a_garder` : une prise désignée, ou une `valve` de
classe `water`). Dans une maison sans vanne d'eau, un bouton réglé sur une pièce part tel quel, et Home
Assistant résout la pièce comme avant ; sans cette borne, un registre illisible ou un `all` aurait
retenu des boutons qui n'ont rien à voir avec l'eau.
