# 0166 — Un agenda vide reste un agenda

*8 octobre 2026 — accepté*

## Le problème

> « Pourquoi dans le calendrier j'en ai qu'un seul alors que sur HAOS j'en ai
> 4 ? » — 8 octobre, deux captures à l'appui : Home Assistant listant
> *Collectes*, *Maison*, *Planning Guillaume* et *Rappels* ; Loggia n'affichant
> que *Planning Guillaume*.

Loggia lisait bien les quatre. Le registre d'entités le confirme : quatre
`calendar.*`, aucun masqué, aucun désactivé, tous de la même intégration. Et
`useAgenda` interroge **tous** les `calendar.*`, sans filtre.

Le défaut était dans la liste « Mes agendas » : elle se construisait à partir des
**événements trouvés**, pas des calendriers de la maison.

```js
for (const e of evts) {
  const id = calDe(e) || '';
  if (!m.has(id)) m.set(id, { id, nom: nomCalendrier(e, hass), … });
  m.get(id).n += 1;
}
```

Un calendrier sans rendez-vous sur la période affichée n'avait donc aucune
ligne. Compté chez l'utilisateur, sur la semaine du 5 au 11 octobre :

| agenda | rendez-vous | dans la liste |
|---|---|---|
| planning_guillaume | 5 cette semaine | oui |
| maison | 2 en tout, aucun en octobre | **non** |
| collectes | aucun, pas même de fichier | **jamais** |
| rappels | aucun, pas même de fichier | **jamais** |

Trois conséquences, dont la dernière est la pire : on ne pouvait pas savoir
qu'un agenda existait ; sa case à cocher apparaissait et disparaissait au gré
des semaines ; et un agenda **toujours** vide n'existait jamais — impossible de
le voir, impossible de le décocher à l'avance.

## La décision

La liste part des **entités**, et le compte de la période s'y ajoute — zéro
quand il n'y a rien :

```js
for (const id of calendriersDeLaMaison(hass)) m.set(id, { id, nom: nomDuCalendrier(id, hass), … });
for (const e of evts) { … m.get(id).n += 1; }
```

Le nom se demande désormais par l'**identifiant** (`nomDuCalendrier`) et non par
un événement : un agenda vide n'en a aucun à présenter.

Un calendrier qui porte un événement sans plus figurer dans les états — retiré
en cours de session — **garde** sa ligne. Sinon ses rendez-vous resteraient à
l'écran sans moyen de les éteindre.

C'est la règle de la maison, appliquée ici : *tout opérationnel sans configurer*
(07/10), et la découverte fait foi.

## La démonstration portait le trou

Aucun de ses trois agendas n'était vide : elle ne pouvait donc **ni montrer le
cas, ni le protéger**. Un quatrième s'ajoute, *Anniversaires*, sans aucun
événement — jamais. Il paraît dans la liste avec un zéro, et c'est ce que le
test vérifie.

## Ce qu'on n'a pas fait

**Masquer les agendas vides derrière un repli.** Ce serait reproduire le défaut
sous une autre forme : l'utilisateur veut voir ses quatre agendas, pas trois
plus un bouton.

**Trier les vides en fin de liste.** L'ordre alphabétique est prévisible ; un
ordre qui change selon la semaine affichée ne l'est pas.

## Ce que les tests tiennent

Un test dans `tests/agenda_rail.test.mjs` : la liste part de
`calendriersDeLaMaison`, un agenda disparu des états garde sa ligne, le nom se
demande par l'identifiant, et la démonstration porte bien un agenda vide qui le
reste.

## À relire

Le polonais d'*Anniversaires* (« Urodziny ») est de moi, pas de Seba882 :
à relire.
