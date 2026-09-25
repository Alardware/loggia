# ADR 0091 — Le compte sur chaque puce d'Objets

**Date** : 2026-09-25
**Statut** : décidé et appliqué ; gardé en local.

Premier des quatre points d'**A8** retenus. Il solde un « non fait » de l'ADR
0040 : « le compte sur chaque puce, un bandeau qui resterait collé en haut
pendant le défilement ». Le bandeau collant n'est pas fait — il n'a pas été
demandé.

## Le constat

Les huit puces de la vue Objets — Tous, Lumières, Volets, Chauffage, Prises,
Multimédia, IoT, Capteurs — ne disaient pas ce qu'elles portaient. On touchait
pour découvrir, et parfois pour ne rien trouver.

Le titre sous la rangée, lui, dit déjà « 6 appareils » **après** le choix.
L'information existait donc, une seconde trop tard.

## La décision

**Le nombre d'appareils sur chaque puce**, à côté de son mot.

- « Tous » compte tout ; une famille compte les siens
  (`objets.filter(o => o.filtres.indexOf(f.id) >= 0)`).
- La somme des familles ne fait pas le total, et c'est normal : un appareil peut
  appartenir à plusieurs familles, ou à aucune. Mesuré sur la démonstration :
  34 au total, 6 + 3 + 2 + 2 + 1 + 4 + 13 = 31 rangés.

**Le nombre prend la couleur du texte** (`currentColor`, opacité .55). Une puce
choisie passe en bleu plein avec un texte blanc — un jeton figé y deviendrait
illisible, et la règle du projet est sans exception sur ce point.

## Ce qui disparaît au téléphone, et pourquoi

Sous 560 px, les puces n'ont plus que leur icône et se partagent la largeur sur
**une** ligne, sans défilement (ADR 0040, retour du 17/09). Un nombre seul à
côté d'une icône s'y lirait mal, et la rangée est déjà serrée : le compte
s'efface avec le mot.

Il ne disparaît pas pour autant : l'`aria-label` porte « Lumières · 6
appareils » **à toutes les tailles**. Ce qui s'efface est le dessin, pas
l'information.

## Vérifié à l'écran

Sur la démonstration, à 1 440 px : « Tous 34 · Lumières 6 · Volets 3 ·
Chauffage 2 · Prises 2 · Multimédia 1 · IoT 4 · Capteurs 13 ». Le singulier
fonctionne — « Multimédia · 1 appareil ».

À 375 px : `display: none` sur le mot **et** sur le compte, une seule rangée,
et `aria-label` toujours « Tous · 34 appareils ».

## Conséquences

- **Aucun texte nouveau** : `{n} appareil` / `{n} appareils` existaient déjà,
  le titre sous la rangée s'en sert.
- Rien côté serveur, aucun redémarrage de Home Assistant.
- Une famille vide n'a pas de puce (règle existante) : on ne verra jamais
  « Volets 0 ».

Tests : `tests/objets.test.mjs` — l'étiquette dit la famille ET ce qu'elle
porte, le calcul du compte, et la règle du téléphone qui vise désormais les
deux classes.
