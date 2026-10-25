# 0190 — Le seuil de fermeture n'est plus un réglage

*12 octobre 2026 — accepté, à l'essai (plan 2 du chantier Volets, rien de publié). Remplace en partie l'ADR 0105.*

## Le problème

> « même dans netatmo l'application le volet est à 1 % et ne descend pas plus
> alors que celui-ci en physique il est bien fermé, tu peux le retirer des
> réglages d'ailleurs » — 12 octobre

L'ADR 0105 avait fait du seuil un réglage (« Considérer fermé en dessous de »,
0, 1, 2 ou 5 %). Personne n'avait à le changer : il appartient au matériel, et
le sien bute à 1 %. Chez lui, il valait 0 : sa chambre, bien fermée, se disait
« Ouvert à 1 % ».

## La décision

**Deux pour cent, fixés (V12)** — la valeur par défaut de l'ADR 0105, mesurée
sur sa chambre —, aux DEUX bouts : 2 % et moins est « Fermé » (`SEUIL_FERME`,
`coverFerme`), 98 % et plus est « Ouvert » (`coverOuvert`). L'état de Home
Assistant reste l'autorité quand il dit `closed`. Le pourcentage affiché reste
la mesure : « 1 % », « Fermé » — seul le mot change.

**Le même verdict partout** (relecture du 13/10). `coverActif` — ni muet, ni
fermé au sens de `coverFerme` sur la position publiée ; sans position, un volet
en mouvement n'est pas encore fermé — décide si un cover est « actif » dans
`objetActif` (`objets.js`), dans le `on` de `CvCard` pour un cover qui n'est
pas un volet (un groupe, un garage), et dans `chipVif`. Ces trois endroits
jugeaient encore par `pos > 0` ou par l'état `open` : la chambre à 1 % comptait
comme « active » dans Objets, et une compacte en vue personnalisée affichait
« Ouvert · 1 % ».

**La clé `loggia_coverseuil` n'est plus lue ni écrite** ; une configuration qui
la porte encore la garde, inerte. Le réglage quitte Paramètres.

**Le verdict quitte `App.jsx`** pour `voletecran.js`, pur, que la carte (au
démarrage) et la fiche (à la demande) lisent au même endroit ; la liste des
classes d'un volet (`CLASSES_VOLETS`, miroir de `ouvrants.py`) le suit.

## Ce que cela coûte

Une autre installation dont un volet bute au-delà de 2 % le verra « Ouvert à
3 % » : le réglage qui l'évitait est parti, à sa demande.

## Ce qu'on n'a pas fait

**Le journal d'activité** (`historique.jsx`, `etatJournal`) dit encore « Ouvert »
sur l'état `open`. Le journal de Home Assistant ne porte pas la position, et V12
ne s'y applique pas sans l'historique : la chambre y dira « Ouvert » au bout de
sa fermeture. Signalé, non corrigé.

## Ce que les tests tiennent

`tests/voletecran.test.mjs` (V12 : le seuil aux deux bouts, la clé qui n'est
plus lue, `coverActif`), `tests/optimiste.test.mjs` (le verdict et l'absence du
réglage), `tests/objets.test.mjs` (un volet qui bute à 1 % n'est pas actif),
`tests/carte_volet.test.mjs` (un cover qui n'est pas un volet suit V12 lui
aussi), `tests/ouvrants_miroir.test.mjs` (la liste des classes, des deux côtés).
