# 0173 — Le tarif en cours est celui dont le compteur tourne

*9 octobre 2026 — accepté*

## Le problème

> « Pour l'énergie, tout le monde n'est pas en HC/HP, ça dépend des contrats,
> comment ça se passe du coup là ? » puis « oui corrige Tempo ». — 9 octobre.

La carte du Tarif choisissait le prix du moment ainsi :

```js
const hcLu = … duTableau[0];                        // le moins cher
const hpLu = … duTableau[duTableau.length - 1];     // le plus cher
```

À **deux** tarifs, c'est juste, et ce n'est même pas une devinette sur les
noms : le tarif réduit *est* le moins cher des deux, par définition.

À **six**, c'est faux. Tempo a bleu, blanc et rouge, chacun en heures creuses
et en heures pleines. Loggia annonçait donc soit le bleu creuses, soit le rouge
pleines — jamais les quatre autres. Un jour blanc en heures pleines affichait
le prix du rouge : **presque quatre fois trop cher**.

## La décision

On n'invente pas la couleur du jour, et on ne lit aucun nom d'entité.
**On observe** : parmi les compteurs déclarés dans le tableau de bord Énergie,
**un seul tourne** — celui du tarif en cours. Les autres sont figés depuis des
heures ou des jours.

```js
export function prixEnCours(connexions) {
  const vivantes = (connexions || []).filter(c => c && c.lisible && …);
  if (!vivantes.length) return null;
  let tete = vivantes[0];
  for (const c of vivantes) if (c.instant > tete.instant) tete = c;
  return tete.prix;
}
```

`resolve.js` attachait déjà à chaque prix le compteur de sa connexion
(`compteur: x.flux.stat_energy_from`) : il n'y avait rien à deviner, seulement
à regarder le `last_changed` de chacun.

**Un compteur muet ne vote pas.** Le `last_changed` d'un capteur devenu
`unavailable` dit l'instant où il s'est tu, pas une consommation : il
gagnerait la comparaison en annonçant un prix qui n'a pas cours.

### Où la bascule s'applique

| tarifs déclarés | ce qui décide |
|---|---|
| la fiche nomme les deux prix | **la fiche**, toujours — c'est un choix explicite |
| 0 | rien ne s'affiche |
| 1 | « Tarif unique », le prix |
| 2 | le capteur binaire de créneau, comme avant |
| **3 et plus** | **le compteur qui tourne** |

À deux tarifs, le binaire reste meilleur : il bascule à l'instant exact, là où
un compteur met quelques minutes à bouger.

### Ce que le libellé promet

À plus de deux tarifs sans capteur de créneau, on sait ce que **coûte** le kWh
maintenant, pas dans quel créneau on se trouve. Le titre dit donc « **Tarif en
cours** » — et non « Heures creuses », qu'on ne peut pas affirmer.

Et les chiffres de la légende **se taisent** : `hcLu` et `hpLu` valent alors le
moins cher et le plus cher de tous les créneaux — en Tempo, le bleu creuses et
le rouge pleines, qui n'ont jamais cours le même jour. Les deux puces restent,
elles servent à lire la barre.

## Ce n'est pas une rustine française

Tempo a motivé la correction, mais « le compteur qui tourne » ne connaît ni
Tempo, ni EDF, ni la France. Le même code couvre :

| pays | contrat | ce qui s'applique |
|---|---|---|
| France | Tempo (6 tarifs) | le compteur qui tourne |
| Espagne | 2.0TD — punta / llano / valle | le compteur qui tourne |
| Italie | F1 / F2 / F3 | le compteur qui tourne |
| États-Unis, Canada | time-of-use (peak / mid / off-peak) | le compteur qui tourne |
| Royaume-Uni | Economy 7, Economy 10 | le binaire, comme avant |
| Pays-Bas | dal / normaal | le binaire |
| Suisse, Allemagne | Niedertarif / Hochtarif | le binaire |
| Pologne | G12, G12w | le binaire |
| partout | prix horaire (Tibber, Octopus Agile, Nordpool) | « Tarif unique », prix du moment |
| partout | tarif de base | « Tarif unique » |

Le vocabulaire suit déjà le pays, et ce ne sont pas des traductions littérales :
*Niedertarif / Hochtarif*, *Off-peak / Peak hours*, *Horas valle / Horas punta*,
*Fascia economica / Fascia di punta*, *Daluren / Piekuren*, *Taryfa nocna /
Taryfa dzienna*. La devise suit l'entité, puis `hass.config.currency` — jamais
supposée en euros.

## Ce qui reste ouvert, et qui n'est pas français non plus

Le capteur binaire de créneau (`hcActive`) n'a **aucune découverte
automatique** : il doit être désigné à la main dans les Paramètres, en France
comme ailleurs. Sans lui, il n'y a ni barre des vingt-quatre heures, ni « heures
pleines à partir de… », et à deux tarifs le prix ne s'affiche pas — on ne sait
pas dans quel créneau on se trouve. C'est le vrai manque restant, et il
contredit la règle du 07/10 (*tout opérationnel sans configurer*).

## Ce que les tests tiennent

`tests/tarif_heures.test.mjs`, trois cas de plus : six tarifs Tempo où le prix
retenu n'est **ni le moins cher ni le plus cher** mais celui du compteur qui a
bougé il y a une minute ; un compteur muet qui n'impose pas son prix, et le
silence quand rien n'est lisible ; enfin le seuil de bascule, la main laissée à
la fiche, le libellé « Tarif en cours » et la légende qui se tait.
