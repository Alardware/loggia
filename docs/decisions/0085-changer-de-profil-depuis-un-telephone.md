# ADR 0085 — Changer de profil depuis un téléphone

**Statut** : décidé et appliqué le 2026-09-24 ; gardé en local pour la mise à
jour groupée de correctifs.

Signalé par un utilisateur, reproduit, et confirmé à l'écran.

## Le constat

`html.loggia-tactile .loggia-hdr { display: none !important; }`
([index.css:197](../../src/index.css)) masque le bandeau du haut sur **tout
appareil tactile** — téléphone ET tablette, les deux orientations. C'est voulu :
le type d'appareil décide, jamais la largeur.

Mais la pastille de profil et la cloche des notifications ne vivaient **que**
dans ce bandeau. Conséquence : **il était impossible de changer de profil depuis
un mobile ou une tablette.** Paramètres › Profils permet de créer et de
modifier, pas de basculer. La cloche était perdue de la même façon.

C'est un trou de parcours entier, pas un détail d'affichage : une tablette
murale de famille restait figée sur le profil du dernier qui l'avait réglée
depuis un ordinateur.

## La décision

**Deux rangées dans le pied du tiroir, au-dessus du séparateur**, juste avant
« Mode édition / Alarme / Home Assistant » — au même endroit et pour la même
raison que « Mode édition », rapatrié là quand le bandeau a disparu.

- **Rangée 1** : pastille + nom + chevron → une feuille qui liste les profils,
  le profil actif coché, un nom pour basculer, et un lien « Gérer les profils »
  vers Paramètres › Profils.
- **Rangée 2** : Notifications, avec le point des non-lues → une feuille qui
  liste les notifications.

**Le bandeau reste masqué au tactile.** Il n'était pas question de le rétablir :
ce serait défaire l'ADR qui l'a masqué.

**Sur ordinateur, rien ne change.** Les rangées ne se rendent pas du tout —
`tactile` est un état, pas une règle CSS. Les répéter en bas alors que la
pastille est en haut à droite serait un réglage en double.

**Le nom seul dans le tiroir**, le rôle dans la feuille. Le rôle est un mot
technique de Loggia ; il a sa place où l'on choisit, pas où l'on passe.

## Le code reste le code

Basculer vers un profil Admin passe toujours par `PinModal`. La feuille appelle
`onSwitchUser`, c'est-à-dire `switchUser` — jamais `applyUser` ni `cfgSet`. Un
test le vérifie, parce que l'écrire directement **ne marcherait plus** : depuis
l'ADR 0080, le composant refuse d'écrire `loggia_active_user` vers un profil
Admin sans laissez-passer.

## Deux défauts trouvés en chemin

**L'auto-reconnaissance ne prouvait pas le code.** Quand `matchHaUser`
reconnaît le compte Home Assistant, l'écran basculait sur le profil
correspondant par un `applyUser` direct. Si ce profil est Admin et que le compte
n'est pas administrateur Home Assistant, le composant **refuse** depuis l'ADR
0080 : un refus serait apparu au démarrage, sans que personne ait rien demandé.
Elle ne bascule donc plus dans ce cas — un repli refuse, il n'élargit pas (ADR
0079). La bascule se fait à la main, par le code.

**Le toast mentait.** `not_admin` couvre deux refus depuis l'ADR 0080 : un
réglage de la maison, et le passage vers un profil Admin. Le message unique
disait « seul un administrateur Home Assistant peut le changer » — faux pour le
second, où le code suffit. Le motif du composant les départage maintenant.

## Ce que la vérification a appris

La feuille était d'abord rendue **dans** l'`<aside>`. Elle existait dans le DOM
et restait invisible : le `transform` du tiroir qui glisse en fait le bloc
conteneur du `position: fixed`, et son `overflow-y: auto` la découpe. C'est le
piège exact que le code documentait déjà pour le bandeau du haut, quelques
centaines de lignes plus bas. Les deux feuilles sortent donc de l'`<aside>`, et
un test le tient.

## Conséquences

- **Aucun redémarrage de Home Assistant** : rien ne change dans le composant.
- Trois textes nouveaux, traduits dans les six langues. Le garde-fou de l'ADR
  0084 les a nommés tout seul, avant que j'y pense.
- Un profil sans droit d'édition n'affiche plus « Mode édition » dans le tiroir
  après bascule — vérifié à l'écran, et c'est la preuve que la bascule agit.

Vérifié **à l'écran** sur la démonstration, en émulation tactile 375 × 812 : les
deux rangées au-dessus du séparateur, la feuille qui s'ouvre, la bascule vers
« Invité », le point des non-lues qui s'éteint. Puis sur ordinateur : `tactile`
faux, bandeau visible, pied du tiroir inchangé.

Tests : 955 au vert côté JS (+7), 573 côté Python, lint propre, audit propre,
`textes_serveur.mjs --check` à jour, `npm run build` passe.
