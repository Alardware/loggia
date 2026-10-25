# 0196 — Protéger une prise ; ce qu'elle alimente

*13 octobre 2026 — accepté, à l'essai (chantier Prises, plans 1 et 2, rien de publié).*

*15 octobre 2026 — la carte étroite ne demande pas sur place (passe téléphone, ADR 0202).
Protégée, elle n'a pas d'interrupteur : une pastille, le cadenas et « Protégée », dont
l'appui ouvre la fiche, qui demande ; allumée et gardée (protection pas encore lue), sa
bascule ouvre la fiche (`appuiBascule` → « fiche »), comme la compacte ; coupée, elle
envoie `turn_on`. La carte large demande comme avant.*

## Le problème

Le NAS et le PC sont des appareils réels : les couper d'un doigt depuis une
carte peut abîmer des disques. Et le type d'une prise, deviné par son nom, se
trompe parfois — « Prise 3 » ne dit rien (P2, P4, P5).

## La décision

**Protéger est une garde de l'ÉCRAN (P5).** Couper à la main une prise protégée,
depuis une carte, une fiche ou la recherche de Loggia, demande d'abord :

- sur la carte, la question prend la place de la phrase, Annuler et Couper celle
  du pied (six secondes au plus) ;
- dans la fiche, l'encart « {nom} est en marche (23 W). Le couper d'un coup peut
  abîmer ses disques. » et « Couper quand même » ; pour ce qui n'est pas un
  serveur, « L'appareil s'arrêtera net. » ;
- une compacte qui a une fiche à ouvrir l'ouvre : c'est la fiche qui demande ;
- la recherche (Ctrl+K) ne coupe pas : Entrée mène à la carte, qui demande
  (ADR 0193). Elle ne s'abonne à rien — rien ne part au serveur pour une
  recherche — et personne ne relit le cache de l'état des prises quand aucune
  carte de prise n'est montée : sans abonné, il peut dater de la veille, et vaut
  une protection INCONNUE (`abonnesPrises`). Même une prise libre mène alors à
  Objets, où sa carte s'abonne et demande ; elle se bascule sur place dès qu'une
  carte de prise est montée quelque part ;
- sans fiche à ouvrir — la compacte de l'appareil, dans sa propre fiche — et
  pour le gros interrupteur d'une vue personnalisée, on demande par DEUX appuis :
  le premier pose la question (« Couper la prise ? » prend la place de l'état, et
  le nom de la bascule devient « Couper {nom} »), le second coupe ; six secondes
  ou Échap la défont. Pas de bouton dans le bouton : c'est la bascule elle-même
  qui reçoit le second appui ;
- la ligne d'un switch épinglé — la sortie 2 d'une multiprise, dans la fiche de
  l'appareil ou sur sa carte — passe par la même garde : une prise allumée et
  gardée ne se coupe pas d'un appui. Une ligne n'a la place ni de deux boutons
  ni d'une fiche à ouvrir : elle demande par DEUX appuis, la question à la place
  du nom.

La question TOMBE avec la prise allumée : coupée ou muette entre-temps, elle se
défait sans attendre ses six secondes. Rallumée par une automatisation dans ce
délai, « Couper la prise ? » ne revient pas de nulle part, et l'appui suivant
n'est pas pris pour le second — il pose la question. Cela vaut pour la carte, la
compacte, le gros interrupteur, la ligne et la fiche.

L'ordre est EXPLICITE, d'après l'état affiché : `turn_on` ou `turn_off`, jamais
`toggle` (le gros interrupteur, la ligne, la recherche). Un `toggle` inverse
l'état RÉEL, que l'écran ne voit qu'à deux secondes près : une prise protégée
rallumée juste avant l'appui était coupée sans question.

Un appui sur une bascule ne reste jamais sans effet. Le minuteur, déjà un geste
volontaire, et les règles de Loggia coupent sans demander ; le serveur ne coupe
rien de lui-même.

**La protection inconnue fait demander.** Tant qu'aucune lecture de
`loggia/prises/etat` n'a réussi — le chargement, une panne, un serveur d'avant
la mise à jour —, on ne sait pas si la prise est protégée : dans le doute, on
demande, comme pour une protection vraie. C'est le cas de la carte, de la fiche,
de la compacte et du gros interrupteur ; un appui de trop vaut mieux que le NAS
coupé d'un seul. Le cadenas et « · protégée » ne se montrent que pour une
protection connue (avec l'avance d'un geste de la fiche). Une fois une lecture
réussie, la prise n'est plus « inconnue » : le magasin garde l'état même si les
suivantes échouent.

**Avant l'index, une règle unique pour les switch qu'il ne classe pas encore**
(`gardeDeSwitch`, prisesetat.js). Sur une grosse installation, l'index de la
découverte peut mettre quelques secondes à arriver ; tant qu'il n'est pas lu,
`priseDe` ne reconnaît AUCUNE prise, et le NAS s'affiche en switch ordinaire. La
compacte, le gros interrupteur, la recherche (Ctrl+K), la carte générique et la
ligne d'une épingle le coupaient d'un appui, et la carte générique ouvrait
`RoomSwitchSheet`, dont la bascule coupe sans demander. Pour un switch que
l'index ne classe pas (encore), tous ces chemins demandent si :

- (a) la liste `protegees` d'un état CONNU le nomme ;
- (b) l'état des prises n'a encore reçu AUCUNE réponse, et aucune erreur : c'est
  le chargement. Ils suivent alors l'état le temps que la réponse arrive, qui
  tranche.

Une erreur sans état — un composant d'avant la mise à jour — ne garde PAS un
switch que l'index ne connaît pas : un serveur trop vieux ne gêne pas
indéfiniment. (b) cesse aussi avec l'attente : l'index lu, un switch qu'il ne
classe pas n'est pas une prise, rien à demander de plus (et il ne s'abonne à
rien). La garde des prises reconnues — protégée, OU protection inconnue — ne
change pas. Allumé et gardé, l'appui de la carte générique, ou de la compacte
quand elle a une fiche à ouvrir, ouvre `FichePrise` — dont la bascule demande —,
jamais `RoomSwitchSheet` ; sans fiche à ouvrir, on demande par deux appuis, comme
plus haut. Le choix de la feuille se fait à l'ouverture et tient : elle ne change
pas sous les doigts quand la réponse arrive.

**Ce qu'elle alimente (P2)** : une rangée de la fiche, une liste de choix — les
treize appareils qu'on peut imposer, jamais la sirène, et « Deviner d'après le
nom ». L'écran lit le type que retient le serveur ; il ne le devine lui-même que
sans réponse du serveur, ou le temps d'une avance (le serveur dit encore
l'ancien type pendant que « Deviner d'après le nom » s'envoie).

**La configuration est réservée aux administrateurs (P4)** : une clé partagée,
`loggia_prises`, écrite par `loggia/prises/config` (plan 1) ; `loggia/config/set`
la refuse de même à un compte ordinaire (`not_admin`). `protegees` part ENTIÈRE ;
`types` et `prevenir` prise par prise — un type `null` rend la prise à son nom.
Un compte ordinaire voit le cadenas, la confirmation et chaque rangée ; un appui
sur un réglage dit le refus, qui nomme la clé, sous la rangée touchée.

**Les écritures de la fiche passent en file** (`fileEcritures`, celle des
volets, réutilisée telle quelle) : une seule en vol ; avant la première d'une
série, la configuration se relit ; chaque patch se bâtit au moment d'écrire, sur
celle que rend l'écriture précédente — après un échec, sur une relecture — ; la
réponse, l'état entier, remplace le cache. C'est le piège des volets : le
serveur REMPLACE les tables qu'il reçoit.

- Une relecture qui ÉCHOUE n'écrit RIEN : l'avance s'annule, la promesse est
  rejetée, et la rangée touchée dit « Enregistrement impossible — le composant
  ne répond pas. ». Avant, un patch bâti sur un cache vide (`{}`) envoyait
  `protegees: []` : « ne plus protéger » une prise effaçait TOUTES les
  protections ; bâti sur le cache de 15 s, il ignorait celle qu'un autre
  appareil venait de poser.
- Une réponse DÉPASSÉE par une plus fraîche n'est pas une panne : la relecture
  rend alors `null` sans erreur, et le cache, plus frais, sert de base.

**Le minuteur de la fiche.** La rangée « minuteur qui tourne » ne paraît que sur
une prise ALLUMÉE. Le serveur efface le minuteur d'une prise éteinte à la main
(ADR 0064), mais le sondage de la fiche ne le sait qu'au tour suivant — 15 s
pendant lesquelles « +1 h » aurait posé un minuteur neuf sur une prise coupée.
Coupée ou muette, la rangée redit « Disponible une fois la prise allumée. » et
ses quatre durées restent inertes (`aria-disabled`, pas `disabled` : le focus ne
tombe pas). Et UNE SEULE demande en vol à la fois : le serveur AJOUTE le temps à
ce qui reste, deux appuis sur « 30 min » posaient donc 60 min. Les durées, +15
min, +1 h et Annuler attendent la réponse — même deux appuis dans le même tour
—, et un échec rend la main et le dit.

## Ce que cela coûte

La protection ne protège que des gestes faits dans Loggia : l'application Home
Assistant, un bouton physique, une automatisation et l'assistant (un agent Home
Assistant externe) coupent sans demander. Dans Loggia, tout geste à la main
demande — la carte, la compacte, le gros interrupteur, la fiche, la recherche et,
depuis la relecture du 14/10, la ligne d'un switch épinglé (F3) : l'épingle ne
contourne plus la garde. Et dans le doute, un appui de plus : même une prise
libre demande tant que l'état du serveur n'est pas lu ; la recherche, qui ne le
relit pas, envoie sa prise vers Objets tant qu'aucune carte de prise n'est
montée.

## Ce qu'on n'a pas fait

Respecter la protection dans les règles de Loggia (P5 l'écarte).

## Ce que les tests tiennent

Au serveur, `tests/python/test_prises_calcul.py`, `test_prises.py` (la clé n'est
pas ouverte à tous), `test_websocket_api.py` et `test_websocket_api_execution.py`
(plan 1). À l'écran, `tests/carte_prise.test.mjs` (la demande de la carte, son
focus), `tests/fiche_prise.test.mjs` (la confirmation, le compte ordinaire),
`tests/prisesfiche.test.mjs` (les patchs, les treize appareils),
`tests/prisesetat.test.mjs` (la garde : protégée, inconnue ; `gardeDeSwitch` ;
`abonnesPrises`), `tests/prises.test.mjs` (l'appui sur la bascule),
`tests/demo_prises.test.mjs` (la démo répond comme le serveur).

Les gestes sont JOUÉS (`tests/crochets.mjs`) : `tests/prises_gestes.test.mjs`
pour la carte générique, la compacte avec et sans fiche, le gros interrupteur,
la ligne d'une épingle — la question, les deux appuis, six secondes, Échap, la
question qui ne revient pas, l'ordre explicite — et la recherche ; pour le NAS
avant l'index — l'état qui le nomme, qui n'a pas répondu, l'erreur sans état,
l'index lu — et la feuille que la carte générique ouvre : `FichePrise`, dont la
bascule demande ;
`tests/fiche_prise_gestes.test.mjs` pour la fiche — la protection pas encore
lue, les six secondes et le focus, le minuteur et ses appels en vol, la file
d'écriture et la relecture qui échoue, le compte ordinaire.
