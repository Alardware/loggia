# 0164 — Une fiche complète la découverte, elle ne la remplace pas

*7 octobre 2026 — accepté*

## Le problème

> « Une personne autre que moi qui installe Loggia pour sa propre maison, tout
> doit être opérationnel. Si sa vue énergie de HAOS est paramétrée avec les
> prix, s'il produit, s'il revend, etc., tout doit être opérationnel pour lui. »
> — 7 octobre, après les ADR 0162 et 0163.

Loggia découvre presque tout. Mais `loggiaEnt(domaine)` **coupait la découverte
pour tout le domaine** dès qu'une fiche avait été enregistrée une fois :

```js
if (cfg) return { available: true, source: 'utilisateur', haids: cfg, devices: [] };
```

Pour une **liste** — les caméras, les personnes, les pièces —, c'est la bonne
règle : on choisit ses caméras, et une liste vidée reste vide. Pour un **objet de
rôles partiels**, c'est un défaut, et il était sévère.

**L'Énergie.** L'écran Paramètres n'expose que **six champs de puissance**, alors
que l'objet en porte près de quarante. Nommer sa voiture suffisait à perdre les
compteurs, les coûts, les prix, le gaz, l'eau et les appareils mesurés que Home
Assistant déclarait. Un utilisateur dont le tableau de bord Énergie est
parfaitement rempli n'en voyait plus rien.

**Le Système.** Trois emplacements de machines ; en remplir un faisait perdre les
deux autres. Et le nom découvert *écrasait* le nom choisi à la main — une machine
désignée restait « Machine 2 ».

**Le distributeur.** Le dernier appareil à n'exister QUE par sa fiche : sans une
entité nommée à la main, pas de carte, pas de vue, rien.

## La décision

### La granularité n'est pas le domaine

Elle est la **famille** de capteurs, ou l'**emplacement**. La fiche décide pour ce
qu'elle touche ; le reste vient de la découverte.

Pour l'Énergie, le tableau de bord et la fiche ne donnent pas les mêmes noms à la
même chose — `gridNow` et `consoNow` sont le même capteur, `solarNow` et
`solarOutput` aussi. C'est précisément ce qui avait motivé le garde du 02/10 :
vider un champ ne retirait rien, le tableau le resservait sous son autre nom.

```js
const FAM_SCHEMA = [
  ['consoNow', 'gridNow'],
  ['surplusNow', 'injectionNow'],
  ['solarOutput', 'solarNow'],
  ['evNow'],
  ['batNow', 'batSoc', 'batChargeNow', 'batDechargeNow'],
];
```

Dès que la fiche **déclare** une clé d'une famille — même vide, c'est un choix —,
elle décide pour la famille entière. Partout ailleurs, les deux se marient. Le
garde du 02/10 tient donc toujours, et son test le vérifie encore.

Le Système suit la même règle, emplacement par emplacement. Ses **noms** prennent
trois sources dans l'ordre : le libellé d'attente, le nom que l'appareil porte
dans Home Assistant, puis celui qu'on a écrit soi-même — le choix explicite gagne,
ce qui n'était pas le cas.

### Le distributeur se trouve

Home Assistant n'a pas de domaine pour ces appareils. Mais les intégrations qui en
gèrent nomment leurs entités par une **clé de traduction** — le même mot dans
toutes les langues —, et c'est déjà sur elles que reposait toute la lecture du
distributeur. On remonte donc des entités à leur appareil.

**Deux familles de signaux au minimum.** Une seule ne suffit pas : `portions` tout
seul pourrait être autre chose, et poser une carte de croquettes sur un appareil
qui n'en est pas un serait pire que de n'en poser aucune. Onze familles sont
reconnues (portion, poids, programme, prochain repas, dernier repas, en cours,
compteur, niveau bas, bourrage, source du repas, consommable), ce qui couvre
petlibro, petkit, tuya-local, zigbee2mqtt et petsafe.

Ce qui est **désigné** passe toujours devant ce qui est trouvé. Le résultat est
mémorisé par index : `distributeurConfigure()` est appelée à chaque rendu.

## Mesuré sur une installation réelle

Sur celle qui a servi à écrire la vue, dont la fiche porte 33 rôles :

- **perdu : rien**, et rien ne change ;
- **gagné** : les prix du contrat (0,1605 / 0,2092 €/kWh) remontent enfin du
  tableau de bord — ils étaient perdus ;
- et le jour où son contrat de revente sera actif, le revenu et le prix de rachat
  arriveront **tout seuls**.

Un effet de bord attrapé au passage : avec la fusion, les connexions anonymes du
tableau (`consoJourParts`) arrivaient en même temps que les compteurs nommés de
la fiche, et `compteursConso` préférait les premières — l'historique aurait perdu
ses libellés « heures creuses » et « heures pleines » pour tout réunir sous
« Réseau ». **Deux compteurs nommés passent désormais devant des parts anonymes** :
la maison sait dire lequel est lequel.

## Ce qui n'a pas changé

Les domaines en **liste** — caméras, personnes, pièces, volets, climatisation,
lecteurs, météo, postes de consommation. « Vidé = vide » y reste la bonne règle.
Le robot utilisait déjà le bon modèle, clé par clé (`over[key] || pickSibling(…)`).

## Garde-fous

- `tests/systeme_fusion.test.mjs` — six cas : les trois emplacements découverts,
  celui qu'on renseigne sans perdre les autres, celui qu'on vide et qui reste
  vide, l'absence totale, et l'ordre des trois sources de noms.
- `tests/distributeur_trouve.test.mjs` — huit cas : deux signaux suffisent, un
  seul non, une maison sans distributeur n'en invente pas, les quatre
  intégrations, masquée contre désactivée, l'entité sans appareil, le
  déterminisme à égalité, et la priorité de ce qui est désigné.
- `tests/piles_energie.test.mjs` et `tests/resolve.test.mjs` gardent l'intention
  du 02/10, vérifiée plus précisément qu'avant.
