# 0108 — Trois cartes oubliées par le choix d'icône

Date : 28/09/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti. Suite directe de l'ADR 0095.

## Le retour

> « j'ai remarqué que le changement d'icone ne se fait pas partout, dans
> energie il y a des cartes ou je le change mes rien, dans securiyé pareil »

C'est le même symptôme que le 27/09 — « si j'en choisis un, ça ne le change
pas, l'ancien reste » — sur trois cartes que la correction d'alors n'avait pas
touchées.

## Le défaut était d'un seul côté

La fiche « Modifier l'entité » propose la grille d'icônes dès que la carte
porte un `entity_id` :

```js
const estEntite = brut.indexOf('.') > 0 && brut.indexOf(':') < 0;
const peutChoisirIcone = estEntite || estZone;
```

Un poste de consommation s'appelle `dev:sensor.bureau_co2` ; le préfixe est
retiré, il reste une entité. L'alarme et la sirène en sont aussi. **Les trois
avaient donc la grille, et le choix se rangeait bien** — `loggia_icones` le
portait, vérifié à l'écran.

Ce qui manquait est en face : rien ne le RELISAIT.

| Carte | Ce qu'elle dessinait |
|---|---|
| Poste de consommation (Énergie) | `<Fi i={d.icon}>` — le glyphe de `enDevices` |
| `CvAlarm` (Sécurité) | `<Fi i="shield-check">` en dur |
| `CvSirene` (Sécurité) | `<Fi i="bell-ring">` en dur |

L'ADR 0095 avait créé `GlypheCarte` exactement pour cela : le dessin d'origine
n'est plus qu'un défaut, le choix passe devant. Cinq familles y étaient
passées — lumière, aspirateur, climat, volet, média. Ces trois-là avaient été
oubliées, et leur test ne les nommait pas.

## Ce qui change

Les trois cartes passent par `GlypheCarte`, comme les cinq autres :

```jsx
<GlypheCarte id={d.power} size={15}><Fi i={d.icon} size={15} color={d.c} /></GlypheCarte>
<GlypheCarte id={id} size={15}><Fi i="shield-check" size={15} /></GlypheCarte>
<GlypheCarte id={id} size={16}><Fi i="bell-ring" size={16} /></GlypheCarte>
```

Un détail qui n'en est pas un : `Ico` dessine en `currentColor`, alors que `Fi`
recevait sa teinte en attribut. La pastille du poste ne donnait que son FOND
(`hx(d.c, .14)`) ; un dessin choisi en serait sorti noir sur fond bleu pâle.
Elle donne maintenant aussi sa couleur (`color: d.c`). L'alarme et la sirène
l'avaient déjà — `RM_ICO(fond, couleur)`.

## Vérifié à l'écran, pas seulement aux tests

Démo, thème sombre, 1440 px. Le cadenas choisi sur les trois :

| Carte | Avant | Après |
|---|---|---|
| Alarme | `i.fi-rr-shield-check` | **`svg.o-ico-fige`** (le cadenas) |
| Sirène intérieure | `i.fi-rr-bell-ring` | **`svg.o-ico-fige`** |
| Poste « Bureau CO2 » | `i.fi-rr-sensor` | **`svg.o-ico-fige`**, parent `rgb(158,197,255)` |

La troisième ligne est celle qui valide la couleur : le tracé hérite bien de
`d.c`, il n'est pas noir.

Un piège du banc d'essai, noté pour la prochaine fois. **En mode édition, une
carte n'est pas la carte** : `EditableCard` dessine un aperçu qui porte
l'icône du DOMAINE (bouclier pour l'alarme, capteur pour une fenêtre), pas
celle de la carte. Tant que le mode édition reste ouvert, le choix paraît sans
effet alors qu'il est déjà posé. C'est voulu — l'aperçu dit la famille — mais
cela ressemble trait pour trait au défaut qu'on vient de corriger.

Et la démo ne remplace pas la maison : `cfgSet` met bien `LOGGIA_CFG` à jour
tout de suite, donc le choix se voit sans rechargement ; il ne survit pas à un
rechargement, le serveur factice n'ayant rien où l'écrire.

## Ce que je n'ai PAS fait

- **Toucher à l'aperçu du mode édition.** Il montre la famille, dans TOUTES
  les vues, et depuis toujours. Le changer ici serait une décision séparée.
- **Élargir `peutChoisirIcone`.** La carte Présence (`carte:presence`), le
  distributeur et les plantes n'ont pas d'`entity_id` : la grille ne leur est
  pas proposée, et elles ne prétendent donc rien.

Le test de l'ADR 0095 énumérait cinq familles ; un second cas en nomme les
trois autres, et il échoue sans le correctif. Celui qui épinglait le gabarit
de la sirène (`securite_trois_cartes`) suit le nouveau balisage. 1 009 tests JS, lint propre (aucun avertissement ajouté).
Paquet rebâti.
