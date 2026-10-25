# 0199 — « Tout éteindre » épargne les veilleuses

*14 octobre 2026 — accepté, à l'essai (chantier Lumières, plan 2, rien de publié).*

## Le problème

Objets › Lumières avait l'en-tête générique (« {n} appareils ») : ni le compte des
lampes allumées, ni « Tout éteindre ». Et éteindre « tout » le soir éteindrait
aussi la veilleuse d'une chambre d'enfant, qu'une règle de Loggia éteint seule,
en fondu (L2).

## La décision

**L'en-tête de la famille** (§ 3.4) : « Lumières », le compte à côté — « 3 allumées
sur 6 », ou « Toutes éteintes », au pluriel de chaque langue — et, à droite, la puce
« Tout éteindre », seulement si une lampe hors veilleuse est allumée. La rangée a
la hauteur de la puce, 40 px, qu'elle soit là ou non ; le compte tient sur UNE
ligne ; au téléphone (560 px et moins), la puce n'a que son icône, et son nom le
dit toujours.

**Un appui éteint les lampes allumées de la famille, sauf les veilleuses** de la
règle Nuit (`loggia_nuit.veilleuse.lampes`, lu par `loggia/nuit/etat`, relu chaque
minute) : les lampes VISIBLES sous le filtre, une par une, `light.turn_off` pour un
`light.*` et `homeassistant.turn_off` pour un switch-lumière — jamais `toggle`.
Les cartes et le compte le montrent tout de suite (l'avance de `lumieresetat.js`,
six secondes au plus, défaite dès que la lampe a répondu). La puce partie sous le
doigt, le focus va au compte, qui dit ce qui reste allumé.

**Les groupes de lumières qui contiennent une veilleuse sont épargnés aussi.** Un
groupe de Home Assistant est un `light.*` dont `attributes.entity_id` liste les
membres : son `light.turn_off` éteindrait la veilleuse avec les autres, contre L2.
Tout groupe dont un membre est une veilleuse est donc écarté, un groupe de groupes
compris — une configuration en boucle ne fige rien. S'il ne reste que lui d'allumé,
la puce ne paraît pas. Le compte, lui, le compte toujours comme une lampe.

**Une veilleuse inconnue est gardée** : tant que la règle Nuit n'est pas lue — le
chargement, ou une lecture qui échoue —, on ne sait pas quelles lampes épargner, et
la puce ne paraît pas.

L'en-tête est son propre module, chargé à la première ouverture du filtre
(`entetelumieres.jsx`), comme ceux des volets et des prises ; il reçoit un `hass`
vivant d'un petit composant d'`App.jsx` (`EnteteLumieresVive`), abonné aux lampes
visibles.

## Ce que cela coûte

Une lecture de `loggia/nuit/etat` par minute, filtre ouvert. Environ un kilo-octet
au démarrage (+998 octets à la mesure du 14/10 : le composant abonné, le repli de
chargement, la feuille de style) ; l'en-tête lui-même naît à la demande.

L'en-tête n'éteint que ce que l'on voit : une lampe qu'une vue personnalisée retire
d'Objets n'est ni comptée ni éteinte. C'est voulu. Et un groupe qui contient une
veilleuse reste allumé après « Tout éteindre » : le compte le dit.

## Ce qu'on n'a pas fait

Un « Tout éteindre » du serveur : l'action « lumières · éteindre · sauf les
veilleuses » des scénarios existe déjà pour une maison entière ; l'en-tête, lui,
n'éteint que ce que l'on voit.

## Ce que les tests tiennent

`tests/entete_lumieres.test.mjs` : le compte et ses pluriels (le polonais a ses
trois formes), les veilleuses épargnées, les groupes qui en contiennent une —
un groupe de groupes, une boucle —, la règle Nuit pas lue ou illisible, les ordres
`turn_off`, l'avance sur les cartes et le compte, le focus, le module à la demande,
le repli de la même hauteur, la puce au téléphone.
