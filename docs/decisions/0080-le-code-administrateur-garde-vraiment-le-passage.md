# ADR 0080 — Le code administrateur garde vraiment le passage

**Statut** : décidé et appliqué le 2026-09-24 ; gardé en local pour la mise à
jour groupée de correctifs.

Point M14 du plan du 22/09.

## Le constat

L'écran des Paramètres annonçait, sous « Code administrateur » :

> Requis pour basculer vers un profil Admin.

Rien ne le vérifiait. `loggia_active_user` — la clé qui dit quel profil se sert
du dashboard — est dans `OUVERTES_A_TOUS` : n'importe quel compte connecté
pouvait l'écrire par `loggia/config/set`, sans passer par
`loggia/pin/verifier`. Un appel direct suffisait à se donner l'affichage
administrateur et ses boutons d'édition.

La maison, elle, restait protégée : `loggia_users` refuse toujours l'écriture à
un compte ordinaire, personne ne se donne un rôle, et les droits Home Assistant
ne bougent pas. Le commentaire du composant le disait déjà, et il avait raison
sur le fond. Mais la phrase de l'écran, elle, était fausse — et une phrase
fausse sur une barrière est pire qu'une barrière absente.

Deux sorties : réécrire la phrase, ou tenir la promesse. C'est la seconde qui a
été choisie.

## La décision

**Un laissez-passer, en mémoire, par compte et pour quelques minutes.**

- `LaissezPasser` (`code_admin.py`) : `accorder`, `valide`, `retirer`. Cinq
  minutes — assez pour taper le code puis choisir le profil, trop court pour
  qu'un écran laissé ouvert des heures serve à quelqu'un d'autre. **En mémoire
  seulement**, comme le limiteur d'essais : un redémarrage l'oublie, et c'est
  voulu. Un laissez-passer qui survit à un redémarrage est un laissez-passer
  qu'on a oublié de retirer.
- Une vérification réussie de `loggia/pin/verifier` l'accorde au compte qui a
  prouvé le code.
- `loggia/config/set` refuse d'écrire `loggia_active_user` quand le profil visé
  est un Admin, sauf si le compte est administrateur Home Assistant — celui-là
  n'a rien à prouver, il peut déjà tout ailleurs — ou s'il a le laissez-passer.

**Ce qui reste ouvert l'est toujours.** Basculer vers un profil de famille ne
demande rien : c'est l'usage premier d'une tablette, et le refuser aurait été
pire que le trou qu'on ferme.

**La règle est une fonction pure.** `passage_admin(patch, profils)` répond à
une seule question : ce patch fait-il basculer vers un profil Admin ? Un index
hors liste, une liste illisible, un autre rôle : non. Elle se teste sans Home
Assistant, comme `compte_resolu` de l'ADR 0079.

**Une liste de profils illisible fait refuser**, dans l'esprit de l'ADR 0079 :
sans elle, on ne sait pas ce que l'on ouvre.

## Ce que cela change à l'usage

Rien, sur le parcours normal. L'écran demandait déjà le code avant de basculer
vers un profil Admin (`switchUser`, puis `PinModal`) : le laissez-passer est
accordé une seconde avant l'écriture. Ce qui change, c'est qu'un appel qui
saute l'écran ne passe plus.

La phrase des Paramètres dit maintenant ce qui se produit : « Requis pour
basculer vers un profil Admin, **et vérifié par le composant**. »

## Ce qui n'a pas changé, et qu'il faut continuer de dire

Les profils de Loggia **ne sont pas une frontière de sécurité Home Assistant**.
Ils ne changent aucun droit du compte : ce qu'une personne peut piloter reste
décidé par Home Assistant, et le composant le vérifie de son côté. Ce code
garde un passage dans le dashboard, pas la maison.

## Conséquences

- **Redémarrage de Home Assistant requis** : le composant change.
- Le limiteur d'essais existant continue de protéger le code lui-même : cinq
  ratés par compte, blocage qui double.
- L'ancienne phrase reste au catalogue des sept langues sans être appelée :
  une traduction orpheline de plus, à ramasser avec le point S6.

Tests : tests/python/test_code_admin.py (+3 : la règle pure, le laissez-passer
et son expiration, le branchement du gestionnaire).
