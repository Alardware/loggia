# 0198 — Le carnet des lumières

*14 octobre 2026 — accepté, à l'essai (chantier Lumières, plans 1 et 2, rien de publié).*

## Le problème

Le logbook de Home Assistant ne dit que les passages on/off : ni la luminosité
d'un allumage, ni un réglage, ni le niveau d'une lampe éteinte (Home Assistant
efface `brightness` à l'extinction). La carte ne pouvait donc pas dire « se
rallumera à 80 % », ni le journal « Allumée à 45 % » ou « Réglée à 60 % ». Et le
« qui » d'une prise (ADR 0193, 0194) se rangeait dans une fonction qui ne
connaissait que les mots d'une prise (L1, L12).

## La décision

**Le serveur de Loggia tient le carnet des lumières (L1 ; plan 1).**
- **Ce qu'il suit** (L11) : les `light.*` du registre sans catégorie ni
  désactivés — la LED d'une borne n'en est pas une —, ceux que le registre ne
  connaît pas (YAML), et les switch déclarés lumière (`loggia_switchlights`). Le
  suivi attend que Home Assistant ait fini de démarrer — avant, une intégration
  n'a peut-être pas encore créé ses lampes —, et ce qui a changé pendant l'arrêt
  se note alors à l'heure de son `last_changed`. La liste se relit ensuite quand le
  registre change pour une lumière — une lampe renommée emporte sa fiche, notes,
  état vu et dernier niveau, sous son nouveau nom —, et quand
  `loggia_switchlights` change (`rechargement.py`).
- **Ce qu'il note** : un allumage avec son niveau, une extinction, un réglage de
  niveau seul, un passage à `unavailable` ou `unknown` et le retour — au format du
  logbook, plus `bri` et `reglage`. Ni le premier état vu, ni le même état au même
  niveau, ni une couleur seule. Le contexte de chaque note : le compte
  (`context_user_id`), et le nom de l'automatisation ou du script qui l'a lancée
  (`automation_triggered`, `script_started`). Le serveur garde le lien entre
  l'identifiant d'un contexte et ce nom une heure, mille liens au plus, les plus
  anciens partant d'abord ; il cherche le contexte de l'état, sinon son parent,
  comme le logbook, et le premier nom vu pour un contexte reste : une
  automatisation qui lance un script reste l'automatisation.
- **La fonte** : des réglages à moins de 30 s l'un de l'autre, en chaîne, l'allumage
  compris, ne font qu'une note ; elle garde son heure et son auteur et prend la
  dernière valeur. Un autre auteur garde sa note ; un réglage sans auteur — l'écho
  de l'ampoule, qui confirme son niveau — se fond.
- **Le dernier niveau** (`dernier` : `bri`, `mode`, `kelvin` en blanc, `hs` en
  couleur), gardé éteinte ; `null` tant que la lampe n'a jamais été vue allumée.
- **La fenêtre** : depuis la veille à 00:00, heure de la maison, précédée de la
  dernière note d'avant — l'état de la lampe à l'ouverture, même après des jours
  sans changement. Cent notes par lampe : les vieux réglages partent d'abord,
  puis les plus vieilles notes. La note d'avant ne part JAMAIS — ni avec les
  vieux réglages, ni sous la tranche des plus récentes —, c'est la seule qui dit
  l'état à minuit ; elle compte dans les cent.
- **Le disque** : `.storage/loggia_lumieres_etat`, élagué à chaque écriture. Une
  note, ou un changement de ce que la lampe était (`vu`), s'écrit 20 s après la
  première en attente ; quand seul `dernier` a changé — un blanc qui glisse de
  10 K, un éclairage adaptatif —, l'écriture attend 5 minutes, et une note qui
  arrive entre-temps la ramène à 20 s : le fichier entier ne se réécrit pas toutes
  les 20 s, toute la journée. Ce qui attend part tout de suite au déchargement de
  l'intégration et à l'arrêt de Home Assistant. Illisible, le carnet repart à vide
  et le dit ; un démarrage raté n'écrit jamais, le carnet n'y ayant pas été relu.
- **Un état restauré n'est pas une panne.** Au démarrage ou au rechargement de
  son intégration, Home Assistant pose lui-même `unavailable`, avec
  `restored: true`, sur une entité pas encore recréée : ce n'est pas la lampe qui
  ne répond plus. Ni note, ni état vu, ni dernier niveau. De même, `unknown` et
  `unavailable` ne sont jamais retenus comme tout PREMIER état d'une lampe : son
  retour est alors son premier état vu, pas un allumage.
- **Une lampe qui entre au suivi en cours de route** — un switch qu'on déclare
  lumière, une ampoule qu'on vient d'appairer — est prise dans l'état où elle est :
  sans cela son premier geste passerait pour son premier état vu, et ne se
  noterait pas.
- **Le rechargement attend l'écriture.** Le déchargement lance l'écriture de ce qui
  attendait ; l'instance suivante relirait le fichier PENDANT elle, puis l'écraserait
  de ce qu'elle a lu. L'ancienne garde donc sa tâche d'écriture finale
  (`hass.data[DOMAIN]["lumieres_ecriture"]`), la nouvelle l'attend avant de relire —
  dix secondes au plus, et elle le dit au journal de Home Assistant si l'écriture
  n'a pas fini : un disque qui s'étrangle n'empêche pas le carnet de démarrer.
- **Deux commandes en lecture seule**, ouvertes à tout compte connecté, sous ses
  droits de lecture (`_lecture_autorisee`), les instants en secondes :
  `loggia/lumieres/etat` tait la lampe qu'un compte ne lit pas,
  `loggia/lumieres/journal` la refuse (`unauthorized`). Le compte vient de la
  session, jamais du message.

**L'écran lit le carnet.**
- L'état, une fois pour tout l'écran (`lumieresetat.js`, le magasin des prises) :
  toutes les 60 s pour les cartes, 15 s fiche ouverte. Un serveur d'avant ce
  chantier ne répond pas : l'écran marche quand même, sans repère gris ni « se
  rallumera à ».
- Le journal de la fiche (« Aujourd'hui ») : le carnet ; le logbook de Home
  Assistant pour un serveur d'avant, ou quand le carnet ne dit rien — le premier
  jour, il ignore ce qui précède son installation ; un refus (`unauthorized`) ne
  se contourne pas, le journal dit qu'il n'a pas pu être lu. Le journal de Loggia
  qui nomme la lampe (`loggia/volets/manoeuvres`) et le fondu de la veilleuse se
  lisent avec lui.

**Le « qui » est une règle, à un seul endroit (L12)** : `journalDuJour`
(`prisesfiche.js`), une règle et deux vocabulaires. Le serveur note les faits,
l'écran les range. Pour une lumière, dans l'ordre : Réseau (« Ne répond plus »,
« De retour ») ; Loggia, une règle à ± 60 s — une télécommande
(`interrupteurs/<nom>`) se dit « Interrupteur », avec son nom ; Automatisme, avec
son nom ; Loggia, un compte ; Interrupteur. « Allumée à 45 % » (« Allumée » sans
variateur), « Éteinte », « Réglée à 60 % », « Minuteur · 1 h ». Une reprise au même
état ne fait pas de ligne ; une ligne simulée (« Observer sans agir ») et
« retenir » n'attribuent rien.

**Le fondu d'une veilleuse.** La règle Nuit l'éteint en `fondu` MINUTES, et Home
Assistant ne garde le contexte d'un ordre que quelques secondes : l'extinction et
ses paliers arrivent sans lui. Une ligne `nuit/veilleuse` couvre, après elle, son
fondu plus 60 s : l'extinction est à elle (« Loggia », note « Veilleuse »), ses
paliers ne font pas de ligne « Réglée ».

**La durée allumée** (« Allumée 2 h 35 ») se compte sur les notes, depuis l'état
d'avant minuit — la note d'avant la fenêtre le donne —, une panne comptant éteinte.
Un réglage ne change pas l'état, mais il le DIT — « allumée » : on le garde, et la
note d'avant minuit que le carnet conserve en est souvent un. **Sans note d'avant
minuit** — le premier jour du carnet, qui ne note pas le premier état qu'il voit,
le logbook non plus —, la lampe d'avant la première note était dans l'état
CONTRAIRE : éteinte à 23:00, elle était allumée jusque-là ; allumée, elle était
éteinte ; réglée, elle l'était déjà. Le premier jour, la fiche disait « Pas allumée
aujourd'hui » au-dessus de « 23:00 Éteinte ». Sans aucune note, la durée se compte
sur l'état que l'écran montre ; allumée, ne serait-ce qu'un instant, c'est une
minute au moins. Une horloge du serveur un peu en avance n'en fait pas un avenir.

**La démo répond au même contrat** : la note d'avant la fenêtre, `maintenant` en
secondes, `dernier` à `null` pour une lampe jamais vue allumée, et une veilleuse
qui s'éteint en fondu dans sa journée — la ligne de la règle Nuit, puis l'extinction
et ses paliers sans contexte. Elle joue aussi les règles du serveur sur les
gestes :
- une lampe vue allumée que le carnet n'a jamais notée y est inscrite AVANT le
  premier geste, à l'heure où elle s'est allumée — le serveur prend de même, dans
  l'état où elle est, une lampe qui entre au suivi ; éteinte, elle garde son repère
  gris, rallumée elle reprend sa couleur ;
- un réglage se fond comme chez le serveur (`noter`) : dans la dernière note de la
  lampe — son allumage compris : « Allumée à 60 % », et non « Réglée à » —, à moins de
  30 s du dernier niveau noté, chez le même auteur ou sans auteur ; la note garde
  l'heure du PREMIER changement, et chaque pas prolonge les 30 s (revue finale du
  14/10, R4). La note silencieuse d'une couleur ou d'un blanc, qui n'est pas une
  note, ne l'avale pas et ne reporte rien : « Réglée à 70 % » paraît ;
- un appareil qui passe à `off` n'a plus de minuteur, `unavailable` n'annule rien
  (`minuteurs.py`, `_sur_etat`) : une lampe éteinte à la main puis rallumée ne
  retrouve pas son « S'éteint à ».
Sa journée est celle de la maquette, vue à 20:40, décalée d'un bloc à l'heure où
on l'ouvre : une fiction assumée — ouverte à 03:00, elle montre la veilleuse
rallumée à 02:50, et éteinte en fondu la veille à 13:15.

## Ce que cela coûte

Un redémarrage de Home Assistant à l'installation, sur son « go » : le carnet ne
vit qu'après lui, et il naît vide. Un fichier de plus dans `.storage`, borné (cent
notes par lampe : quelques centaines de kilo-octets au pire, non mesuré chez
lui). Les lectures de l'écran sont partagées : une pour tout l'écran, quel que
soit le nombre de cartes.

Un arrêt brutal — pas un arrêt propre — perd jusqu'à 20 s de notes, et jusqu'à
5 minutes du seul dernier niveau d'un blanc qui glisse. Un rechargement de
l'intégration, lui, ne perd plus les notes en attente : la nouvelle instance
attend l'écriture de l'ancienne, dix secondes au plus.

« Interrupteur » est le mot par défaut : ce qui n'a ni compte ni automatisme connu
— un changement rattrapé au démarrage, une automatisation qui attend plus d'une
heure avant d'agir, le premier jour lu au logbook — se dit « Interrupteur ». Et le
fondu d'une veilleuse se juge à l'heure : une extinction à la main dans les
`fondu` + 1 minutes qui suivent la ligne de la règle Nuit se dirait
« Loggia · Veilleuse ». Rare, et sans conséquence au-delà du mot.

## Ce qu'on n'a pas fait

Écouter `state_reported` (aucune note n'en dépendrait) ; une option de module ;
une ligne au journal de Loggia. `context_user_id` sort tel quel, comme le logbook
le donne déjà ; l'écran ne s'en sert que pour dire « un compte ».

## Trois doutes, à lever chez lui

Les doublures de Home Assistant, dans les tests, ne peuvent pas les lever. Le
premier essai, à l'installation, sur son « go » et sans toucher à ses lampes sans
lui, les dira.
- **D1** : l'état des lampes Zigbee2MQTT juste après le démarrage (`unknown`
  jusqu'à leur republication, vers 30 s). Seul `restored` est écarté : un vrai
  `unknown`, sur une lampe qui avait déjà un état vu, se note encore.
  - **16/10 — confirmé chez lui et corrigé.** Son redémarrage de 14:28 : ses quatorze lampes existaient déjà, `unknown` sans `restored`, et leur vrai état est arrivé 89 s plus tard. Le carnet notait `unknown` à 14:28:21, puis l'état d'avant à 14:29:50 : 28 fausses notes, à chaque redémarrage.
  - **La règle** (`FENETRE_DEMARRAGE_S` = 120 s, `lumieres_calcul.py`). Une fenêtre de démarrage s'ouvre à la naissance du carnet. Elle se ferme 120 s après que Home Assistant a démarré (dès la relecture du carnet s'il tournait déjà : un rechargement), et jamais plus de 300 s après la naissance. Pendant elle, `unknown` ou `unavailable` ne fait pas de note sur une lampe qui a déjà un état vu : la fiche garde l'heure du silence et l'état d'avant.
  - **Quand le vrai état arrive** : s'il est le même qu'avant, aucune note ; s'il diffère, une note à son heure, avec son niveau et son contexte.
  - **Encore muette à la fermeture**, la lampe ne répond plus : une note, datée de l'heure où elle s'est tue.
  - **Le fichier** garde la lampe telle qu'avant son silence, jamais le doute : un redémarrage en pleine fenêtre repart de l'état d'avant.
  - **Les 28 notes du 16/10** ne se nettoient pas. Elles quittent le journal en deux jours ; seule peut rester, comme note d'avant minuit, celle du retour, qui dit le vrai état.
- **D2** : une extinction en fondu de 5 minutes peut laisser le dernier niveau au
  dernier palier — « se rallumera à 3 % » — si l'ampoule publie ses paliers.
  L'écran l'affiche tel quel ; la démo le joue.
  - **16/10 — confirmé chez lui et corrigé.** La veilleuse Hue de Lino, le 15/10 : `off` à 18:31:45, puis `on` à 2 % deux secondes plus tard, puis `off` sept secondes après. Le journal disait « Allumée à 2 % », et le dernier niveau restait à 2 % au lieu de 22.
  - **La règle** (`ECHO_S` = 10 s, `lumieres_calcul.py`). Un rallumage remplit quatre conditions : sans compte, moins de 10 s après une extinction, pas plus haut que le niveau d'avant, et éteint de nouveau moins de 10 s plus tard. Ce n'est alors que l'écho : il ne reste qu'une extinction, avec l'heure et l'auteur du geste, et le dernier niveau revient.
  - **Pendant le doute**, ni le journal, ni l'état, ni le fichier ne montrent le rallumage.
  - **Ce qui reste noté** : un vrai rallumage, qui dure ou monte plus haut, et tout geste d'un humain.
  - **Les échos déjà stockés** ne se nettoient pas. Ils quittent le journal en deux jours, et le prochain allumage remplace le 2 %.
  - **Un fondu Loggia de 5 minutes** qui publierait chaque palier n'entre pas dans cette fenêtre de 10 s : à revoir s'il se montre.
- **D3** : un écho Zigbee qui arrive plus de 5 s après l'ordre perd son contexte,
  puisque Home Assistant ne garde le contexte que 5 s : sa note n'a alors ni compte
  ni automatisme, et se dit « Interrupteur ».

## Ce que les tests tiennent

Au serveur : `tests/python/test_lumieres_calcul.py` (les notes, la fonte, le
niveau, la fenêtre, l'état restauré, le premier état inconnu, la note d'avant qui
ne part jamais), `tests/python/test_lumieres.py` (les lampes suivies, l'écoute, le
contexte, le disque et ses deux délais, l'arrêt, le rechargement qui attend),
`tests/python/test_websocket_api.py` et `test_websocket_api_execution.py` (les deux
commandes, `etat` qui tait, `journal` qui refuse), `test_demarrage.py`,
`test_robustesse.py`, `test_rechargement.py`. À l'écran :
`tests/lumieresetat.test.mjs` (l'état, l'avance), `tests/journal_lumiere.test.mjs`
(le vocabulaire, le « qui », la télécommande, le fondu, la durée allumée — le
premier jour et la note d'avant qui est un réglage —, ce que la fiche lit, le
refus, le premier jour), `tests/prisesfiche.test.mjs` (une prise ne change pas),
`tests/demo_lumieres.test.mjs` (la démo répond comme le serveur).
