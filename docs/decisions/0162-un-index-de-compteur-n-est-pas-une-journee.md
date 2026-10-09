# 0162 — Un index de compteur n'est pas une journée

*7 octobre 2026 — accepté*

## Le problème

Le tableau de bord Énergie de Home Assistant ne désigne **pas** des compteurs
journaliers. Il désigne l'**index** du compteur — celui du Linky, du Shelly, du
P1 —, un nombre qui ne fait que monter depuis le premier jour, et c'est lui qui
calcule les différences pour ses propres graphes.

L'aperçu de la vue Énergie lisait cet index tel quel et l'annonçait comme la
consommation du jour :

```js
const prodJour = avail(EN.prodJour) ? numKwh(EN.prodJour) : null;
const totalToday = consoJourKwh({ jour: numKwh(EN.consoJour, null), … });
```

Sur l'installation qui a servi à écrire la vue, cela ne se voyait pas : sa fiche
Entités désigne des `utility_meter` remis à zéro chaque nuit, dont l'état *est*
le total du jour. Mais `enHaids()` ne passe par la fiche que si elle a été
enregistrée au moins une fois ; chez tous les autres, les rôles sont déduits du
tableau de bord natif — et le grand chiffre aurait annoncé « 12 450 kWh
aujourd'hui ».

Six valeurs étaient touchées : le total du jour, les heures creuses, les heures
pleines, la production, l'injection et le coût. L'historique, le calendrier, la
feuille du jour et les bilans, eux, étaient déjà justes : ils passent par les
statistiques (`change`), qui mesurent une variation et non un niveau.

## La décision

Un nouveau module, `src/jourstat.js`, et deux sortes de compteurs, deux lectures.

**1. Un compteur journalier le dit lui-même.** Un `utility_meter` publie
`last_reset`. Si cette date tombe aujourd'hui, son état est le total du jour :
on le lit directement, sans rien demander à personne.

```js
export function compteurDuJour(etat, maintenant = Date.now()) {
  const lr = etat && etat.attributes && etat.attributes.last_reset;
  …
  return t >= minuitLocal(maintenant) - BATTEMENT && t <= maintenant + BATTEMENT;
}
```

**2. Tous les autres sont des index.** Leur journée est la différence entre
maintenant et minuit, que le `recorder` tient déjà. Une seule requête les couvre
tous, en `period: 'day'` et `types: ['change']` — une ligne par compteur, pas un
découpage horaire.

**3. Quand ni l'un ni l'autre ne répond, on ne rend rien.** Un tiret vaut mieux
qu'un index pris pour une journée.

Dans `EnergieContent`, les six valeurs passent par `kwhJour` (une énergie, qu'on
ramène en kilowattheures) ou `euroJour` (une somme d'argent, qui garde sa
devise). Seuls les compteurs qu'on ne sait pas lire directement sont envoyés au
`recorder` : un compteur journalier n'a rien à demander.

La carte du Tarif lisait `num(EN.coutJour)` de son côté — deux chiffres sur le
même écran, dont un faux. Elle reçoit désormais celui de l'aperçu en prop.

## Pourquoi pas `stats.js`

Il fait ce travail, mais il découpe la période en cases heure par heure pour les
graphes, et il reste volontairement **hors du chargement initial**
(`tests/lot14_chargement.test.mjs`) : l'historique et le calendrier ne se
chargent qu'à l'ouverture de la vue. L'aperçu, lui, est la première chose qu'on
voit, et il ne veut qu'un total. `jourstat.js` tient en une centaine de lignes et
ne dépend que de React.

## Ce que ça change

- Chez une installation qui déduit tout du tableau de bord natif, l'aperçu dit
  enfin la consommation du **jour**.
- Chez une installation dont la fiche désigne des compteurs journaliers, rien ne
  bouge : `compteurDuJour` les reconnaît et leur état continue de faire foi.
- Le premier jour du mois, un compteur mensuel tombe dans le premier cas — et il
  a raison : ce jour-là, son total **est** celui de la journée.
- Une requête de plus à l'ouverture de la vue, puis une toutes les cinq minutes
  avec le tour de relecture. Elle ne porte que les compteurs cumulatifs.

## Ce qui reste ouvert

Deux manques relevés par le même audit et **non traités ici** :

- **la batterie domestique** : `resolveEnergy` ignore les sources de type
  `battery` du tableau de bord Énergie. `batNow` et `batSoc` ne peuvent venir que
  d'une fiche remplie à la main, et le schéma de la maison n'a donc jamais de
  batterie chez un nouveau venu ;
- **la revente** : `number_energy_price_export`, `entity_energy_price_export` et
  `stat_compensation` ne sont pas lus. L'injection s'affiche en kilowattheures,
  jamais en euros gagnés.

## Garde-fous

`tests/total_du_jour.test.mjs` — quinze cas : minuit local et non universel, la
reconnaissance d'un compteur journalier (y compris le reset un peu avant minuit,
le compteur mensuel le premier du mois, la date illisible), la forme de la
requête, la somme des variations, le compteur muet **absent** du résultat plutôt
qu'à zéro, et les six valeurs de l'aperçu qui ne lisent plus l'état brut.
