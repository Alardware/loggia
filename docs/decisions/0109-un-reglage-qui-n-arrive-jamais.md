# 0109 — Un réglage qui n'arrive jamais

Date : 28/09/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti.

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

## Complément du 03/10 : quand le serveur a bougé depuis

L'audit du 03/10 a trouvé le revers de « indéfiniment s'il le faut ». Un
téléphone rate une écriture ; le lendemain, l'ordinateur range ; le téléphone
rouvert renvoie sa vieille valeur. Comme elle porte la clé **entière**, l'ordre
fait sur l'ordinateur, la carte ajoutée, la disposition de la tablette
disparaissaient — sans un mot.

Chaque entrée du carnet retient désormais deux choses : l'**empreinte** `e` de
ce que le serveur tenait quand elle s'est ouverte, et `p`, les empreintes de
nos propres envois restés sans réponse (seize au plus). Au renvoi,
`renvoyerEnAttente` compare à la configuration qu'on vient de lire :

- le serveur tient déjà la valeur : elle était arrivée, seule la réponse
  s'est perdue — rayée sans rien renvoyer ;
- il tient `e`, ou l'un de nos envois de `p` : personne d'autre n'a rangé, la
  valeur repart — le cas du 28/09, inchangé ;
- il tient autre chose : un autre écran a rangé depuis. **Le serveur a
  raison** : l'entrée est rayée, et le journal nomme la clé.

`p` n'est pas un luxe. Home Assistant qui redémarre juste après avoir rangé un
envoi n'en rend pas la réponse ; le suivant part dans le vide. Le serveur tient
alors NOTRE premier envoi : sans `p`, il passerait pour un rangement venu
d'ailleurs, et la dernière carte se perdrait de nouveau — exactement ce que ce
carnet corrige. Un écran qui a relu le rangement d'un autre (décision 0067)
puis range par-dessus prend pour `e` ce qu'il a vu. Sans empreinte — carnet
écrit avant ce correctif, réglage fait avant que le composant réponde —, on
renvoie comme avant. Chacun de ces cas est épinglé par un test.

L'empreinte est courte (longueur et FNV-1a sur 32 bits, clés d'objet triées) :
le carnet n'a pas à loger une seconde copie de chaque agencement.

**Toujours pas de durée de vie.** Le carnet garde indéfiniment ce qui n'est pas
arrivé ; il ne le renvoie simplement plus contre un serveur qui a bougé.
Une durée de vie de 24 h a été proposée, puis écartée par l'utilisateur
(« Empreinte seule ») : elle aurait perdu le lendemain un réglage fait hors
ligne la veille.

## Complément du 03/10 : un carnet par compte, et clé par clé

Deux autres trous du même audit.

**Un refus partait plus tard sous les droits d'un autre.** Le carnet était
unique pour le navigateur, et `saveCfg` ne rayait rien sur un refus. Un
réglage de la maison tenté depuis un compte ordinaire (`loggia_users`, ou
`loggia_rooms = []`) attendait le démarrage suivant. Il repartait alors sous
le compte qui ouvrait la page : un administrateur sur la même tablette, et il
passait sous SES droits. Trois corrections :
- le carnet se range **par compte** (`{ comptes: { <id>: … } }`, l'id du
  compte Home Assistant) et ne repart que sous son auteur ;
- `saveCfg` raye un refus dès qu'il tombe ;
- une valeur refusée **faute de droits** (`not_admin`) ne se recopie plus sur
  l'appareil : `completerDepuisLocal` l'aurait confiée au serveur sous un
  administrateur.

Un carnet d'avant ce correctif, rangé sans auteur, se lit vide. Personne ne
sait sous quels droits il avait été écrit.

**Un refus emportait tout le lot.** Le composant refuse un lot ENTIER dès
qu'une seule clé de la maison y figure. Le renvoi rayait alors tout le
carnet, l'agencement perdu à côté d'une clé réservée compris : le cas même
que ce carnet devait sauver, sur ce que la décision 0125 ouvre à tous. Le
renvoi part maintenant **une clé par envoi**. Un refus (avec `code`) ne raye
que sa clé ; une coupure (sans `code`) arrête tout et garde ce qui n'est pas
parti ; ce qui arrive est rayé aussitôt.

Rejoués contre un faux composant aussi strict que `store.py` (rejeux A, B et
C de l'audit) : `tests/reglages_en_attente.test.mjs` et
`tests/reglages_en_attente_cle_par_cle.test.mjs`.
