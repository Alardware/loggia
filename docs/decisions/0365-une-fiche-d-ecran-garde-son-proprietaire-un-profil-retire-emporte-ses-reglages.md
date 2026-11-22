# 0365 — Une fiche d'écran garde son propriétaire, un profil retiré emporte ses réglages

*14 novembre 2026 — appliqué (v3.100.0). Le serveur change : Home Assistant doit être REDÉMARRÉ à l'installation.*

## Le problème

Deux défauts se tenaient.

**Retirer un profil décalait les réglages des suivants.** Les réglages d'un
profil — ses favoris, sa grille d'Accueil, son menu, son apparence, seize clés
en tout — sont rangés sous son RANG dans la liste des profils, et la fiche de
chaque écran retient le rang du profil qu'il affiche (ADR 0220). Retirer le
profil de rang 1 ne retirait que son nom : le profil de rang 2 passait au rang
1 et lisait les réglages du profil retiré ; les siens restaient au rang 2,
jusqu'à ce qu'un profil créé plus tard en hérite ; un écran resté sur le rang
2 retombait sur les réglages du premier profil, sans restriction de vues.

**Écrire une fiche d'écran en changeait le propriétaire.** La règle écrite
(ADR 0220) : tout compte peut écrire la fiche de l'écran où il se trouve, seul
un administrateur retire la fiche d'un autre compte. Mais chaque écriture
posait le compte de celui qui écrivait : un compte ordinaire écrivait la fiche
de la tablette murale — elle devenait la sienne —, puis la retirait. Et
corriger le premier défaut aurait fait de l'administrateur le propriétaire de
tous les écrans qu'il renumérote.

## La décision

- **Côté serveur** : le compte d'une fiche se pose une fois, à sa première
  écriture, et ne bouge plus. Un compte ordinaire écrit toujours la fiche de
  l'écran où il se trouve ; il ne peut plus la retirer si elle est à un autre.
  Un administrateur qui retouche la fiche d'un autre n'en devient pas le
  propriétaire, et ne l'a pas « vue » : ni « En ligne » à tort, ni délai
  d'oubli qui repart.
- **Côté écran** : retirer un profil fait descendre d'un cran, dans le MÊME
  envoi que la liste, chaque réglage rangé par rang et le rang des fiches
  d'écran. Le composant prend le lot en entier ou le refuse en entier. Un
  écran qui affichait le profil retiré passe au premier profil qui n'est pas
  Admin (un profil Admin ne se rouvre pas tout seul, ADR 0080).
- **Les autres écrans** suivent leur profil quand la liste change : retrouvé
  par son compte Home Assistant, sinon tel quel.

## Ce qui reste ouvert, exprès

Un compte ordinaire peut toujours renommer la fiche d'un écran ou changer le
profil qu'elle retient (vers un profil qui n'est pas Admin) : une fiche suit
celui qui tient l'identifiant de l'écran, et un écran qui change de compte —
un navigateur partagé — doit pouvoir continuer d'écrire la sienne. Une fiche
n'est pas une frontière de sécurité.

## Les limites connues

- Les profils retirés AVANT cette version ont laissé des réglages décalés,
  qu'on ne peut pas réparer : rien ne dit qui était où.
- Un écran éteint pendant le retrait retrouve son profil par sa fiche, déjà
  renumérotée.

Tests : `tests/python/test_appareils.py` (trois tests),
`tests/audit_1211_lot3_profils.test.mjs`.

## Amendement du 14/11/2026 — supprimer un profil demande deux appuis

*À l'essai, rien de publié. L'écran seul change : pas de redémarrage pour ce point.*

Demandé le jour même. Un profil retiré emporte ses réglages, et rien ne les
rend ; or le bouton « Supprimer » de sa feuille partait d'un seul appui. Le
premier appui l'arme — rouge plein, « Confirmer ? » — et ne supprime rien ; le
second supprime ; sans second appui, le bouton se désarme seul au bout de 4 s.
Le même geste que « Remettre à zéro… » et que « Remettre » d'une sauvegarde,
dans la même vue.

Test : `tests/audit_1211_lot3bis_profil.test.mjs`.
