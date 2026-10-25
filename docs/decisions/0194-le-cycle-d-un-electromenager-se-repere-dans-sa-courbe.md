# 0194 — Le cycle d'un électroménager se repère dans sa courbe

*13 octobre 2026 — accepté, à l'essai (chantier Prises, plans 1 et 2, rien de publié). Remplace en partie l'ADR 0095, § 4.*

## Le problème

L'ADR 0095 (§ 4) avait écarté de la première maquette la barre de cycle et
l'état « terminé » : « Loggia ne connaît pas la progression d'un lave-vaisselle
branché sur une prise […] Elle reviendra le jour où la donnée existe. » Pour la
FIN d'un cycle, la donnée existe : la courbe de puissance. La maquette « Cartes
prises » demande « Terminé à 16:14 · 1,08 kWh » et une alerte quand le
lave-vaisselle a fini (P3, P6).

## La décision

**Le serveur suit le cycle** (plan 1) des seules prises dont le type retenu est
le lave-vaisselle, le lave-linge ou le sèche-linge :

- un cycle commence au premier instant au-dessus de 15 W (strictement) tenu une
  minute ; il finit quand la puissance reste à 5 W ou moins dix minutes, et sa
  fin est datée à la BAISSE ;
- deux heures sans nouvelle le closent aussi : il se garde, « cycle terminé »,
  sans prévenir ; une valeur publiée de nouveau à l'identique n'est pas un
  silence (le serveur écoute `state_reported` quand Home Assistant le publie) ;
- six heures sans retomber l'INTERROMPENT : ni place parmi les cycles, ni
  alerte, « cycle interrompu » au journal ; le suivant attend que la puissance
  retombe à 5 W ou moins ;
- ses kWh viennent du compteur s'il ne s'écarte pas de plus du simple au double
  de la puissance intégrée, sinon de celle-ci ;
- il garde sept jours de cycles, trente au plus (`.storage/loggia_prises_etat`),
  reprend au redémarrage, et écrit au journal « cycle démarré », « cycle
  terminé » — l'instant réel dans les parties de la ligne (`g.motif[0][1].ts`),
  les kWh à part ;
- l'alerte de fin, coupée par défaut, part en régime normal (silencieuse
  pendant les heures calmes) vers le téléphone de Paramètres › Alertes.

Les seuils, la durée maximale comprise, sont des constantes qu'une ADR seule
change.

**L'écran le lit, il ne le recalcule pas** (plan 2) :

- la phrase de la carte et de la fiche : « Terminé à 16:14 · 1,08 kWh » tant
  que l'appareil reste sous 2 W le jour même, « En marche depuis 13:40 » pendant
  un cycle (§ 4) — le DERNIER des cycles finis aujourd'hui (`cycles` va du plus
  ancien au plus récent). La ligne « Terminé à » ne l'emporte jamais sur un
  cycle en cours : avec un cycle le matin et un second commencé à 13:40, une
  pause sous 2 W dit « En marche depuis 13:40 », pas « Terminé à 09:30 » ;
- la fiche : la bande de chaque cycle du jour sur la courbe des 24 heures, et
  « Cycle de 13:40 à 16:14 · 1,08 kWh · 0,27 € » pour le dernier — les chiffres
  de sa maquette ; la démo, à 15:10, dit « Cycle de 12:16 à 14:50 · 1,08 kWh ·
  0,21 € » (ADR 0195) ;
- la rangée « Prévenir à la fin du cycle », pour l'électroménager seulement,
  coupée par défaut ; sans téléphone choisi dans Paramètres › Alertes, elle le
  dit en ambre ;
- le Journal du jour : « Cycle démarré », « Cycle terminé · 1,08 kWh », « Cycle
  interrompu », qui « Mesure », à l'instant réel ; la pose d'un minuteur,
  « Minuteur · 30 min », qui « Loggia » (ADR 0064). Trois règles pour ne pas
  affirmer ce qui n'a pas eu lieu, ou qu'on n'a pas vu :
  - une ligne `simule` du journal de Loggia (« Observer sans agir ») n'attribue
    jamais un geste à Loggia : elle dit ce que Loggia AURAIT fait, il n'a rien
    fait ;
  - un geste CHANGE l'état : un on/off identique au dernier état connu n'en est
    pas un, c'est une REPRISE, et elle ne fait pas de ligne. Le dernier état
    connu se cherche dans la VEILLE : le logbook se lit depuis 24 h avant
    minuit, et seules les lignes d'aujourd'hui s'affichent. Lu depuis minuit, il
    laissait trois défauts : une prise muette depuis 23:00 qui revenait à 07:00
    faisait « Allumée · Bouton de la prise » au lieu de « De retour » ; un
    `unknown` en tête du jour faisait « De retour » sans changement ; et le
    logbook de Home Assistant omettant le premier état d'une entité après un
    redémarrage (sa ligne n'a pas d'`old_state_id`), une prise qui reprenait `on`
    paraissait passer de `on` à `on` — « Allumée · Bouton de la prise » à chaque
    redémarrage. Un `unknown` — ce que Home Assistant publie au redémarrage, avant
    que la prise ne réponde — ne fait pas de ligne à lui seul, et le retour qui le
    suit ne dit « De retour » (Réseau) que s'il a changé l'état. Après un
    `unavailable`, suivi ou non d'un `unknown` (une seule panne, dite une fois),
    il le dit toujours : c'est la fin de la panne que « Ne répond plus » a
    ouverte, qu'elle revienne dans l'état d'avant ou dans un autre. Limite : sans
    état connu dans la veille — une prise qui n'a pas bougé depuis plus d'un jour
    —, rien ne dit qu'un `on` est une reprise, et il reste un geste ;
  - un logbook illisible le dit : « Le journal n'a pas pu être lu. », après les
    lignes de Loggia s'il y en a, à la place de « Rien depuis minuit. » qui
    affirmerait une journée calme qu'on n'a pas vue. Si seul le journal de
    Loggia échoue, on montre le logbook ;
- la vue Journal traduit les mots du serveur (`cycle`, `cycle démarré`, `cycle
  terminé`, `à {h}`, `{kwh} kWh`, `poser`, les modules `prises` et `minuteurs`),
  et écrit les kWh à la façon de la langue.

**La démo joue ce contrat.** Son lave-vaisselle fait un cycle de 154 minutes qui
vaut 1,08 kWh à toute heure d'ouverture : fini vingt minutes avant la démo si on
l'ouvre avant 16:34 — une fiction assumée — et, ouverte juste après minuit,
commencé la veille au soir (de 21:36 à 00:10, ouverte à 00:30). Un cycle qui
passe minuit garde ses kWh entiers : la carte dit « Terminé à 00:10 · 1,08 kWh »
et jamais « 0,00 kWh ». L'histoire d'aujourd'hui est fixée à la première lecture
du jour : une démo laissée ouverte ne fait pas avancer « Terminé à » d'une
minute à chaque relecture.

## Ce que cela coûte

Une machine qui reste au-dessus de 5 W en fin de programme (un sèche-linge qui
tourne à 14 W pour défroisser) ne finit son cycle qu'en dessous ; la fin dite
est celle de la baisse, pas celle du signal sonore. Un programme de plus de six
heures (une lavante-séchante) est interrompu, sans alerte.

## Ce qu'on n'a pas fait

La progression d'un cycle en cours (phase, temps restant) : la courbe ne la dit
pas. Des seuils réglables.

## Ce que les tests tiennent

Au serveur, `tests/python/test_prises_calcul.py` et `test_prises.py` (plan 1),
`tests/python/test_minuteurs.py` (la pose au journal). À l'écran,
`tests/prises.test.mjs` (la ligne 4 du § 4, et le cycle en cours qui l'emporte),
`tests/prisesfiche.test.mjs` (les bandes, la ligne du dernier cycle, le journal
du jour et son « qui » — la veille, la reprise, le retour d'une panne),
`tests/fiche_prise.test.mjs`, `tests/fiche_prise_gestes.test.mjs` (un logbook ou
un journal de Loggia qui échoue ; la fiche qui lit le logbook depuis la veille),
`tests/journal_prises.test.mjs` (les mots du serveur, les kWh à virgule, les
lignes de la démo), `tests/demo_prises.test.mjs` (1,08 kWh à toute heure, minuit
franchi, « Terminé à » qui ne bouge pas).
