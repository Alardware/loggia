# 0276 — Un compte Home Assistant, son profil

*27 octobre 2026 — accepté (ticket #38 ; corrige les ADR 0220 et 0185)*

## Le problème

> « Depuis la mise à jour, le nom de mon épouse apparaît à l'ouverture de
> Loggia, et je n'arrive plus à modifier le tableau de bord car elle n'est pas
> administrateur. » — ticket #38, v3.94.0

Et sa règle, en le lisant :

> « Si sur son téléphone il est connecté à Home Assistant avec son compte, ça
> doit charger son profil, point. Il n'y a pas de nom pas reconnu : Loggia se
> connecte au même profil que celui avec lequel il est connecté à HA. »

Un profil Loggia (`loggia_users` : nom, rôle, droits, vues) n'était relié à
un compte (`haId`) que dans un cas : la première fois, si son **nom** était
identique à celui du compte, et seulement depuis un compte **administrateur** —
la liste des profils appartient à la maison. D'où :

- un administrateur dont le profil s'appelait « Administrateur » n'était
  jamais relié ;
- un compte ordinaire (une épouse, une tablette au compte « Luna ») ne reliait
  jamais le sien, même au bon nom ;
- l'écran, « non relié », suivait la règle du 19/10 (« pas en admin ») et
  retombait sur le premier profil non Admin — celui de l'épouse.

## La décision

**Un compte Home Assistant = son profil.** À l'ouverture, l'écran demande au
composant `loggia/profils/moi`, qui rend le profil du compte de la
**connexion** — relié, ou créé d'office :

1. le profil déjà relié à ce compte ;
2. sinon, un profil libre du même nom (sans casse ni espaces) : une
   installation existante garde ses réglages ;
3. sinon, pour un administrateur de Home Assistant, le profil Admin libre
   s'il n'y en a qu'un — le « Administrateur » d'une installation neuve ;
4. sinon, un profil neuf, à son nom, `Admin` si le compte l'est, `Famille`
   sinon, sans droits ni vues en plus.

Ce profil passe devant tout : la fiche de l'écran (ADR 0220), le choix fait à
la main sur un autre écran.

### Ce qui garde la maison

- Rien ne vient du message : ni compte, ni nom, ni rôle — tout est lu sur la
  connexion authentifiée. Un compte ne relie ou ne crée que **son** profil.
- **Jamais un profil Admin pour un compte qui ne l'est pas** : un profil Admin
  libre du même nom n'est pas repris par un compte ordinaire (il reçoit le
  sien), et un compte qui a perdu son rôle dans Home Assistant ne rouvre plus
  son profil Admin.
- Deux profils Admin libres ne se devinent pas : un profil neuf est créé.
- La liste ne s'écrit que si elle change, et le changement est signalé aux
  écrans (ADR 0067). L'écran n'écrit plus jamais la liste pour y graver un
  lien : réécrite en entier, elle pouvait effacer un profil que le serveur
  venait de créer.

## Ce que cela entraîne

- Chez lui : les profils Clara et Luna, jamais reliés faute de compte
  administrateur, le sont à leur prochaine ouverture, par le nom.
- Un compte technique (`mqtt`, une intégration) ne reçoit de profil que s'il
  ouvre Loggia.
- Le sélecteur de profils reste : un administrateur peut regarder l'écran d'un
  autre profil le temps d'une session ; l'ouverture suivante revient au sien.
- Un composant qui ne connaît pas la commande (écran plus récent que le
  serveur) garde la règle d'avant.
- **Redémarrage de Home Assistant** nécessaire : une commande WebSocket
  nouvelle (55 commandes).
