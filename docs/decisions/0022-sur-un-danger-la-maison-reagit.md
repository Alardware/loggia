# ADR 0022 — Sur un danger, la maison réagit : lumières, volets, vanne

**Statut** : appliqué (v3.16.0) — `alertes._reagir`, `alertes._async_rendre` (§18, moitié « action »).

## Contexte

Le téléphone est prévenu (ADR 0005), mais la maison, elle, ne fait rien :
une fumée à trois heures du matin laisse le couloir noir et les volets
baissés ; une fuite continue de couler le temps qu'on rentre. La moitié
« action » de §18 : lumières à 100 %, volets remontés, vanne coupée.

## Décision

**La maison agit, en tête de l'échelle, et tenu tant que le danger dure.**

| Danger | Lumières à 100 % | Volets remontés | Vanne coupée |
|---|---|---|---|
| fumée, monoxyde | oui | oui | — |
| gaz | **non** — un relais qui claque est une étincelle | oui | — |
| fuite | — | — | oui |
| alarme déclenchée | oui | — | — |

La priorité est la plus haute de l'échelle (`niveau("surete", 19)`) : au-dessus
du vent, au-dessus de tout — sauf une main. Les portes de garage, portails
et portes (`device_class`) ne sont pas des volets : on ne les ouvre pas.

**Quand le danger passe, la maison revient à l'état d'avant** — lampe
éteinte, luminosité, position du volet — mais seulement ce que la règle
tient encore : une lampe prise en main pendant l'alerte reste comme elle
est. Deux dangers en même temps : on ne rend qu'à la fin du dernier, et le
second ne « retient » pas l'état que le premier a imposé.

**La vanne reste coupée.** Une fuite s'inspecte avant de rouvrir ; le
journal dit « laisser coupée · la vanne d'eau se rouvre à la main ». La
vanne est la première `valve` d'eau que Home Assistant connaît, ou une
entité désignée (une prise commandée sur l'arrivée d'eau vaut aussi).

Actif d'emblée, avec trois interrupteurs pour débrayer, dans Paramètres ›
Alertes — là où le danger se règle déjà.

## Conséquences

- L'état d'avant vit en mémoire : un redémarrage pendant l'alerte le perd,
  et la maison n'est alors pas rendue — plutôt que d'inventer (ADR 0011).
- Sans vanne connue, la fuite ne coupe rien et le journal le dit ; le
  téléphone, lui, sonne quand même.
- Un capteur qui devient muet pendant l'alerte ne la termine pas : on ne
  rend la maison que sur un « danger passé » explicite.
