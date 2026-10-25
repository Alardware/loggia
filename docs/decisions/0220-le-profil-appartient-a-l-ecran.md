# 0220 — Le profil appartient à l'écran

*17 octobre 2026 — accepté (tranche 1 de `docs/chantier-synchronisation.md`)*

## Le problème

> « Sur la synchronisation il faudrait que ce soit comme pour une vraie app.
> À voir déjà comment fait Home Assistant lui-même, à la différence que sur
> chaque appareil l'utilisateur peut personnaliser la mise en page. »

L'ADR 0182 disait que le profil actif décrit **qui regarde cet écran**, et
l'ADR 0185 a rangé chaque agencement **par profil**. Les deux tenaient sur une
promesse que le code ne tenait pas.

`loggia_active_user` était bien « personnelle », côté écran
(`PERSONNELLES`, `state.js`) comme côté composant (`PERSONAL_KEYS`,
`store.py`). Mais le composant range ces clés **sous le compte Home
Assistant**. Un foyer branche presque toujours le PC et la tablette sur le même
compte : ils partageaient donc un seul profil actif.

Et l'écart se voyait mal, parce que deux choses lisaient le profil :

- `userIdx` (App) — le prénom affiché — lu au montage, puis seulement par un
  geste sur cet écran ;
- `profilActif()` (`state.js`) — la part qu'on lit et qu'on écrit — relu à
  chaque appel dans la configuration.

Le PC passe sur Guillaume ; le composant le signale aux écrans du compte
(ADR 0067) ; la tablette relit. Elle affiche toujours « Luna » et range déjà
les cartes de Guillaume.

## Ce que fait Home Assistant

Trois niveaux : la maison (les tableaux de bord), le compte (langue, formats),
le navigateur (thème de ce navigateur, tableau de bord par défaut, barre
latérale). Son identité est le compte connecté ; il n'a pas de profils sans
compte. Loggia en a — une tablette de famille change de profil d'un geste —, il
lui faut donc un niveau que Home Assistant n'a pas : **l'appareil**.

## La décision

**Le profil actif appartient à l'écran.** Dans l'ordre, `profilActif()` rend :

1. ce que l'écran **affiche** (`userIdx`, posé par App dans `state.js`) — une
   seule source pour le prénom et pour la part lue ;
2. la **fiche de cet appareil** (`loggia_appareils[id].profil`), qui le
   retrouve au rechargement ;
3. l'ancienne clé, pour la démo, les tests et un écran sans composant.

Le résultat est **borné** à la liste des profils.

**Un appareil** est un identifiant tiré au hasard la première fois
(`loggia-appareil`, clé d'appareil : ni exportée, ni importée) et une **fiche
dans la maison** :

```js
loggia_appareils = { '<id>': { profil: '1', format: 'tablette', nom: '', vu: 1760700000000 } }
```

### Pourquoi la fiche est sur le serveur

**La garde du profil Admin** (ADR 0080). Le composant refuse de faire passer un
écran sur un profil Admin sans le code. Un profil tenu par le seul navigateur
sauterait cette garde. `_refus_profil_admin` vérifie donc aussi chaque profil
que vise une fiche — la même règle, une clé de plus.

### Comment elle s'écrit

- **L'écran n'envoie que SA fiche** ; `appareils.fusionner` la range dans la
  liste. Deux écrans qui écrivent en même temps ne se reprennent rien.
- **Ouverte à tout compte**, comme `loggia_active_user` : une fiche n'est pas
  une frontière de sécurité, les profils n'en sont pas une. Retirer la fiche
  d'un **autre** compte, ou toutes d'un coup, reste réservé à un administrateur.
- Le composant retient **qui** a écrit une fiche, mais ne le rend jamais à
  l'écran.
- Un appareil **sans nom** qu'on n'a pas revu depuis 90 jours est oublié — un
  cache vidé en laisse un à chaque fois. Un appareil **nommé** ne l'est jamais
  seul (tranche 3).
- Une fiche mal formée est un défaut de l'écran, pas un geste : un simple
  `invalid_format`, sans traduction à elle.

### La reconnaissance automatique

Elle ouvrait le profil lié au compte Home Assistant à **chaque** chargement :
la tablette familiale passée sur Luna revenait sur Guillaume dès qu'on la
rechargeait. Elle ne sert plus qu'à un **écran neuf** — un écran qui a déjà
choisi garde son choix.

## Ce que cela entraîne

- Changer de profil sur le PC ne touche plus la tablette, **quel que soit** le
  nombre de comptes Home Assistant.
- **Une installation existante** : au premier passage, chaque écran reprend le
  profil qu'il affichait et l'écrit dans sa fiche. Rien ne bouge sous ses yeux.
- `loggia_active_user` reste écrite : c'est la valeur de départ d'un écran
  sans fiche, et le repli sans composant.
- **Adresse locale et accès distant** sont deux origines, donc deux
  identifiants : chacun a sa fiche. La tranche 3 (appareils nommés) proposera
  de les réunir.
- **Redémarrage de Home Assistant** nécessaire : le composant change.

## Ce qui n'est pas fait ici

- L'héritage de la mise en page réglage par réglage (tranche 2, ADR 0221) :
  c'est elle qui corrige l'ordre alphabétique du ticket #34.
- Les appareils nommés et leur propre mise en page (tranche 3).
- `loggia_active_user` est toujours signalée aux autres écrans du compte. Ils
  relisent pour rien, mais ne changent plus de profil.

## Corrige

L'ADR 0182 (« le profil suit l'écran ») et l'ADR 0185, dont les parts par
profil supposaient un profil propre à l'écran.
