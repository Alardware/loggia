# 0163 — La batterie, et ce que la revente rapporte

*7 octobre 2026 — accepté*

## Le problème

L'audit du 07/10 (voir [0162](0162-un-index-de-compteur-n-est-pas-une-journee.md))
a relevé trois manques dans la vue Énergie. Le premier — l'index de compteur pris
pour une journée — a été traité. Voici les deux autres, qui ont la même origine :
`resolveEnergy` ne lisait qu'une partie de ce que le tableau de bord Énergie de
Home Assistant déclare.

**La batterie domestique.** Home Assistant la déclare comme une source à part
entière, `type: "battery"`, avec deux compteurs : `stat_energy_from` est ce
qu'elle rend à la maison, `stat_energy_to` ce qu'elle stocke. Rien n'était lu.
Le schéma de la maison dessine pourtant une batterie, avec son câble, son flux
et sa pastille — mais `batNow` et `batSoc` ne pouvaient venir que d'une fiche
Entités remplie à la main. Chez quiconque déduit ses rôles du tableau natif, la
batterie n'existait tout simplement pas.

**Ce que l'injection rapporte.** En face du prix d'achat, le tableau déclare un
prix de rachat (`number_energy_price_export`, ou l'entité qui le publie) et
parfois la somme déjà gagnée (`stat_compensation`, que Home Assistant tient
lui-même comme il tient `stat_cost`). Rien n'était lu non plus : l'injection
s'affichait en kilowattheures, jamais en euros.

## La décision

### La batterie se lit dans les deux sens

`batNow` suppose un capteur **signé** — positif en charge, négatif en décharge —,
et beaucoup d'onduleurs en publient un. Mais le tableau de bord nomme souvent les
deux sens séparément, dans `power_config`, et **deux capteurs toujours positifs
ne disent rien à eux seuls**. La résolution expose donc les trois :

```js
batNow: batCle ? powerOf(batCle) : null,
batChargeNow: batRate('stat_rate_to'),
batDechargeNow: batRate('stat_rate_from'),
batSoc: batCle ? pickSibling(index, states, batCle, { domain: 'sensor', deviceClass: 'battery' }) : null,
```

et la vue fait la différence, le capteur signé restant prioritaire :

```js
if (avail(EN.batNow)) return Math.round(numW(EN.batNow));
…
return Math.round((c || 0) - (d || 0));   // positif en charge
```

Le niveau se cherche sur **l'appareil du compteur**, par sa `device_class`. Sans
`power_config` et sans voisin, rien n'est fabriqué à partir du nom du compteur.

### La revente se lit comme le coût

`revenuJour` vient de `stat_compensation` : on reprend **son** chiffre, Home
Assistant connaissant les paliers et les contrats. Deux connexions qui en portent
chacune un ? Aucune ne vaut pour le tout, et les parts restent à côté — la même
règle que pour le coût. Comme c'est un cumul et non une journée, il passe par
`euroJour` ([0162](0162-un-index-de-compteur-n-est-pas-une-journee.md)).

Le prix de rachat sort dans `prixVente`, de la même forme que `prix` : une valeur,
ou l'entité qui la publie. `enVente()` le sert à la vue comme `enPrix()` sert
celui d'achat — vide tant que rien n'est déclaré, parce qu'on ne devine pas un
tarif de rachat.

Deux lignes dans la carte du Tarif, et pas une de plus :

- **« Revente du jour »**, en vert, juste sous le coût du jour : les deux chiffres
  se lisent ensemble ;
- **« Revendu 0,1300 €/kWh »**, sous le prix d'achat : ce qu'on touche et ce qu'on
  paie ne se comparent que côte à côte.

Une maison qui ne ferait que revendre — prix d'achat inconnu, rachat déclaré —
garde sa carte : la condition d'effacement compte désormais les deux prix.

## Ce que ça change

- Une maison avec batterie voit enfin la sienne sur le schéma, sans rien régler.
- Une maison qui revend voit ce que cela lui rapporte, en euros.
- Chez qui n'a ni l'une ni l'autre, rien n'apparaît : aucune ligne, aucune
  pastille. On ne devine ni un tarif de rachat, ni une batterie.
- Chez qui a rempli sa fiche Entités à la main, rien ne bouge non plus : elle
  fait foi seule, et le rôle `revenuJour` peut y être ajouté.

## Garde-fous

`tests/batterie_revente.test.mjs` — douze cas : les deux sens d'une source
`battery`, l'absence totale de batterie, une batterie sans `power_config`, la
somme et le prix de rachat, un prix publié par une entité, deux revenus dont
aucun ne vaut pour le tout, l'absence de revente, l'ancien format `flow_to`, et
les deux affichages. Les deux mots nouveaux sont vérifiés au catalogue anglais.

La maison de démonstration revend désormais son surplus (0,12 € pour 0,96 kWh) :
la ligne se voit dans la vitrine.
