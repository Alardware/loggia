# 0109 — Un réglage qui n'arrive jamais

Date : 28/09/2026. Statut : appliqué. Aucun redémarrage de Home Assistant ;
`src/` change — **le paquet est rebâti**.

## Le retour

> « parfois quand j'actualise la page, éventuellement après un redémarrage,
> j'ai une organisation de cartes grande petite, masquer, démasquer. Et bien ça
> réinitialise et revient en arrière, je suis obligé de remettre mes cartes
> comme je les avais mises »

Le mot « réinitialise » envoie chercher une remise à zéro. Il n'y en a pas.
**Rien ne s'efface : c'est l'enregistrement qui n'est jamais parti.**

## Trois règles justes, une rencontre qui perd

Chacune de ces trois lignes est défendable seule. Ensemble, elles font
disparaître un réglage sans un mot.

**1. L'envoi ne se rattrape pas.** `saveCfg` poste le réglage et n'attend pas :

```js
h.callWS({ type: 'loggia/config/set', config: patch }).catch((e) => {
  local();
  if (e && e.code) { … }   // un REFUS se dit ; une déconnexion, non
});
```

Une erreur sans `code` est une coupure de transport — Home Assistant qui
redémarre, une reconnexion, le réveil d'un portable. Elle est traitée comme un
cas normal : la valeur part dans le stockage du navigateur, et personne ne la
renvoie. **Et actualiser la page pendant l'aller-retour donne exactement le
même résultat**, sans la moindre erreur : la requête meurt avec l'onglet.

**2. Le stockage local n'est plus consulté.** Dès que le composant répond,
`cfgVal` donne la main au serveur pour tout ce qui est commun :

```js
if (LOGGIA_SERVER && !estPersonnelle(key)) return fallback;
```

Ce n'est pas un `readLS` : c'est le **défaut**. La copie locale, pourtant plus
récente, n'est même pas regardée.

**3. Le rattrapage existant ne rattrape que l'absence.**
`completerDepuisLocal` confie au serveur les réglages faits avant qu'il
réponde — mais seulement ceux qu'il n'a pas :

```js
if (dejaLa !== undefined && dejaLa !== null) return;
```

Un agencement existe déjà là-bas. La version locale, plus neuve, ne remonte
donc jamais.

Bout à bout : l'agencement a l'air enregistré toute la séance, puis redevient
celui d'avant au rechargement suivant.

## Pourquoi cela ressemble à une remise à zéro

`setLayout` réécrit la clé **entière** :

```js
const all = { ...layoutsOf(cfgKey) };
…
cfgSet({ [cfgKey]: Object.keys(all).length ? all : null });
```

`loggia_roomlayout` porte TOUTES les pièces ; `loggia_objlayout`, toute la vue
Objets. Une seule écriture perdue n'emporte donc pas la carte qu'on venait de
toucher : elle emporte l'état de la clé au complet, tel qu'il était avant. D'où
« ça revient en arrière » plutôt que « une carte a bougé ».

## Le carnet

`src/enattente.js`. Quatre fonctions, une clé de stockage.

On **inscrit avant d'envoyer**, on raye au succès, et ce qui reste repart au
démarrage suivant. Écrire d'abord n'est pas un détail : c'est ce qui couvre le
cas le plus courant — actualiser juste après avoir rangé une carte, avant même
que la requête ne parte.

```json
{ "loggia_roomlayout": { "v": { "Salon": { "larges": ["light.plafonnier"] } }, "n": 3 } }
```

`n` compte les écritures de chaque clé, et sert à une seule chose : au retour
d'un envoi lent, ne pas rayer une valeur écrite entre-temps. Sans lui, ranger
deux cartes coup sur coup perdrait la seconde.

Au démarrage, `renvoyerEnAttente` part **avant** `completerDepuisLocal` : le
carnet porte des valeurs plus récentes que celles du serveur, et c'est la seule
occasion de les lui donner.

**Deux échecs qu'il ne faut pas confondre.** Un transport coupé se retente : le
carnet garde tout, indéfiniment s'il le faut. Un refus applicatif porte un
`code` — une clé de la maison écrite depuis un compte ordinaire, par exemple —
et se retenterait en vain à chaque ouverture : on le raye, en le disant au
journal. Garder les deux serait un réglage fantôme qui finirait par atterrir
des mois plus tard.

Le carnet est **local à l'appareil** (`LOCAL_ONLY_KEYS`) : il décrit un
incident de transport, pas un réglage. Il n'a rien à faire dans un export ni
dans la configuration de la maison.

## Silencieux, sauf quand ça ne marche toujours pas

Le renvoi ne dit rien à l'écran. Un réglage qui arrive avec trente secondes de
retard n'est pas un événement, et annoncer « 2 réglages ont été renvoyés » à
chaque ouverture transformerait un filet en reproche. Le journal du navigateur
le note (`console.info`), et un refus se voit (`console.warn`).

## Ce que je n'ai PAS fait

- **Toucher aux trois règles ci-dessus.** Elles sont justes. Le serveur DOIT
  faire autorité sur ce qui est commun, sinon deux appareils divergent ; et
  `completerDepuisLocal` ne doit PAS écraser le serveur avec une vieille copie
  locale. Un test épingle les deux lignes, avec la consigne de les relire
  plutôt que de les supprimer si elles changent.
- **Renvoyer à la reconnexion.** Aujourd'hui le carnet repart au chargement de
  la page. Écouter la reconnexion du WebSocket raccourcirait l'attente quand
  l'onglet reste ouvert pendant un redémarrage — mais le cas décrit est
  justement celui où l'on actualise. À faire si le retour le demande.
- **Découper `setLayout`.** Réécrire la clé entière reste vrai : c'est ce qui
  amplifie une perte, pas ce qui la cause. Une écriture par portée serait un
  changement de format, et le carnet suffit à ce que plus rien ne se perde.

Neuf tests neufs, dont six échouent sans le module. 1 018 tests JS, 579 pytest,
lint propre (aucun avertissement ajouté), audit propre. Paquet rebâti.
