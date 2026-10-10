# 0174 — Le créneau tarifaire se trouve

*9 octobre 2026 — accepté*

## Le problème

> « Oui fais la découverte du capteur de créneau. » — 9 octobre, après l'ADR
> 0173 qui nommait ce manque.

Home Assistant ne normalise rien pour « sommes-nous en heures creuses ? » : pas
de `device_class`, pas de rôle dans le tableau de bord Énergie. Le capteur
n'existait donc pour Loggia que **désigné à la main** dans les Paramètres — en
France comme ailleurs.

Sans lui : pas de barre des vingt-quatre heures, pas de « heures pleines à
partir de… », et à deux tarifs **le prix ne s'affiche même pas**, faute de
savoir dans quel créneau on se trouve. Cela contredisait directement la règle du
07/10, *tout opérationnel sans configurer*.

## Ce qui ne marche pas : la parenté

Premier essai, par analogie avec la batterie (`pickSibling`) et le distributeur :
chercher le capteur **auprès des compteurs déclarés**, sur le même appareil.
C'était l'hypothèse naturelle, et elle est **fausse**.

Mesuré sur une installation réelle :

| | appareil | entrée de configuration | intégration |
|---|---|---|---|
| les compteurs | `03b6aa7b…` | `01KN4KCH…` | passerelle de téléinformation |
| le créneau | `73ac2083…` | `01KMTE91…` | fournisseur |

Ni le même appareil, ni la même entrée. Et ce n'est pas un hasard de cette
installation : **le créneau décrit le CONTRAT, les compteurs décrivent le
COMPTEUR**. Rien ne les lie, rien ne les liera.

C'est la mesure qui a tranché, pas le raisonnement — le raisonnement disait le
contraire.

## Ce qui marche : le sens, et l'unicité

**Le sens.** La clé de traduction porte un marqueur tarifaire. Une clé de
traduction est un identifiant d'intégration, stable et non traduit — pas un nom
que l'utilisateur choisit et renomme. C'est la règle du distributeur
(ADR 0164), appliquée telle quelle.

```js
const RACINES = /(^|[^a-z])hc([^a-z]|$)|creuse|off[_-]?peak|economy[_-]?\d|…/;
```

Les racines couvrent les langues des intégrations : `hc`/`creuse` (français),
`off peak`/`economy 7`/`low rate`/`low tariff` (anglais), `niedertarif`
(allemand, suisse), `dal tarief`/`daluren` (néerlandais), `valle` (espagnol),
`fascia F1..F3` (italien), `nocna` (polonais), `tempo`.

Trois ont été **écartées** parce qu'elles produisent des faux positifs : `nt`
(trop court pour être sûr), `strefa` — « zone » en polonais, que n'importe quel
détecteur peut porter — et `fascia` seul, qui veut aussi dire « bandeau » ;
on exige donc le numéro de tranche.

**L'unicité.** S'il y a plus d'un candidat dans la maison, **on ne choisit
pas**. Un créneau faux vaut moins que pas de créneau : il ferait afficher un
prix qui n'a pas cours.

## Mesuré sur une installation réelle

| | |
|---|---|
| entités au registre | 3 132 |
| capteurs binaires actifs | 93 |
| candidats retenus | **1** |
| clé trouvée | `hc_active` |

Et la fiche de cette installation ne nommait **aucun** rôle : son propriétaire
n'avait donc jamais eu la barre des vingt-quatre heures. Il l'a maintenant,
sans rien configurer.

## La fiche garde la main

`enHaids` fusionne déjà ainsi depuis l'ADR 0164 : la découverte remplit, la
fiche décide quand elle nomme. Il suffisait que `resolveEnergy` publie le rôle
— aucune famille de `FAM_SCHEMA` à toucher.

## Ce qu'on n'a pas fait

**Une table d'intégrations.** J'ai cherché les clés de MyElectricalData, des
passerelles de téléinformation et des fournisseurs étrangers : rien de
vérifiable. Une liste de noms de greffons serait fausse le jour où une nouvelle
paraît, et je n'aurais fait que recopier des suppositions.

**Lire le `friendly_name`.** L'utilisateur le renomme, et il est traduit.

**Deviner par le comportement** — un capteur qui bascule plusieurs fois par
jour à heures rondes. C'est le signal le plus sûr qui soit, mais il demande
l'historique de tous les capteurs binaires de la maison à chaque chargement.
Trop cher pour ce qu'il ajoute, l'unicité suffisant déjà.

## Ce que les tests tiennent

`tests/tarif_heures.test.mjs`, trois cas : le capteur trouvé parmi des entités
quelconques et le silence quand il n'y est pas ; les douze clés des différentes
langues reconnues et les six pièges écartés (`technical_alarm`, `fascia_led`,
`strefa_ruchu`…) ; un capteur non binaire ou désactivé qui ne compte pas ; deux
candidats qui font taire la découverte ; et le branchement dans `resolve.js`.
